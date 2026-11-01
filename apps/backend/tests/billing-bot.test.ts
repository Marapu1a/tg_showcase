import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('bot persists payment events, retries delivery and declines checkout on outage', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'showcase-payments-'));
  process.env.PAYMENT_EVENTS_DIR = directory;
  process.env.BOT_TOKEN = '999:billing-test';
  process.env.TEST_CHANNEL_ID = '-1001234567';
  process.env.BACKEND_INTERNAL_URL = 'http://127.0.0.1:1';
  const { persistPayment, drainPayments, registerPayments } = await import('../../bot/src/handlers/payments.js');
  const originalFetch = globalThis.fetch;
  const handlers: Record<string, (ctx: unknown, next?: () => void) => Promise<void>> = {};
  try {
    registerPayments({ on(name: string, handler: typeof handlers[string]) { handlers[name] = handler; } } as never);
    let available = false, deliveries = 0;
    globalThis.fetch = async (_url, options) => {
      assert.ok((options?.headers as Record<string, string>).authorization.startsWith('Bearer '));
      deliveries++;
      return new Response('{}', { status: available ? 200 : 503 });
    };
    const event = { event: 'success' as const, invoiceId: 'invoice', telegramUserId: '1001', currency: 'XTR', stars: 30, chargeId: 'test-charge' };
    await persistPayment(event); await persistPayment(event);
    assert.equal((await readdir(directory)).filter(n => n.endsWith('.json')).length, 1);
    await drainPayments();
    assert.equal((await readdir(directory)).length, 1);
    let approved: boolean | undefined;
    await handlers.pre_checkout_query!({ preCheckoutQuery: { invoice_payload: 'invoice', currency: 'XTR', total_amount: 30, id: 'q' }, from: { id: 1001 }, answerPreCheckoutQuery: async (ok: boolean) => { approved = ok; } });
    assert.equal(approved, false);
    available = true;
    await drainPayments(); await drainPayments();
    assert.equal((await readdir(directory)).length, 0);
    assert.equal(deliveries, 3);
    assert.ok(handlers.successful_payment);
    assert.ok(handlers.message);
  } finally {
    globalThis.fetch = originalFetch;
    const target = resolve(directory);
    assert.ok(target.startsWith(resolve(tmpdir()) + '\\') || target.startsWith(resolve(tmpdir()) + '/'));
    await rm(target, { recursive: true, force: true });
  }
});
