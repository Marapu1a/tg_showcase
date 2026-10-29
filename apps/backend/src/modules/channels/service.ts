import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import {
  ChannelError,
  parseChannelReference,
  verifyChannel,
} from '../../lib/telegramChannels.js';

export function channelBotToken() {
  if (!env.TELEGRAM_BOT_TOKEN)
    throw new ChannelError(503, 'Подключение каналов пока недоступно.');
  return env.TELEGRAM_BOT_TOKEN;
}

export async function connectChannel(
  ownerUserId: string,
  telegramUserId: string,
  reference: unknown,
) {
  const verified = await verifyChannel(
    channelBotToken(),
    parseChannelReference(reference),
    telegramUserId,
  );
  const existing = await prisma.sellerChannel.findUnique({
    where: { ownerUserId },
  });
  if (existing && existing.channelId !== verified.channelId) {
    throw new ChannelError(
      409,
      'У вас уже подключён канал. В первом выпуске поддерживается один канал.',
    );
  }
  try {
    // The channel ID is immutable: concurrent requests cannot replace the first connection.
    if (existing)
      return await prisma.sellerChannel.update({
        where: { ownerUserId },
        data: verified,
      });
    return await prisma.sellerChannel.create({
      data: { ownerUserId, ...verified },
    });
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    ) {
      const current = await prisma.sellerChannel.findUnique({
        where: { ownerUserId },
      });
      if (current?.channelId === verified.channelId) return current;
      throw new ChannelError(
        409,
        'Этот канал уже подключён или у вас уже есть другой канал. Обновите страницу.',
      );
    }
    throw error;
  }
}

export async function verifiedPublishChannel(
  ownerUserId: string,
  telegramUserId: string,
) {
  const channel = await prisma.sellerChannel.findUnique({
    where: { ownerUserId },
  });
  if (!channel)
    throw new ChannelError(
      409,
      'Сначала подключите свой канал на главной странице.',
    );
  const verified = await verifyChannel(
    channelBotToken(),
    channel.channelId,
    telegramUserId,
  );
  await prisma.sellerChannel.update({ where: { ownerUserId }, data: verified });
  return verified;
}
