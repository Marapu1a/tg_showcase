import { FastifyReply, FastifyRequest } from 'fastify';

import { prisma } from '../../../lib/prisma.js';
import { parseProductIdParam } from '../schemas/productParamsSchema.js';
import { parseCreateProductImageBody } from '../schemas/createProductImageSchema.js';

export async function createProductImageHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = parseProductIdParam(request.params);
    const data = parseCreateProductImageBody(request.body);

    const product = await prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!product) {
      return reply.code(404).send({
        message: 'Product not found',
      });
    }

    const image = await prisma.productImage.create({
      data: {
        productId: id,
        fileUrl: data.fileUrl,
        sortOrder: data.sortOrder ?? 0,
      },
    });

    return reply.code(201).send(image);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to create product image';

    return reply.code(400).send({
      message,
    });
  }
}
