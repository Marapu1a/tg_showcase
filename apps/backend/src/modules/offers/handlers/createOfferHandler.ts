import { FastifyReply, FastifyRequest } from 'fastify';

import { prisma } from '../../../lib/prisma.js';
import { parseCreateOfferBody } from '../schemas/createOfferSchema.js';

export async function createOfferHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const data = parseCreateOfferBody(request.body);

    const owner = await prisma.user.findUnique({
      where: { id: data.ownerUserId },
      select: { id: true },
    });

    if (!owner) {
      return reply.code(404).send({
        message: 'Owner user not found',
      });
    }

    const product = await prisma.product.findUnique({
      where: { id: data.productId },
      select: { id: true, ownerUserId: true },
    });

    if (!product) {
      return reply.code(404).send({
        message: 'Product not found',
      });
    }

    if (product.ownerUserId !== data.ownerUserId) {
      return reply.code(400).send({
        message: 'Product does not belong to owner',
      });
    }

    const offer = await prisma.offer.create({
      data: {
        productId: data.productId,
        ownerUserId: data.ownerUserId,
        title: data.title,
        text: data.text,
        status: data.status,
        channelId: data.channelId,
        telegramMessageId: data.telegramMessageId,
        publishedAt: data.publishedAt,
      },
    });

    return reply.code(201).send(offer);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to create offer';

    return reply.code(400).send({
      message,
    });
  }
}
