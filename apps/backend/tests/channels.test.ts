import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import {
  ChannelError,
  parseChannelReference,
  verifyChannel,
} from '../src/lib/telegramChannels.js';

test('channel input accepts public names and native IDs, rejects arbitrary URLs', () => {
  assert.equal(parseChannelReference('https://t.me/my_channel'), '@my_channel');
  assert.equal(parseChannelReference('@my_channel'), '@my_channel');
  assert.equal(parseChannelReference('-1001234567'), '-1001234567');
  for (const value of [
    'https://evil.test/channel',
    'https://t.me/+invite',
    'https://t.me/name/123',
    {},
    '',
    123,
  ]) {
    assert.throws(() => parseChannelReference(value), ChannelError);
  }
});

test('channel connection, native handoff, persistence and publish recheck', async () => {
  process.env.DATABASE_URL = 'postgresql://unused:unused@localhost:1/unused';
  process.env.TELEGRAM_BOT_TOKEN = '123:test';
  process.env.BACKEND_PUBLIC_URL = 'https://api.example.com';
  process.env.MINI_APP_PUBLIC_URL = 'https://mini.example.com';
  process.env.DEFAULT_PUBLISH_CHANNEL_ID = '@must_not_be_used';
  const { prisma } = await import('../src/lib/prisma.js');
  const { buildApp } = await import('../src/app.js');
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const headers = (id: number) => {
    const p = new URLSearchParams({
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: JSON.stringify({ id, first_name: 'Seller' }),
    });
    p.sort();
    const secret = createHmac('sha256', 'WebAppData').update(token).digest();
    p.set(
      'hash',
      createHmac('sha256', secret)
        .update([...p].map(([k, v]) => `${k}=${v}`).join('\n'))
        .digest('hex'),
    );
    return { authorization: `tma ${p}` };
  };
  const restores: (() => void)[] = [];
  function replace<T extends object, K extends keyof T>(
    target: T,
    key: K,
    implementation: unknown,
  ) {
    const old = target[key];
    Object.assign(target, { [key]: implementation });
    restores.push(() => Object.assign(target, { [key]: old }));
  }
  type Row = {
    ownerUserId: string;
    channelId: string;
    title: string;
    username: string | null;
    verifiedAt: Date;
  };
  const rows = new Map<string, Row>();
  replace(
    prisma.user,
    'upsert',
    async ({ create }: { create: { telegramUserId: string } }) => ({
      id: create.telegramUserId,
      telegramUserId: create.telegramUserId,
    }),
  );
  replace(
    prisma.user,
    'findUnique',
    async ({ where }: { where: { telegramUserId: string } }) => ({
      id: where.telegramUserId,
      telegramUserId: where.telegramUserId,
    }),
  );
  replace(
    prisma.sellerChannel,
    'findUnique',
    async ({ where }: { where: { ownerUserId: string } }) =>
      rows.get(where.ownerUserId) ?? null,
  );
  replace(prisma.sellerChannel, 'create', async ({ data }: { data: Row }) => {
    if (
      rows.has(data.ownerUserId) ||
      [...rows.values()].some((r) => r.channelId === data.channelId)
    )
      throw { code: 'P2002' };
    rows.set(data.ownerUserId, data);
    return data;
  });
  replace(
    prisma.sellerChannel,
    'update',
    async ({
      where,
      data,
    }: {
      where: { ownerUserId: string };
      data: Partial<Row>;
    }) => {
      const row = { ...rows.get(where.ownerUserId)!, ...data };
      rows.set(where.ownerUserId, row);
      return row;
    },
  );
  replace(prisma.offer, 'findUnique', async () => ({
    id: 'offer',
    status: 'DRAFT',
    channelId: '@forged',
    telegramMessageId: null,
    title: 'Product <test> & more',
    text: 'Description <b>literal</b>',
    product: {
      checkoutUrl: 'https://pay.example.com',
      priceText: '10',
      images: [],
    },
  }));
  replace(prisma.offer, 'update', async ({ data }: { data: object }) => data);
  replace(prisma.offer, 'updateMany', async () => ({ count: 1 }));
  const originalFetch = globalThis.fetch;
  let sellerStatus = 'creator';
  let sellerPost = true;
  let botPost = true;
  let chatType = 'channel';
  let failing = false;
  const sent: Record<string, unknown>[] = [];
  globalThis.fetch = async (url, init) => {
    const method = String(url).split('/').pop();
    const body = JSON.parse(String(init?.body ?? '{}'));
    if (failing) throw new Error('secret token must never leak');
    let result: unknown;
    if (method === 'getMe') result = { id: 123, username: 'test_bot' };
    else if (method === 'getChat')
      result = {
        id: body.chat_id === '@other_channel' ? -1007654321 : -1001234567,
        type: chatType,
        title: 'My channel',
        username: 'my_channel',
      };
    else if (method === 'getChatMember')
      result =
        body.user_id === 123
          ? { status: 'administrator', can_post_messages: botPost }
          : { status: sellerStatus, can_post_messages: sellerPost };
    else if (method === 'savePreparedKeyboardButton') {
      assert.equal(body.user_id, 1);
      assert.equal(body.button.request_chat.chat_is_channel, true);
      result = { id: 'prepared' };
    } else if (method === 'sendMessage') {
      sent.push(body);
      result = { message_id: 42, chat: { id: -1001234567 } };
    } else throw new Error(`Unexpected method ${method}`);
    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const app = buildApp();
  const connect = (id = 1, channel = '@my_channel') =>
    app.inject({
      method: 'POST',
      url: '/channels',
      headers: headers(id),
      payload: { channel, ownerUserId: 'forged' },
    });
  const publish = () =>
    app.inject({
      method: 'POST',
      url: '/offers/offer/publish',
      headers: headers(1),
    });
  try {
    assert.equal((await app.inject({ url: '/channels' })).statusCode, 401);
    assert.equal((await publish()).statusCode, 409);
    assert.equal(sent.length, 0);
    sellerStatus = 'member';
    assert.equal((await connect()).statusCode, 403);
    assert.equal(rows.size, 0);
    sellerStatus = 'administrator';
    sellerPost = false;
    assert.equal((await connect()).statusCode, 403);
    sellerPost = true;
    botPost = false;
    assert.equal((await connect()).statusCode, 403);
    assert.equal(rows.size, 0);
    botPost = true;
    chatType = 'supergroup';
    assert.equal((await connect()).statusCode, 400);
    chatType = 'channel';
    failing = true;
    await assert.rejects(
      () => verifyChannel(token, '@my_channel', '1'),
      (e) =>
        e instanceof ChannelError &&
        e.statusCode === 503 &&
        !e.message.includes('secret'),
    );
    failing = false;
    const connected = await connect();
    assert.equal(connected.statusCode, 200);
    assert.equal(rows.get('1')?.channelId, '-1001234567');
    assert.equal((await connect()).statusCode, 200);
    assert.equal(rows.size, 1);
    assert.equal((await connect(1, '@other_channel')).statusCode, 409);
    assert.equal((await connect(2)).statusCode, 409);
    assert.equal(
      (await app.inject({ url: '/channels', headers: headers(2) })).json()
        .channel,
      null,
    );
    assert.equal(
      (await app.inject({ url: '/channels', headers: headers(1) })).json()
        .channel.title,
      'My channel',
    );
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/channels/request-button',
          headers: headers(1),
        })
      ).json().id,
      'prepared',
    );
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/internal/channel-selection',
          payload: { telegramUserId: '2', channel: '-1001234567' },
        })
      ).statusCode,
      401,
    );
    const handoff = createHmac('sha256', token)
      .update('tg-showcase/channel-handoff')
      .digest('hex');
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/internal/channel-selection',
          headers: { authorization: `Bearer ${handoff}` },
          payload: { telegramUserId: '1', channel: '-1001234567' },
        })
      ).statusCode,
      200,
    );
    botPost = false;
    assert.equal((await publish()).statusCode, 403);
    assert.equal(sent.length, 0);
    botPost = true;
    sellerStatus = 'member';
    assert.equal((await publish()).statusCode, 403);
    assert.equal(sent.length, 0);
    sellerStatus = 'creator';
    assert.equal((await publish()).statusCode, 200);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].chat_id, '-1001234567');
    assert.equal(sent[0].parse_mode, 'HTML');
    assert.ok(
      String(sent[0].text).startsWith('<b>Product &lt;test&gt; &amp; more</b>'),
    );
    assert.ok(
      String(sent[0].text).includes('Description &lt;b&gt;literal&lt;/b&gt;'),
    );
    const { parseUpdateOfferBody } =
      await import('../src/modules/offers/schemas/updateOfferSchema.js');
    const { parseCreateOfferBody } =
      await import('../src/modules/offers/schemas/createOfferSchema.js');
    assert.throws(() => parseUpdateOfferBody({ channelId: '@forged' }));
    assert.throws(() => parseUpdateOfferBody({ telegramMessageId: null }));
    assert.throws(() =>
      parseCreateOfferBody({
        productId: 'p',
        ownerUserId: '1',
        title: 't',
        channelId: '@forged',
      }),
    );
    rows.clear();
    const concurrent = await Promise.all([
      connect(),
      connect(1, '@other_channel'),
    ]);
    assert.deepEqual(concurrent.map((r) => r.statusCode).sort(), [200, 409]);
    assert.equal(rows.size, 1);
    rows.clear();
    const repeated = await Promise.all([connect(), connect()]);
    assert.deepEqual(
      repeated.map((r) => r.statusCode),
      [200, 200],
    );
    assert.equal(rows.size, 1);
  } finally {
    await app.close();
    globalThis.fetch = originalFetch;
    restores.forEach((restore) => restore());
  }
});
