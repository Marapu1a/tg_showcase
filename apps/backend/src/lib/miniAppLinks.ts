import { env } from '../config/env.js';
import { telegramCall } from './telegramChannels.js';

type Bot = { username?: string; has_main_web_app?: boolean };
let cached: { bot: Bot; until: number } | undefined;

export function nativeOfferLink(
  username: string,
  id: string,
  action: 'buy' | 'detail',
) {
  if (
    !/^[A-Za-z0-9_]{5,32}$/.test(username) ||
    !/^[A-Za-z0-9-]{1,100}$/.test(id)
  )
    throw new Error('Invalid Mini App link');
  return `https://t.me/${username}?startapp=${action}_${id}`;
}

export async function offerLinks(id: string) {
  if (!env.TELEGRAM_BOT_TOKEN)
    throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  if (!cached || cached.until < Date.now()) {
    const bot = await telegramCall<Bot>(env.TELEGRAM_BOT_TOKEN, 'getMe');
    cached = { bot, until: Date.now() + 30_000 };
  }
  if (!cached.bot.has_main_web_app || !cached.bot.username) return null;
  return {
    buy: nativeOfferLink(cached.bot.username, id, 'buy'),
    detail: nativeOfferLink(cached.bot.username, id, 'detail'),
  };
}
