import { registerChannelSelection } from './handlers/channel-selection.js';
import { Telegraf } from 'telegraf';

import { env } from './config/env.js';
import { registerStartCommand } from './commands/start.js';
import { registerTestPostCommand } from './commands/test-post.js';
import { registerTextHandlers } from './handlers/text.js';
import { logger } from './lib/logger.js';

const bot = new Telegraf(env.BOT_TOKEN);
const recentUpdates = new Map<number, number>();
let windowStart = 0;
let windowCount = 0;
bot.use(async (ctx, next) => {
  if (ctx.chat?.type !== 'private' || !ctx.from || ctx.from.is_bot) return;
  const now = Date.now();
  if (now - windowStart >= 1000) {
    windowStart = now;
    windowCount = 0;
  }
  if (windowCount >= 10) return;
  if (now - (recentUpdates.get(ctx.from.id) ?? 0) < 2000) return;
  if (recentUpdates.size >= 10000)
    recentUpdates.delete(recentUpdates.keys().next().value!);
  recentUpdates.set(ctx.from.id, now);
  windowCount++;
  await next();
});

registerStartCommand(bot);
registerTestPostCommand(bot);
registerChannelSelection(bot);
registerTextHandlers(bot);

bot.catch((error, ctx) => {
  logger.error('Bot error', error, {
    updateType: ctx.updateType,
  });
});

async function main() {
  await bot.launch();
  logger.info('Bot started');

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

main().catch((error) => {
  logger.error('Failed to start bot', error);
  process.exit(1);
});
