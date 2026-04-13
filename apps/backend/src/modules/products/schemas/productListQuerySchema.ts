import { ProductStatus } from '@prisma/client';

export type ProductListQuery = {
  ownerUserId?: string;
  status?: ProductStatus;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateProductStatus(value: unknown): ProductStatus {
  if (
    value === ProductStatus.ACTIVE ||
    value === ProductStatus.HIDDEN ||
    value === ProductStatus.ARCHIVED
  ) {
    return value;
  }

  throw new Error('status must be one of: ACTIVE, HIDDEN, ARCHIVED');
}

export function parseProductListQuery(query: unknown): ProductListQuery {
  if (!query || typeof query !== 'object') {
    return {};
  }

  const payload = query as Record<string, unknown>;
  const filters: ProductListQuery = {};

  if (payload.ownerUserId !== undefined) {
    if (!isNonEmptyString(payload.ownerUserId)) {
      throw new Error('ownerUserId must be a non-empty string');
    }
    filters.ownerUserId = payload.ownerUserId.trim();
  }

  if (payload.status !== undefined) {
    filters.status = validateProductStatus(payload.status);
  }

  return filters;
}
