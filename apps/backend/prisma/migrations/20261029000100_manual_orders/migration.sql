ALTER TABLE "Product" ALTER COLUMN "checkoutUrl" DROP NOT NULL;
ALTER TABLE "Product" ADD COLUMN "priceMinor" INTEGER, ADD COLUMN "reservedQuantity" INTEGER NOT NULL DEFAULT 0;
-- Legacy free-form prices are not guessed. Seller must set a numeric price before accepting requests.
ALTER TABLE "Offer" ADD COLUMN "creationKey" TEXT, ADD COLUMN "creationFingerprint" TEXT;
ALTER TABLE "Offer" ADD COLUMN "publishState" TEXT NOT NULL DEFAULT 'IDLE';
CREATE UNIQUE INDEX "Offer_creationKey_key" ON "Offer"("creationKey");
CREATE TYPE "OrderStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'DONE', 'CANCELLED');
CREATE TABLE "Media" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerUserId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "data" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "OrderRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "number" SERIAL NOT NULL UNIQUE,
  "ownerUserId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "productId" TEXT NOT NULL REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "offerId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL UNIQUE,
  "requestFingerprint" TEXT NOT NULL,
  "productTitle" TEXT NOT NULL,
  "unitPriceMinor" INTEGER NOT NULL,
  "totalMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'RUB',
  "quantity" INTEGER NOT NULL,
  "buyerName" TEXT,
  "buyerTelegramUserId" TEXT,
  "contact" TEXT NOT NULL,
  "contactType" TEXT NOT NULL,
  "contactVerified" BOOLEAN NOT NULL DEFAULT false,
  "comment" TEXT,
  "status" "OrderStatus" NOT NULL DEFAULT 'NEW',
  "notificationState" TEXT NOT NULL DEFAULT 'PENDING',
  "notificationAttempts" INTEGER NOT NULL DEFAULT 0,
  "notificationNextAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notificationSentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrderRequest_positive_quantity" CHECK ("quantity" > 0),
  CONSTRAINT "OrderRequest_positive_price" CHECK ("unitPriceMinor" > 0 AND "totalMinor" > 0)
);
CREATE INDEX "OrderRequest_ownerUserId_status_createdAt_idx" ON "OrderRequest"("ownerUserId", "status", "createdAt");
CREATE INDEX "OrderRequest_notificationState_notificationNextAt_idx" ON "OrderRequest"("notificationState", "notificationNextAt");
ALTER TABLE "Product" ADD CONSTRAINT "Product_nonnegative_reserved" CHECK ("reservedQuantity" >= 0);
