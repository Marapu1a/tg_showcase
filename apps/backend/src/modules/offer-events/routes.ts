import { FastifyInstance } from 'fastify';

import { redirectBuyClickHandler } from './handlers/redirectBuyClickHandler.js';
import { redirectDetailClickHandler } from './handlers/redirectDetailClickHandler.js';

export async function offerEventsRoutes(app: FastifyInstance) {
  app.post('/click/buy/:offerId', async (_request, reply) =>
    reply.code(410).send({ message: 'Используйте ссылку из публикации.' }),
  );
  app.post('/click/detail/:offerId', async (_request, reply) =>
    reply.code(410).send({ message: 'Используйте ссылку из публикации.' }),
  );
  const options = {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  };
  app.get('/click/buy/:offerId', options, redirectBuyClickHandler);
  app.get('/click/detail/:offerId', options, redirectDetailClickHandler);
}
