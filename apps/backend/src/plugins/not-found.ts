import { FastifyInstance } from 'fastify';

export function registerNotFoundHandler(app: FastifyInstance) {
  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({
      message: `Route ${request.method} ${request.url} not found`,
    });
  });
}
