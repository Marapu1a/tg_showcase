import { FastifyReply, FastifyRequest } from 'fastify';
import { OfferEventType } from '@prisma/client';

import { prisma } from '../../../lib/prisma.js';
import { parseOfferEventBody } from '../schemas/offerEventBodySchema.js';
import { parseOfferEventParams } from '../schemas/offerEventParamsSchema.js';

export async function trackDetailClickHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { offerId } = parseOfferEventParams(request.params);
    const { viewerTelegramUserId } = parseOfferEventBody(request.body);

    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      select: { id: true, productId: true },
    });

    if (!offer) {
      return reply.code(404).send({
        message: 'Offer not found',
      });
    }

    const event = await prisma.offerEvent.create({
      data: {
        offerId: offer.id,
        productId: offer.productId,
        type: OfferEventType.DETAIL_CLICK,
        viewerTelegramUserId: viewerTelegramUserId ?? null,
      },
    });

    return reply.code(201).send(event);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to track DETAIL click';

    return reply.code(400).send({
      message,
    });
  }
}
