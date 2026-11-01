import { Prisma } from '@prisma/client';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { InputError } from '../../lib/input.js';
import { serializable } from '../../lib/transaction.js';

export const FREE_PUBLICATIONS = 3;
export function isBillingExempt(telegramUserId: string) {
  return env.BILLING_EXEMPT_TELEGRAM_IDS.includes(telegramUserId);
}
async function exemptOwner(tx: Prisma.TransactionClient, ownerUserId: string) {
  const user = await tx.user.findUnique({
    where: { id: ownerUserId },
    select: { telegramUserId: true },
  });
  return Boolean(user && isBillingExempt(user.telegramUserId));
}
export const TERMS_VERSION = 'stars-v1';
export const TERMS =
  'Оплата одного размещения в вашем канале. Без подписки и комиссии с заказов. Первые три размещения бесплатно. При подтверждённой неудаче публикации Stars возвращаются. Если результат отправки неизвестен, сначала проверяем пост, чтобы не создать дубль. Оплата без публикации доступна к возврату. Поддержка: @valentin_marapulets, /paysupport. Telegram не обрабатывает обращения по нашим услугам.';

async function freeRemaining(
  tx: Prisma.TransactionClient,
  ownerUserId: string,
) {
  const used = await tx.publicationBill.count({
    where: {
      ownerUserId,
      kind: 'FREE',
      state: { in: ['PUBLISHING', 'CONSUMED', 'UNCERTAIN'] },
    },
  });
  return Math.max(0, FREE_PUBLICATIONS - used);
}

export async function quote(ownerUserId: string, offerId: string) {
  return serializable(async (tx) => {
    const offer = await tx.offer.findUnique({
      where: { id: offerId, ownerUserId },
      include: { billing: true },
    });
    if (!offer) throw new InputError(404, 'Товар не найден.');
    const remaining = await freeRemaining(tx, ownerUserId);
    const exempt = await exemptOwner(tx, ownerUserId);
    return {
      enabled: env.STARS_BILLING_ENABLED && !exempt,
      exempt,
      priceStars: env.PUBLICATION_PRICE_STARS,
      freeRemaining: remaining,
      paid: offer.billing?.state === 'PAID',
      state: offer.billing?.state ?? null,
      published: Boolean(offer.telegramMessageId),
      publishState: offer.publishState,
      terms: TERMS,
      termsVersion: TERMS_VERSION,
    };
  });
}

export async function prepareInvoice(
  ownerUserId: string,
  telegramUserId: string,
  offerId: string,
) {
  if (!env.STARS_BILLING_ENABLED)
    throw new InputError(409, 'Оплата пока отключена.');
  return serializable(async (tx) => {
    const offer = await tx.offer.findUnique({
      where: { id: offerId, ownerUserId },
      include: { billing: true, product: true },
    });
    if (!offer) throw new InputError(404, 'Товар не найден.');
    if (
      offer.publishState !== 'IDLE' ||
      offer.telegramMessageId ||
      offer.status === 'ARCHIVED' ||
      offer.product.status !== 'ACTIVE'
    )
      throw new InputError(
        409,
        'Сначала проверьте состояние публикации в карточке товара.',
      );
    if (offer.billing?.state === 'REFUND_PENDING')
      throw new InputError(
        409,
        'Сначала дождитесь возврата предыдущей оплаты.',
      );
    if (offer.billing?.state === 'PAID') return { paid: true as const };
    if (await exemptOwner(tx, ownerUserId)) return { free: true as const };
    if (await freeRemaining(tx, ownerUserId)) return { free: true as const };
    // Reuse a valid invoice; pre-checkout atomically approves at most one purchase.
    const prior = await tx.starInvoice.findFirst({
      where: {
        offerId,
        ownerUserId,
        state: { in: ['OPEN', 'CHECKOUT'] },
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (prior) return { invoice: prior };
    const invoice = await tx.starInvoice.create({
      data: {
        offerId,
        ownerUserId,
        telegramUserId,
        stars: env.PUBLICATION_PRICE_STARS,
        expiresAt: new Date(Date.now() + 15 * 60000),
      },
    });
    return { invoice };
  });
}

export async function approveCheckout(input: {
  invoiceId: string;
  telegramUserId: string;
  stars: number;
  currency: string;
  queryId: string;
}) {
  if (isBillingExempt(input.telegramUserId))
    throw new InputError(409, 'Для вашего аккаунта оплата не требуется.');
  if (!env.STARS_BILLING_ENABLED)
    throw new InputError(409, 'Оплата временно отключена.');
  return serializable(async (tx) => {
    const invoice = await tx.starInvoice.findUnique({
      where: { id: input.invoiceId },
      include: { offer: { include: { billing: true, product: true } } },
    });
    if (
      !invoice ||
      invoice.telegramUserId !== input.telegramUserId ||
      input.currency !== 'XTR' ||
      input.stars !== invoice.stars
    )
      throw new InputError(400, 'Счёт не соответствует оплате.');
    if (
      invoice.expiresAt < new Date() ||
      !['OPEN', 'CHECKOUT'].includes(invoice.state)
    )
      throw new InputError(409, 'Счёт устарел. Откройте товар заново.');
    if (invoice.state === 'CHECKOUT' && invoice.precheckoutId !== input.queryId)
      throw new InputError(409, 'Этот счёт уже оплачивается.');
    if (
      invoice.offer.publishState !== 'IDLE' ||
      invoice.offer.status === 'ARCHIVED' ||
      invoice.offer.product.status !== 'ACTIVE' ||
      invoice.offer.telegramMessageId ||
      ['PAID', 'REFUND_PENDING'].includes(invoice.offer.billing?.state ?? '')
    )
      throw new InputError(409, 'Оплата этого размещения сейчас не требуется.');
    if (await freeRemaining(tx, invoice.ownerUserId))
      throw new InputError(
        409,
        'Доступна бесплатная публикация. Нажмите «Опубликовать» снова.',
      );
    await tx.starInvoice.update({
      where: { id: invoice.id },
      data: { state: 'CHECKOUT', precheckoutId: input.queryId },
    });
    return { ok: true };
  });
}

export async function recordPayment(input: {
  invoiceId: string;
  telegramUserId: string;
  stars: number;
  currency: string;
  chargeId: string;
}) {
  return serializable(async (tx) => {
    const previous = await tx.starPayment.findUnique({
      where: { chargeId: input.chargeId },
    });
    if (previous) {
      if (
        previous.invoiceId !== input.invoiceId ||
        previous.telegramUserId !== input.telegramUserId ||
        previous.stars !== input.stars ||
        input.currency !== 'XTR'
      )
        throw new InputError(409, 'Несовпадение платёжного события.');
      return { state: previous.state };
    }
    const invoice = await tx.starInvoice.findUnique({
      where: { id: input.invoiceId },
      include: { offer: { include: { billing: true, product: true } } },
    });
    if (!invoice || input.currency !== 'XTR')
      throw new InputError(
        400,
        'Неизвестный счёт. Требуется проверка поддержки.',
      );
    const usable =
      !(await exemptOwner(tx, invoice.ownerUserId)) &&
      invoice.telegramUserId === input.telegramUserId &&
      invoice.stars === input.stars &&
      invoice.state === 'CHECKOUT' &&
      invoice.offer.publishState === 'IDLE' &&
      !invoice.offer.telegramMessageId &&
      invoice.offer.status !== 'ARCHIVED' &&
      invoice.offer.product.status === 'ACTIVE' &&
      !['PAID', 'REFUND_PENDING'].includes(invoice.offer.billing?.state ?? '');
    const state = usable ? 'PAID' : 'REFUND_PENDING';
    await tx.starPayment.create({
      data: {
        chargeId: input.chargeId,
        invoiceId: invoice.id,
        offerId: invoice.offerId,
        ownerUserId: invoice.ownerUserId,
        telegramUserId: input.telegramUserId,
        stars: input.stars,
        state,
        reason: usable
          ? null
          : 'Оплата не может быть использована для этого размещения',
      },
    });
    if (usable) {
      await tx.publicationBill.upsert({
        where: { offerId: invoice.offerId },
        create: {
          offerId: invoice.offerId,
          ownerUserId: invoice.ownerUserId,
          kind: 'PAID',
          state: 'PAID',
          paymentId: input.chargeId,
        },
        update: { kind: 'PAID', state: 'PAID', paymentId: input.chargeId },
      });
      await tx.starInvoice.updateMany({
        where: {
          offerId: invoice.offerId,
          state: { in: ['OPEN', 'CHECKOUT'] },
        },
        data: { state: 'CLOSED' },
      });
      await tx.starInvoice.update({
        where: { id: invoice.id },
        data: { state: 'PAID' },
      });
    }
    return { state };
  });
}

// Payment gate and claim share one transaction: parallel posts cannot spend the
// same free slot or publish against a payment being refunded.
export async function claimPublication(ownerUserId: string, offerId: string) {
  return serializable(async (tx) => {
    const offer = await tx.offer.findUnique({
      where: { id: offerId, ownerUserId },
      include: { billing: true, product: true },
    });
    if (
      !offer ||
      offer.publishState !== 'IDLE' ||
      offer.telegramMessageId ||
      offer.status === 'ARCHIVED' ||
      offer.product.status !== 'ACTIVE'
    )
      throw new InputError(409, 'Публикация недоступна или уже выполняется.');
    if (env.STARS_BILLING_ENABLED) {
      if (offer.billing?.state === 'REFUND_PENDING')
        throw new InputError(409, 'Ожидается возврат оплаты.');
      if (offer.billing?.state === 'PAID') {
        const payment = await tx.starPayment.findUnique({
          where: { chargeId: offer.billing.paymentId! },
        });
        if (payment?.state !== 'PAID')
          throw new InputError(409, 'Проверьте состояние оплаты.');
        await tx.publicationBill.update({
          where: { offerId },
          data: { state: 'PUBLISHING' },
        });
      } else if (await exemptOwner(tx, ownerUserId)) {
        await tx.publicationBill.upsert({
          where: { offerId },
          create: { offerId, ownerUserId, kind: 'EXEMPT', state: 'PUBLISHING' },
          update: { kind: 'EXEMPT', state: 'PUBLISHING', paymentId: null },
        });
      } else {
        if (!(await freeRemaining(tx, ownerUserId)))
          throw new InputError(
            402,
            'Бесплатные размещения закончились. Оплатите одну публикацию.',
          );
        await tx.publicationBill.upsert({
          where: { offerId },
          create: { offerId, ownerUserId, kind: 'FREE', state: 'PUBLISHING' },
          update: { kind: 'FREE', state: 'PUBLISHING', paymentId: null },
        });
      }
    }
    await tx.offer.update({
      where: { id: offerId },
      data: { publishState: 'SENDING' },
    });
  });
}

export async function finishPublication(
  offerId: string,
  outcome: 'SENT' | 'REJECTED' | 'UNCERTAIN',
  message?: { messageId: string; channelId: string },
) {
  return serializable(async (tx) => {
    const bill = await tx.publicationBill.findUnique({ where: { offerId } });
    if (outcome === 'SENT' && message) {
      const offer = await tx.offer.update({
        where: { id: offerId },
        data: {
          status: 'ACTIVE',
          publishState: 'SENT',
          telegramMessageId: message.messageId,
          channelId: message.channelId,
          publishedAt: new Date(),
        },
      });
      if (bill?.state === 'PUBLISHING')
        await tx.publicationBill.update({
          where: { offerId },
          data: { state: 'CONSUMED' },
        });
      return offer;
    }
    await tx.offer.updateMany({
      where: { id: offerId, publishState: 'SENDING' },
      data: { publishState: outcome === 'REJECTED' ? 'IDLE' : 'UNCERTAIN' },
    });
    if (bill?.state === 'PUBLISHING') {
      const state =
        outcome === 'UNCERTAIN'
          ? 'UNCERTAIN'
          : bill.kind !== 'PAID'
            ? 'RELEASED'
            : 'REFUND_PENDING';
      await tx.publicationBill.update({ where: { offerId }, data: { state } });
      if (state === 'REFUND_PENDING' && bill.paymentId)
        await tx.starPayment.update({
          where: { chargeId: bill.paymentId },
          data: {
            state,
            reason: 'Telegram отклонил публикацию',
            refundNextAt: new Date(),
          },
        });
    }
    return null;
  });
}

export async function requestRefund(ownerUserId: string, offerId: string) {
  return serializable(async (tx) => {
    const bill = await tx.publicationBill.findUnique({
      where: { offerId, ownerUserId },
      include: { offer: true },
    });
    if (!bill || bill.kind !== 'PAID')
      throw new InputError(404, 'Оплата не найдена.');
    if (['REFUND_PENDING', 'REFUNDED'].includes(bill.state))
      return { state: bill.state };
    if (
      bill.state !== 'PAID' ||
      bill.offer.publishState !== 'IDLE' ||
      bill.offer.telegramMessageId
    )
      throw new InputError(
        409,
        'Публикация уже отправлена или её результат требует проверки поддержки.',
      );
    await tx.starPayment.update({
      where: { chargeId: bill.paymentId! },
      data: {
        state: 'REFUND_PENDING',
        reason: 'Возврат неиспользованного размещения',
        refundNextAt: new Date(),
      },
    });
    await tx.publicationBill.update({
      where: { offerId },
      data: { state: 'REFUND_PENDING' },
    });
    return { state: 'REFUND_PENDING' };
  });
}

export async function billingHistory(ownerUserId: string) {
  return prisma.starPayment.findMany({
    where: { ownerUserId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      offerId: true,
      stars: true,
      state: true,
      createdAt: true,
      offer: {
        select: {
          title: true,
          publishState: true,
          billing: { select: { state: true } },
        },
      },
    },
  });
}
