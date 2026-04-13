import Fastify from 'fastify';

import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { registerCors } from './plugins/cors.js';
import { registerErrorHandlers } from './plugins/error-handlers.js';
import { registerNotFoundHandler } from './plugins/not-found.js';
import { healthRoutes } from './modules/health/routes.js';
import { offerEventsRoutes } from './modules/offer-events/routes.js';
import { offersRoutes } from './modules/offers/routes.js';
import { productsRoutes } from './modules/products/routes.js';
import { usersRoutes } from './modules/users/routes.js';

export function buildApp() {
  const app = Fastify({
    logger: true,
  });

  registerCors(app);
  registerErrorHandlers(app);
  registerNotFoundHandler(app);

  app.register(healthRoutes);
  app.register(usersRoutes, { prefix: '/users' });
  app.register(productsRoutes, { prefix: '/products' });
  app.register(offersRoutes, { prefix: '/offers' });
  app.register(offerEventsRoutes);

  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  return app;
}

export async function startApp() {
  const app = buildApp();

  await app.listen({
    host: env.HOST,
    port: env.PORT,
  });

  return app;
}
