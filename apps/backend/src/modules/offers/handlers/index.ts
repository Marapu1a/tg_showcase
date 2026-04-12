import { FastifyReply, FastifyRequest } from 'fastify';

type OfferParams = {
  id: string;
};

function notImplemented(reply: FastifyReply, message: string, extra?: object) {
  return reply.code(501).send({
    message,
    ...extra,
  });
}

export async function createOffer(_request: FastifyRequest, reply: FastifyReply) {
  return notImplemented(reply, 'Create offer is not implemented yet');
}

export async function listOffers(_request: FastifyRequest, reply: FastifyReply) {
  return notImplemented(reply, 'List offers is not implemented yet');
}

export async function getOffer(
  request: FastifyRequest<{ Params: OfferParams }>,
  reply: FastifyReply,
) {
  return notImplemented(reply, 'Get offer is not implemented yet', {
    id: request.params.id,
  });
}

export async function updateOffer(
  request: FastifyRequest<{ Params: OfferParams }>,
  reply: FastifyReply,
) {
  return notImplemented(reply, 'Update offer is not implemented yet', {
    id: request.params.id,
  });
}

export async function deleteOffer(
  request: FastifyRequest<{ Params: OfferParams }>,
  reply: FastifyReply,
) {
  return notImplemented(reply, 'Delete offer is not implemented yet', {
    id: request.params.id,
  });
}

export async function publishOffer(
  request: FastifyRequest<{ Params: OfferParams }>,
  reply: FastifyReply,
) {
  return notImplemented(reply, 'Publish offer is not implemented yet', {
    id: request.params.id,
  });
}
