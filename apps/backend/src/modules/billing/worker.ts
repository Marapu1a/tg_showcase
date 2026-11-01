import { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { InputError } from '../../lib/input.js';
import { serializable } from '../../lib/transaction.js';

export async function recordRefund(input: {
  invoiceId: string;
  telegramUserId: string;
  stars: number;
  currency: string;
  chargeId: string;
}) {
  return serializable(async (tx) => {
    const payment = await tx.starPayment.findUnique({
      where: { chargeId: input.chargeId },
    });
    if (!payment) throw new InputError(409, 'Payment event must arrive first');
    if (
      payment.invoiceId !== input.invoiceId ||
      payment.telegramUserId !== input.telegramUserId ||
      payment.stars !== input.stars ||
      input.currency !== 'XTR'
    )
      throw new InputError(400, 'Refund mismatch');
    await tx.starPayment.update({
      where: { chargeId: payment.chargeId },
      data: { state: 'REFUNDED' },
    });
    await tx.publicationBill.updateMany({
      where: { paymentId: payment.chargeId },
      data: { state: 'REFUNDED' },
    });
    return { state: 'REFUNDED' };
  });
}

export async function processRefunds() {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  const payments = await prisma.starPayment.findMany({
    where: { state: 'REFUND_PENDING', refundNextAt: { lte: new Date() } },
    take: 10,
    orderBy: { refundNextAt: 'asc' },
  });
  for (const payment of payments) {
    const claim = await prisma.starPayment.updateMany({
      where: {
        chargeId: payment.chargeId,
        state: 'REFUND_PENDING',
        refundNextAt: payment.refundNextAt,
      },
      data: {
        refundNextAt: new Date(Date.now() + 120000),
        refundAttempts: { increment: 1 },
      },
    });
    if (!claim.count) continue;
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/refundStarPayment`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(8000),
          body: JSON.stringify({
            user_id: Number(payment.telegramUserId),
            telegram_payment_charge_id: payment.chargeId,
          }),
        },
      );
      const data = (await response.json()) as {
        ok?: boolean;
        result?: boolean;
        description?: string;
      };
      if (
        !(response.ok && data.ok && data.result) &&
        !data.description?.includes('CHARGE_ALREADY_REFUNDED')
      )
        throw new Error('Refund not confirmed');
      await recordRefund({ ...payment, currency: 'XTR' });
    } catch {
      await prisma.starPayment.updateMany({
        where: { chargeId: payment.chargeId, state: 'REFUND_PENDING' },
        data: {
          refundNextAt: new Date(
            Date.now() +
              Math.min(
                3600000,
                30000 * 2 ** Math.min(7, payment.refundAttempts),
              ),
          ),
        },
      });
    }
  }
}

export function startBillingWorker(app: FastifyInstance) {
  let running: Promise<void> | undefined;
  let timer: ReturnType<typeof setInterval>;
  const tick = () => {
    if (running) return;
    running = processRefunds()
      .catch(() => app.log.warn('Billing refund worker will retry'))
      .finally(() => {
        running = undefined;
      });
  };
  app.addHook('onReady', async () => {
    timer = setInterval(tick, 10000);
    timer.unref();
    tick();
  });
  app.addHook('onClose', async () => {
    clearInterval(timer);
    await running;
  });
}
