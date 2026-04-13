import { Markup } from 'telegraf';

import { env } from '../config/env.js';

const baseUrl = env.MINI_APP_PUBLIC_URL.replace(/\/+$/, '');
// Dev cache-buster: bump MINI_APP_LAUNCH_VERSION in .env to force reload.
const version = env.MINI_APP_LAUNCH_VERSION ?? Date.now().toString();
const withVersion = (path: string) => `${baseUrl}${path}?v=${version}`;

export const mainMenuKeyboard = Markup.keyboard([
  [Markup.button.webApp('Открыть админку', withVersion('/dashboard'))],
  [Markup.button.webApp('Создать пост', withVersion('/offers/new'))],
  [
    Markup.button.webApp('Статистика', withVersion('/dashboard')),
    Markup.button.webApp('Оплата сервиса', withVersion('/billing')),
  ],
])
  .resize()
  .persistent();
