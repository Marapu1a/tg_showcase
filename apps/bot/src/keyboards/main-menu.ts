import { Markup } from 'telegraf';
import { env } from '../config/env.js';
const baseUrl = env.MINI_APP_PUBLIC_URL.replace(/\/+$/, '');
export const mainMenuKeyboard = Markup.inlineKeyboard([
  [Markup.button.webApp('Начать продавать', `${baseUrl}/dashboard`)],
  [
    Markup.button.webApp('Товары', `${baseUrl}/products`),
    Markup.button.webApp('Заказы', `${baseUrl}/orders`),
  ],
  [Markup.button.webApp('Добавить товар', `${baseUrl}/offers/new`)],
]);
