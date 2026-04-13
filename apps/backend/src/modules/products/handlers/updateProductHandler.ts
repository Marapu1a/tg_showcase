import { FastifyReply, FastifyRequest } from 'fastify';

import { prisma } from '../../../lib/prisma.js';
import { parseProductIdParam } from '../schemas/productParamsSchema.js';
import { parseUpdateProductBody } from '../schemas/updateProductSchema.js';

export async function updateProductHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = parseProductIdParam(request.params);
    const data = parseUpdateProductBody(request.body);

    const existing = await prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      return reply.code(404).send({
        message: 'Product not found',
      });
    }

    const product = await prisma.product.update({
      where: { id },
      data,
    });

    return reply.send(product);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to update product';

    return reply.code(400).send({
      message,
    });
  }
}
