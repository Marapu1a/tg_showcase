import { FastifyReply, FastifyRequest } from 'fastify';

import { prisma } from '../../../lib/prisma.js';
import { parseEnsureTelegramUserBody } from '../schemas/ensureTelegramUserSchema.js';

export async function ensureTelegramUserHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const data = parseEnsureTelegramUserBody(request.body);

    const existing = await prisma.user.findUnique({
      where: { telegramUserId: data.telegramUserId },
    });

    if (existing) {
      const updateData: Partial<typeof data> = {};

      if (data.username !== undefined) {
        updateData.username = data.username;
      }
      if (data.firstName !== undefined) {
        updateData.firstName = data.firstName;
      }
      if (data.lastName !== undefined) {
        updateData.lastName = data.lastName;
      }

      if (Object.keys(updateData).length > 0) {
        const updated = await prisma.user.update({
          where: { telegramUserId: data.telegramUserId },
          data: updateData,
        });
        return reply.send(updated);
      }

      return reply.send(existing);
    }

    const created = await prisma.user.create({
      data: {
        telegramUserId: data.telegramUserId,
        username: data.username ?? null,
        firstName: data.firstName ?? null,
        lastName: data.lastName ?? null,
      },
    });

    return reply.code(201).send(created);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to ensure user';

    return reply.code(400).send({
      message,
    });
  }
}
