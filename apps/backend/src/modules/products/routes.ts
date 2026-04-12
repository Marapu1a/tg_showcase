import { FastifyInstance } from 'fastify';

import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  updateProduct,
} from './handlers/index.js';

export async function productsRoutes(app: FastifyInstance) {
  app.post('/', createProduct);
  app.get('/', listProducts);
  app.get('/:id', getProduct);
  app.patch('/:id', updateProduct);
  app.delete('/:id', deleteProduct);
}
