import { Prisma, OrderStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import {
  dateRange,
  literalSearch,
  queryText,
  searchableContact,
} from '../../lib/search.js';
import { InputError } from '../../lib/input.js';

export const orderSummary = {
  id: true,
  number: true,
  productId: true,
  productTitle: true,
  quantity: true,
  totalMinor: true,
  currency: true,
  buyerName: true,
  contact: true,
  contactType: true,
  status: true,
  createdAt: true,
} as const;

export async function searchOrders(
  ownerUserId: string,
  query: Record<string, unknown>,
) {
  const q = queryText(query.q, 'Поиск');
  const scope = queryText(query.scope, 'Фильтр', 20) || (q ? 'all' : 'active');
  if (
    ![
      'all',
      'active',
      'overdue',
      'history',
      'NEW',
      'IN_PROGRESS',
      'DONE',
      'CANCELLED',
      'RETURNED',
    ].includes(scope)
  )
    throw new InputError(400, 'Некорректный фильтр.');
  const rawBefore = queryText(query.before, 'Страница', 10);
  const before = rawBefore ? Number(rawBefore) : undefined;
  if (
    before !== undefined &&
    (!/^\d+$/.test(rawBefore) ||
      !Number.isSafeInteger(before) ||
      before < 1 ||
      before > 2147483647)
  )
    throw new InputError(400, 'Некорректная страница.');
  const productId = queryText(query.productId, 'Товар');
  const relatedTo = queryText(query.relatedTo, 'Заказ');
  const where: Prisma.OrderRequestWhereInput = {
    ownerUserId,
    productId: productId || undefined,
    createdAt: dateRange(query.from, query.to),
    status:
      scope === 'all'
        ? undefined
        : scope === 'active'
          ? { in: ['NEW', 'IN_PROGRESS'] }
          : scope === 'history'
            ? { in: ['DONE', 'CANCELLED', 'RETURNED'] }
            : scope === 'overdue'
              ? 'NEW'
              : (scope as OrderStatus),
  };
  const clauses: Prisma.OrderRequestWhereInput[] = [];
  if (scope === 'overdue')
    clauses.push({ createdAt: { lt: new Date(Date.now() - 86400000) } });
  if (q) {
    const number = Number(q.replace(/^#/, ''));
    const contactQuery = /^[+\d ()-]+$/.test(q)
      ? searchableContact(q, 'PHONE') || q
      : q.replace(/^@/, '') || q;
    clauses.push({
      OR: [
        { buyerName: { contains: literalSearch(q), mode: 'insensitive' } },
        { productTitle: { contains: literalSearch(q), mode: 'insensitive' } },
        {
          contactSearch: {
            contains: literalSearch(contactQuery),
            mode: 'insensitive',
          },
        },
        // Fallback for legacy contacts; their displayed value remains unchanged.
        { contact: { contains: literalSearch(q), mode: 'insensitive' } },
        ...(/^#?\d+$/.test(q) && number > 0 && number <= 2147483647
          ? [{ number }]
          : []),
      ],
    });
  }
  if (relatedTo) {
    const source = await prisma.orderRequest.findUnique({
      where: { id: relatedTo, ownerUserId },
      select: { contact: true, contactSearch: true, contactType: true },
    });
    if (!source) throw new InputError(404, 'Заказ не найден.');
    clauses.push({
      contactType: source.contactType,
      OR: [
        {
          contactSearch:
            source.contactSearch ||
            searchableContact(source.contact, source.contactType),
        },
        { contact: { equals: source.contact, mode: 'insensitive' } },
      ],
    });
  }
  if (clauses.length) where.AND = clauses;
  const [rows, total, counts] = await Promise.all([
    prisma.orderRequest.findMany({
      where: { ...where, number: before ? { lt: before } : undefined },
      orderBy: { number: 'desc' },
      take: 31,
      select: orderSummary,
    }),
    prisma.orderRequest.count({ where }),
    prisma.orderRequest.groupBy({
      by: ['status'],
      where: { ownerUserId },
      _count: true,
    }),
  ]);
  return {
    orders: rows.slice(0, 30),
    next: rows.length > 30 ? rows[29]!.number : null,
    total,
    counts: Object.fromEntries(counts.map((row) => [row.status, row._count])),
  };
}
