import { test } from 'node:test';
import assert from 'node:assert/strict';

test('start sends one welcome message with supported app routes', async () => {
  process.env.SUPPORT_TELEGRAM_USERNAME = 'test_support';
  process.env.BOT_TOKEN = '999:local-test';
  process.env.TEST_CHANNEL_ID = '-1001234567';
  process.env.MINI_APP_PUBLIC_URL = 'https://current.example.com';
  const { registerStartCommand } =
    await import('../../bot/src/commands/start.js');
  let handler: (ctx: unknown) => Promise<void> = async () => {};
  registerStartCommand({
    command() {},
    start(fn: typeof handler) {
      handler = fn;
    },
  } as never);
  const sent: {
    text: string;
    options: {
      reply_markup: {
        remove_keyboard?: boolean;
        inline_keyboard?: {
          text: string;
          web_app?: { url: string };
          url?: string;
        }[][];
      };
    };
  }[] = [];
  await handler({
    reply: async (text: string, options: (typeof sent)[number]['options']) => {
      sent.push({ text, options });
    },
  });
  assert.equal(sent.length, 1);
  assert.match(sent[0]!.text, /Продавайте товары/);
  const urls = sent[0]!.options.reply_markup
    .inline_keyboard!.flat()
    .filter((b) => b.web_app)
    .map((b) => b.web_app!.url);
  const support = sent[0]!.options.reply_markup
    .inline_keyboard!.flat()
    .find((b) => b.text === 'Поддержка и предложения');
  assert.equal(support?.url, 'https://t.me/test_support');
  assert.deepEqual(
    urls,
    ['/dashboard', '/products', '/orders', '/offers/new'].map(
      (path) => 'https://current.example.com' + path,
    ),
  );
});
