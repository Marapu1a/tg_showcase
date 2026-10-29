import { createHmac, timingSafeEqual } from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { ChannelError, telegramCall } from '../../lib/telegramChannels.js';
import {
  channelBotToken,
  connectChannel,
  verifiedPublishChannel,
} from './service.js';

export async function channelsRoutes(app: FastifyInstance) {
  app.get('/', async (request) => ({
    channel: await prisma.sellerChannel.findUnique({
      where: { ownerUserId: request.seller.id },
    }),
  }));
  app.get('/bot', async () => {
    const me = await telegramCall<{ username: string }>(
      channelBotToken(),
      'getMe',
    );
    return { username: me.username };
  });
  app.post('/', async (request) => {
    const body = request.body as { channel?: unknown } | null;
    return {
      channel: await connectChannel(
        request.seller.id,
        request.seller.telegramUserId,
        body?.channel,
      ),
    };
  });
  app.post('/verify', async (request) => ({
    channel: await verifiedPublishChannel(
      request.seller.id,
      request.seller.telegramUserId,
    ),
  }));
  app.post('/request-button', async (request) => {
    return telegramCall<{ id: string }>(
      channelBotToken(),
      'savePreparedKeyboardButton',
      {
        user_id: Number(request.seller.telegramUserId),
        button: {
          text: 'Подключить канал',
          request_chat: {
            request_id: 1,
            chat_is_channel: true,
            request_title: true,
            request_username: true,
            user_administrator_rights: {
              is_anonymous: false,
              can_manage_chat: true,
              can_delete_messages: false,
              can_manage_video_chats: false,
              can_restrict_members: false,
              can_promote_members: false,
              can_change_info: false,
              can_invite_users: false,
              can_post_messages: true,
              can_post_stories: false,
              can_edit_stories: false,
              can_delete_stories: false,
            },
            bot_administrator_rights: {
              is_anonymous: false,
              can_manage_chat: true,
              can_delete_messages: false,
              can_manage_video_chats: false,
              can_restrict_members: false,
              can_promote_members: false,
              can_change_info: false,
              can_invite_users: false,
              can_post_messages: true,
              can_post_stories: false,
              can_edit_stories: false,
              can_delete_stories: false,
            },
          },
        },
      },
    );
  });
}

// Only the trusted bot process may deliver Telegram chat_shared updates here.
export async function channelHandoffRoutes(app: FastifyInstance) {
  app.post('/internal/channel-selection', async (request, reply) => {
    const expected = createHmac('sha256', channelBotToken())
      .update('tg-showcase/channel-handoff')
      .digest('hex');
    const supplied =
      request.headers.authorization?.replace(/^Bearer /, '') ?? '';
    if (
      !/^[a-f0-9]{64}$/.test(supplied) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    ) {
      return reply.code(401).send({ message: 'Unauthorized' });
    }
    const body = request.body as {
      telegramUserId?: unknown;
      channel?: unknown;
    } | null;
    if (
      typeof body?.telegramUserId !== 'string' ||
      !/^[1-9]\d{0,15}$/.test(body.telegramUserId) ||
      !Number.isSafeInteger(Number(body.telegramUserId))
    ) {
      throw new ChannelError(400, 'Invalid Telegram user');
    }
    const user = await prisma.user.findUnique({
      where: { telegramUserId: body.telegramUserId },
    });
    if (!user)
      throw new ChannelError(409, 'Сначала откройте приложение через бота.');
    return {
      channel: await connectChannel(user.id, user.telegramUserId, body.channel),
    };
  });
}
