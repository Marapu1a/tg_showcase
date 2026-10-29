import { createHmac } from 'node:crypto';
import { Telegraf } from 'telegraf';
import { env } from '../config/env.js';
import { mainMenuKeyboard } from '../keyboards/main-menu.js';

export function registerChannelSelection(bot: Telegraf) {
  bot.on('chat_shared', async (ctx) => {
    if (ctx.chat.type !== 'private' || ctx.message.chat_shared.request_id !== 1)
      return;
    try {
      const authorization = createHmac('sha256', env.BOT_TOKEN)
        .update('tg-showcase/channel-handoff')
        .digest('hex');
      const response = await fetch(
        `${env.BACKEND_INTERNAL_URL.replace(/\/$/, '')}/internal/channel-selection`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authorization}`,
          },
          body: JSON.stringify({
            telegramUserId: String(ctx.from.id),
            channel: String(ctx.message.chat_shared.chat_id),
          }),
          signal: AbortSignal.timeout(40000),
        },
      );
      const result = (await response.json()) as {
        channel?: { title: string };
        message?: string;
      };
      await ctx.reply(
        response.ok
          ? `Канал «${result.channel?.title}» подключён. Вернитесь в приложение.`
          : (result.message ?? 'Не удалось подключить канал.'),
        mainMenuKeyboard,
      );
    } catch {
      await ctx.reply(
        'Не удалось получить подтверждение. Вернитесь в приложение и обновите статус подключения.',
        mainMenuKeyboard,
      );
    }
  });
}
