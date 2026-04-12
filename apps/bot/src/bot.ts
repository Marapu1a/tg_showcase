import { Telegraf } from 'telegraf';

import { env } from './config/env.js';
import { registerStartCommand } from './commands/start.js';
import { registerTextHandlers } from './handlers/text.js';
import { logger } from './lib/logger.js';

const bot = new Telegraf(env.BOT_TOKEN);

registerStartCommand(bot);
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
