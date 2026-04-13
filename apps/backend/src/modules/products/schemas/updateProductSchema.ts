import { ProductStatus } from '@prisma/client';

export type UpdateProductBody = {
  title?: string;
  description?: string | null;
  priceText?: string;
  checkoutUrl?: string;
  status?: ProductStatus;
  quantityLimit?: number | null;
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

function validateQuantityLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error('quantityLimit must be a positive integer');
  }

  return value;
}

export function parseUpdateProductBody(body: unknown): UpdateProductBody {
  if (!body || typeof body !== 'object') {
    throw new Error('Request body must be an object');
  }

  const payload = body as Record<string, unknown>;
  const data: UpdateProductBody = {};

  if (payload.title !== undefined) {
    if (!isNonEmptyString(payload.title)) {
      throw new Error('title must be a non-empty string');
    }
    data.title = payload.title.trim();
  }

  if (payload.description !== undefined) {
    if (payload.description === null) {
      data.description = null;
    } else if (!isNonEmptyString(payload.description)) {
      throw new Error('description must be a non-empty string or null');
    } else {
      data.description = payload.description.trim();
    }
  }

  if (payload.priceText !== undefined) {
    if (!isNonEmptyString(payload.priceText)) {
      throw new Error('priceText must be a non-empty string');
    }
    data.priceText = payload.priceText.trim();
  }

  if (payload.checkoutUrl !== undefined) {
    if (!isNonEmptyString(payload.checkoutUrl)) {
      throw new Error('checkoutUrl must be a non-empty string');
    }
    data.checkoutUrl = payload.checkoutUrl.trim();
  }

  if (payload.status !== undefined) {
    data.status = validateProductStatus(payload.status);
  }

  if (payload.quantityLimit !== undefined) {
    data.quantityLimit =
      payload.quantityLimit === null
        ? null
        : validateQuantityLimit(payload.quantityLimit);
  }

  if (Object.keys(data).length === 0) {
    throw new Error('At least one updatable field must be provided');
  }

  return data;
}
