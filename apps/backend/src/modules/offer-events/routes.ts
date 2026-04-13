import { FastifyInstance } from 'fastify';

import { trackBuyClickHandler } from './handlers/trackBuyClickHandler.js';
import { trackDetailClickHandler } from './handlers/trackDetailClickHandler.js';
import { redirectBuyClickHandler } from './handlers/redirectBuyClickHandler.js';
import { redirectDetailClickHandler } from './handlers/redirectDetailClickHandler.js';

export async function offerEventsRoutes(app: FastifyInstance) {
  app.post('/click/buy/:offerId', trackBuyClickHandler);
  app.post('/click/detail/:offerId', trackDetailClickHandler);
  app.get('/click/buy/:offerId', redirectBuyClickHandler);
  app.get('/click/detail/:offerId', redirectDetailClickHandler);
}
