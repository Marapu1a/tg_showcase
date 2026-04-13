import { FastifyReply, FastifyRequest } from 'fastify';

import { prisma } from '../../../lib/prisma.js';
import { parseOfferListQuery } from '../schemas/offerListQuerySchema.js';

export async function listOffersHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const filters = parseOfferListQuery(request.query);

    const offers = await prisma.offer.findMany({
      where: filters,
      orderBy: { createdAt: 'desc' },
    });

    return reply.send(offers);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to list offers';

    return reply.code(400).send({
      message,
    });
  }
}
