import { Telegraf, Markup } from 'telegraf';

import { mainMenuKeyboard } from '../keyboards/main-menu.js';

export function registerTextHandlers(bot: Telegraf) {
  bot.on('text', async (ctx) => {
    await ctx.reply('Актуальное меню — ниже.', Markup.removeKeyboard());
    await ctx.reply(
      'Используйте кнопки меню для быстрых действий.',
      mainMenuKeyboard,
    );
  });
}
