import { FastifyReply, FastifyRequest } from 'fastify';

import { prisma } from '../../../lib/prisma.js';
import { parseOfferIdParam } from '../schemas/offerParamsSchema.js';
import { parseUpdateOfferBody } from '../schemas/updateOfferSchema.js';

export async function updateOfferHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = parseOfferIdParam(request.params);
    const data = parseUpdateOfferBody(request.body);

    const existing = await prisma.offer.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      return reply.code(404).send({
        message: 'Offer not found',
      });
    }

    const offer = await prisma.offer.update({
      where: { id },
      data,
    });

    return reply.send(offer);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to update offer';

    return reply.code(400).send({
      message,
    });
  }
}
