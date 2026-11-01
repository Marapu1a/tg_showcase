CREATE TABLE "PublicationBill" (
 "offerId" TEXT NOT NULL PRIMARY KEY REFERENCES "Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "ownerUserId" TEXT NOT NULL, "kind" TEXT NOT NULL, "state" TEXT NOT NULL, "paymentId" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "PublicationBill_paymentId_key" ON "PublicationBill"("paymentId");
CREATE INDEX "PublicationBill_ownerUserId_kind_state_idx" ON "PublicationBill"("ownerUserId","kind","state");
CREATE TABLE "StarInvoice" (
 "id" TEXT NOT NULL PRIMARY KEY, "offerId" TEXT NOT NULL REFERENCES "Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "ownerUserId" TEXT NOT NULL, "telegramUserId" TEXT NOT NULL, "stars" INTEGER NOT NULL,
 "state" TEXT NOT NULL DEFAULT 'OPEN', "precheckoutId" TEXT, "termsVersion" TEXT NOT NULL DEFAULT 'stars-v1', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "StarInvoice_offerId_state_idx" ON "StarInvoice"("offerId","state");
CREATE TABLE "StarPayment" (
 "chargeId" TEXT NOT NULL PRIMARY KEY, "invoiceId" TEXT NOT NULL,
 "offerId" TEXT NOT NULL REFERENCES "Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "ownerUserId" TEXT NOT NULL, "telegramUserId" TEXT NOT NULL, "stars" INTEGER NOT NULL,
 "state" TEXT NOT NULL, "reason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "refundNextAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "refundAttempts" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX "StarPayment_state_refundNextAt_idx" ON "StarPayment"("state","refundNextAt");
CREATE INDEX "StarPayment_ownerUserId_createdAt_idx" ON "StarPayment"("ownerUserId","createdAt");
