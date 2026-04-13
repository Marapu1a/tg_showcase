export type OfferParams = {
  id: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function parseOfferIdParam(params: unknown): OfferParams {
  if (!params || typeof params !== 'object') {
    throw new Error('Params must be an object');
  }

  const payload = params as Record<string, unknown>;

  if (!isNonEmptyString(payload.id)) {
    throw new Error('id is required');
  }

  return {
    id: payload.id.trim(),
  };
}
