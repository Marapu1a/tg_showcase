import { FastifyInstance, FastifyRequest } from 'fastify';
import { isIP } from 'node:net';
import rateLimit from '@fastify/rate-limit';
import { InputError, objectBody, textField } from '../lib/input.js';

export function clientAddress(request: FastifyRequest) {
  const forwarded = request.headers['cf-connecting-ip'];
  // Opt in only for a loopback-only server behind the local cloudflared process.
  if (
    process.env.TRUST_LOCAL_CLOUDFLARE === '1' &&
    ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.ip) &&
    typeof forwarded === 'string' &&
    isIP(forwarded)
  )
    return forwarded;
  return request.ip;
}

export function registerAbuseLimits(app: FastifyInstance) {
  app.register(rateLimit, {
    global: true,
    max: 120,
    timeWindow: '1 minute',
    cache: 10000,
    keyGenerator: clientAddress,
    errorResponseBuilder: () => ({
      statusCode: 429,
      message: 'Слишком много запросов. Подождите минуту и попробуйте снова.',
    }),
  });
  app.addHook('onRoute', (route) => {
    if (route.config?.rateLimit !== undefined) return;
    if (
      ['POST', 'PATCH', 'DELETE'].some((method) =>
        Array.isArray(route.method)
          ? route.method.includes(method as 'POST')
          : route.method === method,
      )
    )
      route.config = {
        ...route.config,
        rateLimit: { max: 20, timeWindow: '1 minute' },
      };
  });
}

// Legacy editing routes must respect the same limits as the new listing form.
export function validateLegacyBody(body: unknown) {
  const p = objectBody(body);
  for (const [field, max] of Object.entries({
    title: 100,
    description: 700,
    text: 700,
    priceText: 20,
    checkoutUrl: 2048,
  })) {
    if (p[field] !== undefined && p[field] !== null)
      textField(p[field], field, max, true);
  }
  if (
    p.quantityLimit !== undefined &&
    p.quantityLimit !== null &&
    (typeof p.quantityLimit !== 'number' ||
      !Number.isInteger(p.quantityLimit) ||
      p.quantityLimit < 1 ||
      p.quantityLimit > 100000)
  )
    throw new InputError(400, 'Количество должно быть от 1 до 100 000.');
}
