import { FastifyInstance } from 'fastify';

import { validateLegacyBody } from '../../plugins/abuse-limits.js';
import { deleteOfferHandler } from './handlers/deleteOfferHandler.js';
import { getOfferHandler } from './handlers/getOfferHandler.js';
import { listOffersHandler } from './handlers/listOffersHandler.js';
import { publishOfferHandler } from './handlers/publishOfferHandler.js';
import { updateOfferHandler } from './handlers/updateOfferHandler.js';
import { offerStatsHandler } from './handlers/offerStatsHandler.js';

export async function offersRoutes(app: FastifyInstance) {
  app.post('/', async (_request, reply) =>
    reply.code(410).send({ message: 'Используйте форму создания товара.' }),
  );
  app.get('/', listOffersHandler);
  app.get('/:id/stats', offerStatsHandler);
  app.get('/:id', getOfferHandler);
  app.patch(
    '/:id',
    {
      preValidation: async (request) => {
        validateLegacyBody(request.body);
      },
    },
    updateOfferHandler,
  );
  app.delete('/:id', deleteOfferHandler);
  app.post('/:id/publish', publishOfferHandler);
}
