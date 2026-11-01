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
      where: { id, ownerUserId: request.seller.id },
      select: { id: true },
    });

    if (!existing) {
      return reply.code(404).send({
        message: 'Product not found',
      });
    }

    return reply
      .code(410)
      .send({
        message:
          'Архивируйте товар через карточку в каталоге. Заказы и история сохранятся.',
      });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to delete product';

    return reply.code(400).send({
      message,
    });
  }
}
