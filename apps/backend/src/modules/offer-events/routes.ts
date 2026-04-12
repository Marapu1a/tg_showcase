import { FastifyInstance } from 'fastify';

import { trackBuyClick, trackDetailClick } from './handlers/index.js';

export async function offerEventsRoutes(app: FastifyInstance) {
  app.get('/click/buy/:offerId', trackBuyClick);
  app.get('/click/detail/:offerId', trackDetailClick);
}
