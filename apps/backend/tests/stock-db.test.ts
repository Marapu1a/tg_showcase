import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

test(
  'stock breakdown, overdue queue, idempotent additions and concurrent reservations',
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
      const { addStock, listingStock } =
        await import('../src/modules/listings/stock.js');
      const product = await prisma.product.create({
        data: {
          ownerUserId: seller.id,
          title: 'Socks',
          priceText: '600',
          priceMinor: 60000,
          quantityLimit: 20,
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
      let contact = 0;
      async function order(quantity: number) {
        return createOrder(offer.id, {
          requestKey: randomUUID(),
          quantity,
          unitPriceMinor: 60000,
          contactType: 'TELEGRAM',
          contact: `@customer${contact++}`,
        });
      }
      async function transition(id: string, status: string, extras = {}) {
        const current = await prisma.orderRequest.findUniqueOrThrow({
          where: { id },
        });
        return changeOrderStatus(
          seller.id,
          id,
          payload(status, current.status, current.version, {
            reason: 'Test',
            ...extras,
          }),
        );
      }
      const old = await order(2),
        fresh = await order(1),
        working = await order(3),
        done = await order(2),
        defect = await order(1),
        returned = await order(1),
        cancelled = await order(1);
      await prisma.orderRequest.updateMany({
        where: { id: { in: [old.id, working.id] } },
        data: { createdAt: new Date(Date.now() - 2 * 86400000) },
      });
      await transition(working.id, 'IN_PROGRESS');
      for (const item of [done, defect, returned]) {
        await transition(item.id, 'IN_PROGRESS');
        await transition(item.id, 'DONE');
      }
      await transition(defect.id, 'RETURNED', { restock: false });
      await transition(returned.id, 'RETURNED', { restock: true });
      await transition(cancelled.id, 'CANCELLED');
      const stock = await listingStock(seller.id, offer.id);
      assert.deepEqual(
        [
          stock.total,
          stock.reserved,
          stock.sold,
          stock.withheldReturns,
          stock.returnedToStock,
          stock.available,
          stock.discrepancy,
        ],
        [20, 6, 2, 1, 1, 11, 0],
      );
      const overdue = await app.inject({
        url: '/orders?scope=overdue',
        headers: auth(1001),
      });
      assert.deepEqual(
        overdue.json().orders.map((o: { id: string }) => o.id),
        [old.id],
      );
      assert.equal(
        (
          await app.inject({
            url: '/orders?scope=overdue',
            headers: auth(1002),
          })
        ).json().total,
        0,
      );
      assert.equal(
        (
          await app.inject({
            url: `/orders?scope=overdue&q=${fresh.number}`,
            headers: auth(1001),
          })
        ).json().total,
        0,
      );
      assert.equal(
        (await app.inject({ url: `/listings/${offer.id}/stock` })).statusCode,
        401,
      );
      assert.equal(
        (
          await app.inject({
            url: `/listings/${offer.id}/stock`,
            headers: auth(1002),
          })
        ).statusCode,
        404,
      );
      for (const payload of [
        { quantityLimit: 1 },
        { quantityLimit: null },
        { status: 'ARCHIVED' },
      ]) {
        assert.equal(
          (
            await app.inject({
              method: 'PATCH',
              url: `/products/${product.id}`,
              headers: auth(1001),
              payload,
            })
          ).statusCode,
          409,
        );
      }
      assert.equal(
        (
          await app.inject({
            method: 'DELETE',
            url: `/products/${product.id}`,
            headers: auth(1001),
          })
        ).statusCode,
        410,
      );
      assert.equal(
        (await prisma.product.findUniqueOrThrow({ where: { id: product.id } }))
          .quantityLimit,
        20,
      );
      assert.equal(
        (await prisma.product.findUniqueOrThrow({ where: { id: product.id } }))
          .status,
        'ACTIVE',
      );
      const addition = {
        requestKey: randomUUID(),
        quantity: 5,
        note: 'New batch',
      };
      const additions = await Promise.all([
        addStock(seller.id, offer.id, addition),
        addStock(seller.id, offer.id, addition),
      ]);
      assert.equal(additions[0].id, additions[1].id);
      assert.equal(await prisma.stockAddition.count(), 1);
      assert.equal((await listingStock(seller.id, offer.id)).total, 25);
      await assert.rejects(() => addStock(other.id, offer.id, addition));
      await assert.rejects(() =>
        addStock(seller.id, offer.id, { ...addition, quantity: 4 }),
      );
      for (const quantity of [0, -1, 1.5, 100001, '4'])
        await assert.rejects(() =>
          addStock(seller.id, offer.id, { requestKey: randomUUID(), quantity }),
        );
      await assert.rejects(() =>
        addStock(seller.id, offer.id, {
          requestKey: randomUUID(),
          quantity: 100000,
        }),
      );
      await assert.rejects(() =>
        addStock(seller.id, offer.id, {
          requestKey: randomUUID(),
          quantity: 1,
          note: 'x'.repeat(301),
        }),
      );
      await Promise.all([
        order(1),
        addStock(seller.id, offer.id, {
          requestKey: randomUUID(),
          quantity: 1,
        }),
      ]);
      const after = await listingStock(seller.id, offer.id);
      assert.equal(after.available, 16);
      assert.equal(after.discrepancy, 0);
      await prisma.offer.update({
        where: { id: offer.id },
        data: { status: 'PAUSED' },
      });
      await addStock(seller.id, offer.id, {
        requestKey: randomUUID(),
        quantity: 1,
      });
      assert.equal(
        (await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } }))
          .status,
        'PAUSED',
      );
      assert.equal(
        (await listingStock(seller.id, offer.id)).additions.length,
        3,
      );
      await prisma.product.update({
        where: { id: product.id },
        data: { quantityLimit: null },
      });
      await assert.rejects(() =>
        addStock(seller.id, offer.id, {
          requestKey: randomUUID(),
          quantity: 1,
        }),
      );
      assert.equal((await listingStock(seller.id, offer.id)).available, null);
    } finally {
      await app.close();
      await prisma.$disconnect();
      await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.$disconnect();
    }
  },
);
