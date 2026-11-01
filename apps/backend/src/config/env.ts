import { config } from 'dotenv';

config();

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getNodeEnv(): 'development' | 'production' | 'test' {
  const value = process.env.NODE_ENV;

  if (!value) return 'development';

  if (value !== 'development' && value !== 'production' && value !== 'test') {
    throw new Error(`Invalid NODE_ENV: ${value}`);
  }

  return value;
}

const starsPrice = Number(process.env.PUBLICATION_PRICE_STARS ?? 30);
const ownerIds = (process.env.OWNER_TELEGRAM_IDS ?? '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);
if (ownerIds.some((id) => !/^[1-9]\d*$/.test(id)))
  throw new Error('Invalid OWNER_TELEGRAM_IDS');
const billingExemptIds = (process.env.BILLING_EXEMPT_TELEGRAM_IDS ?? '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);
if (billingExemptIds.some((id) => !/^[1-9]\d*$/.test(id)))
  throw new Error('Invalid BILLING_EXEMPT_TELEGRAM_IDS');
if (!Number.isSafeInteger(starsPrice) || starsPrice < 1 || starsPrice > 10000)
  throw new Error('Invalid PUBLICATION_PRICE_STARS');
export const env = {
  OWNER_TELEGRAM_IDS: ownerIds,
  BILLING_EXEMPT_TELEGRAM_IDS: billingExemptIds,
  STARS_BILLING_ENABLED: process.env.STARS_BILLING_ENABLED === '1',
  PUBLICATION_PRICE_STARS: starsPrice,
  HOST: process.env.HOST ?? '0.0.0.0',
  PORT: Number(process.env.PORT ?? 3000),
  DATABASE_URL: getRequiredEnv('DATABASE_URL'),
  NODE_ENV: getNodeEnv(),
  TELEGRAM_BOT_TOKEN: getOptionalEnv('TELEGRAM_BOT_TOKEN'),
  BACKEND_PUBLIC_URL: getOptionalEnv('BACKEND_PUBLIC_URL'),
  MINI_APP_PUBLIC_URL: getOptionalEnv('MINI_APP_PUBLIC_URL'),
  DEFAULT_PUBLISH_CHANNEL_ID: getOptionalEnv('DEFAULT_PUBLISH_CHANNEL_ID'),
  CORS_ORIGIN: getOptionalEnv('CORS_ORIGIN'),
} as const;
