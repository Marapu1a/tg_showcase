import { test } from 'node:test';
import assert from 'node:assert/strict';

test('start removes obsolete reply keyboard and offers only supported app routes', async () => {
  process.env.BOT_TOKEN = '999:local-test';
  process.env.TEST_CHANNEL_ID = '-1001234567';
  process.env.MINI_APP_PUBLIC_URL = 'https://current.example.com';
  const { registerStartCommand } =
    await import('../../bot/src/commands/start.js');
  let handler: (ctx: unknown) => Promise<void> = async () => {};
  registerStartCommand({
    start(fn: typeof handler) {
      handler = fn;
    },
  } as never);
  const sent: {
    text: string;
    options: {
      reply_markup: {
        remove_keyboard?: boolean;
        inline_keyboard?: { web_app: { url: string } }[][];
      };
    };
  }[] = [];
  await handler({
    reply: async (text: string, options: (typeof sent)[number]['options']) => {
      sent.push({ text, options });
    },
  });
  assert.equal(sent[0]?.options.reply_markup.remove_keyboard, true);
  const urls = sent[1]!.options.reply_markup
    .inline_keyboard!.flat()
    .map((b) => b.web_app.url);
  assert.deepEqual(
    urls,
    ['/dashboard', '/products', '/orders', '/offers/new'].map(
      (path) => 'https://current.example.com' + path,
    ),
  );
});
