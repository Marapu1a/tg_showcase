ALTER TYPE "OrderStatus" ADD VALUE 'RETURNED';
ALTER TABLE "OrderRequest" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "stockReleased" BOOLEAN NOT NULL DEFAULT false;
UPDATE "OrderRequest" SET "stockReleased" = true WHERE "status" = 'CANCELLED';
CREATE TABLE "OrderHistory" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "fromStatus" "OrderStatus" NOT NULL,
  "toStatus" "OrderStatus" NOT NULL,
  "reason" TEXT,
  "stockDelta" INTEGER NOT NULL DEFAULT 0,
  "requestKey" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "OrderRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OrderHistory_requestKey_key" ON "OrderHistory"("requestKey");
CREATE INDEX "OrderHistory_orderId_createdAt_id_idx" ON "OrderHistory"("orderId", "createdAt", "id");
