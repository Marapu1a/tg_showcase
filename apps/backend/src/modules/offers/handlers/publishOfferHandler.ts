import { FastifyReply, FastifyRequest } from 'fastify';
import { OfferStatus } from '@prisma/client';

import { prisma } from '../../../lib/prisma.js';
import { parseOfferIdParam } from '../schemas/offerParamsSchema.js';

export async function publishOfferHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = parseOfferIdParam(request.params);

    const offer = await prisma.offer.findUnique({
      where: { id },
    });

    if (!offer) {
      return reply.code(404).send({
        message: 'Offer not found',
      });
    }

    if (offer.status === OfferStatus.ARCHIVED) {
      return reply.code(400).send({
        message: 'Archived offer cannot be published',
      });
    }

    const updatedOffer = await prisma.offer.update({
      where: { id },
      data: {
        status: OfferStatus.ACTIVE,
        publishedAt: offer.publishedAt ?? new Date(),
      },
    });

    return reply.send(updatedOffer);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to publish offer';

    return reply.code(400).send({
      message,
    });
  }
}
