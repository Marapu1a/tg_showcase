CREATE TABLE "HubProject" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "telegramUrl" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "visible" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HubProject_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HubProject_slug_key" ON "HubProject"("slug");
CREATE TABLE "OwnerAudit" (
  "id" TEXT NOT NULL,
  "telegramUserId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "details" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OwnerAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OwnerAudit_createdAt_idx" ON "OwnerAudit"("createdAt");
INSERT INTO "HubProject" ("id", "slug", "name", "summary", "description", "telegramUrl", "visible") VALUES (
  'pocketshowcase', 'pocketshowcase', 'PocketShowcase',
  'Товары, посты и заявки покупателей прямо в вашем Telegram-канале.',
  'Добавьте товар, опубликуйте пост и принимайте заявки. Покупатель оставляет контакт, а вы договариваетесь об оплате и доставке напрямую. Заказы и остатки собраны в одном месте. Первые три размещения бесплатны, затем — 30 Stars за размещение. Без подписок и пакетов.',
  'https://t.me/showcase_lite_bot?startapp', true
);
