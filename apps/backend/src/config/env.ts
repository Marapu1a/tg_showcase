import { config } from 'dotenv';

config();

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getNodeEnv(): 'development' | 'production' | 'test' {
  const value = process.env.NODE_ENV;

  if (!value) return 'development';

  if (value !== 'development' && value !== 'production' && value !== 'test') {
    throw new Error(`Invalid NODE_ENV: ${value}`);
  }

  return value;
}

export const env = {
  HOST: process.env.HOST ?? '0.0.0.0',
  PORT: Number(process.env.PORT ?? 3000),
  DATABASE_URL: getRequiredEnv('DATABASE_URL'),
  NODE_ENV: getNodeEnv(),
} as const;
