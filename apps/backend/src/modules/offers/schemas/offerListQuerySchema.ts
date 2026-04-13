import { OfferStatus } from '@prisma/client';

export type OfferListQuery = {
  ownerUserId?: string;
  productId?: string;
  status?: OfferStatus;
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

export function parseOfferListQuery(query: unknown): OfferListQuery {
  if (!query || typeof query !== 'object') {
    return {};
  }

  const payload = query as Record<string, unknown>;
  const filters: OfferListQuery = {};

  if (payload.ownerUserId !== undefined) {
    if (!isNonEmptyString(payload.ownerUserId)) {
      throw new Error('ownerUserId must be a non-empty string');
    }
    filters.ownerUserId = payload.ownerUserId.trim();
  }

  if (payload.productId !== undefined) {
    if (!isNonEmptyString(payload.productId)) {
      throw new Error('productId must be a non-empty string');
    }
    filters.productId = payload.productId.trim();
  }

  if (payload.status !== undefined) {
    filters.status = validateOfferStatus(payload.status);
  }

  return filters;
}
