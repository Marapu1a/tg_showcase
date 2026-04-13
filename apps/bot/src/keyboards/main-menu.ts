import { Markup } from 'telegraf';

import { env } from '../config/env.js';

const baseUrl = env.MINI_APP_PUBLIC_URL.replace(/\/+$/, '');

export const mainMenuKeyboard = Markup.keyboard([
  [Markup.button.webApp('Открыть админку', `${baseUrl}/dashboard`)],
  [Markup.button.webApp('Создать пост', `${baseUrl}/offers/new`)],
  [
    Markup.button.webApp('Статистика', `${baseUrl}/dashboard`),
    Markup.button.webApp('Оплата сервиса', `${baseUrl}/billing`),
  ],
])
  .resize()
  .persistent();
