import { FastifyReply, FastifyRequest } from 'fastify';

export async function ensureTelegramUserHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  return reply.send(request.seller);
}
