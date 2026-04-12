import { FastifyReply, FastifyRequest } from 'fastify';

type ProductParams = {
  id: string;
};

function notImplemented(reply: FastifyReply, message: string, extra?: object) {
  return reply.code(501).send({
    message,
    ...extra,
  });
}

export async function createProduct(
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  return notImplemented(reply, 'Create product is not implemented yet');
}

export async function listProducts(
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  return notImplemented(reply, 'List products is not implemented yet');
}

export async function getProduct(
  request: FastifyRequest<{ Params: ProductParams }>,
  reply: FastifyReply,
) {
  return notImplemented(reply, 'Get product is not implemented yet', {
    id: request.params.id,
  });
}

export async function updateProduct(
  request: FastifyRequest<{ Params: ProductParams }>,
  reply: FastifyReply,
) {
  return notImplemented(reply, 'Update product is not implemented yet', {
    id: request.params.id,
  });
}

export async function deleteProduct(
  request: FastifyRequest<{ Params: ProductParams }>,
  reply: FastifyReply,
) {
  return notImplemented(reply, 'Delete product is not implemented yet', {
    id: request.params.id,
  });
}
