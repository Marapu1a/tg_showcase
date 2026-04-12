import { Telegraf } from 'telegraf';

import { env } from '../config/env.js';
import { mainMenuKeyboard } from '../keyboards/main-menu.js';

export function registerTextHandlers(bot: Telegraf) {
  bot.hears('Открыть админку', async (ctx) => {
    await ctx.reply(`Mini App будет доступен по адресу: ${env.MINI_APP_URL}`);
  });

  bot.hears('Мои оферы', async (ctx) => {
    await ctx.reply('Раздел с оферами пока в каркасе и будет добавлен позже.', mainMenuKeyboard);
  });

  bot.hears('Статистика', async (ctx) => {
    await ctx.reply('Раздел статистики пока в каркасе и будет добавлен позже.', mainMenuKeyboard);
  });
}
