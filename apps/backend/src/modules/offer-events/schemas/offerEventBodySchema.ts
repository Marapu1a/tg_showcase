export type OfferEventBody = {
  viewerTelegramUserId?: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function parseOfferEventBody(body: unknown): OfferEventBody {
  if (body === undefined || body === null) {
    return {};
  }

  if (typeof body !== 'object') {
    throw new Error('Request body must be an object');
  }

  const payload = body as Record<string, unknown>;

  if (payload.viewerTelegramUserId === undefined) {
    return {};
  }

  if (!isNonEmptyString(payload.viewerTelegramUserId)) {
    throw new Error('viewerTelegramUserId must be a non-empty string');
  }

  return {
    viewerTelegramUserId: payload.viewerTelegramUserId.trim(),
  };
}
