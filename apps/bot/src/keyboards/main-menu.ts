import { Markup } from 'telegraf';

export const mainMenuKeyboard = Markup.keyboard([
  ['Открыть админку'],
  ['Мои оферы', 'Статистика'],
])
  .resize()
  .persistent();
