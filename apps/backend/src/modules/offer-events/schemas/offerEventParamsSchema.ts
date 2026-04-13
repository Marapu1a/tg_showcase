export type OfferEventParams = {
  offerId: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function parseOfferEventParams(params: unknown): OfferEventParams {
  if (!params || typeof params !== 'object') {
    throw new Error('Params must be an object');
  }

  const payload = params as Record<string, unknown>;

  if (!isNonEmptyString(payload.offerId)) {
    throw new Error('offerId is required');
  }

  return {
    offerId: payload.offerId.trim(),
  };
}
