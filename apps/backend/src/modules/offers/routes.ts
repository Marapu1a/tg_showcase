import { FastifyInstance } from 'fastify';

import { createOfferHandler } from './handlers/createOfferHandler.js';
import { deleteOfferHandler } from './handlers/deleteOfferHandler.js';
import { getOfferHandler } from './handlers/getOfferHandler.js';
import { listOffersHandler } from './handlers/listOffersHandler.js';
import { publishOfferHandler } from './handlers/publishOfferHandler.js';
import { updateOfferHandler } from './handlers/updateOfferHandler.js';

export async function offersRoutes(app: FastifyInstance) {
  app.post('/', createOfferHandler);
  app.get('/', listOffersHandler);
  app.get('/:id', getOfferHandler);
  app.patch('/:id', updateOfferHandler);
  app.delete('/:id', deleteOfferHandler);
  app.post('/:id/publish', publishOfferHandler);
}
