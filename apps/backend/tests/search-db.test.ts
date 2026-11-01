import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { dateRange } from '../src/lib/search.js';

test('search dates reject invalid input and include Moscow calendar days', () => {
  assert.equal(
    dateRange('2026-10-29', '2026-10-29')?.gte?.toISOString(),
    '2026-10-28T21:00:00.000Z',
  );
  assert.equal(
    dateRange('2026-10-29', '2026-10-29')?.lt?.toISOString(),
    '2026-10-29T21:00:00.000Z',
  );
  for (const date of ['2026-99-99', '2026-02-30', 'abc', '2026-01-01T00:00:00'])
    assert.throws(() => dateRange(date, undefined));
  assert.throws(() => dateRange('2026-10-30', '2026-10-29'));
});

test(
  '1500-order search stays inside seller boundary; details, filters, pagination and pause lifecycle',
  { skip: process.env.RUN_DB_TESTS !== '1' },
  async () => {
    config({ quiet: true });
    const admin = new PrismaClient({
      datasourceUrl: process.env.DATABASE_URL!,
    });
    const schema = 'search_test_' + randomUUID().replaceAll('-', '');
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    const db = new URL(process.env.DATABASE_URL!);
    db.searchParams.set('schema', schema);
    process.env.DATABASE_URL = db.toString();
    process.env.TELEGRAM_BOT_TOKEN = '999:search-test';
    process.env.MINI_APP_PUBLIC_URL = 'https://mini.example.com';
    const { prisma } = await import('../src/lib/prisma.js');
    const { buildApp } = await import('../src/app.js');
    const { createOrder } = await import('../src/modules/orders/service.js');
    const app = buildApp();
    const originalFetch = globalThis.fetch;
    let externalCalls = 0;
    globalThis.fetch = async (url) => {
      if (String(url).endsWith('/getMe'))
        return new Response(
          JSON.stringify({
            ok: true,
            result: { username: 'test_bot', has_main_web_app: false },
          }),
        );
      externalCalls++;
      throw Error('No external calls expected');
    };
    function auth(id: number) {
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
    }
    try {
      for (const dir of (await readdir('prisma/migrations')).sort()) {
        if (dir === 'migration_lock.toml') continue;
        const sql = await readFile(
          `prisma/migrations/${dir}/migration.sql`,
          'utf8',
        );
        for (const statement of sql.split(';').filter((s) => s.trim()))
          await prisma.$executeRawUnsafe(statement);
      }
      const a = await prisma.user.create({ data: { telegramUserId: '1001' } }),
        b = await prisma.user.create({ data: { telegramUserId: '1002' } });
      const product = await prisma.product.create({
        data: {
          ownerUserId: a.id,
          title: 'Кукло 100%_ handmade',
          priceText: '600',
          priceMinor: 60000,
          quantityLimit: 20,
        },
      });
      const otherProduct = await prisma.product.create({
        data: {
          ownerUserId: b.id,
          title: 'Чужой товар',
          priceText: '900',
          priceMinor: 90000,
        },
      });
      const offer = await prisma.offer.create({
        data: {
          ownerUserId: a.id,
          productId: product.id,
          title: product.title,
          status: 'ACTIVE',
          publishState: 'SENT',
          telegramMessageId: '7',
        },
      });
      const otherOffer = await prisma.offer.create({
        data: {
          ownerUserId: b.id,
          productId: otherProduct.id,
          title: 'Foreign private',
          status: 'ACTIVE',
          telegramMessageId: '8',
        },
      });
      for (const [owner, pub, prod, prefix, count] of [
        [a, offer, product, 'own', 1500],
        [b, otherOffer, otherProduct, 'foreign', 40],
      ] as const) {
        await prisma.orderRequest.createMany({
          data: Array.from({ length: count }, (_, i) => ({
            id: `${prefix}-${i}`,
            ownerUserId: owner.id,
            productId: prod.id,
            offerId: pub.id,
            requestKey: randomUUID(),
            requestFingerprint: 'fixture',
            productTitle: prod.title,
            unitPriceMinor: 60000,
            totalMinor: 60000,
            quantity: 1,
            buyerName: 'Юлия',
            buyerTelegramUserId: '777',
            contact: '+7 (900) 123-45-67',
            contactSearch: '79001234567',
            contactType: 'PHONE',
            status: 'DONE',
            createdAt: new Date('2026-10-29T00:00:00Z'),
          })),
        });
      }
      const get = (url: string, id = 1001) =>
        app.inject({ url, headers: auth(id) });
      assert.equal(
        (await app.inject({ url: '/orders?q=Юлия' })).statusCode,
        401,
      );
      const phone = (
        await get(
          '/orders?q=' +
            encodeURIComponent('+7 (900) 123-45-67') +
            '&ownerUserId=' +
            b.id,
        )
      ).json();
      assert.equal(phone.total, 1500);
      assert.equal(phone.orders.length, 30);
      assert.equal(phone.counts.DONE, 1500);
      assert.ok(
        phone.orders.every((row: { id: string }) => row.id.startsWith('own-')),
      );
      assert.equal(phone.orders[0].requestKey, undefined);
      assert.equal(phone.orders[0].comment, undefined);
      const next = (await get('/orders?q=900123&before=' + phone.next)).json();
      assert.equal(next.total, 1500);
      assert.equal(next.orders.length, 30);
      assert.ok(
        next.orders.every((row: { number: number }) => row.number < phone.next),
      );
      assert.equal((await get('/orders?q=900123', 1002)).json().total, 40);
      assert.equal((await get('/orders/foreign-0')).statusCode, 404);
      assert.equal((await get('/orders/own-0', 1002)).statusCode, 404);
      assert.equal(
        (await get('/orders?relatedTo=foreign-0&scope=all')).statusCode,
        404,
      );
      assert.equal(
        (await get('/orders?relatedTo=own-0&scope=all')).json().total,
        1500,
      );
      assert.equal(
        (await get('/orders?q=' + encodeURIComponent('ЮЛИЯ'))).json().total,
        1500,
      );
      const ownNumber = (await get('/orders/own-0')).json().number;
      assert.equal(
        (await get('/orders?q=' + encodeURIComponent('#' + ownNumber))).json()
          .total,
        1,
      );
      const foreignNumber = (await get('/orders/foreign-0', 1002)).json()
        .number;
      assert.equal(
        (
          await get('/orders?q=' + encodeURIComponent('#' + foreignNumber))
        ).json().total,
        0,
      );
      assert.equal((await get('/orders?q=100%25_')).json().total, 1500);
      assert.equal((await get('/orders?q=%25%25')).json().total, 0);
      assert.equal((await get('/orders?q=Юлия&scope=NEW')).json().total, 0);
      assert.equal(
        (await get('/orders?scope=all&productId=' + otherProduct.id)).json()
          .total,
        0,
      );
      assert.equal(
        (await get('/orders?scope=all&from=2026-10-29&to=2026-10-29')).json()
          .total,
        1500,
      );
      assert.equal(
        (await get('/orders?scope=all&from=2026-10-30')).json().total,
        0,
      );
      assert.equal((await get('/orders?from=2026-99-99')).statusCode, 400);
      assert.equal((await get('/orders?q=' + 'x'.repeat(101))).statusCode, 400);
      assert.equal((await get('/orders/products')).json().products.length, 1);
      assert.equal((await get('/listings?scope=all')).json().total, 1);
      assert.equal(
        (await get('/listings?scope=all&before=' + otherOffer.id)).statusCode,
        400,
      );
      assert.equal((await get('/listings/' + otherOffer.id)).statusCode, 404);
      assert.equal((await get('/listings?q=100%25_')).json().total, 1);
      const state = (
        action: string,
        expectedStatus: string,
        id = offer.id,
        seller = 1001,
      ) =>
        app.inject({
          method: 'POST',
          url: `/listings/${id}/state`,
          headers: auth(seller),
          payload: { action, expectedStatus },
        });
      assert.equal(
        (await state('PAUSE', 'ACTIVE', offer.id, 1002)).statusCode,
        404,
      );
      assert.equal((await state('PAUSE', 'ACTIVE')).json().status, 'PAUSED');
      assert.equal((await state('PAUSE', 'ACTIVE')).statusCode, 200);
      assert.equal(
        (await app.inject({ url: `/public/offers/${offer.id}` })).json()
          .saleStatus,
        'PAUSED',
      );
      assert.equal(
        (await app.inject({ url: `/click/buy/${offer.id}` })).statusCode,
        302,
      );
      const payload = {
        requestKey: randomUUID(),
        quantity: 1,
        unitPriceMinor: 60000,
        contactType: 'TELEGRAM',
        contact: '@buyer',
      };
      await assert.rejects(() => createOrder(offer.id, payload));
      assert.equal((await state('RESUME', 'ACTIVE')).statusCode, 409);
      assert.equal((await state('RESUME', 'PAUSED')).json().status, 'ACTIVE');
      const order = await createOrder(offer.id, payload);
      assert.equal((await get('/orders?q=%40BUYER')).json().total, 1);
      assert.equal(
        (await state('ARCHIVE', 'ACTIVE')).json().status,
        'ARCHIVED',
      );
      assert.equal((await get('/listings')).json().total, 0);
      assert.equal((await get('/listings?scope=ARCHIVED')).json().total, 1);
      assert.equal(
        (await app.inject({ url: `/public/offers/${offer.id}` })).json()
          .saleStatus,
        'ARCHIVED',
      );
      assert.equal((await createOrder(offer.id, payload)).id, order.id); // lost response still recoverable
      assert.equal(
        (await state('RESTORE', 'ARCHIVED')).json().status,
        'PAUSED',
      );
      assert.equal((await state('RESUME', 'PAUSED')).json().status, 'ACTIVE');
      assert.equal(
        (await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } }))
          .telegramMessageId,
        '7',
      );
      assert.equal(
        (await prisma.product.findUniqueOrThrow({ where: { id: product.id } }))
          .reservedQuantity,
        1,
      );
      assert.equal(
        await prisma.orderRequest.count({ where: { ownerUserId: a.id } }),
        1501,
      );
      const draft = await prisma.offer.create({
        data: { ownerUserId: a.id, productId: product.id, title: 'Draft' },
      });
      assert.equal((await state('ARCHIVE', 'DRAFT', draft.id)).statusCode, 200);
      assert.equal(
        (await app.inject({ url: `/public/offers/${draft.id}` })).statusCode,
        404,
      );
      assert.equal(
        (await state('RESTORE', 'ARCHIVED', draft.id)).json().status,
        'DRAFT',
      );
      await prisma.offer.update({
        where: { id: draft.id },
        data: { publishState: 'SENDING' },
      });
      assert.equal((await state('ARCHIVE', 'DRAFT', draft.id)).statusCode, 409);
      assert.equal(externalCalls, 0);
    } finally {
      globalThis.fetch = originalFetch;
      await app.close();
      await prisma.$disconnect();
      await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.$disconnect();
    }
  },
);
