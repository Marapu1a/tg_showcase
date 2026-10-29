import Fastify from 'fastify';
import { registerAbuseLimits } from './plugins/abuse-limits.js';
import { listingsRoutes, mediaRoutes } from './modules/listings/routes.js';
import {
  publicOrdersRoutes,
  sellerOrdersRoutes,
} from './modules/orders/routes.js';
import { startOrderNotifier } from './modules/orders/notifier.js';
import {
  channelsRoutes,
  channelHandoffRoutes,
} from './modules/channels/routes.js';

import { registerSellerAuth } from './plugins/seller-auth.js';
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

export function buildApp(options: { notifications?: boolean } = {}) {
  if (
    process.env.TRUST_LOCAL_CLOUDFLARE === '1' &&
    !['127.0.0.1', '::1', 'localhost'].includes(env.HOST)
  )
    throw new Error('TRUST_LOCAL_CLOUDFLARE requires a loopback-only HOST');
  const app = Fastify({
    bodyLimit: 16384,
    requestTimeout: 20000,
    logger: { redact: ['req.headers.authorization'] },
  });

  registerCors(app);
  registerAbuseLimits(app);
  registerErrorHandlers(app);
  registerNotFoundHandler(app);

  app.register(healthRoutes);
  app.register(async (sellerApp) => {
    registerSellerAuth(sellerApp, {
      token: env.TELEGRAM_BOT_TOKEN,
      ensureUser: (identity) =>
        prisma.user.upsert({
          where: { telegramUserId: identity.telegramUserId },
          create: identity,
          update: identity,
        }),
    });
    sellerApp.register(listingsRoutes, { prefix: '/listings' });
    sellerApp.register(sellerOrdersRoutes, { prefix: '/orders' });
    sellerApp.register(channelsRoutes, { prefix: '/channels' });
    sellerApp.register(usersRoutes, { prefix: '/users' });
    sellerApp.register(productsRoutes, { prefix: '/products' });
    sellerApp.register(offersRoutes, { prefix: '/offers' });
  });
  app.register(offerEventsRoutes);
  app.register(publicOrdersRoutes);
  app.register(mediaRoutes);
  app.register(channelHandoffRoutes);

  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  if (options.notifications) startOrderNotifier(app);
  return app;
}

export async function startApp() {
  const app = buildApp({ notifications: true });

  await app.listen({
    host: env.HOST,
    port: env.PORT,
  });

  return app;
}
