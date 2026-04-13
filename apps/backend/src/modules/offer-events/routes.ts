import { FastifyInstance } from 'fastify';

import { trackBuyClickHandler } from './handlers/trackBuyClickHandler.js';
import { trackDetailClickHandler } from './handlers/trackDetailClickHandler.js';

export async function offerEventsRoutes(app: FastifyInstance) {
  app.post('/click/buy/:offerId', trackBuyClickHandler);
  app.post('/click/detail/:offerId', trackDetailClickHandler);
}
