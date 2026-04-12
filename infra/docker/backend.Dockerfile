FROM node:22-alpine AS base

WORKDIR /app

COPY . .

RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm --filter @tg-showcase/backend build

CMD ["pnpm", "--filter", "@tg-showcase/backend", "start"]
