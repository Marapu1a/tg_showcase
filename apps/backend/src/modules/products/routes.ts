import { FastifyInstance } from 'fastify';

import { createProductHandler } from './handlers/createProductHandler.js';

export async function productsRoutes(app: FastifyInstance) {
  app.post('/', createProductHandler);
}
