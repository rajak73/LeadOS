# Worker process image. Identical build to api.Dockerfile; only the entrypoint differs.
FROM node:20-bookworm AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .npmrc ./
COPY packages ./packages
COPY apps/api/package.json ./apps/api/package.json
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile || pnpm install

FROM deps AS build
COPY . .
RUN pnpm --filter @leados/shared build \
 && pnpm --filter @leados/api exec prisma generate --schema=../../prisma/schema.prisma \
 && pnpm --filter @leados/api build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/api
CMD ["node", "dist/worker.js"]
