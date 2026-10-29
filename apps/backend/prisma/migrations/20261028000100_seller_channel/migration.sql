CREATE TABLE "SellerChannel" (
  "ownerUserId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "username" TEXT,
  "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SellerChannel_pkey" PRIMARY KEY ("ownerUserId")
);
CREATE UNIQUE INDEX "SellerChannel_channelId_key" ON "SellerChannel"("channelId");
ALTER TABLE "SellerChannel" ADD CONSTRAINT "SellerChannel_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
