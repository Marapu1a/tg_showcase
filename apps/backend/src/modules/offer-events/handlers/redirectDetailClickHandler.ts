import { FastifyReply, FastifyRequest } from 'fastify';
import { OfferEventType } from '@prisma/client';

import { env } from '../../../config/env.js';
import { parseOfferEventParams } from '../schemas/offerEventParamsSchema.js';
import { recordOfferClick } from './recordOfferClick.js';

function buildDetailUrl(offerId: string) {
  if (!env.MINI_APP_PUBLIC_URL) {
    throw new Error('MINI_APP_PUBLIC_URL is not configured');
  }

  const base = env.MINI_APP_PUBLIC_URL.replace(/\/+$/, '');
  return `${base}/offers/${offerId}`;
}

export async function redirectDetailClickHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { offerId } = parseOfferEventParams(request.params);

    const result = await recordOfferClick({
      offerId,
      type: OfferEventType.DETAIL_CLICK,
    });

    if (!result) {
      return reply.code(404).send({
        message: 'Offer not found',
      });
    }

    const detailUrl = buildDetailUrl(offerId);

    return reply.redirect(detailUrl, 302);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to redirect DETAIL click';

    return reply.code(400).send({
      message,
    });
  }
}
