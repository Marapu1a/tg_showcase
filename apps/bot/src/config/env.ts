import { config } from 'dotenv';

config();

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export const env = {
  BACKEND_INTERNAL_URL:
    process.env.BACKEND_INTERNAL_URL ?? 'http://127.0.0.1:3000',
  ADMIN_TELEGRAM_USER_IDS: (process.env.ADMIN_TELEGRAM_USER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
  BOT_TOKEN: getRequiredEnv('BOT_TOKEN'),
  MINI_APP_PUBLIC_URL:
    process.env.MINI_APP_PUBLIC_URL ?? 'http://localhost:5173',
  MINI_APP_LAUNCH_VERSION: process.env.MINI_APP_LAUNCH_VERSION,
  TEST_CHANNEL_ID: getRequiredEnv('TEST_CHANNEL_ID'),
} as const;
