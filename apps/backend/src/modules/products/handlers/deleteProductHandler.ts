import { FastifyReply, FastifyRequest } from 'fastify';

import { prisma } from '../../../lib/prisma.js';
import { parseProductIdParam } from '../schemas/productParamsSchema.js';

export async function deleteProductHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = parseProductIdParam(request.params);

    const existing = await prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      return reply.code(404).send({
        message: 'Product not found',
      });
    }

    const product = await prisma.product.delete({
      where: { id },
    });

    return reply.send(product);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to delete product';

    return reply.code(400).send({
      message,
    });
  }
}
