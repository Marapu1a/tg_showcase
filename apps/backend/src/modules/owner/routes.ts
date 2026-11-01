import { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { InputError, objectBody, textField } from '../../lib/input.js';
import { serializable } from '../../lib/transaction.js';
import { telegramCall } from '../../lib/telegramChannels.js';

export const isOwner = (id: string) => env.OWNER_TELEGRAM_IDS.includes(id);
const publicSelect = {
  slug: true,
  name: true,
  summary: true,
  description: true,
  telegramUrl: true,
  status: true,
} as const;

export async function hubRoutes(app: FastifyInstance) {
  app.get('/projects', async () => ({
    projects: await prisma.hubProject.findMany({
      where: { visible: true },
      select: publicSelect,
      orderBy: { createdAt: 'asc' },
      take: 100,
    }),
  }));
  app.get('/projects/:slug', async (request) => {
    const project = await prisma.hubProject.findFirst({
      where: { slug: (request.params as { slug: string }).slug, visible: true },
      select: publicSelect,
    });
    if (!project) throw new InputError(404, 'Проект не найден.');
    return project;
  });
}

function projectInput(body: unknown) {
  const p = objectBody(body);
  const slug = textField(p.slug, 'Адрес', 60);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    throw new InputError(
      400,
      'Адрес: латинские буквы в нижнем регистре, цифры и дефисы.',
    );
  const telegramUrl = textField(p.telegramUrl, 'Ссылка', 512);
  let url: URL;
  try {
    url = new URL(telegramUrl);
  } catch {
    throw new InputError(400, 'Нужна ссылка https://t.me/имя_бота.');
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 't.me' ||
    url.username ||
    url.password ||
    url.port ||
    !/^\/[A-Za-z][A-Za-z0-9_]{4,31}\/?$/.test(url.pathname)
  )
    throw new InputError(
      400,
      'Разрешена только HTTPS-ссылка на проект в t.me.',
    );
  if (
    !['ACTIVE', 'COMING_SOON', 'PAUSED'].includes(String(p.status)) ||
    typeof p.visible !== 'boolean'
  )
    throw new InputError(400, 'Проверьте статус и видимость.');
  return {
    slug,
    name: textField(p.name, 'Название', 80),
    summary: textField(p.summary, 'Кратко', 200),
    description: textField(p.description, 'Описание', 2000),
    telegramUrl: url.toString(),
    status: String(p.status),
    visible: p.visible,
  };
}

export async function ownerRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (request, reply) => {
    if (!isOwner(request.seller.telegramUserId))
      return reply
        .code(403)
        .send({ message: 'Этот раздел доступен только владельцу TG Zoo.' });
  });
  app.get('/summary', async (request) => {
    const period = String(
      (request.query as { period?: string }).period ?? '30',
    );
    if (!['7', '30', 'all'].includes(period))
      throw new InputError(400, 'Выберите период.');
    const since =
      period === 'all'
        ? undefined
        : new Date(Date.now() - Number(period) * 86400000);
    const createdAt = since ? { gte: since } : undefined;
    const [accounts, channels, products, publications, orders, payments] =
      await prisma.$transaction([
        prisma.user.count({ where: { createdAt } }),
        prisma.sellerChannel.count(),
        prisma.product.count({ where: { createdAt } }),
        prisma.offer.count({
          where: {
            telegramMessageId: { not: null },
            ...(since ? { publishedAt: { gte: since } } : {}),
          },
        }),
        prisma.orderRequest.groupBy({
          by: ['status'],
          orderBy: { status: 'asc' },
          where: { createdAt },
          _count: { _all: true },
        }),
        prisma.starPayment.groupBy({
          by: ['state'],
          orderBy: { state: 'asc' },
          where: { createdAt },
          _sum: { stars: true },
          _count: { _all: true },
        }),
      ]);
    return {
      period,
      since: since?.toISOString() ?? null,
      asOf: new Date().toISOString(),
      accounts,
      channels,
      products,
      publications,
      orders,
      payments,
    };
  });
  // Per-process short cache prevents clicking Refresh from flooding Telegram.
  let balance:
    | { amount: number; nanostarAmount: number; fetchedAt: string }
    | undefined;
  let nextFetch = 0;
  let failure: string | null = null;
  let pending: Promise<void> | undefined;
  app.get('/stars', async () => {
    if (Date.now() >= nextFetch && !pending) {
      pending = (async () => {
        try {
          if (!env.TELEGRAM_BOT_TOKEN) throw new Error('Bot unavailable');
          const result = await telegramCall<{
            amount: number;
            nanostar_amount?: number;
          }>(env.TELEGRAM_BOT_TOKEN, 'getMyStarBalance');
          if (!Number.isSafeInteger(result.amount))
            throw new Error('Invalid balance');
          balance = {
            amount: result.amount,
            nanostarAmount: result.nanostar_amount ?? 0,
            fetchedAt: new Date().toISOString(),
          };
          failure = null;
        } catch {
          failure =
            'Telegram сейчас не подтвердил баланс. Попробуйте обновить через минуту.';
        }
        nextFetch = Date.now() + 60000;
      })().finally(() => {
        pending = undefined;
      });
    }
    await pending;
    return {
      balance: balance ?? null,
      error: failure,
      stale: Boolean(failure),
    };
  });
  app.get('/payments', async (request) => {
    const raw = (request.query as { page?: string }).page ?? '1';
    if (!/^\d{1,5}$/.test(raw) || Number(raw) < 1)
      throw new InputError(400, 'Некорректная страница.');
    const page = Number(raw);
    const rows = await prisma.starPayment.findMany({
      orderBy: [{ createdAt: 'desc' }, { chargeId: 'desc' }],
      skip: (page - 1) * 30,
      take: 31,
      select: {
        chargeId: true,
        offerId: true,
        stars: true,
        state: true,
        reason: true,
        createdAt: true,
        offer: { select: { title: true } },
      },
    });
    return {
      payments: rows.slice(0, 30),
      next: rows.length > 30 ? page + 1 : null,
    };
  });
  app.get('/problems', async () => {
    const delayed = new Date(Date.now() - 5 * 60000);
    const offerWhere = {
      OR: [
        { publishState: 'UNCERTAIN' },
        { publishState: 'SENDING', updatedAt: { lt: delayed } },
      ],
    };
    const refundWhere = { state: 'REFUND_PENDING' };
    const orderWhere = {
      OR: [
        { notificationState: 'FAILED' },
        {
          notificationState: { in: ['PENDING', 'SENDING'] },
          createdAt: { lt: delayed },
        },
      ],
    };
    const [
      offers,
      refunds,
      notifications,
      offerCount,
      refundCount,
      notificationCount,
    ] = await prisma.$transaction([
      prisma.offer.findMany({
        where: offerWhere,
        take: 30,
        orderBy: { updatedAt: 'asc' },
        select: { id: true, title: true, publishState: true, updatedAt: true },
      }),
      prisma.starPayment.findMany({
        where: refundWhere,
        take: 30,
        orderBy: { createdAt: 'asc' },
        select: {
          chargeId: true,
          offerId: true,
          stars: true,
          refundAttempts: true,
          refundNextAt: true,
        },
      }),
      prisma.orderRequest.findMany({
        where: orderWhere,
        take: 30,
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          number: true,
          notificationState: true,
          notificationAttempts: true,
        },
      }),
      prisma.offer.count({ where: offerWhere }),
      prisma.starPayment.count({ where: refundWhere }),
      prisma.orderRequest.count({ where: orderWhere }),
    ]);
    return {
      offers,
      refunds,
      notifications,
      counts: {
        offers: offerCount,
        refunds: refundCount,
        notifications: notificationCount,
      },
      asOf: new Date().toISOString(),
    };
  });
  app.get('/projects', async () => ({
    projects: await prisma.hubProject.findMany({
      orderBy: { createdAt: 'asc' },
      take: 100,
    }),
  }));
  app.post('/projects', async (request, reply) => {
    const data = projectInput(request.body);
    const project = await serializable(async (tx) => {
      if (await tx.hubProject.findUnique({ where: { slug: data.slug } }))
        throw new InputError(409, 'Такой адрес уже занят.');
      if ((await tx.hubProject.count()) >= 100)
        throw new InputError(409, 'Достигнут лимит 100 проектов.');
      const row = await tx.hubProject.create({ data });
      await tx.ownerAudit.create({
        data: {
          telegramUserId: request.seller.telegramUserId,
          action: 'PROJECT_CREATED',
          projectId: row.id,
          details: { after: data },
        },
      });
      return row;
    });
    return reply.code(201).send(project);
  });
  app.put('/projects/:id', async (request) => {
    const data = projectInput(request.body);
    const version = objectBody(request.body).version;
    if (!Number.isSafeInteger(version) || Number(version) < 0)
      throw new InputError(400, 'Обновите карточку проекта.');
    return serializable(async (tx) => {
      const id = (request.params as { id: string }).id;
      const before = await tx.hubProject.findUnique({ where: { id } });
      if (!before) throw new InputError(404, 'Проект не найден.');
      if (before.version !== version)
        throw new InputError(
          409,
          'Проект уже изменён. Обновите список и откройте карточку заново.',
        );
      const duplicate = await tx.hubProject.findUnique({
        where: { slug: data.slug },
      });
      if (duplicate && duplicate.id !== id)
        throw new InputError(409, 'Такой адрес уже занят.');
      const row = await tx.hubProject.update({
        where: { id },
        data: { ...data, version: { increment: 1 } },
      });
      await tx.ownerAudit.create({
        data: {
          telegramUserId: request.seller.telegramUserId,
          action: 'PROJECT_UPDATED',
          projectId: id,
          details: { before: projectInput(before), after: data },
        },
      });
      return row;
    });
  });
  app.get('/audit', async () => ({
    events: await prisma.ownerAudit.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        action: true,
        projectId: true,
        telegramUserId: true,
        createdAt: true,
      },
    }),
  }));
}
