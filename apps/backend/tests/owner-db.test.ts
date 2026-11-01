import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

test(
  'hub visibility, owner boundary, audited concurrent editing and Stars reporting',
  { skip: process.env.RUN_DB_TESTS !== '1' },
  async () => {
    config({ quiet: true });
    const admin = new PrismaClient();
    const schema = 'owner_test_' + randomUUID().replaceAll('-', '');
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    const db = new URL(process.env.DATABASE_URL!);
    db.searchParams.set('schema', schema);
    process.env.DATABASE_URL = db.toString();
    process.env.TELEGRAM_BOT_TOKEN = '999:owner-test';
    process.env.OWNER_TELEGRAM_IDS = '1001';
    process.env.BILLING_EXEMPT_TELEGRAM_IDS = '1003';
    const { prisma } = await import('../src/lib/prisma.js');
    const { buildApp } = await import('../src/app.js');
    const app = buildApp();
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async (url) => {
      assert.ok(String(url).endsWith('/getMyStarBalance'));
      calls++;
      return new Response(JSON.stringify({ ok: true, result: { amount: 0 } }));
    };
    function auth(id: number) {
      const p = new URLSearchParams({
        auth_date: String(Math.floor(Date.now() / 1000)),
        user: JSON.stringify({
          id,
          first_name: 'Owner',
          username: 'valentin_marapulets',
        }),
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
        for (const sql of (
          await readFile(`prisma/migrations/${dir}/migration.sql`, 'utf8')
        )
          .split(';')
          .filter((s) => s.trim()))
          await prisma.$executeRawUnsafe(sql);
      }
      for (const url of [
        '/admin/summary',
        '/admin/stars',
        '/admin/payments',
        '/admin/problems',
        '/admin/projects',
        '/admin/audit',
      ]) {
        assert.equal((await app.inject({ url })).statusCode, 401);
        for (const id of [1002, 1003])
          assert.equal(
            (await app.inject({ url, headers: auth(id) })).statusCode,
            403,
          );
      }
      for (const method of ['POST', 'PUT'] as const)
        assert.equal(
          (
            await app.inject({
              method,
              url:
                '/admin/projects' + (method === 'PUT' ? '/pocketshowcase' : ''),
              headers: auth(1003),
              payload: {},
            })
          ).statusCode,
          403,
        );
      assert.equal(
        (await app.inject({ url: '/owner-access', headers: auth(1001) })).json()
          .isOwner,
        true,
      );
      assert.equal(
        (await app.inject({ url: '/owner-access', headers: auth(1003) })).json()
          .isOwner,
        false,
      );
      const forged = auth(1002);
      forged.authorization = forged.authorization.replace('1002', '1001');
      assert.equal(
        (await app.inject({ url: '/admin/summary', headers: forged }))
          .statusCode,
        401,
      );
      const initial = (await app.inject({ url: '/projects' })).json().projects;
      assert.equal(initial.length, 1);
      assert.equal(initial[0].slug, 'pocketshowcase');
      assert.equal(initial[0].id, undefined);
      const data = {
        slug: 'new-project',
        name: 'New project',
        summary: 'Small summary',
        description: 'Description',
        telegramUrl: 'https://t.me/example_bot?startapp',
        status: 'COMING_SOON',
        visible: false,
      };
      const create = await app.inject({
        method: 'POST',
        url: '/admin/projects',
        headers: auth(1001),
        payload: data,
      });
      assert.equal(create.statusCode, 201, create.body);
      const row = create.json();
      assert.equal(
        (await app.inject({ url: '/projects/new-project' })).statusCode,
        404,
      );
      for (const telegramUrl of [
        'javascript:alert(1)',
        'https://t.me.evil.test/example_bot',
        'https://evil.test/example_bot',
        'https://t.me/+invite',
      ])
        assert.equal(
          (
            await app.inject({
              method: 'POST',
              url: '/admin/projects',
              headers: auth(1001),
              payload: { ...data, telegramUrl },
            })
          ).statusCode,
          400,
        );
      assert.equal(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/projects',
            headers: auth(1001),
            payload: data,
          })
        ).statusCode,
        409,
      );
      const edits = await Promise.all(
        [1, 2].map(() =>
          app.inject({
            method: 'PUT',
            url: '/admin/projects/' + row.id,
            headers: auth(1001),
            payload: { ...data, visible: true, version: 0 },
          }),
        ),
      );
      assert.deepEqual(edits.map((r) => r.statusCode).sort(), [200, 409]);
      assert.equal(await prisma.ownerAudit.count(), 2);
      assert.equal(
        (await app.inject({ url: '/projects/new-project' })).statusCode,
        200,
      );
      assert.equal(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/projects/' + row.id,
            headers: auth(1001),
            payload: { ...data, version: 1 },
          })
        ).statusCode,
        200,
      );
      assert.equal(
        (await app.inject({ url: '/projects/new-project' })).statusCode,
        404,
      );
      const owner = await prisma.user.findUniqueOrThrow({
        where: { telegramUserId: '1001' },
      });
      const product = await prisma.product.create({
        data: {
          ownerUserId: owner.id,
          title: 'Private product',
          priceText: '100',
          priceMinor: 10000,
        },
      });
      const offer = await prisma.offer.create({
        data: {
          ownerUserId: owner.id,
          productId: product.id,
          title: 'Private offer',
          publishState: 'UNCERTAIN',
        },
      });
      for (let i = 0; i < 32; i++)
        await prisma.starPayment.create({
          data: {
            chargeId: `charge-${i}`,
            invoiceId: `invoice-${i}`,
            offerId: offer.id,
            ownerUserId: owner.id,
            telegramUserId: '1001',
            stars: 30,
            state: i === 0 ? 'REFUNDED' : i === 1 ? 'REFUND_PENDING' : 'PAID',
            ...(i === 31 ? { createdAt: new Date('2020-01-01') } : {}),
          },
        });
      const summary = (
        await app.inject({
          url: '/admin/summary?period=7',
          headers: auth(1001),
        })
      ).json();
      assert.equal(summary.products, 1);
      assert.equal(
        summary.payments.reduce(
          (n: number, r: { _count: { _all: number } }) => n + r._count._all,
          0,
        ),
        31,
      );
      const all = (
        await app.inject({
          url: '/admin/summary?period=all',
          headers: auth(1001),
        })
      ).json();
      assert.equal(
        all.payments.reduce(
          (n: number, r: { _sum: { stars: number } }) => n + r._sum.stars,
          0,
        ),
        960,
      );
      assert.equal(
        (
          await app.inject({
            url: '/admin/summary?period=bad',
            headers: auth(1001),
          })
        ).statusCode,
        400,
      );
      const payments = (
        await app.inject({ url: '/admin/payments', headers: auth(1001) })
      ).json();
      assert.equal(payments.payments.length, 30);
      assert.equal(payments.next, 2);
      assert.equal(
        (
          await app.inject({
            url: '/admin/payments?page=2',
            headers: auth(1001),
          })
        ).json().payments.length,
        2,
      );
      const problems = (
        await app.inject({ url: '/admin/problems', headers: auth(1001) })
      ).json();
      assert.equal(problems.counts.offers, 1);
      assert.equal(problems.counts.refunds, 1);
      const balances = await Promise.all(
        [1, 2, 3].map(() =>
          app.inject({ url: '/admin/stars', headers: auth(1001) }),
        ),
      );
      assert.equal(calls, 1);
      assert.equal(balances[0].json().balance.amount, 0);
      assert.equal(balances[0].json().error, null);
      const failing = buildApp();
      globalThis.fetch = async () => {
        throw Error('Telegram unavailable');
      };
      try {
        const failed = (
          await failing.inject({ url: '/admin/stars', headers: auth(1001) })
        ).json();
        assert.equal(failed.balance, null);
        assert.equal(failed.stale, true);
        assert.ok(failed.error);
      } finally {
        await failing.close();
      }
    } finally {
      globalThis.fetch = originalFetch;
      await app.close();
      await prisma.$disconnect();
      await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.$disconnect();
    }
  },
);
