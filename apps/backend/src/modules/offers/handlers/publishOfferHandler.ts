import { FastifyReply, FastifyRequest } from 'fastify';
import { verifiedPublishChannel } from '../../channels/service.js';
import { ChannelError } from '../../../lib/telegramChannels.js';
import { OfferStatus } from '@prisma/client';

import { env } from '../../../config/env.js';
import { prisma } from '../../../lib/prisma.js';
import {
  publishTelegramMessage,
  publishTelegramPhoto,
  TelegramPublishRejected,
} from '../../../lib/telegramPublisher.js';
import { parseOfferIdParam } from '../schemas/offerParamsSchema.js';

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildOfferText(
  offer: { title: string; text: string | null },
  product: { priceText: string },
) {
  const lines = [`<b>${escapeHtml(offer.title.trim())}</b>`];

  if (offer.text && offer.text.trim().length > 0) {
    lines.push('', escapeHtml(offer.text.trim()));
  }

  lines.push('', `Цена: <b>${escapeHtml(product.priceText)}</b>`);

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
  let claimedId: string | undefined;
  try {
    const { id } = parseOfferIdParam(request.params);

    const offer = await prisma.offer.findUnique({
      where: { id, ownerUserId: request.seller.id },
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

    if (
      offer.product.status === 'ARCHIVED' ||
      offer.product.status === 'HIDDEN'
    )
      return reply.code(409).send({ message: 'Этот товар снят с продажи.' });

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

    const { channelId } = await verifiedPublishChannel(
      request.seller.id,
      request.seller.telegramUserId,
    );

    const buyUrl = buildPublicUrl(
      env.BACKEND_PUBLIC_URL,
      `/click/buy/${offer.id}`,
    );
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

    const claimed = await prisma.offer.updateMany({
      where: {
        id: offer.id,
        ownerUserId: request.seller.id,
        telegramMessageId: null,
        publishState: 'IDLE',
        status: { not: 'ARCHIVED' },
      },
      data: { publishState: 'SENDING' },
    });
    if (!claimed.count)
      return reply
        .code(409)
        .send({
          message:
            'Публикация уже запущена или её результат требует проверки. Проверьте канал перед повтором.',
        });
    claimedId = offer.id;

    const publishResult = imageUrl
      ? await publishTelegramPhoto({
          botToken: env.TELEGRAM_BOT_TOKEN,
          channelId,
          text,
          parseMode: 'HTML',
          photoUrl: imageUrl.startsWith('/')
            ? buildPublicUrl(env.BACKEND_PUBLIC_URL, imageUrl)
            : imageUrl,
          buttons,
        })
      : await publishTelegramMessage({
          botToken: env.TELEGRAM_BOT_TOKEN,
          channelId,
          text,
          parseMode: 'HTML',
          buttons,
        });

    const updatedOffer = await prisma.offer.update({
      where: { id, ownerUserId: request.seller.id },
      data: {
        status: OfferStatus.ACTIVE,
        publishState: 'SENT',
        channelId: publishResult.channelId,
        telegramMessageId: publishResult.messageId,
        publishedAt: offer.publishedAt ?? new Date(),
      },
    });

    return reply.send(updatedOffer);
  } catch (error) {
    if (claimedId) {
      const rejected = error instanceof TelegramPublishRejected;
      await prisma.offer.updateMany({
        where: { id: claimedId, publishState: 'SENDING' },
        data: { publishState: rejected ? 'IDLE' : 'UNCERTAIN' },
      });
      return reply
        .code(rejected ? 400 : 409)
        .send({
          message: rejected
            ? `Telegram отклонил публикацию: ${error.message}`
            : 'Не удалось подтвердить результат отправки. Проверьте канал; автоматический повтор остановлен, чтобы не создать второй пост.',
        });
    }
    if (error instanceof ChannelError)
      return reply.code(error.statusCode).send({ message: error.message });
    const message =
      error instanceof Error ? error.message : 'Failed to publish offer';

    return reply.code(400).send({
      message,
    });
  }
}
