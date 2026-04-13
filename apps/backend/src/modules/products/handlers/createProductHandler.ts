import { FastifyReply, FastifyRequest } from 'fastify';

import { prisma } from '../../../lib/prisma.js';
import { parseCreateProductBody } from '../schemas/createProductSchema.js';

export async function createProductHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const data = parseCreateProductBody(request.body);

    const owner = await prisma.user.findUnique({
      where: { id: data.ownerUserId },
      select: { id: true },
    });

    if (!owner) {
      return reply.code(404).send({
        message: 'Owner user not found',
      });
    }

    const product = await prisma.product.create({
      data: {
        ownerUserId: data.ownerUserId,
        title: data.title,
        description: data.description,
        priceText: data.priceText,
        checkoutUrl: data.checkoutUrl,
        status: data.status,
        quantityLimit: data.quantityLimit,
      },
    });

    return reply.code(201).send(product);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to create product';

    return reply.code(400).send({
      message,
    });
  }
}
