import { FastifyReply, FastifyRequest } from 'fastify';

export async function getHealth(_request: FastifyRequest, reply: FastifyReply) {
  return reply.send({ status: 'ok' });
}
