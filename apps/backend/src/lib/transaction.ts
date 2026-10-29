import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { InputError } from './input.js';

export async function serializable<T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: 'Serializable',
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        !['P2034', 'P2002'].includes(error.code)
      )
        throw error;
      if (attempt === 3)
        throw new InputError(409, 'Данные изменились. Повторите действие.');
    }
  }
  throw new Error('Unreachable');
}
