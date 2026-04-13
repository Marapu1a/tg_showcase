import { FastifyReply, FastifyRequest } from 'fastify';

import { prisma } from '../../../lib/prisma.js';
import { parseProductListQuery } from '../schemas/productListQuerySchema.js';

export async function listProductsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const filters = parseProductListQuery(request.query);

    const products = await prisma.product.findMany({
      where: filters,
      orderBy: { createdAt: 'desc' },
    });

    return reply.send(products);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to list products';

    return reply.code(400).send({
      message,
    });
  }
}
