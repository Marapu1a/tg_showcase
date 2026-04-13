import { Telegraf } from 'telegraf';

import { mainMenuKeyboard } from '../keyboards/main-menu.js';

export function registerStartCommand(bot: Telegraf) {
  bot.start(async (ctx) => {
    await ctx.reply('Добро пожаловать! Используйте меню для быстрых действий.', mainMenuKeyboard);
  });
}
