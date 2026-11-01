import { serializable } from '../../lib/transaction.js';
import {
  InputError,
  objectBody,
  requestKey,
  textField,
} from '../../lib/input.js';

export async function listingStock(ownerUserId: string, id: string) {
  return serializable(async (tx) => {
    const offer = await tx.offer.findUnique({
      where: { id, ownerUserId },
      include: { product: true },
    });
    if (!offer) throw new InputError(404, 'Товар не найден.');
    const rows = await tx.orderRequest.groupBy({
      by: ['status', 'stockReleased'],
      where: { productId: offer.productId, ownerUserId },
      _sum: { quantity: true },
    });
    let reserved = 0,
      sold = 0,
      withheldReturns = 0,
      returnedToStock = 0;
    for (const row of rows) {
      const n = row._sum.quantity ?? 0;
      if (row.status === 'RETURNED' && row.stockReleased) returnedToStock += n;
      if (row.stockReleased) continue;
      if (row.status === 'NEW' || row.status === 'IN_PROGRESS') reserved += n;
      else if (row.status === 'DONE') sold += n;
      else if (row.status === 'RETURNED') withheldReturns += n;
    }
    const total = offer.product.quantityLimit;
    const additions = await tx.stockAddition.findMany({
      where: { productId: offer.productId, ownerUserId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 10,
      select: { id: true, quantity: true, note: true, createdAt: true },
    });
    return {
      total,
      reserved,
      sold,
      withheldReturns,
      returnedToStock,
      available: total === null ? null : total - offer.product.reservedQuantity,
      discrepancy:
        offer.product.reservedQuantity - reserved - sold - withheldReturns,
      additions,
    };
  });
}

export async function addStock(ownerUserId: string, id: string, body: unknown) {
  const p = objectBody(body);
  const key = requestKey(p.requestKey);
  const quantity = p.quantity;
  if (
    typeof quantity !== 'number' ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > 100000
  )
    throw new InputError(400, 'Добавьте целое количество от 1 до 100 000.');
  const note = textField(p.note, 'Примечание', 300, true) || null;
  return serializable(async (tx) => {
    const offer = await tx.offer.findUnique({
      where: { id, ownerUserId },
      include: { product: true },
    });
    if (!offer) throw new InputError(404, 'Товар не найден.');
    const prior = await tx.stockAddition.findUnique({
      where: { requestKey: key },
    });
    if (prior) {
      if (
        prior.ownerUserId !== ownerUserId ||
        prior.productId !== offer.productId ||
        prior.quantity !== quantity ||
        prior.note !== note
      )
        throw new InputError(
          409,
          'Это пополнение уже отправлено с другими данными.',
        );
      return { id: prior.id, quantity: prior.quantity };
    }
    if (offer.product.quantityLimit === null)
      throw new InputError(
        409,
        'У этого товара количество не ограничено. Пополнение не требуется.',
      );
    if (offer.product.quantityLimit + quantity > 100000)
      throw new InputError(409, 'Общее количество не может превышать 100 000.');
    await tx.product.update({
      where: { id: offer.productId },
      data: { quantityLimit: { increment: quantity } },
    });
    const entry = await tx.stockAddition.create({
      data: {
        productId: offer.productId,
        ownerUserId,
        quantity,
        note,
        requestKey: key,
      },
    });
    return { id: entry.id, quantity };
  });
}
