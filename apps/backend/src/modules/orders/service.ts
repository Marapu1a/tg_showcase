import { currencyCode } from '../../lib/currency.js';
import { Prisma, OrderRequest } from '@prisma/client';
import { createHash } from 'node:crypto';
export { changeOrderStatus } from './workflow.js';
import { serializable } from '../../lib/transaction.js';
import {
  InputError,
  objectBody,
  requestKey,
  textField,
} from '../../lib/input.js';
import { TelegramIdentity } from '../../lib/telegramAuth.js';
import { searchableContact } from '../../lib/search.js';

export function parseOrder(body: unknown, identity?: TelegramIdentity) {
  const p = objectBody(body);
  const quantity = p.quantity;
  if (
    typeof quantity !== 'number' ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 99
  )
    throw new InputError(400, 'Количество должно быть от 1 до 99.');
  if (
    typeof p.unitPriceMinor !== 'number' ||
    !Number.isSafeInteger(p.unitPriceMinor) ||
    p.unitPriceMinor < 1
  )
    throw new InputError(400, 'Обновите карточку товара.');
  const contactType = p.contactType;
  if (
    typeof contactType !== 'string' ||
    !['TELEGRAM', 'PHONE', 'OTHER'].includes(contactType)
  )
    throw new InputError(400, 'Выберите способ связи.');
  let contact = textField(p.contact, 'Контакт', 160);
  let contactVerified = false;
  if (contactType === 'TELEGRAM') {
    if (identity?.username) {
      contact = `@${identity.username}`;
      contactVerified = true;
    }
    if (!/^@[A-Za-z][A-Za-z0-9_]{3,31}$/.test(contact))
      throw new InputError(
        400,
        'Укажите Telegram @имя или выберите другой способ связи.',
      );
  }
  if (
    contactType === 'PHONE' &&
    (!/^\+?[0-9 ()-]{7,25}$/.test(contact) ||
      !/^\d{7,15}$/.test(contact.replace(/\D/g, '')))
  )
    throw new InputError(400, 'Проверьте номер телефона.');
  if (contactType === 'PHONE') contact = contact.replace(/[ ()-]/g, '');
  if (contactType === 'TELEGRAM') contact = contact.toLowerCase();
  return {
    requestKey: requestKey(p.requestKey),
    quantity,
    expectedPrice: p.unitPriceMinor,
    expectedCurrency: currencyCode(p.currency),
    contactType: String(contactType),
    contact,
    contactVerified,
    buyerName:
      identity?.firstName ?? (textField(p.buyerName, 'Имя', 80, true) || null),
    buyerTelegramUserId: identity?.telegramUserId ?? null,
    comment: textField(p.comment, 'Комментарий', 500, true) || null,
  };
}

async function receipt(tx: Prisma.TransactionClient, order: OrderRequest) {
  const seller = await tx.user.findUniqueOrThrow({
    where: { id: order.ownerUserId },
    select: { buyerContactUsername: true },
  });
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    productTitle: order.productTitle,
    quantity: order.quantity,
    totalMinor: order.totalMinor,
    currency: order.currency,
    buyerContactUsername: seller.buyerContactUsername,
  };
}

export async function createOrder(
  offerId: string,
  body: unknown,
  identity?: TelegramIdentity,
) {
  const parsed = parseOrder(body, identity);
  const { requestKey: key, expectedPrice, expectedCurrency, ...data } = parsed;
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        offerId,
        ...data,
        expectedPrice,
        ...(expectedCurrency !== 'RUB' ? { expectedCurrency } : {}),
      }),
    )
    .digest('hex');
  return serializable(async (tx) => {
    const previous = await tx.orderRequest.findUnique({
      where: { requestKey: key },
    });
    if (previous) {
      if (previous.requestFingerprint !== fingerprint)
        throw new InputError(
          409,
          'Эта заявка уже отправлена с другими данными. Обновите страницу для нового заказа.',
        );
      return receipt(tx, previous);
    }
    const offer = await tx.offer.findUnique({
      where: { id: offerId },
      include: { product: true },
    });
    if (
      !offer ||
      offer.status !== 'ACTIVE' ||
      offer.product.status !== 'ACTIVE'
    )
      throw new InputError(404, 'Продажа недоступна или уже завершена.');
    const product = offer.product;
    if (!product.priceMinor)
      throw new InputError(
        409,
        'Продавец ещё не указал цену для оформления заявки.',
      );
    if (
      expectedPrice !== product.priceMinor ||
      expectedCurrency !== product.currency
    )
      throw new InputError(
        409,
        'Цена изменилась. Обновите карточку перед отправкой заказа.',
      );
    if (product.priceMinor * data.quantity > 2147483647)
      throw new InputError(
        400,
        'Слишком большая сумма заказа. Уменьшите количество.',
      );
    if (
      product.quantityLimit !== null &&
      product.reservedQuantity + data.quantity > product.quantityLimit
    )
      throw new InputError(
        409,
        'Такого количества уже нет. Обновите карточку товара.',
      );
    const recent = await tx.orderRequest.count({
      where: {
        offerId,
        contact:
          data.contactType === 'PHONE'
            ? {
                in: [
                  data.contact.replace(/^\+/, ''),
                  '+' + data.contact.replace(/^\+/, ''),
                ],
              }
            : { equals: data.contact, mode: 'insensitive' },
        createdAt: { gte: new Date(Date.now() - 600000) },
      },
    });
    if (recent >= 5)
      throw new InputError(
        429,
        'Вы уже отправили несколько заявок. Подождите ответа продавца.',
      );
    await tx.product.update({
      where: { id: product.id },
      data: { reservedQuantity: { increment: data.quantity } },
    });
    const order = await tx.orderRequest.create({
      data: {
        ...data,
        contactSearch: searchableContact(data.contact, data.contactType),
        requestKey: key,
        requestFingerprint: fingerprint,
        offerId,
        ownerUserId: offer.ownerUserId,
        productId: product.id,
        productTitle: product.title,
        currency: product.currency,
        unitPriceMinor: product.priceMinor,
        totalMinor: product.priceMinor * data.quantity,
      },
    });
    return receipt(tx, order);
  });
}
