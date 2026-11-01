import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

test(
  'strict reversible order workflow: reasons, history, stock, repeat requests and stale versions',
  { skip: process.env.RUN_DB_TESTS !== '1' },
  async () => {
    config({ quiet: true });
    const admin = new PrismaClient({
        datasourceUrl: process.env.DATABASE_URL!,
      }),
      schema = 'workflow_' + randomUUID().replaceAll('-', '');
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    const url = new URL(process.env.DATABASE_URL!);
    url.searchParams.set('schema', schema);
    process.env.DATABASE_URL = url.toString();
    process.env.TELEGRAM_BOT_TOKEN = '999:workflow-test';
    const { prisma } = await import('../src/lib/prisma.js');
    const { buildApp } = await import('../src/app.js');
    const { createOrder, changeOrderStatus } =
      await import('../src/modules/orders/service.js');
    const app = buildApp();
    const payload = (
      status: string,
      expectedStatus: string,
      expectedVersion: number,
      extras = {},
    ) => ({
      status,
      expectedStatus,
      expectedVersion,
      requestKey: randomUUID(),
      ...extras,
    });
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
      for (const folder of (await readdir('prisma/migrations')).sort()) {
        if (folder === 'migration_lock.toml') continue;
        for (const sql of (
          await readFile(`prisma/migrations/${folder}/migration.sql`, 'utf8')
        )
          .split(';')
          .filter((v) => v.trim()))
          await prisma.$executeRawUnsafe(sql);
      }
      const seller = await prisma.user.create({
          data: { telegramUserId: '1001' },
        }),
        other = await prisma.user.create({ data: { telegramUserId: '1002' } });
      const product = await prisma.product.create({
        data: {
          ownerUserId: seller.id,
          title: 'Socks',
          priceText: '600',
          priceMinor: 60000,
          quantityLimit: 2,
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
      const newOrder = () =>
        createOrder(offer.id, {
          requestKey: randomUUID(),
          quantity: 2,
          unitPriceMinor: 60000,
          contactType: 'TELEGRAM',
          contact: '@buyer',
        });
      const order = await newOrder();
      const change = (body: unknown) =>
        changeOrderStatus(seller.id, order.id, body);
      const stock = async () =>
        (await prisma.product.findUniqueOrThrow({ where: { id: product.id } }))
          .reservedQuantity;
      await assert.rejects(() => change(payload('DONE', 'NEW', 0)));
      assert.equal(await prisma.orderHistory.count(), 0);
      assert.equal(await stock(), 2);
      const take = payload('IN_PROGRESS', 'NEW', 0);
      await Promise.all([change(take), change(take)]);
      assert.equal(await prisma.orderHistory.count(), 1);
      await change(payload('DONE', 'IN_PROGRESS', 1));
      await assert.rejects(() =>
        change(payload('RETURNED', 'DONE', 2, { restock: false })),
      );
      await assert.rejects(() =>
        change(
          payload('RETURNED', 'DONE', 2, {
            reason: 'Defect',
            restock: 'false',
          }),
        ),
      );
      await assert.rejects(() =>
        change(
          payload('RETURNED', 'DONE', 2, {
            reason: 'x'.repeat(501),
            restock: false,
          }),
        ),
      );
      await change(
        payload('RETURNED', 'DONE', 2, {
          reason: 'Брак, вещь непригодна для продажи',
          restock: false,
        }),
      );
      assert.equal(await stock(), 2);
      await change(
        payload('DONE', 'RETURNED', 3, { reason: 'Ошибочно отметил возврат' }),
      );
      const returned = payload('RETURNED', 'DONE', 4, {
        reason: 'Товар получен, исправен',
        restock: true,
      });
      await Promise.all([change(returned), change(returned)]);
      assert.equal(await stock(), 0);
      assert.equal(await prisma.orderHistory.count(), 5);
      assert.equal((await change(take)).status, 'RETURNED');
      assert.equal(await prisma.orderHistory.count(), 5);
      await assert.rejects(() => change({ ...returned, reason: 'Different' }));
      const competing = await newOrder();
      await assert.rejects(() =>
        change(payload('DONE', 'RETURNED', 5, { reason: 'Correction' })),
      );
      assert.equal(await stock(), 2);
      assert.equal(await prisma.orderHistory.count(), 5);
      const cancel = payload('CANCELLED', 'NEW', 0, {
        reason: 'Customer cancelled',
      });
      await Promise.all([
        changeOrderStatus(seller.id, competing.id, cancel),
        changeOrderStatus(seller.id, competing.id, cancel),
      ]);
      assert.equal(await stock(), 0);
      await change(
        payload('DONE', 'RETURNED', 5, { reason: 'Возврат был ошибочным' }),
      );
      assert.equal(await stock(), 2);
      await change(
        payload('IN_PROGRESS', 'DONE', 6, { reason: 'Ошибочно завершил' }),
      );
      await change(
        payload('NEW', 'IN_PROGRESS', 7, { reason: 'Нужно уточнить детали' }),
      );
      // Same status again is not the same version: reject an old browser tab.
      await assert.rejects(() => change(payload('IN_PROGRESS', 'NEW', 0)));
      await assert.rejects(() =>
        changeOrderStatus(other.id, order.id, payload('IN_PROGRESS', 'NEW', 8)),
      );
      const count = await prisma.orderHistory.count();
      const race = await Promise.allSettled([
        change(payload('IN_PROGRESS', 'NEW', 8)),
        change(payload('CANCELLED', 'NEW', 8, { reason: 'Race' })),
      ]);
      assert.equal(race.filter((v) => v.status === 'fulfilled').length, 1);
      assert.equal(await prisma.orderHistory.count(), count + 1);
      const current = await prisma.orderRequest.findUniqueOrThrow({
        where: { id: order.id },
      });
      if (current.status === 'IN_PROGRESS')
        await change(
          payload('CANCELLED', 'IN_PROGRESS', 9, { reason: 'Cancellation' }),
        );
      const cancelled = await prisma.orderRequest.findUniqueOrThrow({
        where: { id: order.id },
      });
      assert.equal(await stock(), 0);
      await change(
        payload('IN_PROGRESS', 'CANCELLED', cancelled.version, {
          reason: 'Покупатель подтвердил заказ',
        }),
      );
      assert.equal(await stock(), 2);
      assert.equal(
        (await app.inject({ url: `/orders/${order.id}/history` })).statusCode,
        401,
      );
      assert.equal(
        (
          await app.inject({
            url: `/orders/${order.id}/history`,
            headers: auth(1002),
          })
        ).statusCode,
        404,
      );
      const history = (
        await app.inject({
          url: `/orders/${order.id}/history`,
          headers: auth(1001),
        })
      ).json();
      assert.ok(
        history.events.some(
          (e: { reason: string }) =>
            e.reason === 'Брак, вещь непригодна для продажи',
        ),
      );
      assert.equal(history.events[0].requestKey, undefined);
      assert.equal(history.events[0].actorUserId, undefined);
      assert.equal(
        (
          await app.inject({ url: `/orders/${order.id}`, headers: auth(1001) })
        ).json().status,
        'IN_PROGRESS',
      );
      assert.equal(
        (
          await app.inject({
            method: 'PATCH',
            url: `/orders/${order.id}`,
            headers: auth(1001),
            payload: { status: 'DONE', expectedStatus: 'IN_PROGRESS' },
          })
        ).statusCode,
        400,
      );
      for (let i = 0; i < 12; i++) {
        const snapshot = await prisma.orderRequest.findUniqueOrThrow({
          where: { id: order.id },
        });
        await change(
          payload(
            snapshot.status === 'IN_PROGRESS' ? 'DONE' : 'IN_PROGRESS',
            snapshot.status,
            snapshot.version,
            { reason: 'Проверка истории' },
          ),
        );
      }
      const page1 = (
        await app.inject({
          url: `/orders/${order.id}/history`,
          headers: auth(1001),
        })
      ).json();
      assert.equal(page1.events.length, 20);
      assert.ok(page1.next);
      const page2 = (
        await app.inject({
          url: `/orders/${order.id}/history?before=${page1.next}`,
          headers: auth(1001),
        })
      ).json();
      assert.ok(page2.events.length > 0);
      assert.ok(
        page2.events.every(
          (event: { id: string }) =>
            !page1.events.some(
              (first: { id: string }) => first.id === event.id,
            ),
        ),
      );
      const otherHistory = await prisma.orderHistory.findFirstOrThrow({
        where: { orderId: competing.id },
      });
      assert.equal(
        (
          await app.inject({
            url: `/orders/${order.id}/history?before=${otherHistory.id}`,
            headers: auth(1001),
          })
        ).statusCode,
        400,
      );
    } finally {
      await app.close();
      await prisma.$disconnect();
      await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.$disconnect();
    }
  },
);
