CREATE TABLE "StockAddition" (
 "id" TEXT NOT NULL PRIMARY KEY, "productId" TEXT NOT NULL, "ownerUserId" TEXT NOT NULL,
 "quantity" INTEGER NOT NULL, "note" TEXT, "requestKey" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "StockAddition_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StockAddition_requestKey_key" ON "StockAddition"("requestKey");
CREATE INDEX "StockAddition_productId_createdAt_idx" ON "StockAddition"("productId", "createdAt");
