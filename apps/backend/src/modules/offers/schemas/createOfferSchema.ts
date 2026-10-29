import { OfferStatus } from '@prisma/client';

export type CreateOfferBody = {
  productId: string;
  ownerUserId: string;
  title: string;
  text?: string | null;
  status?: OfferStatus;
  channelId?: string | null;
  telegramMessageId?: string | null;
  publishedAt?: Date | null;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateOfferStatus(value: unknown): OfferStatus {
  if (
    value === OfferStatus.DRAFT ||
    value === OfferStatus.ACTIVE ||
    value === OfferStatus.ARCHIVED
  ) {
    return value;
  }

  throw new Error('status must be one of: DRAFT, ACTIVE, ARCHIVED');
}

function parseOptionalNullableString(
  value: unknown,
  field: string,
): string | null {
  if (value === null) {
    return null;
  }

  if (!isNonEmptyString(value)) {
    throw new Error(`${field} must be a non-empty string or null`);
  }

  return value.trim();
}

export function parseCreateOfferBody(body: unknown): CreateOfferBody {
  if (!body || typeof body !== 'object') {
    throw new Error('Request body must be an object');
  }

  const payload = body as Record<string, unknown>;

  if (!isNonEmptyString(payload.productId)) {
    throw new Error('productId is required');
  }

  if (!isNonEmptyString(payload.ownerUserId)) {
    throw new Error('ownerUserId is required');
  }

  if (!isNonEmptyString(payload.title)) {
    throw new Error('title is required');
  }

  const data: CreateOfferBody = {
    productId: payload.productId.trim(),
    ownerUserId: payload.ownerUserId.trim(),
    title: payload.title.trim(),
  };

  if (payload.text !== undefined) {
    data.text = parseOptionalNullableString(payload.text, 'text');
  }

  if (payload.status !== undefined) {
    data.status = validateOfferStatus(payload.status);
  }

  if (
    payload.channelId !== undefined ||
    payload.telegramMessageId !== undefined ||
    payload.publishedAt !== undefined
  ) {
    throw new Error('Канал и данные публикации определяются сервером.');
  }

  return data;
}
