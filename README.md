# tg_showcase

Стартовый `pnpm` monorepo-каркас для Telegram-first MVP публикации товарных оферов.

## Структура

```text
apps/
  backend/   Fastify + Prisma
  bot/       Telegraf bot
  miniapp/   React + Vite mini app
infra/
  docker/    Черновые Dockerfile
  nginx/     Базовый конфиг для раздачи miniapp
```

## Быстрый старт

1. Установить зависимости:

   ```bash
   pnpm install
   ```

2. Заполнить `.env` файлы на основе примеров:

   - `apps/backend/.env.example`
   - `apps/bot/.env.example`
   - `apps/miniapp/.env.example`

3. Запустить нужные приложения:

   ```bash
   pnpm dev:backend
   pnpm dev:bot
   pnpm dev:miniapp
   ```

## Что входит в каркас

- `apps/backend`: модульный Fastify backend с маршрутами-заглушками для `products`, `offers`, `offer-events`, `health`, singleton Prisma client и базовым error handling.
- `apps/bot`: минимальный Telegraf bot с `/start`, reply keyboard и базовым bootstrap.
- `apps/miniapp`: Vite + React + `react-router-dom` с тремя страницами-заглушками.
- `infra`: минимальные заготовки для Docker и Nginx без production-ready оркестрации.

## Намеренно не сделано

- бизнес-логика, auth, платежи и интеграции между сервисами
- Prisma migrations
- создание или изменение `prisma/schema.prisma`
- тесты, CI/CD и дополнительная монорепо-обвязка поверх `pnpm workspace`
