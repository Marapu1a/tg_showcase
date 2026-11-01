ALTER TYPE "OfferStatus" ADD VALUE 'PAUSED';
ALTER TABLE "OrderRequest" ADD COLUMN "contactSearch" TEXT NOT NULL DEFAULT '';
UPDATE "OrderRequest" SET "contactSearch" = CASE
  WHEN "contactType" = 'PHONE' THEN regexp_replace("contact", '[^0-9]', '', 'g')
  ELSE lower(ltrim(trim("contact"), '@')) END;
CREATE INDEX "OrderRequest_ownerUserId_number_idx" ON "OrderRequest"("ownerUserId", "number");
CREATE INDEX "Offer_ownerUserId_createdAt_id_idx" ON "Offer"("ownerUserId", "createdAt", "id");
