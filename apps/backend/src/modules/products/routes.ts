import { FastifyInstance } from 'fastify';

import { validateLegacyBody } from '../../plugins/abuse-limits.js';
import { deleteProductHandler } from './handlers/deleteProductHandler.js';
import { getProductHandler } from './handlers/getProductHandler.js';
import { listProductsHandler } from './handlers/listProductsHandler.js';
import { updateProductHandler } from './handlers/updateProductHandler.js';

export async function productsRoutes(app: FastifyInstance) {
  app.post('/', async (_request, reply) =>
    reply.code(410).send({ message: 'Используйте форму создания товара.' }),
  );
  app.post('/:id/images', async (_request, reply) =>
    reply.code(410).send({ message: 'Загрузите фото через форму товара.' }),
  );
  app.get('/', listProductsHandler);
  app.get('/:id', getProductHandler);
  app.patch(
    '/:id',
    {
      preValidation: async (request) => {
        validateLegacyBody(request.body);
      },
    },
    updateProductHandler,
  );
  app.delete('/:id', deleteProductHandler);
}
