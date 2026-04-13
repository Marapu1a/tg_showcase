import { OfferEventType } from '@prisma/client';

import { prisma } from '../../../lib/prisma.js';

type RecordOfferClickInput = {
  offerId: string;
  type: OfferEventType;
  viewerTelegramUserId?: string;
};

export async function recordOfferClick(input: RecordOfferClickInput) {
  const offer = await prisma.offer.findUnique({
    where: { id: input.offerId },
    select: {
      id: true,
      productId: true,
      product: {
        select: {
          checkoutUrl: true,
        },
      },
    },
  });

  if (!offer) {
    return null;
  }

  const event = await prisma.offerEvent.create({
    data: {
      offerId: offer.id,
      productId: offer.productId,
      type: input.type,
      viewerTelegramUserId: input.viewerTelegramUserId ?? null,
    },
  });

  return {
    offer,
    event,
  };
}
