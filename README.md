# LeadOS

AI-powered Revenue Operating System. Modular-monolith backend (Express + TypeScript) +
Next.js 15 web app, on PostgreSQL (Neon) / Prisma / Redis / BullMQ.

> **Source of truth:** [`docs/planning/FINAL_ARCHITECTURE.md`](docs/planning/FINAL_ARCHITECTURE.md).
> **Current state:** Sprint 1 — Platform Spine (see [`docs/planning/SPRINT_1_EXECUTION_PLAN.md`](docs/planning/SPRINT_1_EXECUTION_PLAN.md)).
> No domain modules, auth, or tenancy logic exist yet — those are Sprints 2–3.

## Layout

```
apps/api        Express modular monolith + worker entrypoint (api.leados.app)
apps/web        Next.js 15 + BFF route handlers (app.leados.app)
packages/shared Zod schemas, PLAN_LIMITS, permission keys, error codes, enums
packages/config Shared ESLint/Prettier presets
packages/tsconfig Shared TypeScript presets
prisma/         Schema + migrations + seeds
infra/          Dockerfiles, local compose, runbooks
```

## Prerequisites

- Node 20 (`nvm use`)
- pnpm 9 (`npm i -g pnpm` or `corepack enable`)
- Docker (for local Postgres + Redis)

## Local bootstrap

```bash
nvm use
pnpm install
cp .env.example apps/api/.env        # fill local values
cp .env.example apps/web/.env.local  # fill NEXT_PUBLIC_* values
docker compose -f infra/docker/docker-compose.dev.yml up -d   # Postgres + Redis
pnpm db:migrate
pnpm dev                              # runs api + worker + web with watch
```

Web on http://localhost:3000 → BFF → API on http://localhost:4000.

## Common scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | run all workspaces in watch mode |
| `pnpm build` | build all workspaces |
| `pnpm lint` | ESLint (incl. module-boundary rules) |
| `pnpm typecheck` | TypeScript strict typecheck |
| `pnpm test` | unit + integration tests |
| `pnpm db:migrate` | apply Prisma migrations |
| `pnpm check:enum-parity` | assert shared enums match Prisma |

## Definition of "spine green" (Sprint 1 / M0)

A request flows browser → web (BFF) → API → Postgres with envelope + structured logging;
a job enqueued by the API is processed by a **separate** worker process; CI is green;
preview deploys work on same-site custom domains.
