import { FastifyReply, FastifyRequest } from 'fastify';

type OfferEventParams = {
  offerId: string;
};

export async function trackBuyClick(
  request: FastifyRequest<{ Params: OfferEventParams }>,
  reply: FastifyReply,
) {
  return reply.code(501).send({
    message: 'BUY click tracking is not implemented yet',
    offerId: request.params.offerId,
  });
}

export async function trackDetailClick(
  request: FastifyRequest<{ Params: OfferEventParams }>,
  reply: FastifyReply,
) {
  return reply.code(501).send({
    message: 'DETAIL click tracking is not implemented yet',
    offerId: request.params.offerId,
  });
}
