# REPOSITORY_BOOTSTRAP_PLAN.md

> **Owner:** Engineering Manager, LeadOS
> **Inputs:** `docs/planning/FINAL_ARCHITECTURE.md` (source of truth) + `docs/planning/ENGINEERING_TASKS.md` (WBS, esp. Epic 1 Infrastructure / Sprint 1).
> **Purpose:** the exact repository layout, conventions, and bootstrap decisions so Sprint 1 (`INFRA-1.x`, `INFRA-2.x`, `INFRA-5.x`) can be executed without further architectural debate.
> **Scope:** structure, configuration, and process only. No application code is written here (folder trees, file names, env-var names, and config keys are layout/configuration, not code).

---

## 0. Decisions Locked for Bootstrap

| Topic | Decision | Rationale (per FINAL_ARCHITECTURE) |
|---|---|---|
| Monorepo tool | **pnpm workspaces + Turborepo** | fast, content-hashed task caching across `backend`/`frontend`/`packages/*`; strict, disk-efficient installs. (npm workspaces is the fallback if pnpm is unavailable.) |
| Language | **TypeScript strict everywhere** | NFR 4.7; shared types across FE/BE |
| Module style (backend) | **Modular monolith**, physical module boundaries enforced by lint | `INFRA-1.3`; modules become service seams |
| API process vs workers | **Separate processes, one codebase** | `INFRA-2.5`; workers scale independently |
| Frontend | **Next.js 15 App Router + BFF route handlers** | `AUTH-5.1`; RSC can't read in-memory token |
| Domains | **`app.leados.app` (web) + `api.leados.app` (API)** — one registrable domain | same-site cookie requirement (P0-4) |
| Shared contract source | **`packages/shared`** = Zod schemas (→ OpenAPI), `PLAN_LIMITS`, permission keys, error codes, enums, types | single source; `BILL-4.1`, `M6` |
| Node | **20 LTS** | doc 06 |
| Package manager pin | `packageManager` field + `.nvmrc` | reproducible toolchain |

---

## 1. Monorepo Structure

A single Git repository with **three deployable/publishable workspaces** and shared config at the root.

```
leados/                              # repo root
├── apps/
│   ├── api/                         # Express modular monolith  → deploys to Railway/ECS (api.leados.app)
│   └── web/                         # Next.js 15 + BFF          → deploys to Vercel (app.leados.app)
├── packages/
│   ├── shared/                      # Zod schemas, constants, types, error codes (FE + BE consume)
│   ├── config/                      # shared eslint/tsconfig/prettier presets (internal)
│   └── tsconfig/                    # base tsconfig variants (node, next, lib)
├── prisma/                          # single Prisma schema + migrations (owned by api, kept at root for visibility)
│   ├── schema.prisma
│   ├── migrations/
│   └── seed/                        # role/plan/template seed definitions (data, not app code)
├── docs/                            # blueprint/ + planning/ (this file lives here)
├── infra/                           # IaC, Dockerfiles, deploy manifests, runbooks
│   ├── docker/                      # api.Dockerfile, worker.Dockerfile
│   ├── cloudflare/                  # DNS/WAF notes
│   └── runbooks/                    # DR, rollback, restore (doc 20)
├── .github/
│   ├── workflows/                   # CI/CD pipelines (section 7)
│   ├── CODEOWNERS
│   └── pull_request_template.md
├── .changeset/                      # versioning for packages/shared (optional)
├── turbo.json                       # task graph + caching
├── pnpm-workspace.yaml              # workspace globs: apps/*, packages/*
├── package.json                     # root scripts, devDeps, packageManager pin
├── tsconfig.base.json
├── .nvmrc                           # 20
├── .editorconfig
├── .gitignore
├── .env.example                     # documented, committed (no secrets)
└── README.md
```

> **Note on `apps/api` vs `apps/worker`:** the worker is **not** a separate workspace — it shares `apps/api`'s code (same modules, queues, Prisma). It is a **separate process entrypoint** (`apps/api/src/worker.ts`) deployed as its own container from the same image. This honors "one codebase, separate processes" (`INFRA-2.5`) without duplicating module code.

---

## 2. Folder Structure (top-level responsibilities)

| Path | Owns | Notes |
|---|---|---|
| `apps/api` | the backend monolith + worker entrypoint | the only writer of the database; the only holder of secrets |
| `apps/web` | Next.js app, BFF, UI | never imports `apps/api` internals; talks to API over HTTP (and to packages/shared) |
| `packages/shared` | cross-cutting contracts/constants/types | **no runtime deps on api/web**; pure, tree-shakeable |
| `packages/config` | lint/format/tsconfig presets | consumed by all workspaces for consistency |
| `prisma/` | schema, migrations, seeds | migrations reviewed like code; rollback scripts required (doc 21) |
| `infra/` | Docker, IaC, runbooks | deploy is config-as-code |
| `docs/` | blueprint + planning | source of truth for *what* and *why* |
| `.github/` | CI/CD, ownership, PR process | section 7 + 9 |

**Boundary rules baked into the tree (enforced by lint, `INFRA-1.3`):**
- `apps/web` may import `packages/shared` only — never `apps/api/*`.
- `apps/api` modules may import `packages/shared`, `core/*`, and their own folder — never another module's internals (only its public `index.ts`).
- `packages/shared` imports nothing from `apps/*`.

---

## 3. Backend Module Structure (`apps/api`)

Two layers: **`core/`** (the platform spine, tenant-agnostic) and **`modules/`** (the 13 domain modules). Each module is a self-contained vertical slice exposing a narrow public surface.

```
apps/api/
├── src/
│   ├── server.ts                    # API process entrypoint (HTTP)
│   ├── worker.ts                    # worker process entrypoint (BullMQ consumers)
│   ├── app.ts                       # express app assembly + middleware order
│   │
│   ├── core/                        # PLATFORM SPINE (no tenant/domain logic)
│   │   ├── middleware/              # cors, helmet, compression, rateLimit,
│   │   │                            #   requestLogger, auth, tenant, rbac, validate, errorHandler
│   │   ├── prisma/                  # client singleton; tenant unit-of-work + extension; RLS helpers
│   │   ├── redis/                   # ioredis singleton; cache vs queue namespaces
│   │   ├── queue/                   # queue defs, worker registry, DLQ
│   │   ├── events/                  # event bus (in-process + durable-enqueue convention)
│   │   ├── scheduler/               # single-flight cron registry (INFRA-3.1)
│   │   ├── crypto/                  # AES-256-GCM token encryption (key-versioned)
│   │   ├── http/                    # response envelope, pagination helpers
│   │   ├── errors/                  # AppError, error-code registry, global handler
│   │   ├── config/                  # typed env loader (validates against packages/shared schema)
│   │   ├── observability/           # logger, OpenTelemetry, Sentry, metrics
│   │   ├── flags/                   # feature flags / kill switch (INFRA-4.1)
│   │   └── webhooks/                # raw-body capture + signature verify (Meta/Stripe)
│   │
│   └── modules/                     # DOMAIN MODULES (13) — each a vertical slice
│       ├── auth/
│       ├── org/
│       ├── team/
│       ├── leads/
│       ├── contacts/
│       ├── pipeline/                # (pipelines + deals)
│       ├── inbox/                   # (instagram now; whatsapp in V2; unified-conversation-ready)
│       ├── workflow/
│       │   └── engine/              # triggerEvaluator, conditionEvaluator (grouped boolean), actionExecutor
│       ├── ai/
│       │   ├── scoring/  sentiment/  forecast/  recommendations/  summary/
│       ├── billing/
│       ├── analytics/
│       ├── notifications/
│       └── files/
├── tests/
│   ├── isolation/                   # cross-tenant suite (TEN-3.1) — permanent gate
│   ├── integration/                 # critical journeys
│   └── helpers/                     # tenant-aware harness + external-API mocks (M7)
├── package.json
└── tsconfig.json
```

### 3.1 Canonical module layout (every `modules/<name>/`)
```
modules/leads/
├── leads.routes.ts          # express router (path → middleware → controller)
├── leads.controller.ts      # HTTP in/out only (no business logic)
├── leads.service.ts         # business logic; owns the unit-of-work transaction
├── leads.repository.ts      # ALL Prisma access for this module (no other module touches leads tables)
├── leads.events.ts          # events this module emits/handles
├── leads.dto.ts             # request/response shapes (re-exported from packages/shared Zod)
├── leads.worker.ts          # queue consumers owned by this module (e.g., import, scoring trigger)
├── index.ts                 # PUBLIC SURFACE — the only thing other modules may import
└── leads.test.ts            # unit tests (service-layer, ≥70% per module, doc 21)
```

**Rules:**
- A controller never touches Prisma; only services/repositories do.
- A repository is the **sole** DB accessor for its module's tables. Cross-module data is fetched via the other module's `index.ts` service interface or via events.
- `index.ts` exports only the service interface + DTO types other modules legitimately need — nothing else is importable across module boundaries (lint-enforced).
- Workers live beside their module but are wired into `worker.ts` through the queue registry.

### 3.2 Module → queue ownership (from FINAL_ARCHITECTURE / doc 06 §6.5)
`workflow-execution` → workflow · `ai-scoring` → ai · `webhook-processing` → core/webhooks → routes to inbox/billing · `email-delivery` & `notification-delivery` → notifications · `instagram-send`/`whatsapp-send` → inbox · `data-export` → leads/analytics.

---

## 4. Frontend Structure (`apps/web`)

Next.js 15 App Router with route groups, a **BFF** layer for authenticated server-side data, and a flat component/lib organization.

```
apps/web/
├── src/
│   ├── app/
│   │   ├── (auth)/                  # public: login, register, forgot, reset, verify, org-select
│   │   │   └── layout.tsx
│   │   ├── (dashboard)/             # protected: shell + nav (Zustand)
│   │   │   ├── layout.tsx
│   │   │   ├── leads/  [leadId]/
│   │   │   ├── contacts/  [contactId]/
│   │   │   ├── pipeline/  [pipelineId]/
│   │   │   ├── inbox/  [conversationId]/
│   │   │   ├── workflows/
│   │   │   ├── analytics/
│   │   │   ├── notifications/
│   │   │   └── settings/            # org, team, billing, social, custom-fields
│   │   ├── api/                     # BFF route handlers (server-side session → proxy to api.leados.app)
│   │   │   ├── auth/                # login/refresh/logout: set/read HttpOnly cookie
│   │   │   └── [...proxy]/          # authenticated data proxy for RSC pages
│   │   ├── layout.tsx               # root (providers)
│   │   └── globals.css              # imports design tokens
│   ├── components/
│   │   ├── ui/                      # Shadcn-derived primitives (owned in-repo)
│   │   ├── data-table/  kanban/  inbox/  charts/   # custom complex components (not in Shadcn)
│   │   └── <feature>/               # feature-scoped components
│   ├── lib/
│   │   ├── api-client.ts            # Axios instance + interceptors (bearer, 401-refresh, 403-redirect)
│   │   ├── query/                   # TanStack Query keys, hooks
│   │   ├── store/                   # Zustand UI stores
│   │   ├── socket/                  # Socket.io client (org room, reconnect)
│   │   └── auth/                    # session helpers (server + client)
│   ├── styles/                      # tokens.css (from doc 17), tailwind layers
│   └── hooks/                       # shared React hooks
├── public/
├── next.config.ts                  # CSP, image domains, env exposure
├── tailwind.config.ts              # tokens → Tailwind theme
├── package.json
└── tsconfig.json
```

**Conventions:**
- Push `'use client'` to the smallest leaf (doc 06); layouts stay server components.
- Server-rendered data pages fetch through the **BFF** (`app/api/[...proxy]`), which attaches the session; client components may call the API directly with the in-memory bearer token.
- All API data flows through TanStack Query; Zustand holds only UI state.
- Forms use React Hook Form + the **same Zod schemas** from `packages/shared` used by the backend.

---

## 5. Shared Package Structure (`packages/shared`)

The contract layer. Pure, no runtime deps on apps. **The single source of truth for validation, limits, permissions, and cross-cutting types.**

```
packages/shared/
├── src/
│   ├── schemas/                     # Zod schemas per domain (lead, deal, auth, billing, workflow, …)
│   │   └── index.ts                 # also the source for OpenAPI generation (M6)
│   ├── types/                       # TS types (many inferred from Zod via z.infer)
│   ├── constants/
│   │   ├── plan-limits.ts           # canonical PLAN_LIMITS (monthly + hourly axes) — BILL-4.1
│   │   ├── permissions.ts           # permission keys + role default sets (doc 11)
│   │   ├── enums.ts                 # LeadStatus, LeadSource, DealStatus, … (match Prisma enums)
│   │   └── events.ts                # event-name registry (workflow triggers, internal events)
│   ├── errors/
│   │   └── error-codes.ts           # error-code registry (doc 10 §10.2) shared FE/BE
│   ├── http/
│   │   └── envelope.ts              # success/error envelope + pagination types
│   └── index.ts                     # public exports
├── package.json
└── tsconfig.json
```

**Rules:**
- Enums here are kept in lockstep with `prisma/schema.prisma` (a CI check asserts parity).
- Nothing in `shared` imports from `apps/*`. It is publishable/cacheable independently.
- Changing a shared schema is a contract change → triggers FE + BE rebuilds via Turborepo task graph and requires both reviewers (section 9).

---

## 6. Environment Variables

Loaded through `core/config` (backend) validated against a Zod schema at boot — **the process refuses to start if required vars are missing/invalid**. `.env.example` is committed (names + docs, no values). Production secrets live in **AWS Secrets Manager** (doc 19); only non-secret config is in platform env.

### 6.1 Backend / Worker (`apps/api`)
| Variable | Purpose | Secret? |
|---|---|---|
| `NODE_ENV` | environment | no |
| `PORT` | API listen port | no |
| `APP_WEB_ORIGIN` | `https://app.leados.app` (CORS allow-list, cookie) | no |
| `API_PUBLIC_URL` | `https://api.leados.app` | no |
| `DATABASE_URL` | Neon Postgres (pooled, transaction mode) | **yes** |
| `DATABASE_DIRECT_URL` | direct connection (migrations) | **yes** |
| `DATABASE_REPLICA_URL` | read replica (analytics) | **yes** |
| `REDIS_URL` | Upstash Redis (TLS) | **yes** |
| `JWT_ACCESS_SECRET` | access-token signing (256-bit, rotated 90d) | **yes** |
| `JWT_REFRESH_PEPPER` | refresh-token hashing pepper | **yes** |
| `FIELD_ENCRYPTION_KEY` | AES-256-GCM key for OAuth tokens (hex, key-versioned) | **yes** |
| `FIELD_ENCRYPTION_KEY_VERSION` | active key version | no |
| `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` | Meta app | **secret** |
| `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` | Meta webhook handshake | **yes** |
| `INSTAGRAM_GRAPH_VERSION` | pinned Graph API version (IG-0.2) | no |
| `WHATSAPP_APP_SECRET` / `WHATSAPP_VERIFY_TOKEN` | WhatsApp (V2) | **secret** |
| `OPENAI_API_KEY` | AI layer | **yes** |
| `STRIPE_SECRET_KEY` | Stripe API | **yes** |
| `STRIPE_WEBHOOK_SECRET` | Stripe signature verify | **yes** |
| `STRIPE_PRICE_STARTER_MONTHLY` … `_SCALE_ANNUAL` | price IDs (6) | no |
| `SENDGRID_API_KEY` | email | **yes** |
| `SENDGRID_FROM_DOMAIN` | authenticated sender domain | no |
| `CLOUDINARY_URL` | media storage | **yes** |
| `AWS_S3_BUCKET` / `AWS_REGION` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | document storage | **secret** |
| `SENTRY_DSN` | error tracking | no |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | traces/metrics | no |
| `GIT_SHA` | release tag (set in CI) | no |

### 6.2 Frontend (`apps/web`)
| Variable | Purpose | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.leados.app/api/v1` | client-exposed |
| `NEXT_PUBLIC_WS_URL` | `wss://api.leados.app` | Socket.io |
| `NEXT_PUBLIC_SENTRY_DSN` | frontend Sentry | client-exposed |
| `NEXT_PUBLIC_APP_ENV` | environment label | client-exposed |
| `API_INTERNAL_URL` | server-side BFF target (may bypass public edge) | server-only |
| `SESSION_COOKIE_DOMAIN` | `leados.app` (same-site) | server-only |
| `STRIPE_PUBLISHABLE_KEY` | Checkout client | client-exposed |

> **Rule:** only `NEXT_PUBLIC_*` and `STRIPE_PUBLISHABLE_KEY` reach the browser. The BFF holds everything else server-side. A CI check fails the build if a non-`NEXT_PUBLIC_` secret is referenced in client code.

---

## 7. CI/CD Structure (`.github/workflows`)

Turborepo-aware pipelines using affected-graph + remote cache so only changed workspaces run.

| Workflow | Trigger | Jobs (in order) |
|---|---|---|
| `ci.yml` | every PR + push | install → typecheck → lint (incl. boundary rules) → unit tests → build → **`npm/pnpm audit` (high/critical fails)** → enum-parity check (shared↔prisma) → client-secret-leak check |
| `isolation.yml` | PR touching api/prisma | spin ephemeral Postgres → run **cross-tenant isolation + RLS suite** (`TEN-3.1`) — required to merge |
| `integration.yml` | PR + nightly | Postgres + Redis services → integration tests of critical journeys |
| `migrate-check.yml` | PR touching `prisma/` | apply migration on shadow DB → assert rollback script applies cleanly (doc 21) |
| `security.yml` | staging deploy + weekly | OWASP ZAP on staging, secret scan (trufflehog), SBOM generation |
| `deploy-web.yml` | merge to `main` | Vercel production deploy of `apps/web` (custom domain `app.leados.app`) |
| `deploy-api.yml` | merge to `main` | build `api`/`worker` Docker images → push to ECR → Railway/ECS rolling deploy (`api.leados.app`) with `/health` gating |
| `preview.yml` | every PR | Vercel preview + ephemeral API preview env for end-to-end checks |

**Pipeline gates (must pass to merge):** lint+boundaries, typecheck, unit (≥70%/module), isolation suite, migrate-check, audit. **Deploy gates:** health-deep green, smoke tests (doc 20 §20.6), DNS TTL reduced before risky releases.

**Release:** trunk-based; `main` is always deployable; deploys are continuous to staging, promoted to prod during the low-traffic window for risky changes (doc 20). `GIT_SHA` stamps Sentry releases.

---

## 8. Development Workflow

### 8.1 Local bootstrap (documented in README)
1. `nvm use` (Node 20) → `corepack enable` → `pnpm install` at root.
2. Copy `.env.example` → `.env` per app; fill local values (local Postgres/Redis via `infra/docker/docker-compose.dev.yml`, or a Neon dev branch + Upstash).
3. `pnpm db:migrate` then `pnpm db:seed` (roles, plan limits, workflow templates).
4. `pnpm dev` → Turborepo runs `api` (HTTP), `worker`, and `web` concurrently with `--watch`.
5. Visit `http://localhost:3000` (web) → BFF → `http://localhost:4000` (api). Local cookies use `localhost` (same-site); cross-domain behavior is validated on staging (`AUTH-5.1` / P0-4 gate).

### 8.2 Standard task loop
- Create a branch from `main` (section 9).
- Implement against the relevant `ENGINEERING_TASKS.md` task ID; keep the unit of work small.
- TDD where practical; the isolation suite must stay green for any tenant-touching change.
- `pnpm lint && pnpm typecheck && pnpm test` locally before pushing (mirrors CI).
- Open a PR → preview env spins up → request review → squash-merge on green.

### 8.3 Common scripts (root `package.json`, names only)
`dev`, `build`, `lint`, `typecheck`, `test`, `test:isolation`, `db:migrate`, `db:migrate:create`, `db:seed`, `db:studio`, `openapi:generate`, `format`. Each delegates through Turborepo to the right workspace(s).

### 8.4 Database change workflow
Edit `prisma/schema.prisma` → `db:migrate:create` (named migration) → **author a rollback script** → run `migrate-check` locally → update `docs/blueprint/08`/`09` if the change is structural → PR with migration + rollback reviewed as code (no prod migration without a tested rollback, doc 21).

---

## 9. Git Strategy

- **Model:** trunk-based development. `main` is protected and always deployable.
- **Branches:** short-lived, prefixed by type + task id:
  `feat/CRM-1.2-lead-list`, `fix/IG-2.2-mid-dedup`, `chore/INFRA-5.1-ci`, `refactor/…`, `docs/…`.
- **Commits:** **Conventional Commits** (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`, `perf:`, `build:`) — drives changelogs and signals scope. Reference the task id in the body.
- **PRs:**
  - Small and single-purpose; linked to a task id; template requires *what/why*, test evidence, and a "blueprint/docs updated?" checkbox.
  - **CODEOWNERS** auto-requests reviewers per area (e.g., `core/prisma` + `modules/*` tenant changes require a security-aware reviewer; `packages/shared` changes require both an FE and a BE reviewer because they're contract changes).
  - Required green checks: CI, isolation (if api/prisma touched), migrate-check (if prisma touched).
  - **Squash-merge** only → linear history; PR title becomes the conventional commit.
- **Protections on `main`:** no direct pushes; ≥1 approval (2 for tenancy/auth/billing/security-touching changes); up-to-date branch; signed commits encouraged; secret-scanning push protection on.
- **Releases:** continuous; tag on prod promotion; `packages/shared` versioned via Changesets when its contract changes.
- **Hotfix:** `fix/*` branch → fast-tracked review → squash to `main` → expedited deploy → backfill tests.

---

## 10. Coding Standards

### 10.1 Language & types
- TypeScript **strict** (no implicit `any`, `noUncheckedIndexedAccess`, exact optional). Types preferred at boundaries; infer from Zod where possible.
- No `any` in committed code (lint error); use `unknown` + narrowing.
- Dates ISO 8601; money as integer minor units or `Decimal` (never floats) — currency-aware (DB-5).

### 10.2 Architecture/layering (lint-enforced)
- **Controller → Service → Repository** only; controllers do no business logic; repositories are the sole DB accessors for their module.
- **No cross-module internal imports** — only a module's `index.ts`. **No cross-module DB access.** (`INFRA-1.3`, R-ARCH-1.)
- All tenant-scoped DB work runs inside a **unit-of-work transaction** that sets the tenant GUC; **no network calls inside a DB transaction** (lint/review rule, P0-3).
- Every request boundary validates with a **shared Zod schema**; every protected route declares `requirePermission`; every create-path calls `enforceLimit`.
- Webhooks: verify signature over raw body → persist → 200 → process async; idempotent by design.
- AI/workflow/outbound-send work is **always queued**, never inline.

### 10.3 Naming & files
- Files: `kebab-case` (`leads.service.ts`); types/classes `PascalCase`; vars/functions `camelCase`; constants `SCREAMING_SNAKE`; DB columns `camelCase` (Prisma) mapping to snake_case where doc 08 specifies.
- One module owns one bounded concept; the public `index.ts` is the contract.
- Event names from `packages/shared/constants/events.ts` only (no string literals).

### 10.4 Errors, logging, security
- Throw `AppError` with a registry code; never leak stack traces in responses (`INFRA-2.2`).
- Structured JSON logs; **never log** passwords/tokens/full message bodies/PII (doc 18 §18.2); tenant id goes in logs/traces, **not** metric labels (I8).
- Secrets only via `core/config`/env; never hardcoded; `no-eval`/`no-new-func` enforced.

### 10.5 Testing
- Unit tests per module (service layer) **≥70%** to merge, **80% services target** (NFR 4.7).
- The **cross-tenant isolation suite** is mandatory and runs in CI for any api/prisma change.
- Integration tests for critical journeys (signup→verify→login; DM→scored lead→reply; deal won; checkout).
- External APIs (Meta/Stripe/OpenAI/SendGrid) accessed through adapters and **mocked** in tests (M7).

### 10.6 Documentation & contracts
- OpenAPI is **generated from Zod** (`openapi:generate`) — never hand-edited (M6); an API change without a regenerated spec fails CI.
- Structural DB/schema changes update `docs/blueprint/08`/`09`; architectural changes update `docs/planning/FINAL_ARCHITECTURE.md` (source of truth) in the same PR.
- Code reads like its neighbors: match surrounding comment density, naming, and idiom.

---

## Appendix — Sprint 1 Bootstrap Order (maps to ENGINEERING_TASKS Epic 1)

1. `INFRA-1.1/1.2/1.3` — monorepo, strict TS, lint + **boundary rules** (do boundaries first; they're unrecoverable later).
2. `INFRA-5.1/5.2` — CI + deploy pipelines + **same-site custom domains**.
3. `INFRA-2.1…2.7` — Express app, error/envelope, Prisma+Neon, Redis, BullMQ split, event bus, health.
4. `OBS-1.1/1.2`, `OBS-2.1` — logging/tracing/metrics from the first commit.
5. `SEC-1.1/2.1`, `INFRA-4.1`, `INFRA-3.1` — headers/CORS, rate limits, flags/kill-switch, scheduler.
6. `UI-1.1/1.2` — design tokens + app shell + Axios interceptors (parallel stream).
7. `packages/shared` seed: `PLAN_LIMITS`, permission keys, error codes, enums, base Zod schemas (`BILL-4.1`).

Exit = **M0 (spine green)**: request flows browser→BFF→API→Postgres with envelope+logging; a job enqueues and a separate worker processes it; CI green; preview deploys live. Only then do tenancy (Sprint 2–3) and domain modules begin.
