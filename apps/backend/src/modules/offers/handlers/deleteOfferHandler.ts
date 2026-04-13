import { FastifyReply, FastifyRequest } from 'fastify';

import { prisma } from '../../../lib/prisma.js';
import { parseOfferIdParam } from '../schemas/offerParamsSchema.js';

export async function deleteOfferHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = parseOfferIdParam(request.params);

    const existing = await prisma.offer.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      return reply.code(404).send({
        message: 'Offer not found',
      });
    }

    const offer = await prisma.offer.delete({
      where: { id },
    });

    return reply.send(offer);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to delete offer';

    return reply.code(400).send({
      message,
    });
  }
}
