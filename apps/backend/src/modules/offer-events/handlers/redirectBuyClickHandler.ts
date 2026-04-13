import { FastifyReply, FastifyRequest } from 'fastify';
import { OfferEventType } from '@prisma/client';

import { parseOfferEventParams } from '../schemas/offerEventParamsSchema.js';
import { recordOfferClick } from './recordOfferClick.js';

export async function redirectBuyClickHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { offerId } = parseOfferEventParams(request.params);

    const result = await recordOfferClick({
      offerId,
      type: OfferEventType.BUY_CLICK,
    });

    if (!result) {
      return reply.code(404).send({
        message: 'Offer not found',
      });
    }

    const checkoutUrl = result.offer.product.checkoutUrl;

    if (!checkoutUrl) {
      return reply.code(400).send({
        message: 'Checkout URL is missing',
      });
    }

    return reply.redirect(checkoutUrl, 302);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to redirect BUY click';

    return reply.code(400).send({
      message,
    });
  }
}
