import { createRequire } from 'node:module';

import { env } from '../config/env.js';

type PrismaClientLike = {
  $disconnect(): Promise<void>;
};

class PrismaClientStub implements PrismaClientLike {
  async $disconnect() {
    return Promise.resolve();
  }
}

const require = createRequire(import.meta.url);

function createPrismaClient(): PrismaClientLike {
  try {
    const { PrismaClient } = require('@prisma/client') as {
      PrismaClient: new (options?: { datasourceUrl?: string }) => PrismaClientLike;
    };

    return new PrismaClient({
      datasourceUrl: env.DATABASE_URL,
    });
  } catch {
    return new PrismaClientStub();
  }
}

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClientLike;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
