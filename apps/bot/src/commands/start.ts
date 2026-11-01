import { env } from '../config/env.js';
import { Telegraf, Markup } from 'telegraf';
import { mainMenuKeyboard } from '../keyboards/main-menu.js';

export function registerStartCommand(bot: Telegraf) {
  bot.command(['support', 'paysupport'], async (ctx) => {
    await ctx.reply(
      'По вопросам оплаты, возврата, ошибок и предложений напишите нам. Укажите товар и дату оплаты. Telegram не рассматривает обращения по нашему сервису.',
      env.SUPPORT_URL
        ? Markup.inlineKeyboard([
            Markup.button.url('Поддержка и предложения', env.SUPPORT_URL),
          ])
        : undefined,
    );
  });
  bot.command('terms', async (ctx) => {
    await ctx.reply(
      'Оплата одного размещения в вашем канале. Первые три публикации бесплатно, далее цена в Stars показана перед оплатой. Без подписок, пакетов и комиссии с продаж. При подтверждённой неудаче публикации Stars возвращаются. При неизвестном результате сначала проверяем пост. Неиспользованную оплату можно вернуть на странице «Оплата сервиса». Поддержка: /paysupport.',
    );
  });
  bot.start(async (ctx) => {
    await ctx.reply(
      'Продавайте товары в своём Telegram-канале. Добавьте товар, опубликуйте пост и получайте заказы здесь.' +
        (env.SUPPORT_URL
          ? '\n\nЕсть вопрос, ошибка или идея? Нажмите «Поддержка и предложения» — напишите нам напрямую.'
          : ''),
      mainMenuKeyboard,
    );
  });
}
