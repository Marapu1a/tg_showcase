import { FastifyInstance } from 'fastify';

import { createProductHandler } from './handlers/createProductHandler.js';
import { deleteProductHandler } from './handlers/deleteProductHandler.js';
import { getProductHandler } from './handlers/getProductHandler.js';
import { listProductsHandler } from './handlers/listProductsHandler.js';
import { updateProductHandler } from './handlers/updateProductHandler.js';

export async function productsRoutes(app: FastifyInstance) {
  app.post('/', createProductHandler);
  app.get('/', listProductsHandler);
  app.get('/:id', getProductHandler);
  app.patch('/:id', updateProductHandler);
  app.delete('/:id', deleteProductHandler);
}
