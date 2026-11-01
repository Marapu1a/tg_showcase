# tg_showcase

Бот и мини-приложение для продаж из собственного Telegram-канала: товар → пост → заявка → связь с покупателем → отметка о выполнении. Оплату стороны согласуют вне сервиса.

- [Продукт и принципы](docs/PRODUCT.md)
- [Готовые функции, ограничения и план](docs/MVP.md)
- [Локальная разработка](docs/DEVELOPMENT.md)
- [Подключение канала](docs/CHANNELS.md)
- [Заявки, API и проверки](docs/ORDERS.md)
- [Валидация, безопасность и лимиты](docs/SECURITY.md)
- [Поиск, списки и пауза продаж](docs/SEARCH_AND_CATALOG.md)
- [Обработка заказов, отмена, возврат и история](docs/ORDER_WORKFLOW.md)

## Устройство и запуск

pnpm monorepo: apps/backend — Fastify и Prisma/PostgreSQL; apps/bot — Telegraf; apps/miniapp — React/Vite. infra содержит заготовки Docker/Nginx.

Нужны Node.js, pnpm и PostgreSQL. Выполнить pnpm install, заполнить .env приложений по .env.example, затем применить миграции к локальной БД:

```sh
pnpm --filter @tg-showcase/backend exec prisma generate
pnpm --filter @tg-showcase/backend exec prisma migrate deploy
```

В отдельных терминалах:

```sh
pnpm dev:backend
pnpm dev:bot
pnpm dev:miniapp
```

Интерфейс: http://localhost:5173, API: http://localhost:3000. Для входа продавца нужны Telegram и HTTPS-туннели: [инструкция](docs/DEVELOPMENT.md). Публичная карточка работает и в браузере.

## Проверки

pnpm build, pnpm lint, pnpm --filter @tg-showcase/backend test. Проверка с изолированной схемой PostgreSQL включается через RUN_DB_TESTS=1: [подробности](docs/ORDERS.md).

Это версия для локальной проверки. Платёжных интеграций и биллинга нет. Направление монетизации — оплата за использование, конкретный тариф не выбран.


TG Zoo: [публичный хаб и закрытая админка](docs/TG_ZOO_PLAN.md).
