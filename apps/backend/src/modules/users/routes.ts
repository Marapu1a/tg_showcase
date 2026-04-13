import { FastifyInstance } from 'fastify';

import { ensureTelegramUserHandler } from './handlers/ensureTelegramUserHandler.js';

export async function usersRoutes(app: FastifyInstance) {
  app.post('/ensure-telegram-user', ensureTelegramUserHandler);
}
