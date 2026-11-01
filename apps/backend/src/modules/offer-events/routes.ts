import { recordOfferClick } from './handlers/recordOfferClick.js';
import { parseOfferEventParams } from './schemas/offerEventParamsSchema.js';
import { FastifyInstance } from 'fastify';

import { redirectBuyClickHandler } from './handlers/redirectBuyClickHandler.js';
import { redirectDetailClickHandler } from './handlers/redirectDetailClickHandler.js';

export async function offerEventsRoutes(app: FastifyInstance) {
  const options = {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  };
  for (const action of ['buy', 'detail'] as const) {
    app.post(`/click/${action}/:offerId`, options, async (request, reply) => {
      const { offerId } = parseOfferEventParams(request.params);
      const result = await recordOfferClick({
        offerId,
        type: action === 'buy' ? 'BUY_CLICK' : 'DETAIL_CLICK',
      });
      return reply.code(result ? 200 : 404).send({ ok: Boolean(result) });
    });
  }
  app.get('/click/buy/:offerId', options, redirectBuyClickHandler);
  app.get('/click/detail/:offerId', options, redirectDetailClickHandler);
}
