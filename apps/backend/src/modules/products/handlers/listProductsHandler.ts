import { FastifyReply, FastifyRequest } from 'fastify';

import { prisma } from '../../../lib/prisma.js';

export async function listProductsHandler(
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: 'desc' },
  });

  return reply.send(products);
}
