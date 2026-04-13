import { Markup, Telegraf } from 'telegraf';

import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

const testPostText = [
  'Тестовый офер: Умный термос 500 мл',
  '',
  'Короткое описание: держит тепло до 12 часов, подходит для поездок.',
  'Цена: 1 490 ₽',
].join('\n');

const testPostKeyboard = Markup.inlineKeyboard([
  Markup.button.url('Купить', 'https://example.com/pay'),
  Markup.button.url('Подробнее', 'https://example.com/details'),
]);

export function registerTestPostCommand(bot: Telegraf) {
  bot.command('testpost', async (ctx) => {
    try {
      await ctx.telegram.sendMessage(env.TEST_CHANNEL_ID, testPostText, {
        reply_markup: testPostKeyboard.reply_markup,
      });

      await ctx.reply('Тестовый пост отправлен в канал.');
    } catch (error) {
      logger.error('Failed to send test post', error, {
        chatId: ctx.chat?.id,
      });

      await ctx.reply(
        'Не удалось отправить тестовый пост. Проверьте TEST_CHANNEL_ID и права бота в канале.',
      );
    }
  });
}
