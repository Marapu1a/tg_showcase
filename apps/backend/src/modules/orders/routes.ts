import { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { InputError } from '../../lib/input.js';
import { validateTelegramInitData } from '../../lib/telegramAuth.js';
import { changeOrderStatus, createOrder } from './service.js';

export async function publicOrdersRoutes(app: FastifyInstance) {
  app.get('/public/offers/:id', async (request) => {
    const { id } = request.params as { id: string };
    const offer = await prisma.offer.findUnique({
      where: { id, status: 'ACTIVE', product: { status: 'ACTIVE' } },
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
      title: offer.product.title,
      description: offer.product.description,
      priceMinor: offer.product.priceMinor,
      currency: 'RUB',
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
  createdAt: true,
  notificationState: true,
} as const;

export async function sellerOrdersRoutes(app: FastifyInstance) {
  app.get('/', async (request) => {
    const query = request.query as { scope?: string; before?: string };
    const scope = query.scope ?? 'active';
    if (!['active', 'history', 'all'].includes(scope))
      throw new InputError(400, 'Неизвестный фильтр.');
    const before =
      query.before === undefined ? undefined : Number(query.before);
    if (before !== undefined && (!Number.isSafeInteger(before) || before < 1))
      throw new InputError(400, 'Некорректная страница.');
    const rows = await prisma.orderRequest.findMany({
      where: {
        ownerUserId: request.seller.id,
        status:
          scope === 'active'
            ? { in: ['NEW', 'IN_PROGRESS'] }
            : scope === 'history'
              ? { in: ['DONE', 'CANCELLED'] }
              : undefined,
        number: before ? { lt: before } : undefined,
      },
      orderBy: { number: 'desc' },
      take: 31,
      select: orderSelect,
    });
    const counts = await prisma.orderRequest.groupBy({
      by: ['status'],
      where: { ownerUserId: request.seller.id },
      _count: true,
    });
    return {
      orders: rows.slice(0, 30),
      next: rows.length > 30 ? rows[29]!.number : null,
      counts: Object.fromEntries(counts.map((row) => [row.status, row._count])),
    };
  });
  app.patch('/:id', async (request) =>
    changeOrderStatus(
      request.seller.id,
      (request.params as { id: string }).id,
      request.body,
    ),
  );
}
