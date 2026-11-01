import { createHash } from 'node:crypto';
import { OrderStatus } from '@prisma/client';
import {
  InputError,
  objectBody,
  requestKey,
  textField,
} from '../../lib/input.js';
import { serializable } from '../../lib/transaction.js';

export async function changeOrderStatus(
  ownerUserId: string,
  id: string,
  body: unknown,
) {
  const p = objectBody(body);
  if (
    !Object.values(OrderStatus).includes(p.status as OrderStatus) ||
    !Object.values(OrderStatus).includes(p.expectedStatus as OrderStatus)
  )
    throw new InputError(400, 'Некорректный статус заказа.');
  if (
    typeof p.expectedVersion !== 'number' ||
    !Number.isSafeInteger(p.expectedVersion) ||
    p.expectedVersion < 0 ||
    p.expectedVersion > 2147483647
  )
    throw new InputError(400, 'Обновите карточку заказа.');
  const key = requestKey(p.requestKey);
  const reason = textField(p.reason, 'Причина', 500, true) || null;
  const status = p.status as OrderStatus,
    expectedStatus = p.expectedStatus as OrderStatus;
  const needsReason =
    status === 'CANCELLED' ||
    status === 'RETURNED' ||
    ['DONE', 'CANCELLED', 'RETURNED'].includes(expectedStatus) ||
    status === 'NEW';
  if (needsReason && !reason)
    throw new InputError(
      400,
      'Укажите причину изменения — она сохранится в истории.',
    );
  if (status === 'RETURNED' && typeof p.restock !== 'boolean')
    throw new InputError(
      400,
      'Укажите, возвращать ли товар в доступный остаток.',
    );
  if (status !== 'RETURNED' && p.restock !== undefined)
    throw new InputError(
      400,
      'Решение об остатке указывается только для возврата товара.',
    );
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        ownerUserId,
        id,
        status,
        expectedStatus,
        expectedVersion: p.expectedVersion,
        reason,
        restock: p.restock ?? null,
      }),
    )
    .digest('hex');
  return serializable(async (tx) => {
    const previous = await tx.orderHistory.findUnique({
      where: { requestKey: key },
    });
    if (previous) {
      if (
        previous.actorUserId !== ownerUserId ||
        previous.orderId !== id ||
        previous.fingerprint !== fingerprint
      )
        throw new InputError(
          409,
          'Это действие уже отправлено с другими данными.',
        );
      const current = await tx.orderRequest.findUnique({
        where: { id, ownerUserId },
        select: { id: true, status: true, version: true },
      });
      if (!current) throw new InputError(404, 'Заказ не найден.');
      return current;
    }
    const order = await tx.orderRequest.findUnique({
      where: { id, ownerUserId },
      include: { product: true },
    });
    if (!order) throw new InputError(404, 'Заказ не найден.');
    if (order.status !== expectedStatus || order.version !== p.expectedVersion)
      throw new InputError(409, 'Заказ уже изменился. Обновите карточку.');
    const allowed: Record<OrderStatus, OrderStatus[]> = {
      NEW: ['IN_PROGRESS', 'CANCELLED'],
      IN_PROGRESS: ['NEW', 'DONE', 'CANCELLED'],
      DONE: ['IN_PROGRESS', 'RETURNED'],
      CANCELLED: ['IN_PROGRESS'],
      RETURNED: ['DONE'],
    };
    if (!allowed[order.status].includes(status))
      throw new InputError(
        409,
        'Этот переход недоступен. Сначала возьмите заказ в работу.',
      );
    const released =
      status === 'CANCELLED' || (status === 'RETURNED' && p.restock === true);
    // Positive delta reserves stock, negative delta returns it to availability.
    const delta =
      order.stockReleased === released
        ? 0
        : released
          ? -order.quantity
          : order.quantity;
    if (
      delta > 0 &&
      order.product.quantityLimit !== null &&
      order.product.reservedQuantity + delta > order.product.quantityLimit
    )
      throw new InputError(
        409,
        'Не хватает свободного остатка для восстановления заказа.',
      );
    if (delta < 0 && order.product.reservedQuantity + delta < 0)
      throw new InputError(
        409,
        'Остаток требует проверки. Обратитесь в поддержку.',
      );
    if (delta)
      await tx.product.update({
        where: { id: order.productId },
        data: { reservedQuantity: { increment: delta } },
      });
    const updated = await tx.orderRequest.update({
      where: { id, ownerUserId, version: order.version, status: order.status },
      data: { status, stockReleased: released, version: { increment: 1 } },
      select: { id: true, status: true, version: true },
    });
    await tx.orderHistory.create({
      data: {
        orderId: id,
        actorUserId: ownerUserId,
        fromStatus: order.status,
        toStatus: status,
        reason,
        stockDelta: delta,
        requestKey: key,
        fingerprint,
      },
    });
    return updated;
  });
}
