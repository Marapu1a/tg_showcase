FROM node:22-alpine AS build

WORKDIR /app

COPY . .

RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm --filter @tg-showcase/miniapp build

CMD ["pnpm", "--filter", "@tg-showcase/miniapp", "preview", "--host", "0.0.0.0"]
