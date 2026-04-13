import { FastifyReply, FastifyRequest } from 'fastify';

import { prisma } from '../../../lib/prisma.js';
import { parseOfferIdParam } from '../schemas/offerParamsSchema.js';

export async function getOfferHandler(
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

    return reply.send(offer);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch offer';

    return reply.code(400).send({
      message,
    });
  }
}
