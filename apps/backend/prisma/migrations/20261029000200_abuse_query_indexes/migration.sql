CREATE INDEX "Media_ownerUserId_idx" ON "Media"("ownerUserId");
CREATE INDEX "OrderRequest_offerId_createdAt_idx" ON "OrderRequest"("offerId", "createdAt");
