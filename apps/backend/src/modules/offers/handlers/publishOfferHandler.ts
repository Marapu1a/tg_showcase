import { FastifyReply, FastifyRequest } from 'fastify';
import { OfferStatus } from '@prisma/client';

import { env } from '../../../config/env.js';
import { prisma } from '../../../lib/prisma.js';
import {
  publishTelegramMessage,
  publishTelegramPhoto,
} from '../../../lib/telegramPublisher.js';
import { parseOfferIdParam } from '../schemas/offerParamsSchema.js';

function buildOfferText(
  offer: { title: string; text: string | null },
  product: { priceText: string },
) {
  const lines = [offer.title.trim()];

  if (offer.text && offer.text.trim().length > 0) {
    lines.push('', offer.text.trim());
  }

  lines.push('', `Цена: ${product.priceText}`);

  return lines.join('\n');
}

function buildPublicUrl(base: string, path: string) {
  const normalizedBase = base.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

export async function publishOfferHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = parseOfferIdParam(request.params);

    const offer = await prisma.offer.findUnique({
      where: { id },
      include: {
        product: {
          include: {
            images: {
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            },
          },
        },
      },
    });

    if (!offer) {
      return reply.code(404).send({
        message: 'Offer not found',
      });
    }

    if (!offer.product) {
      return reply.code(404).send({
        message: 'Product not found',
      });
    }

    if (offer.status === OfferStatus.ARCHIVED) {
      return reply.code(400).send({
        message: 'Archived offer cannot be published',
      });
    }

    if (offer.telegramMessageId) {
      return reply.code(400).send({
        message: 'Offer already published',
      });
    }

    if (!offer.product.checkoutUrl || offer.product.checkoutUrl.trim().length === 0) {
      return reply.code(400).send({
        message: 'Product checkoutUrl is missing',
      });
    }

    if (!env.BACKEND_PUBLIC_URL) {
      return reply.code(400).send({
        message: 'BACKEND_PUBLIC_URL is not configured',
      });
    }

    if (!env.MINI_APP_PUBLIC_URL) {
      return reply.code(400).send({
        message: 'MINI_APP_PUBLIC_URL is not configured',
      });
    }

    if (!env.TELEGRAM_BOT_TOKEN) {
      return reply.code(400).send({
        message: 'TELEGRAM_BOT_TOKEN is not configured',
      });
    }

    const channelId = offer.channelId ?? env.DEFAULT_PUBLISH_CHANNEL_ID;

    if (!channelId) {
      return reply.code(400).send({
        message: 'Channel id is missing for publish',
      });
    }

    const buyUrl = buildPublicUrl(env.BACKEND_PUBLIC_URL, `/click/buy/${offer.id}`);
    const detailUrl = buildPublicUrl(
      env.BACKEND_PUBLIC_URL,
      `/click/detail/${offer.id}`,
    );

    const text = buildOfferText(offer, offer.product);

    const imageUrl =
      offer.product.images.find((image) => image.fileUrl?.trim().length > 0)
        ?.fileUrl ?? null;

    const buttons = [
      { text: 'Купить', url: buyUrl },
      { text: 'Подробнее', url: detailUrl },
    ];

    const publishResult = imageUrl
      ? await publishTelegramPhoto({
          botToken: env.TELEGRAM_BOT_TOKEN,
          channelId,
          text,
          photoUrl: imageUrl,
          buttons,
        })
      : await publishTelegramMessage({
          botToken: env.TELEGRAM_BOT_TOKEN,
          channelId,
          text,
          buttons,
        });

    const updatedOffer = await prisma.offer.update({
      where: { id },
      data: {
        status: OfferStatus.ACTIVE,
        channelId: publishResult.channelId,
        telegramMessageId: publishResult.messageId,
        publishedAt: offer.publishedAt ?? new Date(),
      },
    });

    return reply.send(updatedOffer);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to publish offer';

    return reply.code(400).send({
      message,
    });
  }
}
