import { createHash, createHmac } from 'node:crypto';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { resolve } from 'node:path';
import { Telegraf } from 'telegraf';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

type PaymentEvent = {
  event: 'success' | 'refund';
  invoiceId: string;
  telegramUserId: string;
  currency: string;
  stars: number;
  chargeId: string;
};
const spool = resolve(
  process.env.PAYMENT_EVENTS_DIR ?? '.runtime/payment-events',
);
const authorization = createHmac('sha256', env.BOT_TOKEN)
  .update('tg-showcase/stars-events')
  .digest('hex');
async function deliver(event: string, body: object, timeout = 6000) {
  const response = await fetch(
    `${env.BACKEND_INTERNAL_URL.replace(/\/$/, '')}/internal/stars/${event}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${authorization}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    },
  );
  return response.ok;
}

// Persist successful payments before returning from Telegram's update handler.
// Backend retries are idempotent by charge ID and survive process restarts.
export async function persistPayment(event: PaymentEvent) {
  await mkdir(spool, { recursive: true });
  const name = createHash('sha256')
    .update(`${event.event}:${event.chargeId}`)
    .digest('hex');
  const temporary = resolve(spool, `${name}.tmp`);
  await writeFile(temporary, JSON.stringify(event), { mode: 0o600 });
  await rename(temporary, resolve(spool, `${name}.json`));
}
let running: Promise<void> | undefined;
export async function drainPayments() {
  if (running) return running;
  running = (async () => {
    await mkdir(spool, { recursive: true });
    const names = (await readdir(spool))
      .filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
      .slice(0, 50);
    for (const name of names) {
      try {
        const path = resolve(spool, name);
        const event = JSON.parse(await readFile(path, 'utf8')) as PaymentEvent;
        if (await deliver(event.event, event)) await unlink(path);
      } catch {
        logger.info('Payment event retained for retry');
      }
    }
  })().finally(() => {
    running = undefined;
  });
  return running;
}

export function registerPayments(bot: Telegraf) {
  // Register before general text flood controls: payment updates must never be dropped.
  bot.on('pre_checkout_query', async (ctx) => {
    const query = ctx.preCheckoutQuery;
    let ok = false;
    try {
      ok = await deliver('checkout', {
        invoiceId: query.invoice_payload,
        telegramUserId: String(ctx.from.id),
        currency: query.currency,
        stars: query.total_amount,
        queryId: query.id,
      });
    } catch {
      /* deny if backend cannot confirm */
    }
    await ctx.answerPreCheckoutQuery(
      ok,
      ok
        ? undefined
        : 'Не удалось подтвердить счёт. Вернитесь в карточку товара и проверьте оплату.',
    );
  });
  bot.on('successful_payment', async (ctx) => {
    const payment = ctx.message.successful_payment;
    await persistPayment({
      event: 'success',
      invoiceId: payment.invoice_payload,
      telegramUserId: String(ctx.from.id),
      currency: payment.currency,
      stars: payment.total_amount,
      chargeId: payment.telegram_payment_charge_id,
    });
    void drainPayments().catch(() =>
      logger.info('Payment delivery will retry'),
    );
  });
  bot.on('message', async (ctx, next) => {
    // Telegraf's bundled Bot API types predate refunded_payment.
    const payment = (
      ctx.message as unknown as {
        refunded_payment?: {
          invoice_payload: string;
          currency: string;
          total_amount: number;
          telegram_payment_charge_id: string;
        };
      }
    ).refunded_payment;
    if (!payment) return next();
    await persistPayment({
      event: 'refund',
      invoiceId: payment.invoice_payload,
      telegramUserId: String(ctx.chat.id),
      currency: payment.currency,
      stars: payment.total_amount,
      chargeId: payment.telegram_payment_charge_id,
    });
    void drainPayments().catch(() => logger.info('Refund delivery will retry'));
  });
  const timer = setInterval(() => {
    void drainPayments().catch(() =>
      logger.info('Payment delivery will retry'),
    );
  }, 5000);
  timer.unref();
}
