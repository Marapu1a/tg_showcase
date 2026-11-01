import { OfferStatus } from '@prisma/client';
import { serializable } from '../../lib/transaction.js';
import { InputError, objectBody } from '../../lib/input.js';

export async function changeListingState(
  ownerUserId: string,
  id: string,
  body: unknown,
) {
  const p = objectBody(body);
  if (
    typeof p.action !== 'string' ||
    !['PAUSE', 'RESUME', 'ARCHIVE', 'RESTORE'].includes(p.action) ||
    !Object.values(OfferStatus).includes(p.expectedStatus as OfferStatus)
  )
    throw new InputError(400, 'Укажите действие и текущий статус товара.');
  return serializable(async (tx) => {
    const offer = await tx.offer.findUnique({
      where: { id, ownerUserId },
      include: { product: true },
    });
    if (!offer) throw new InputError(404, 'Товар не найден.');
    if (['SENDING', 'UNCERTAIN'].includes(offer.publishState))
      throw new InputError(
        409,
        'Сначала проверьте результат публикации в канале.',
      );
    const target: OfferStatus =
      p.action === 'PAUSE'
        ? 'PAUSED'
        : p.action === 'RESUME'
          ? 'ACTIVE'
          : p.action === 'ARCHIVE'
            ? 'ARCHIVED'
            : offer.telegramMessageId
              ? 'PAUSED'
              : 'DRAFT';
    if (offer.status === target) return { id: offer.id, status: offer.status };
    if (offer.status !== p.expectedStatus)
      throw new InputError(409, 'Статус уже изменился. Обновите список.');
    const allowed =
      p.action === 'ARCHIVE' ||
      (p.action === 'PAUSE' && offer.status === 'ACTIVE') ||
      (p.action === 'RESUME' && offer.status === 'PAUSED') ||
      (p.action === 'RESTORE' && offer.status === 'ARCHIVED');
    if (!allowed) throw new InputError(409, 'Это действие сейчас недоступно.');
    if (
      target === 'ACTIVE' &&
      (!offer.telegramMessageId ||
        offer.product.status !== 'ACTIVE' ||
        !offer.product.priceMinor)
    )
      throw new InputError(
        409,
        'Для возобновления нужен опубликованный товар с указанной ценой.',
      );
    return tx.offer.update({
      where: { id, ownerUserId, status: offer.status },
      data: { status: target },
      select: { id: true, status: true },
    });
  });
}
