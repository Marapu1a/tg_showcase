import { FastifyReply, FastifyRequest } from 'fastify';

import { prisma } from '../../../lib/prisma.js';

export async function listOffersHandler(
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  const offers = await prisma.offer.findMany({
    orderBy: { createdAt: 'desc' },
  });

  return reply.send(offers);
}
