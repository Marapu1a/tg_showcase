export type CreateProductImageBody = {
  fileUrl: string;
  sortOrder?: number;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseOptionalSortOrder(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error('sortOrder must be a non-negative integer');
  }

  return value;
}

export function parseCreateProductImageBody(body: unknown): CreateProductImageBody {
  if (!body || typeof body !== 'object') {
    throw new Error('Request body must be an object');
  }

  const payload = body as Record<string, unknown>;

  if (!isNonEmptyString(payload.fileUrl)) {
    throw new Error('fileUrl is required');
  }

  return {
    fileUrl: payload.fileUrl.trim(),
    sortOrder: parseOptionalSortOrder(payload.sortOrder),
  };
}
