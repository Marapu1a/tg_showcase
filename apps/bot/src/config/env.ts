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
  BOT_TOKEN: getRequiredEnv('BOT_TOKEN'),
  MINI_APP_URL: process.env.MINI_APP_URL ?? 'http://localhost:5173',
} as const;
