import { createHmac, timingSafeEqual } from 'node:crypto';

export type TelegramIdentity = {
  telegramUserId: string;
  username?: string;
  firstName: string;
  lastName?: string;
};

export function validateTelegramInitData(
  raw: string,
  token: string,
  now = Math.floor(Date.now() / 1000),
): TelegramIdentity {
  const invalid = () => new Error('Invalid or expired Telegram authorization');
  if (!raw || raw.length > 16384 || !token) throw invalid();
  const params = new URLSearchParams(raw);
  if (new Set(params.keys()).size !== [...params.keys()].length)
    throw invalid();
  const hash = params.get('hash');
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) throw invalid();
  params.delete('hash');
  params.sort();
  const data = [...params].map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const expected = createHmac('sha256', secret).update(data).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) throw invalid();
  const date = Number(params.get('auth_date'));
  if (
    !Number.isSafeInteger(date) ||
    date <= 0 ||
    date > now + 30 ||
    now - date > 3600
  ) {
    throw invalid();
  }
  let user: Record<string, unknown>;
  try {
    user = JSON.parse(params.get('user') ?? 'null');
  } catch {
    throw invalid();
  }
  if (
    !user ||
    !Number.isSafeInteger(user.id) ||
    Number(user.id) <= 0 ||
    typeof user.first_name !== 'string'
  )
    throw invalid();
  return {
    telegramUserId: String(user.id),
    firstName: user.first_name,
    username: typeof user.username === 'string' ? user.username : undefined,
    lastName: typeof user.last_name === 'string' ? user.last_name : undefined,
  };
}
