import { ProductStatus } from '@prisma/client';

export type CreateProductBody = {
  ownerUserId: string;
  title: string;
  description?: string;
  priceText: string;
  checkoutUrl: string;
  status?: ProductStatus;
  quantityLimit?: number | null;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function parseCreateProductBody(body: unknown): CreateProductBody {
  if (!body || typeof body !== 'object') {
    throw new Error('Request body must be an object');
  }

  const payload = body as Record<string, unknown>;

  if (!isNonEmptyString(payload.ownerUserId)) {
    throw new Error('ownerUserId is required');
  }

  if (!isNonEmptyString(payload.title)) {
    throw new Error('title is required');
  }

  if (!isNonEmptyString(payload.priceText)) {
    throw new Error('priceText is required');
  }

  if (!isNonEmptyString(payload.checkoutUrl)) {
    throw new Error('checkoutUrl is required');
  }

  const description =
    typeof payload.description === 'string' ? payload.description.trim() : undefined;

  const status =
    payload.status === undefined
      ? ProductStatus.ACTIVE
      : validateProductStatus(payload.status);

  const quantityLimit =
    payload.quantityLimit === undefined || payload.quantityLimit === null
      ? null
      : validateQuantityLimit(payload.quantityLimit);

  return {
    ownerUserId: payload.ownerUserId.trim(),
    title: payload.title.trim(),
    description,
    priceText: payload.priceText.trim(),
    checkoutUrl: payload.checkoutUrl.trim(),
    status,
    quantityLimit,
  };
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

function validateQuantityLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error('quantityLimit must be a positive integer');
  }

  return value;
}
