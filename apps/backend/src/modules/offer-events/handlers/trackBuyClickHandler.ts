import { FastifyReply, FastifyRequest } from 'fastify';
import { OfferEventType } from '@prisma/client';

import { parseOfferEventBody } from '../schemas/offerEventBodySchema.js';
import { parseOfferEventParams } from '../schemas/offerEventParamsSchema.js';
import { recordOfferClick } from './recordOfferClick.js';

export async function trackBuyClickHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { offerId } = parseOfferEventParams(request.params);
    const { viewerTelegramUserId } = parseOfferEventBody(request.body);

    const result = await recordOfferClick({
      offerId,
      type: OfferEventType.BUY_CLICK,
      viewerTelegramUserId,
    });

    if (!result) {
      return reply.code(404).send({
        message: 'Offer not found',
      });
    }

    return reply.code(201).send(result.event);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to track BUY click';

    return reply.code(400).send({
      message,
    });
  }
}
