import { OfferStatus } from '@prisma/client';

export type UpdateOfferBody = {
  title?: string;
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

function parseOptionalNullableString(value: unknown, field: string): string | null {
  if (value === null) {
    return null;
  }

  if (!isNonEmptyString(value)) {
    throw new Error(`${field} must be a non-empty string or null`);
  }

  return value.trim();
}

function parseDateValue(value: unknown, field: string): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error(`${field} must be a valid date`);
    }
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`${field} must be a valid date`);
    }
    return parsed;
  }

  throw new Error(`${field} must be a valid date`);
}

export function parseUpdateOfferBody(body: unknown): UpdateOfferBody {
  if (!body || typeof body !== 'object') {
    throw new Error('Request body must be an object');
  }

  const payload = body as Record<string, unknown>;
  const data: UpdateOfferBody = {};

  if (payload.title !== undefined) {
    if (!isNonEmptyString(payload.title)) {
      throw new Error('title must be a non-empty string');
    }
    data.title = payload.title.trim();
  }

  if (payload.text !== undefined) {
    data.text = parseOptionalNullableString(payload.text, 'text');
  }

  if (payload.status !== undefined) {
    data.status = validateOfferStatus(payload.status);
  }

  if (payload.channelId !== undefined) {
    data.channelId = parseOptionalNullableString(payload.channelId, 'channelId');
  }

  if (payload.telegramMessageId !== undefined) {
    data.telegramMessageId = parseOptionalNullableString(
      payload.telegramMessageId,
      'telegramMessageId',
    );
  }

  if (payload.publishedAt !== undefined) {
    data.publishedAt =
      payload.publishedAt === null
        ? null
        : parseDateValue(payload.publishedAt, 'publishedAt');
  }

  if (Object.keys(data).length === 0) {
    throw new Error('At least one updatable field must be provided');
  }

  return data;
}
