import { Telegraf } from 'telegraf';

import { mainMenuKeyboard } from '../keyboards/main-menu.js';

export function registerStartCommand(bot: Telegraf) {
  bot.start(async (ctx) => {
    await ctx.reply(
      'Добро пожаловать в tg_showcase. Ниже стартовое меню для будущей админки и оферов.',
      mainMenuKeyboard,
    );
  });
}
