import { createHmac, timingSafeEqual } from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import { InputError, objectBody, textField } from '../../lib/input.js';
import { telegramCall } from '../../lib/telegramChannels.js';
import { verifiedPublishChannel } from '../channels/service.js';
import { offerLinks } from '../../lib/miniAppLinks.js';
import {
  approveCheckout,
  isBillingExempt,
  billingHistory,
  prepareInvoice,
  quote,
  recordPayment,
  requestRefund,
  TERMS_VERSION,
} from './service.js';
import { recordRefund } from './worker.js';

export async function billingRoutes(app: FastifyInstance) {
  app.get('/config', async (request) => ({
    enabled: env.STARS_BILLING_ENABLED,
    exempt: isBillingExempt(request.seller.telegramUserId),
    priceStars: env.PUBLICATION_PRICE_STARS,
  }));
  app.get('/history', async (request) => ({
    payments: await billingHistory(request.seller.id),
  }));
  app.get('/offers/:id', async (request) =>
    quote(request.seller.id, (request.params as { id: string }).id),
  );
  app.post('/offers/:id/refund', async (request) =>
    requestRefund(request.seller.id, (request.params as { id: string }).id),
  );
  app.post('/offers/:id/invoice', async (request) => {
    const id = (request.params as { id: string }).id;
    const body = objectBody(request.body);
    if (body.termsVersion !== TERMS_VERSION || body.acceptTerms !== true)
      throw new InputError(400, 'Подтвердите условия размещения.');
    await quote(request.seller.id, id); // owner check before Telegram calls
    await verifiedPublishChannel(
      request.seller.id,
      request.seller.telegramUserId,
    );
    if (!(await offerLinks(id)))
      throw new InputError(409, 'Мини-приложение пока не настроено.');
    const result = await prepareInvoice(
      request.seller.id,
      request.seller.telegramUserId,
      id,
    );
    if (!result.invoice) return result;
    const invoice = result.invoice;
    const url = await telegramCall<string>(
      env.TELEGRAM_BOT_TOKEN!,
      'createInvoiceLink',
      {
        title: 'Одно размещение товара',
        description:
          'Один пост в вашем канале. Без подписки и комиссии с заказов.',
        payload: invoice.id,
        provider_token: '',
        currency: 'XTR',
        prices: [{ label: 'Размещение', amount: invoice.stars }],
      },
    );
    return { url, stars: invoice.stars };
  });
}

// Only updates received by our bot from Telegram may enter the payment ledger.
export async function internalBillingRoutes(app: FastifyInstance) {
  app.post(
    '/internal/stars/:event',
    { config: { rateLimit: false } },
    async (request, reply) => {
      if (!env.TELEGRAM_BOT_TOKEN)
        throw new InputError(503, 'Bot not configured');
      const expected = createHmac('sha256', env.TELEGRAM_BOT_TOKEN)
        .update('tg-showcase/stars-events')
        .digest('hex');
      const supplied =
        request.headers.authorization?.replace(/^Bearer /, '') ?? '';
      if (
        !/^[a-f0-9]{64}$/.test(supplied) ||
        !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))
      )
        return reply.code(401).send({ message: 'Unauthorized' });
      const body = objectBody(request.body);
      const input = {
        invoiceId: textField(body.invoiceId, 'Invoice', 128),
        telegramUserId: textField(body.telegramUserId, 'User', 32),
        stars: body.stars as number,
        currency: textField(body.currency, 'Currency', 8),
      };
      if (
        !/^\d+$/.test(input.telegramUserId) ||
        !Number.isSafeInteger(input.stars) ||
        input.stars < 1 ||
        input.stars > 10000
      )
        throw new InputError(400, 'Invalid payment event');
      const event = (request.params as { event: string }).event;
      if (event === 'checkout')
        return approveCheckout({
          ...input,
          queryId: textField(body.queryId, 'Query', 128),
        });
      const chargeId = textField(body.chargeId, 'Charge', 256);
      if (event === 'success') return recordPayment({ ...input, chargeId });
      if (event === 'refund') return recordRefund({ ...input, chargeId });
      throw new InputError(404, 'Unknown payment event');
    },
  );
}
