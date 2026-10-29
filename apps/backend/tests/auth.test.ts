import { createHmac } from 'node:crypto';
import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { validateTelegramInitData } from '../src/lib/telegramAuth.js';

const token = '123:test-token';
const now = Math.floor(Date.now() / 1000);
function signed(date = now, id = 123) {
  const params = new URLSearchParams({
    auth_date: String(date),
    user: JSON.stringify({ id, first_name: 'Seller' }),
  });
  params.sort();
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  params.set(
    'hash',
    createHmac('sha256', secret)
      .update([...params].map(([k, v]) => `${k}=${v}`).join('\n'))
      .digest('hex'),
  );
  return params.toString();
}

test('valid signature identifies seller; altered, stale, future and duplicate data fail', () => {
  assert.equal(
    validateTelegramInitData(signed(), token, now).telegramUserId,
    '123',
  );
  for (const value of [
    signed().replace('Seller', 'Attacker'),
    signed(now - 3601),
    signed(now + 60),
    `${signed()}&auth_date=${now}`,
    'hash=bad',
    signed(now, -1),
  ]) {
    assert.throws(() => validateTelegramInitData(value, token, now));
  }
  assert.throws(() => validateTelegramInitData(signed(), 'other-token', now));
});

test('real routes require login and scope reads and mutations to authenticated seller', async () => {
  process.env.DATABASE_URL = 'postgresql://unused:unused@localhost:1/unused';
  process.env.TELEGRAM_BOT_TOKEN = token;
  const { prisma } = await import('../src/lib/prisma.js');
  const { buildApp } = await import('../src/app.js');
  const restores: (() => void)[] = [];
  function replace<T extends object, K extends keyof T>(
    target: T,
    key: K,
    implementation: (...args: never[]) => unknown,
  ) {
    const original = target[key];
    const replacement = mock.fn(implementation);
    Object.assign(target, { [key]: replacement });
    restores.push(() => Object.assign(target, { [key]: original }));
    return replacement;
  }
  const seller = { id: 'seller-a', telegramUserId: '123' };
  replace(prisma.user, 'upsert', async () => seller);
  replace(prisma.user, 'findUnique', async () => seller);
  const productLookup = replace(
    prisma.product,
    'findUnique',
    async (args: { where: { ownerUserId: string } }) => {
      assert.equal(args.where.ownerUserId, seller.id);
      return null;
    },
  );
  const offerLookup = replace(
    prisma.offer,
    'findUnique',
    async (args: { where: { ownerUserId: string } }) => {
      assert.equal(args.where.ownerUserId, seller.id);
      return null;
    },
  );
  replace(
    prisma.product,
    'findMany',
    async (args: { where: { ownerUserId: string } }) => {
      assert.equal(args.where.ownerUserId, seller.id);
      return [];
    },
  );
  replace(
    prisma.offer,
    'findMany',
    async (args: { where: { ownerUserId: string } }) => {
      assert.equal(args.where.ownerUserId, seller.id);
      return [];
    },
  );
  replace(
    prisma.product,
    'create',
    async (args: { data: { ownerUserId: string } }) => {
      assert.equal(args.data.ownerUserId, seller.id);
      return { id: 'new-product' };
    },
  );
  const app = buildApp();
  const headers = { authorization: `tma ${signed()}` };
  try {
    for (const url of ['/products', '/offers', '/offers/foreign/stats']) {
      assert.equal((await app.inject({ url })).statusCode, 401);
    }
    assert.equal(
      (
        await app.inject({
          url: '/products',
          headers: { authorization: `tma ${signed(now - 4000)}` },
        })
      ).statusCode,
      401,
    );
    for (const url of [
      '/products?ownerUserId=someone-else',
      '/offers?ownerUserId=someone-else',
    ]) {
      assert.equal((await app.inject({ url, headers })).statusCode, 200);
    }
    for (const url of [
      '/products/foreign',
      '/offers/foreign',
      '/offers/foreign/stats',
    ]) {
      assert.equal((await app.inject({ url, headers })).statusCode, 404);
    }
    for (const url of ['/products/foreign', '/offers/foreign']) {
      assert.equal(
        (await app.inject({ method: 'DELETE', url, headers })).statusCode,
        404,
      );
      assert.equal(
        (
          await app.inject({
            method: 'PATCH',
            url,
            headers,
            payload: { title: 'Changed' },
          })
        ).statusCode,
        404,
      );
    }
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/products/foreign/images',
          headers,
          payload: { fileUrl: 'https://example.com/image.jpg' },
        })
      ).statusCode,
      410,
    );
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/offers/foreign/publish',
          headers,
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/products',
          headers,
          payload: {
            ownerUserId: 'someone-else',
            title: 'Test',
            priceText: '10',
            checkoutUrl: 'https://example.com',
          },
        })
      ).statusCode,
      410,
    );
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/offers',
          headers,
          payload: {
            ownerUserId: 'someone-else',
            productId: 'foreign',
            title: 'Test',
          },
        })
      ).statusCode,
      410,
    );
    const user = await app.inject({
      method: 'POST',
      url: '/users/ensure-telegram-user',
      headers,
      payload: { telegramUserId: '999' },
    });
    assert.equal(user.json().telegramUserId, '123');
    assert.ok(productLookup.mock.callCount() > 0);
    assert.ok(offerLookup.mock.callCount() > 0);
  } finally {
    await app.close();
    restores.forEach((restore) => restore());
    mock.restoreAll();
  }
});
