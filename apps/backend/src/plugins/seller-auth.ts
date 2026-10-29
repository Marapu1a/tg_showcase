import { FastifyInstance } from 'fastify';
import {
  TelegramIdentity,
  validateTelegramInitData,
} from '../lib/telegramAuth.js';

type Seller = { id: string; telegramUserId: string };
type Dependencies = {
  token: string | undefined;
  ensureUser: (identity: TelegramIdentity) => Promise<Seller>;
};

declare module 'fastify' {
  interface FastifyRequest {
    seller: Seller;
  }
}

export function registerSellerAuth(app: FastifyInstance, deps: Dependencies) {
  const budgets = new Map<string, { until: number; count: number }>();
  app.decorateRequest('seller');
  app.addHook('onRequest', async (request, reply) => {
    const header = request.headers.authorization;
    if (!deps.token)
      return reply
        .code(503)
        .send({ message: 'Telegram login is not configured' });
    let identity: TelegramIdentity;
    try {
      if (!header?.startsWith('tma ')) throw new Error('Missing authorization');
      identity = validateTelegramInitData(header.slice(4), deps.token);
    } catch {
      return reply.code(401).send({
        message: 'Откройте приложение через бота заново, чтобы войти.',
      });
    }
    const bucket = request.url.split('?')[0]?.endsWith('/listings/photo')
      ? 'photo'
      : request.method === 'GET'
        ? 'read'
        : 'write';
    const key = `${identity.telegramUserId}:${bucket}`;
    const now = Date.now();
    let budget = budgets.get(key);
    if (!budget || budget.until <= now) {
      if (budgets.size >= 10000) budgets.delete(budgets.keys().next().value!);
      budget = { until: now + 60000, count: 0 };
      budgets.set(key, budget);
    }
    const max = bucket === 'photo' ? 5 : bucket === 'write' ? 30 : 90;
    if (++budget.count > max)
      return reply
        .code(429)
        .header('Retry-After', Math.ceil((budget.until - now) / 1000))
        .send({ message: 'Слишком много действий. Подождите минуту.' });
    request.seller = await deps.ensureUser(identity);
  });
}
