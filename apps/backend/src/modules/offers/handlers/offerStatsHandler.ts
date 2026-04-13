import { FastifyReply, FastifyRequest } from 'fastify';
import { OfferEventType } from '@prisma/client';

import { prisma } from '../../../lib/prisma.js';
import { parseOfferIdParam } from '../schemas/offerParamsSchema.js';

export async function offerStatsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = parseOfferIdParam(request.params);

    const offer = await prisma.offer.findUnique({
      where: { id },
      select: { id: true, productId: true },
    });

    if (!offer) {
      return reply.code(404).send({
        message: 'Offer not found',
      });
    }

    const [totalBuyClicks, totalDetailClicks, lastBuyClick, lastDetailClick] =
      await Promise.all([
        prisma.offerEvent.count({
          where: { offerId: id, type: OfferEventType.BUY_CLICK },
        }),
        prisma.offerEvent.count({
          where: { offerId: id, type: OfferEventType.DETAIL_CLICK },
        }),
        prisma.offerEvent.findFirst({
          where: { offerId: id, type: OfferEventType.BUY_CLICK },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
        prisma.offerEvent.findFirst({
          where: { offerId: id, type: OfferEventType.DETAIL_CLICK },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
      ]);

    return reply.send({
      offerId: offer.id,
      productId: offer.productId,
      totalBuyClicks,
      totalDetailClicks,
      totalClicks: totalBuyClicks + totalDetailClicks,
      lastBuyClickAt: lastBuyClick?.createdAt ?? null,
      lastDetailClickAt: lastDetailClick?.createdAt ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch offer stats';

    return reply.code(400).send({
      message,
    });
  }
}
