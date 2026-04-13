import cors from '@fastify/cors';
import { FastifyInstance } from 'fastify';

import { env } from '../config/env.js';

export async function registerCors(app: FastifyInstance) {
  // Dev-friendly CORS; set CORS_ORIGIN to a specific HTTPS miniapp host in prod.
  await app.register(cors, {
    origin: env.CORS_ORIGIN ?? true,
  });
}
