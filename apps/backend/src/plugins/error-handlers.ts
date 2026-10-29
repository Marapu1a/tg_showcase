import { FastifyInstance } from 'fastify';

export function registerErrorHandlers(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    const statusCode =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;

    const message =
      statusCode < 500 &&
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof error.message === 'string'
        ? error.message
        : 'Internal server error';

    if (statusCode >= 500) {
      // Database errors may contain buyer contacts in query arguments.
      request.log.error({ statusCode }, 'Request failed');
    }

    return reply.status(statusCode).send({
      message,
    });
  });
}
