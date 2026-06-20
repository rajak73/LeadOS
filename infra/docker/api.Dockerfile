# API process image. The worker image (worker.Dockerfile) is the same build with a
# different entrypoint — one codebase, two processes (FINAL_ARCHITECTURE §1).
FROM node:20-bookworm AS base
RUN corepack enable
WORKDIR /app

# Install workspace deps (cached on lockfile).
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .npmrc ./
COPY packages ./packages
COPY apps/api/package.json ./apps/api/package.json
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile || pnpm install

# Build shared + api.
FROM deps AS build
COPY . .
RUN pnpm --filter @leados/shared build \
 && pnpm --filter @leados/api exec prisma generate --schema=../../prisma/schema.prisma \
 && pnpm --filter @leados/api build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/server.js"]
