import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

test(
  'Stars billing: free quota races, authenticated checkout, duplicate payments and refunds',
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
    process.env.STARS_BILLING_ENABLED = '1';
    process.env.PUBLICATION_PRICE_STARS = '30';
    process.env.BILLING_EXEMPT_TELEGRAM_IDS = '1003';
    const { prisma } = await import('../src/lib/prisma.js');
    const { buildApp } = await import('../src/app.js');
    const app = buildApp();
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
      const {
        claimPublication,
        finishPublication,
        prepareInvoice,
        approveCheckout,
        recordPayment,
        quote,
        requestRefund,
      } = await import('../src/modules/billing/service.js');
      const { processRefunds, recordRefund } =
        await import('../src/modules/billing/worker.js');
      const product = await prisma.product.create({
        data: {
          ownerUserId: seller.id,
          title: 'Socks',
          priceText: '600',
          priceMinor: 60000,
          quantityLimit: 10,
        },
      });
      const offer = () =>
        prisma.offer.create({
          data: {
            ownerUserId: seller.id,
            productId: product.id,
            title: 'Socks',
          },
        });
      const offers = await Promise.all([offer(), offer(), offer(), offer()]);
      const claims = await Promise.allSettled(
        offers.map((o) => claimPublication(seller.id, o.id)),
      );
      assert.equal(claims.filter((v) => v.status === 'fulfilled').length, 3);
      assert.equal(
        await prisma.publicationBill.count({
          where: { kind: 'FREE', state: 'PUBLISHING' },
        }),
        3,
      );
      const held = await prisma.publicationBill.findFirstOrThrow();
      await finishPublication(held.offerId, 'REJECTED');
      assert.equal((await quote(seller.id, held.offerId)).freeRemaining, 1);
      await claimPublication(seller.id, held.offerId);
      await finishPublication(held.offerId, 'UNCERTAIN');
      assert.equal((await quote(seller.id, held.offerId)).freeRemaining, 0);
      await assert.rejects(() => claimPublication(seller.id, held.offerId));
      const paidOffer = await offer();
      await assert.rejects(() => claimPublication(seller.id, paidOffer.id));
      await assert.rejects(() =>
        prepareInvoice(other.id, '1002', paidOffer.id),
      );
      assert.equal(
        (
          await app.inject({
            url: `/billing/offers/${paidOffer.id}`,
            headers: auth(1002),
          })
        ).statusCode,
        404,
      );
      assert.equal(
        (
          await app.inject({
            method: 'POST',
            url: '/internal/stars/success',
            payload: {},
          })
        ).statusCode,
        401,
      );
      assert.equal(
        (
          await app.inject({
            method: 'POST',
            url: `/billing/offers/${paidOffer.id}/invoice`,
            headers: auth(1001),
            payload: { acceptTerms: false },
          })
        ).statusCode,
        400,
      );
      const [first, second] = await Promise.all([
        prepareInvoice(seller.id, '1001', paidOffer.id),
        prepareInvoice(seller.id, '1001', paidOffer.id),
      ]);
      const invoice = first.invoice!;
      assert.equal(invoice.id, second.invoice!.id);
      const input = {
        invoiceId: invoice.id,
        telegramUserId: '1001',
        currency: 'XTR',
        stars: 30,
        queryId: 'checkout1',
      };
      await assert.rejects(() =>
        approveCheckout({ ...input, telegramUserId: '1002' }),
      );
      await assert.rejects(() => approveCheckout({ ...input, stars: 1 }));
      await assert.rejects(() =>
        approveCheckout({ ...input, currency: 'RUB' }),
      );
      await approveCheckout(input);
      await approveCheckout(input);
      await assert.rejects(() =>
        approveCheckout({ ...input, queryId: 'checkout2' }),
      );
      const payment = { ...input, chargeId: 'charge-one' };
      await Promise.all([recordPayment(payment), recordPayment(payment)]);
      assert.equal(await prisma.starPayment.count(), 1);
      assert.equal((await quote(seller.id, paidOffer.id)).paid, true);
      await assert.rejects(() => recordPayment({ ...payment, stars: 2 }));
      // A second real charge is tracked and refunded, never a second entitlement.
      assert.equal(
        (await recordPayment({ ...payment, chargeId: 'duplicate-charge' }))
          .state,
        'REFUND_PENDING',
      );
      const originalFetch = globalThis.fetch;
      try {
        let refunds = 0;
        globalThis.fetch = async (url) => {
          assert.match(String(url), /refundStarPayment$/);
          refunds++;
          return new Response(JSON.stringify({ ok: true, result: true }), {
            status: 200,
          });
        };
        await processRefunds();
        await processRefunds();
        assert.equal(refunds, 1);
        assert.equal((await quote(seller.id, paidOffer.id)).paid, true);
        await claimPublication(seller.id, paidOffer.id);
        await assert.rejects(() => requestRefund(seller.id, paidOffer.id));
        await finishPublication(paidOffer.id, 'REJECTED');
        assert.equal(
          (await quote(seller.id, paidOffer.id)).state,
          'REFUND_PENDING',
        );
        await processRefunds();
        assert.equal(refunds, 2);
        assert.equal((await quote(seller.id, paidOffer.id)).state, 'REFUNDED');
        const retry = await prepareInvoice(seller.id, '1001', paidOffer.id);
        assert.notEqual(retry.invoice!.id, invoice.id);
        const retryInput = {
          ...input,
          invoiceId: retry.invoice!.id,
          queryId: 'checkout3',
        };
        await approveCheckout(retryInput);
        await recordPayment({ ...retryInput, chargeId: 'charge-retry' });
        await claimPublication(seller.id, paidOffer.id);
        await finishPublication(paidOffer.id, 'SENT', {
          messageId: '42',
          channelId: '-1001234567',
        });
        await assert.rejects(() => claimPublication(seller.id, paidOffer.id));
        await assert.rejects(() => requestRefund(seller.id, paidOffer.id));
        assert.equal((await quote(seller.id, paidOffer.id)).state, 'CONSUMED');
        // Delayed/refunded update is authenticated and cannot be undone by payment replay.
        await recordRefund({ ...retryInput, chargeId: 'charge-retry' });
        await recordPayment({ ...retryInput, chargeId: 'charge-retry' });
        assert.equal((await quote(seller.id, paidOffer.id)).state, 'REFUNDED');
        const unused = await offer();
        const inv = (await prepareInvoice(seller.id, '1001', unused.id))
          .invoice!;
        const unusedInput = {
          ...input,
          invoiceId: inv.id,
          queryId: 'checkout4',
        };
        await approveCheckout(unusedInput);
        await recordPayment({ ...unusedInput, chargeId: 'unused' });
        await requestRefund(seller.id, unused.id);
        await requestRefund(seller.id, unused.id);
        await processRefunds();
        assert.equal(refunds, 3);
        assert.equal(
          (
            await app.inject({ url: '/billing/history', headers: auth(1002) })
          ).json().payments.length,
          0,
        );
        assert.equal(
          (
            await app.inject({ url: '/billing/history', headers: auth(1001) })
          ).json().payments.length,
          4,
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
      const developer = await prisma.user.create({
        data: { telegramUserId: '1003', username: 'old_name' },
      });
      for (let i = 0; i < 5; i++) {
        const draft = await prisma.offer.create({
          data: {
            ownerUserId: developer.id,
            productId: product.id,
            title: 'Developer test',
          },
        });
        assert.equal((await quote(developer.id, draft.id)).enabled, false);
        assert.equal((await quote(developer.id, draft.id)).exempt, true);
        assert.deepEqual(await prepareInvoice(developer.id, '1003', draft.id), {
          free: true,
        });
        await claimPublication(developer.id, draft.id);
        await finishPublication(draft.id, 'REJECTED');
        assert.equal((await quote(developer.id, draft.id)).state, 'RELEASED');
        await claimPublication(developer.id, draft.id);
        await finishPublication(draft.id, 'SENT', {
          messageId: String(100 + i),
          channelId: '-1001234567',
        });
        assert.equal((await quote(developer.id, draft.id)).freeRemaining, 3);
        await assert.rejects(() => claimPublication(developer.id, draft.id));
        await assert.rejects(() => quote(other.id, draft.id));
      }
      assert.equal(
        await prisma.publicationBill.count({
          where: {
            ownerUserId: developer.id,
            kind: 'EXEMPT',
            state: 'CONSUMED',
          },
        }),
        5,
      );
      assert.equal(
        await prisma.starInvoice.count({
          where: { ownerUserId: developer.id },
        }),
        0,
      );
      await prisma.user.update({
        where: { id: developer.id },
        data: { username: 'new_name' },
      });
      await prisma.user.update({
        where: { id: other.id },
        data: { username: 'old_name' },
      });
      assert.equal(
        (
          await app.inject({ url: '/billing/config', headers: auth(1003) })
        ).json().exempt,
        true,
      );
      assert.equal(
        (
          await app.inject({ url: '/billing/config', headers: auth(1002) })
        ).json().exempt,
        false,
      );
      await assert.rejects(() =>
        approveCheckout({
          invoiceId: 'unused',
          telegramUserId: '1003',
          currency: 'XTR',
          stars: 30,
          queryId: 'exempt',
        }),
      );
    } finally {
      await app.close();
      await prisma.$disconnect();
      await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.$disconnect();
    }
  },
);
