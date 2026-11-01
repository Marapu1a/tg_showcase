import { OfferStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { InputError } from '../../lib/input.js';
import { literalSearch, queryText } from '../../lib/search.js';

export async function searchListings(
  ownerUserId: string,
  query: Record<string, unknown>,
) {
  const q = queryText(query.q, 'Поиск'),
    scope = queryText(query.scope, 'Статус', 20) || 'current';
  const before = queryText(query.before, 'Страница');
  if (
    !['current', 'all', 'DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'].includes(scope)
  )
    throw new InputError(400, 'Некорректный статус.');
  const where: Prisma.OfferWhereInput = {
    ownerUserId,
    status:
      scope === 'all'
        ? undefined
        : scope === 'current'
          ? { not: 'ARCHIVED' }
          : (scope as OfferStatus),
    ...(q
      ? {
          OR: [
            { title: { contains: literalSearch(q), mode: 'insensitive' } },
            {
              product: {
                title: { contains: literalSearch(q), mode: 'insensitive' },
              },
            },
          ],
        }
      : {}),
  };
  let older: Prisma.OfferWhereInput = {};
  if (before) {
    const cursor = await prisma.offer.findUnique({
      where: { id: before, ownerUserId },
      select: { createdAt: true, id: true },
    });
    if (!cursor) throw new InputError(400, 'Некорректная страница.');
    older = {
      OR: [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ],
    };
  }
  const [rows, total] = await Promise.all([
    prisma.offer.findMany({
      where: { AND: [where, older] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 31,
      select: {
        id: true,
        title: true,
        status: true,
        publishState: true,
        telegramMessageId: true,
        product: {
          select: {
            id: true,
            title: true,
            priceText: true,
            quantityLimit: true,
            reservedQuantity: true,
            images: {
              take: 1,
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
              select: { fileUrl: true },
            },
          },
        },
      },
    }),
    prisma.offer.count({ where }),
  ]);
  return {
    offers: rows.slice(0, 30),
    next: rows.length > 30 ? rows[29]!.id : null,
    total,
  };
}
