import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { moneyMinor } from '../src/lib/input.js';

test('prices are exact minor units and invalid inputs are rejected', () => {
  assert.equal(moneyMinor('600,05'), 60005);
  assert.equal(moneyMinor('0.01'), 1);
  for (const value of [
    '0',
    '-1',
    'Infinity',
    '1e3',
    '1.001',
    '600 рублей',
    '1000000',
  ])
    assert.throws(() => moneyMinor(value));
});

test('order validation never trusts a client Telegram identity', async () => {
  process.env.DATABASE_URL = 'postgresql://unused:unused@localhost:1/unused';
  const { parseOrder } = await import('../src/modules/orders/service.js');
  const base = {
    requestKey: randomUUID(),
    quantity: 2,
    unitPriceMinor: 60000,
    contactType: 'TELEGRAM',
    contact: '@someone',
  };
  const guest = parseOrder({
    ...base,
    buyerTelegramUserId: '999',
    buyerName: 'Guest',
  });
  assert.equal(guest.buyerTelegramUserId, null);
  assert.equal(guest.contactVerified, false);
  const verified = parseOrder(base, {
    telegramUserId: '12',
    firstName: 'Buyer',
    username: 'realuser',
  });
  assert.equal(verified.contact, '@realuser');
  assert.equal(verified.contactVerified, true);
  for (const patch of [
    { quantity: 0 },
    { quantity: 1.5 },
    { quantity: 100 },
    { contact: 'javascript:alert(1)' },
    { contactType: 'INVALID' },
    { contactType: ['PHONE'], contact: 'not a phone' },
    { unitPriceMinor: -2 },
    { requestKey: 'abc' },
  ])
    assert.throws(() => parseOrder({ ...base, ...patch }));
});

test('uploaded images are decoded and normalized, not trusted by MIME', async () => {
  process.env.DATABASE_URL = 'postgresql://unused:unused@localhost:1/unused';
  const sharp = (await import('sharp')).default;
  const { normalizePhoto } = await import('../src/modules/listings/routes.js');
  const png = await sharp({
    create: { width: 20, height: 20, channels: 3, background: '#abcdef' },
  })
    .png()
    .toBuffer();
  const jpeg = await normalizePhoto(
    `data:image/png;base64,${png.toString('base64')}`,
  );
  assert.equal((await sharp(jpeg).metadata()).format, 'jpeg');
  await assert.rejects(() => normalizePhoto('data:image/png;base64,SGVsbG8='));
  await assert.rejects(() =>
    normalizePhoto('data:image/svg+xml;base64,SGVsbG8='),
  );
});
