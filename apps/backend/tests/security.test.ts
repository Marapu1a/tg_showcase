import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import {
  registerAbuseLimits,
  clientAddress,
  validateLegacyBody,
} from '../src/plugins/abuse-limits.js';
import { textField, requestKey } from '../src/lib/input.js';
import {
  contactError,
  quantityError,
  priceError,
} from '../../miniapp/src/lib/validation.js';

test('form validation blocks screenshot cases, malformed contacts and excessive totals', async () => {
  process.env.DATABASE_URL = 'postgresql://unused:unused@localhost:1/unused';
  const { parseOrder } = await import('../src/modules/orders/service.js');
  const base = {
    requestKey: randomUUID(),
    quantity: 1,
    unitPriceMinor: 60000,
    contactType: 'PHONE',
    contact: '+7 (900) 123-45-67',
  };
  assert.equal(parseOrder(base).contact, '+79001234567');
  for (const phone of [
    'ываыва',
    '-------',
    '+ () ()',
    '123456',
    '1234567890123456',
  ]) {
    assert.ok(contactError('PHONE', phone));
    assert.throws(() => parseOrder({ ...base, contact: phone }));
  }
  for (const name of ['ыыы1234234', '@x', '@<script>', 'someone']) {
    assert.ok(contactError('TELEGRAM', name));
    assert.throws(() =>
      parseOrder({ ...base, contactType: 'TELEGRAM', contact: name }),
    );
  }
  assert.equal(contactError('TELEGRAM', '@valid_name'), '');
  for (const quantity of [
    '112312312313',
    '17',
    '0',
    '-1',
    '1.5',
    '1e2',
    'Infinity',
    '',
  ])
    assert.ok(quantityError(quantity, 16));
  assert.equal(quantityError('16', 16), '');
  for (const price of ['NaN', '1e6', '1000000', '0', '1.001'])
    assert.ok(priceError(price));
  assert.equal(priceError('999999,99'), '');
  assert.throws(() => textField('x' + ' '.repeat(500), 'comment', 500));
  assert.throws(() => parseOrder({ ...base, comment: 'x'.repeat(501) }));
  assert.equal(requestKey(base.requestKey.toUpperCase()), base.requestKey);
  assert.throws(() => validateLegacyBody({ quantityLimit: 100001 }));
  assert.throws(() => validateLegacyBody({ title: 'x'.repeat(101) }));
});

test('rate limits cover reads, writes and photo routes before handler work; body is bounded', async () => {
  const app = Fastify({ bodyLimit: 16384 });
  registerAbuseLimits(app);
  let calls = 0;
  app.register(async (routes) => {
    routes.get('/read', async () => ({ ok: true }));
    routes.post('/write', async () => {
      calls++;
      return { ok: true };
    });
    routes.post(
      '/photo',
      { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
      async () => {
        calls++;
        return { ok: true };
      },
    );
  });
  try {
    for (let i = 0; i < 20; i++)
      assert.equal(
        (await app.inject({ method: 'POST', url: '/write', payload: {} }))
          .statusCode,
        200,
      );
    assert.equal(
      (await app.inject({ method: 'POST', url: '/write', payload: {} }))
        .statusCode,
      429,
    );
    assert.equal(calls, 20);
    for (let i = 0; i < 5; i++)
      assert.equal(
        (await app.inject({ method: 'POST', url: '/photo', payload: {} }))
          .statusCode,
        200,
      );
    assert.equal(
      (await app.inject({ method: 'POST', url: '/photo', payload: {} }))
        .statusCode,
      429,
    );
    assert.equal(calls, 25);
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/write',
          remoteAddress: '192.0.2.2',
          payload: { text: 'x'.repeat(17000) },
        })
      ).statusCode,
      413,
    );
    for (let i = 0; i < 120; i++)
      assert.equal(
        (await app.inject({ url: '/read', remoteAddress: '192.0.2.3' }))
          .statusCode,
        200,
      );
    assert.equal(
      (await app.inject({ url: '/read', remoteAddress: '192.0.2.3' }))
        .statusCode,
      429,
    );
    // Client-supplied forwarded headers are ignored unless explicitly trusted.
    const original = process.env.TRUST_LOCAL_CLOUDFLARE;
    process.env.TRUST_LOCAL_CLOUDFLARE = '0';
    assert.equal(
      clientAddress({
        ip: '127.0.0.1',
        headers: { 'cf-connecting-ip': '192.0.2.10' },
      } as never),
      '127.0.0.1',
    );
    process.env.TRUST_LOCAL_CLOUDFLARE = '1';
    assert.equal(
      clientAddress({
        ip: '192.0.2.1',
        headers: { 'cf-connecting-ip': '192.0.2.10' },
      } as never),
      '192.0.2.1',
    );
    assert.equal(
      clientAddress({
        ip: '127.0.0.1',
        headers: { 'cf-connecting-ip': '192.0.2.10' },
      } as never),
      '192.0.2.10',
    );
    if (original === undefined) delete process.env.TRUST_LOCAL_CLOUDFLARE;
    else process.env.TRUST_LOCAL_CLOUDFLARE = original;
  } finally {
    await app.close();
  }
});
