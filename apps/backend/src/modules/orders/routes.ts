import { searchOrders } from './search.js';
import { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { InputError } from '../../lib/input.js';
import { validateTelegramInitData } from '../../lib/telegramAuth.js';
import { changeOrderStatus, createOrder } from './service.js';
import { queryText } from '../../lib/search.js';

export async function publicOrdersRoutes(app: FastifyInstance) {
  app.get('/public/offers/:id', async (request) => {
    const { id } = request.params as { id: string };
    const offer = await prisma.offer.findUnique({
      where: {
        id,
        product: { status: 'ACTIVE' },
        OR: [
          { status: 'ACTIVE' },
          { status: 'PAUSED' },
          { status: 'ARCHIVED', telegramMessageId: { not: null } },
        ],
      },
      include: {
        product: {
          include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
        },
      },
    });
    if (!offer)
      throw new InputError(404, 'Продажа недоступна или уже завершена.');
    return {
      id: offer.id,
      saleStatus: offer.status,
      title: offer.product.title,
      description: offer.product.description,
      priceMinor: offer.product.priceMinor,
      currency: offer.product.currency,
      imageUrl: offer.product.images[0]?.fileUrl ?? null,
      available:
        offer.product.quantityLimit === null
          ? null
          : Math.max(
              0,
              offer.product.quantityLimit - offer.product.reservedQuantity,
            ),
    };
  });
  app.post(
    '/public/offers/:id/orders',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      let identity;
      if (request.headers.authorization) {
        try {
          if (!request.headers.authorization.startsWith('tma '))
            throw new Error('Invalid auth');
          identity = validateTelegramInitData(
            request.headers.authorization.slice(4),
            env.TELEGRAM_BOT_TOKEN ?? '',
          );
        } catch {
          throw new InputError(
            401,
            'Вход Telegram устарел. Откройте приложение заново.',
          );
        }
      }
      const order = await createOrder(id, request.body, identity);
      return reply.code(201).send(order);
    },
  );
}

const orderSelect = {
  id: true,
  number: true,
  productTitle: true,
  quantity: true,
  unitPriceMinor: true,
  totalMinor: true,
  currency: true,
  buyerName: true,
  contact: true,
  contactType: true,
  contactVerified: true,
  comment: true,
  status: true,
  version: true,
  stockReleased: true,
  createdAt: true,
  notificationState: true,
} as const;

export async function sellerOrdersRoutes(app: FastifyInstance) {
  app.get('/new-count', async (request) => ({
    count: await prisma.orderRequest.count({
      where: { ownerUserId: request.seller.id, status: 'NEW' },
    }),
  }));
  app.get('/:id/history', async (request) => {
    const id = (request.params as { id: string }).id;
    const order = await prisma.orderRequest.findUnique({
      where: { id, ownerUserId: request.seller.id },
      select: { id: true },
    });
    if (!order) throw new InputError(404, 'Заказ не найден.');
    const before = queryText(
      (request.query as { before?: unknown }).before,
      'Страница',
    );
    let older = {};
    if (before) {
      const cursor = await prisma.orderHistory.findUnique({
        where: { id: before, orderId: id },
        select: { id: true, createdAt: true },
      });
      if (!cursor) throw new InputError(400, 'Некорректная страница истории.');
      older = {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      };
    }
    const rows = await prisma.orderHistory.findMany({
      where: { orderId: id, ...older },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 21,
      select: {
        id: true,
        fromStatus: true,
        toStatus: true,
        reason: true,
        stockDelta: true,
        createdAt: true,
      },
    });
    return {
      events: rows.slice(0, 20),
      next: rows.length > 20 ? rows[19]!.id : null,
    };
  });
  app.get('/', async (request) =>
    searchOrders(request.seller.id, request.query as Record<string, unknown>),
  );
  app.get('/products', async (request) => ({
    products: await prisma.product.findMany({
      where: { ownerUserId: request.seller.id },
      select: { id: true, title: true },
      orderBy: { title: 'asc' },
      take: 200,
    }),
  }));
  app.get('/:id', async (request) => {
    const order = await prisma.orderRequest.findUnique({
      where: {
        id: (request.params as { id: string }).id,
        ownerUserId: request.seller.id,
      },
      select: orderSelect,
    });
    if (!order) throw new InputError(404, 'Заказ не найден.');
    return order;
  });
  app.patch('/:id', async (request) =>
    changeOrderStatus(
      request.seller.id,
      (request.params as { id: string }).id,
      request.body,
    ),
  );
}
