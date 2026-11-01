import { FastifyReply, FastifyRequest } from 'fastify';

import { prisma } from '../../../lib/prisma.js';
import { changeListingState } from '../../listings/state.js';
import { InputError } from '../../../lib/input.js';
import { parseOfferIdParam } from '../schemas/offerParamsSchema.js';

export async function deleteOfferHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = parseOfferIdParam(request.params);

    const existing = await prisma.offer.findUnique({
      where: { id, ownerUserId: request.seller.id },
      select: { id: true, status: true },
    });

    if (!existing) {
      return reply.code(404).send({
        message: 'Offer not found',
      });
    }

    const offer = await changeListingState(request.seller.id, id, {
      action: 'ARCHIVE',
      expectedStatus: existing.status,
    });

    return reply.send(offer);
  } catch (error) {
    if (error instanceof InputError)
      return reply.code(error.statusCode).send({ message: error.message });
    const message =
      error instanceof Error ? error.message : 'Failed to delete offer';

    return reply.code(400).send({
      message,
    });
  }
}
