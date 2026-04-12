import { FastifyInstance } from 'fastify';

import { getHealth } from './handlers/index.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', getHealth);
}
