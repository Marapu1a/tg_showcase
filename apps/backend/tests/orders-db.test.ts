import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

test(
  'isolated PostgreSQL: requests, stock races, status, privacy, history and notification retry',
  { skip: process.env.RUN_DB_TESTS !== '1' },
  async () => {
    config({ quiet: true });
    const baseUrl = process.env.DATABASE_URL!;
    const schema = `orders_test_${randomUUID().replaceAll('-', '')}`;
    const admin = new PrismaClient({ datasourceUrl: baseUrl });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    const url = new URL(baseUrl);
    url.searchParams.set('schema', schema);
    process.env.DATABASE_URL = url.toString();
    process.env.TELEGRAM_BOT_TOKEN = '999:test-token';
    process.env.MINI_APP_PUBLIC_URL = 'https://mini.example.com';
    const { prisma } = await import('../src/lib/prisma.js');
    const { buildApp } = await import('../src/app.js');
    const { createOrder, changeOrderStatus } =
      await import('../src/modules/orders/service.js');
    const { deliverOrderNotifications } =
      await import('../src/modules/orders/notifier.js');
    const app = buildApp();
    const originalFetch = globalThis.fetch;
    try {
      for (const folder of (await readdir('prisma/migrations')).sort()) {
        if (folder === 'migration_lock.toml') continue;
        const sql = await readFile(
          `prisma/migrations/${folder}/migration.sql`,
          'utf8',
        );
        for (const statement of sql.split(';').filter((s) => s.trim()))
          await prisma.$executeRawUnsafe(statement);
      }
      const seller = await prisma.user.create({
        data: { telegramUserId: '1001', firstName: 'Seller' },
      });
      const other = await prisma.user.create({
        data: { telegramUserId: '1002' },
      });
      const product = await prisma.product.create({
        data: {
          ownerUserId: seller.id,
          title: 'Socks',
          priceText: '600',
          priceMinor: 60000,
          quantityLimit: 3,
        },
      });
      const offer = await prisma.offer.create({
        data: {
          ownerUserId: seller.id,
          productId: product.id,
          title: 'Socks',
          status: 'ACTIVE',
        },
      });
      const body = (quantity = 1) => ({
        requestKey: randomUUID(),
        quantity,
        unitPriceMinor: 60000,
        contactType: 'TELEGRAM',
        contact: '@customer',
        comment: 'Grey',
      });
      const auth = (id: number) => {
        const p = new URLSearchParams({
          auth_date: String(Math.floor(Date.now() / 1000)),
          user: JSON.stringify({ id, first_name: 'Seller' }),
        });
        p.sort();
        const secret = createHmac('sha256', 'WebAppData')
          .update(process.env.TELEGRAM_BOT_TOKEN!)
          .digest();
        p.set(
          'hash',
          createHmac('sha256', secret)
            .update([...p].map(([k, v]) => `${k}=${v}`).join('\n'))
            .digest('hex'),
        );
        return { authorization: `tma ${p}` };
      };
      assert.equal(
        (await app.inject({ url: '/channels/buyer-contact' })).statusCode,
        401,
      );
      const settings = (id: number, value: unknown) =>
        app.inject({
          method: 'PUT',
          url: '/channels/buyer-contact',
          headers: auth(id),
          payload: { buyerContactUsername: value },
        });
      assert.equal(
        (await settings(1001, 'https://evil.example')).statusCode,
        400,
      );
      assert.equal((await settings(1001, '@shop_support')).statusCode, 200);
      assert.equal(
        (
          await app.inject({
            url: '/channels/buyer-contact',
            headers: auth(1002),
          })
        ).json().buyerContactUsername,
        null,
      );
      const duplicate = body(2);
      const first = await Promise.all([
        createOrder(offer.id, duplicate),
        createOrder(offer.id, duplicate),
      ]);
      assert.equal(first[0]!.id, first[1]!.id);
      assert.equal(first[0]!.buyerContactUsername, 'shop_support');
      assert.equal(first[0]!.totalMinor, 120000);
      assert.equal(first[0]!.quantity, 2);
      assert.equal(
        (
          await app.inject({ url: '/orders/new-count', headers: auth(1001) })
        ).json().count,
        1,
      );
      assert.equal(
        (
          await app.inject({ url: '/orders/new-count', headers: auth(1002) })
        ).json().count,
        0,
      );
      assert.equal(
        (
          await app.inject({
            url: `/orders/${first[0]!.id}`,
            headers: auth(1002),
          })
        ).statusCode,
        404,
      );
      await settings(1001, '');
      assert.equal(
        (await createOrder(offer.id, duplicate)).buyerContactUsername,
        null,
      );
      assert.equal((await createOrder(offer.id, duplicate)).totalMinor, 120000);
      assert.equal(await prisma.orderRequest.count(), 1);
      assert.equal(
        (await prisma.product.findUniqueOrThrow({ where: { id: product.id } }))
          .reservedQuantity,
        2,
      );
      await assert.rejects(
        () => createOrder(offer.id, { ...duplicate, quantity: 1 }),
        /другими данными/,
      );
      const race = await Promise.allSettled([
        createOrder(offer.id, body()),
        createOrder(offer.id, body()),
      ]);
      assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(
        (await prisma.product.findUniqueOrThrow({ where: { id: product.id } }))
          .reservedQuantity,
        3,
      );
      const cancelKey = randomUUID();
      await changeOrderStatus(seller.id, first[0]!.id, {
        status: 'CANCELLED',
        expectedStatus: 'NEW',
        expectedVersion: 0,
        requestKey: cancelKey,
        reason: 'Customer cancelled',
      });
      await changeOrderStatus(seller.id, first[0]!.id, {
        status: 'CANCELLED',
        expectedStatus: 'NEW',
        expectedVersion: 0,
        requestKey: cancelKey,
        reason: 'Customer cancelled',
      });
      assert.equal(
        (await prisma.product.findUniqueOrThrow({ where: { id: product.id } }))
          .reservedQuantity,
        1,
      );
      await assert.rejects(() =>
        changeOrderStatus(seller.id, first[0]!.id, {
          status: 'NEW',
          expectedStatus: 'CANCELLED',
          expectedVersion: 1,
          requestKey: randomUUID(),
          reason: 'Test',
        }),
      );
      await assert.rejects(() =>
        changeOrderStatus(other.id, first[0]!.id, {
          status: 'DONE',
          expectedStatus: 'NEW',
          expectedVersion: 0,
          requestKey: randomUUID(),
        }),
      );
      const snapshot = await createOrder(offer.id, body());
      await prisma.product.update({
        where: { id: product.id },
        data: { priceMinor: 70000, title: 'New title' },
      });
      assert.equal(
        (
          await prisma.orderRequest.findUniqueOrThrow({
            where: { id: snapshot.id },
          })
        ).productTitle,
        'Socks',
      );
      assert.equal(
        (
          await prisma.orderRequest.findUniqueOrThrow({
            where: { id: snapshot.id },
          })
        ).totalMinor,
        60000,
      );
      await assert.rejects(
        () => createOrder(offer.id, body()),
        /Цена изменилась/,
      );
      await changeOrderStatus(seller.id, snapshot.id, {
        status: 'IN_PROGRESS',
        expectedStatus: 'NEW',
        expectedVersion: 0,
        requestKey: randomUUID(),
      });
      await assert.rejects(
        () =>
          changeOrderStatus(seller.id, snapshot.id, {
            status: 'DONE',
            expectedStatus: 'NEW',
            expectedVersion: 0,
            requestKey: randomUUID(),
          }),
        (error: unknown) =>
          error instanceof Error &&
          'statusCode' in error &&
          error.statusCode === 409,
      );
      await changeOrderStatus(seller.id, snapshot.id, {
        status: 'DONE',
        expectedStatus: 'IN_PROGRESS',
        expectedVersion: 1,
        requestKey: randomUUID(),
      });
      assert.equal((await app.inject({ url: '/orders' })).statusCode, 401);
      assert.equal(
        (await app.inject({ url: '/orders', headers: auth(1002) })).json()
          .orders.length,
        0,
      );
      const history = (
        await app.inject({ url: '/orders?scope=history', headers: auth(1001) })
      ).json();
      assert.equal(history.orders.length, 2);
      assert.equal(history.orders[0].requestKey, undefined);
      const publicCard = (
        await app.inject({ url: `/public/offers/${offer.id}` })
      ).json();
      assert.equal(publicCard.ownerUserId, undefined);
      assert.equal(publicCard.available, 1);
      assert.equal(
        (
          await app.inject({
            method: 'POST',
            url: `/public/offers/${offer.id}/orders`,
            payload: { ...body(), unitPriceMinor: 70000 },
          })
        ).statusCode,
        201,
      );
      assert.equal(
        (
          await app.inject({
            method: 'DELETE',
            url: `/offers/${offer.id}`,
            headers: auth(1001),
          })
        ).statusCode,
        200,
      );
      assert.equal(
        (await app.inject({ url: `/public/offers/${offer.id}` })).statusCode,
        404,
      );
      await assert.rejects(() => createOrder(offer.id, body()), /недоступна/);
      assert.equal(await prisma.orderRequest.count(), 4);
      globalThis.fetch = async () => {
        throw new Error('offline');
      };
      await deliverOrderNotifications();
      assert.equal(
        await prisma.orderRequest.count({
          where: { notificationAttempts: 1, notificationState: 'PENDING' },
        }),
        4,
      );
      await prisma.orderRequest.updateMany({
        data: { notificationNextAt: new Date(0) },
      });
      let sent = 0;
      globalThis.fetch = async (_url, init) => {
        const msg = JSON.parse(String(init?.body));
        assert.equal(msg.chat_id, '1001');
        const link = new URL(
          msg.reply_markup.inline_keyboard[0][0].web_app.url,
        );
        assert.equal(link.pathname, '/orders');
        assert.ok(link.searchParams.get('order'));
        assert.equal(
          msg.reply_markup.inline_keyboard[0][0].text,
          'Открыть заказ',
        );
        assert.ok(msg.text.includes('заказ №'));
        sent++;
        return new Response(
          JSON.stringify({ ok: true, result: { message_id: 1 } }),
          { status: 200 },
        );
      };
      await deliverOrderNotifications();
      await deliverOrderNotifications();
      assert.equal(sent, 4);
      assert.equal(
        await prisma.orderRequest.count({
          where: { notificationState: 'SENT' },
        }),
        4,
      );
      const listingKey = randomUUID();
      const listingPayload = {
        requestKey: listingKey,
        title: 'New listing',
        price: '123,45',
        quantityLimit: 3,
      };
      const listings = await Promise.all([
        app.inject({
          method: 'POST',
          url: '/listings',
          headers: auth(1001),
          payload: listingPayload,
        }),
        app.inject({
          method: 'POST',
          url: '/listings',
          headers: auth(1001),
          payload: listingPayload,
        }),
      ]);
      assert.equal(listings[0]!.statusCode, 201);
      assert.equal(listings[0]!.json().id, listings[1]!.json().id);
      // A changed idempotency body must not create another listing.
      assert.equal(
        (
          await app.inject({
            method: 'POST',
            url: '/listings',
            headers: auth(1001),
            payload: { ...listingPayload, title: 'Changed' },
          })
        ).statusCode,
        409,
      );
      const foreignPhoto = await prisma.media.create({
        data: { ownerUserId: other.id, data: Buffer.from('fixture') },
      });
      assert.equal(
        (
          await app.inject({
            method: 'POST',
            url: '/listings',
            headers: auth(1001),
            payload: {
              ...listingPayload,
              requestKey: randomUUID(),
              photoId: foreignPhoto.id,
            },
          })
        ).statusCode,
        400,
      );
      await prisma.product.createMany({
        data: Array.from({ length: 200 }, (_, i) => ({
          ownerUserId: other.id,
          title: `Quota ${i}`,
          priceText: '1',
          priceMinor: 100,
        })),
      });
      assert.equal(
        (
          await app.inject({
            method: 'POST',
            url: '/listings',
            headers: auth(1002),
            payload: { ...listingPayload, requestKey: randomUUID() },
          })
        ).statusCode,
        409,
      );
      await prisma.media.createMany({
        data: Array.from({ length: 199 }, () => ({
          ownerUserId: other.id,
          data: Buffer.from('fixture'),
        })),
      });
      assert.equal(
        (
          await app.inject({
            method: 'POST',
            url: '/listings/photo',
            headers: auth(1002),
            payload: { dataUrl: 'invalid' },
          })
        ).statusCode,
        409,
      );
      // Invalid requests consume rate budget without creating orders.
      for (let i = 0; i < 20; i++)
        assert.equal(
          (
            await app.inject({
              method: 'POST',
              url: `/public/offers/${offer.id}/orders`,
              remoteAddress: '192.0.2.55',
              payload: {},
            })
          ).statusCode,
          400,
        );
      assert.equal(
        (
          await app.inject({
            method: 'POST',
            url: `/public/offers/${offer.id}/orders`,
            remoteAddress: '192.0.2.55',
            payload: {},
          })
        ).statusCode,
        429,
      );
      assert.equal(await prisma.orderRequest.count(), 4);
      // Currency travels from the seller's form into the immutable order snapshot.
      const listing = {
        requestKey: randomUUID(),
        title: 'Rupee item',
        price: '125.50',
        currency: 'INR',
        quantityLimit: 10,
      };
      const created = await app.inject({
        method: 'POST',
        url: '/listings',
        headers: auth(1004),
        payload: listing,
      });
      assert.equal(created.statusCode, 201, created.body);
      const rupeeId = created.json().id;
      const rupeeOffer = await prisma.offer.findUniqueOrThrow({
        where: { id: rupeeId },
        include: { product: true },
      });
      assert.equal(rupeeOffer.product.currency, 'INR');
      assert.match(rupeeOffer.product.priceText, /₹|INR/);
      assert.equal(
        (
          await app.inject({
            method: 'POST',
            url: '/listings',
            headers: auth(1004),
            payload: { ...listing, currency: 'USD' },
          })
        ).statusCode,
        409,
      );
      assert.equal(
        (
          await app.inject({
            method: 'POST',
            url: '/listings',
            headers: auth(1004),
            payload: {
              ...listing,
              requestKey: randomUUID(),
              currency: 'INVALID',
            },
          })
        ).statusCode,
        400,
      );
      await prisma.offer.update({
        where: { id: rupeeId },
        data: { status: 'ACTIVE' },
      });
      assert.equal(
        (await app.inject({ url: `/public/offers/${rupeeId}` })).json()
          .currency,
        'INR',
      );
      const rupeeRequest = {
        ...body(2),
        unitPriceMinor: 12550,
        currency: 'INR',
      };
      await assert.rejects(() =>
        createOrder(rupeeId, { ...rupeeRequest, currency: 'USD' }),
      );
      const rupeeReceipt = await createOrder(rupeeId, rupeeRequest);
      assert.equal(rupeeReceipt.currency, 'INR');
      assert.equal(rupeeReceipt.totalMinor, 25100);
      await prisma.product.update({
        where: { id: rupeeOffer.productId },
        data: { currency: 'EUR', priceMinor: 999 },
      });
      assert.equal((await createOrder(rupeeId, rupeeRequest)).currency, 'INR');
      assert.equal(
        (
          await prisma.orderRequest.findUniqueOrThrow({
            where: { id: rupeeReceipt.id },
          })
        ).currency,
        'INR',
      );
      let notified = '';
      globalThis.fetch = async (_url, options) => {
        notified += JSON.parse(String(options?.body)).text ?? '';
        return new Response(
          JSON.stringify({ ok: true, result: { message_id: 99 } }),
        );
      };
      await deliverOrderNotifications();
      assert.match(notified, /₹|INR/);
      console.log(
        'Real DB checks passed in isolated schema; no Telegram messages sent',
      );
    } finally {
      globalThis.fetch = originalFetch;
      await app.close();
      await prisma.$disconnect();
      await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.$disconnect();
    }
  },
);
