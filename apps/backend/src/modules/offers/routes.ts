import { FastifyInstance } from 'fastify';

import {
  createOffer,
  deleteOffer,
  getOffer,
  listOffers,
  publishOffer,
  updateOffer,
} from './handlers/index.js';

export async function offersRoutes(app: FastifyInstance) {
  app.post('/', createOffer);
  app.get('/', listOffers);
  app.get('/:id', getOffer);
  app.patch('/:id', updateOffer);
  app.delete('/:id', deleteOffer);
  app.post('/:id/publish', publishOffer);
}
