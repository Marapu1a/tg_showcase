# Локальная разработка

Нужны Node.js, pnpm и PostgreSQL. Выполнить pnpm install и подготовить .env каждого приложения по .env.example. Секреты не коммитить.

Перед запуском проверить DATABASE_URL в apps/backend/.env: миграции должны применяться к локальной базе разработки.

```sh
pnpm --filter @tg-showcase/backend exec prisma generate
pnpm --filter @tg-showcase/backend exec prisma migrate deploy
```

В отдельных терминалах: pnpm dev:backend, pnpm dev:miniapp, pnpm dev:bot. Интерфейс работает на localhost:5173, API — localhost:3000. Для браузерного просмотра VITE_API_URL=http://localhost:3000 и CORS_ORIGIN=http://localhost:5173.

## Telegram

Приватный API требует Authorization: tma <initData>. Mini App получает данные из Telegram, сервер проверяет подпись и срок действия. TELEGRAM_BOT_TOKEN backend должен принадлежать тому же боту, через который открывается приложение. Токен на frontend не передаётся. Обхода авторизации в dev нет. Публичную карточку и форму покупателя можно открыть в браузере.

1. Запустить два HTTPS-туннеля cloudflared к портам 5173 и 3000, например cloudflared tunnel --url http://localhost:5173 --no-autoupdate.
2. В miniapp задать VITE_API_URL адресом API, VITE_ALLOWED_HOSTS — именем хоста туннеля интерфейса.
3. В backend задать BACKEND_PUBLIC_URL, MINI_APP_PUBLIC_URL и CORS_ORIGIN; в bot — MINI_APP_PUBLIC_URL.
4. Перезапустить приложения и отправить /start боту. Открыть приложение свежей inline-кнопкой.

Временные адреса меняются после перезапуска туннелей. Старые кнопки продолжают вести на старый адрес. Туннели открывают локальный сервис в интернет; остановка процесса делает адрес недоступным.

Подключение канала описано в [CHANNELS.md](CHANNELS.md). Команда /testpost разрешена только ADMIN_TELEGRAM_USER_IDS и действительно отправляет пост в TEST_CHANNEL_ID; по умолчанию доступ закрыт.

## Проверки

```sh
pnpm build
pnpm lint
pnpm --filter @tg-showcase/backend test
```

Для интеграционного теста PostgreSQL в PowerShell установить $env:RUN_DB_TESTS='1' перед тестами. Он создаёт отдельную временную схему, применяет миграции и удаляет её после проверки. Основные данные не меняет; Telegram заменён, сообщения не отправляются. Нужны права CREATE SCHEMA. Без переменной этот тест пропускается. Подробнее и ручной сценарий: [ORDERS.md](ORDERS.md).
