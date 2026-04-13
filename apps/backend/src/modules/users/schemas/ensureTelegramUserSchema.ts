export type EnsureTelegramUserBody = {
  telegramUserId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isNonEmptyString(value)) {
    throw new Error(`${field} must be a non-empty string`);
  }

  return value.trim();
}

export function parseEnsureTelegramUserBody(body: unknown): EnsureTelegramUserBody {
  if (!body || typeof body !== 'object') {
    throw new Error('Request body must be an object');
  }

  const payload = body as Record<string, unknown>;

  if (!isNonEmptyString(payload.telegramUserId)) {
    throw new Error('telegramUserId is required');
  }

  return {
    telegramUserId: payload.telegramUserId.trim(),
    username: parseOptionalString(payload.username, 'username'),
    firstName: parseOptionalString(payload.firstName, 'firstName'),
    lastName: parseOptionalString(payload.lastName, 'lastName'),
  };
}
