import { FastifyReply, FastifyRequest } from 'fastify';

import { prisma } from '../../../lib/prisma.js';
import { parseProductIdParam } from '../schemas/productParamsSchema.js';

export async function getProductHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = parseProductIdParam(request.params);

    const product = await prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      return reply.code(404).send({
        message: 'Product not found',
      });
    }

    return reply.send(product);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch product';

    return reply.code(400).send({
      message,
    });
  }
}
