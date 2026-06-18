# SPRINT_1_EXECUTION_PLAN.md

> **Sprint 1 — "Platform Spine" (Weeks 1–2)**
> **Owner:** Engineering Manager, LeadOS · **Team:** 3 senior full-stack engineers
> **Inputs:** `ENGINEERING_TASKS.md` (Epic 1 + OBS/SEC/UI Sprint-1 tasks), `REPOSITORY_BOOTSTRAP_PLAN.md` (layout), `FINAL_ARCHITECTURE.md` (source of truth).
> **Phase:** P0. **Exit milestone:** **M0 — Spine green.**
> **Hard rule:** no domain modules, no auth logic, no tenancy logic this sprint. Those are S2 (Auth) and S3 (Tenancy). Sprint 1 builds the skeleton everything else plugs into.
> No application code is produced in this document — only file paths, responsibilities, order, and acceptance.

---

## 1. Goals

1. **Stand up the monorepo and toolchain** so all later work has a consistent, enforced foundation (`INFRA-1.1/1.2/1.3`).
2. **Build the backend platform spine** — Express app + middleware order, error/envelope model, Prisma+Neon, Redis, BullMQ process split, event bus, health (`INFRA-2.1…2.7`).
3. **Prove the async topology end-to-end** — a job enqueued by the API is processed by a *separate* worker process (`INFRA-2.5`).
4. **Wire observability from the first commit** — structured logs, traces, Sentry, metrics (`OBS-1.1/1.2/2.1`).
5. **Lock the cross-cutting guardrails** — security headers/CORS, rate limiting, feature flags/kill-switch, single-flight scheduler (`SEC-1.1/2.1`, `INFRA-4.1`, `INFRA-3.1`).
6. **Seed the shared contract package** — `PLAN_LIMITS`, permission keys, error codes, enums, base Zod schemas (`BILL-4.1`, `packages/shared`).
7. **Establish the frontend shell** — design tokens, App Router shell, providers, Axios interceptors, and a **minimal BFF health proxy** that proves the browser→BFF→API path (`UI-1.1/1.2`).
8. **Make CI/CD real** — lint/typecheck/test/build/audit gates + preview and production deploy pipelines on same-site custom domains (`INFRA-5.1/5.2`).

**Explicitly OUT of scope (later sprints):** user/org/Prisma domain models, auth endpoints, tenant middleware/RLS, RBAC enforcement, any of the 13 domain modules, field encryption (S6), full BFF auth proxy (S2).

---

## 2. Deliverables

| # | Deliverable | Task IDs | Stream |
|---|---|---|---|
| D1 | Monorepo + pnpm/Turborepo + strict TS + lint (incl. **module-boundary rules**) + Prettier + Husky | INFRA-1.1/1.2/1.3 | A |
| D2 | `packages/config` + `packages/tsconfig` shared presets | INFRA-1.2 | A |
| D3 | `packages/shared` seed: enums, error codes, envelope, PLAN_LIMITS, permission keys, events, base Zod | BILL-4.1 | A/C |
| D4 | Backend app assembly + middleware order (+ `express.raw()` carve-out for webhooks) | INFRA-2.1 | A |
| D5 | Error model + response envelope + pagination helpers | INFRA-2.2 | A |
| D6 | Prisma client + Neon wiring + initial migration (extensions only) + transaction-mode pooler validated | INFRA-2.3 | A |
| D7 | Redis client (cache vs queue namespaces) | INFRA-2.4 | A |
| D8 | BullMQ topology: queue defs + worker process + DLQ + **demo job round-trip** | INFRA-2.5 | A |
| D9 | Internal event bus (+ durable-enqueue convention) | INFRA-2.6 | A |
| D10 | Health endpoints `/health`, `/health/deep` | INFRA-2.7 | A |
| D11 | Single-flight scheduler + cron registry (empty registry, mechanism proven) | INFRA-3.1 | A |
| D12 | Feature-flag + kill-switch layer | INFRA-4.1 | A |
| D13 | Observability: logger, OTel, Sentry, metrics (PII-safe, cardinality-safe) | OBS-1.1/1.2/2.1 | A |
| D14 | Security: Helmet/CSP/HSTS + CORS (same-site allow-list) + Redis rate limiters + headers | SEC-1.1/2.1 | A |
| D15 | Frontend: design tokens + Tailwind + Shadcn baseline | UI-1.1 | B |
| D16 | Frontend: App Router shell + providers + Axios interceptors + Socket.io client stub + **BFF health proxy** | UI-1.2 | B |
| D17 | CI pipeline (lint/typecheck/test/build/audit/parity/secret-leak) | INFRA-5.1 | C |
| D18 | Deploy pipelines (Vercel + Railway) on `app.`/`api.leados.app` + Cloudflare + Docker + local compose | INFRA-5.2 | C |

---

## 3. Exact Files to Create

> Paths follow `REPOSITORY_BOOTSTRAP_PLAN.md`. Each entry is **path — responsibility** (no contents). "stub" = wired but a pass-through this sprint, fully implemented in a later sprint.

### 3.1 Repository root
```
package.json                         — root scripts, devDeps, packageManager pin
pnpm-workspace.yaml                  — workspace globs (apps/*, packages/*)
turbo.json                           — task graph + caching (build/lint/test/typecheck)
tsconfig.base.json                   — root TS base referencing packages/tsconfig
.nvmrc                               — Node 20
.editorconfig                        — editor consistency
.gitignore                           — node_modules, .env, build output, coverage
.prettierrc                          — Prettier config (or extends packages/config)
.env.example                         — documented env names (no values) for api + web
README.md                            — local bootstrap + commands (section 8 of bootstrap plan)
CODEOWNERS                           — .github/CODEOWNERS (area → reviewers)
.github/pull_request_template.md     — what/why, test evidence, "docs updated?" checkbox
```

### 3.2 `.github/workflows`
```
.github/workflows/ci.yml             — install→typecheck→lint→test→build→audit→enum-parity→client-secret-leak
.github/workflows/preview.yml        — Vercel preview + ephemeral API preview per PR
.github/workflows/deploy-web.yml     — Vercel prod deploy (app.leados.app) on main
.github/workflows/deploy-api.yml     — build api/worker images→ECR→Railway/ECS rolling deploy (api.leados.app), /health gated
.github/workflows/isolation.yml      — SCAFFOLD (skipped until S3 tenancy) — cross-tenant suite
.github/workflows/migrate-check.yml  — SCAFFOLD (activates when domain migrations land, S2)
.github/workflows/security.yml       — SCAFFOLD (ZAP/secret-scan/SBOM; activates S8)
```

### 3.3 `packages/config` and `packages/tsconfig`
```
packages/config/package.json
packages/config/eslint.preset.*      — base ESLint incl. security plugin + no-restricted-imports BOUNDARY rules
packages/config/prettier.preset.*    — Prettier preset
packages/tsconfig/package.json
packages/tsconfig/base.json          — strict flags (noImplicitAny, noUncheckedIndexedAccess, exactOptional)
packages/tsconfig/node.json          — backend variant
packages/tsconfig/next.json          — web variant
packages/tsconfig/lib.json           — packages/shared variant
```

### 3.4 `packages/shared`
```
packages/shared/package.json
packages/shared/tsconfig.json
packages/shared/src/index.ts                 — public exports
packages/shared/src/constants/enums.ts       — LeadStatus, LeadSource, DealStatus, TaskType/Priority/Status, MessageDirection, … (mirror doc 09)
packages/shared/src/constants/plan-limits.ts — canonical PLAN_LIMITS (monthly + hourly axes) — BILL-4.1
packages/shared/src/constants/permissions.ts — permission keys + role default sets (doc 11)
packages/shared/src/constants/events.ts      — internal/workflow event-name registry
packages/shared/src/errors/error-codes.ts    — error-code registry (doc 10 §10.2)
packages/shared/src/http/envelope.ts         — success/error envelope + pagination types
packages/shared/src/schemas/index.ts         — base Zod (id, pagination, sort, common filters)
packages/shared/src/types/index.ts           — shared inferred types
```

### 3.5 `prisma/`
```
prisma/schema.prisma                 — generator + datasource (Neon) + extensions (uuid-ossp, pgcrypto); NO domain models yet
prisma/migrations/<init>/            — initial migration: enable extensions only
prisma/seed/index.ts                 — seed entrypoint (STUB; real role/plan/template seeds in S3)
```

### 3.6 `infra/`
```
infra/docker/api.Dockerfile          — API process image
infra/docker/worker.Dockerfile       — worker process image (same build, different entrypoint)
infra/docker/docker-compose.dev.yml  — local Postgres + Redis for dev
infra/cloudflare/README.md           — DNS/WAF notes for app.leados.app / api.leados.app
infra/runbooks/.gitkeep              — placeholder (DR/rollback runbooks land S8)
```

### 3.7 `apps/api`
```
apps/api/package.json
apps/api/tsconfig.json
apps/api/eslintrc.*                   — extends packages/config preset (boundary rules ON)
apps/api/src/server.ts                — HTTP process entrypoint
apps/api/src/worker.ts                — worker process entrypoint (consumes queues)
apps/api/src/app.ts                   — express assembly + middleware order + webhook raw-body carve-out

# core/config
apps/api/src/core/config/env.ts       — typed env loader; validates against a Zod schema; fails fast
apps/api/src/core/config/index.ts

# core/errors + http
apps/api/src/core/errors/app-error.ts
apps/api/src/core/errors/error-handler.ts        — global handler; sanitized prod responses
apps/api/src/core/errors/index.ts
apps/api/src/core/http/envelope.ts               — re-exports shared envelope helpers for controllers
apps/api/src/core/http/pagination.ts

# core/middleware
apps/api/src/core/middleware/cors.ts             — same-site allow-list (SEC-1.1)
apps/api/src/core/middleware/security-headers.ts — Helmet/CSP/HSTS (SEC-1.1)
apps/api/src/core/middleware/compression.ts
apps/api/src/core/middleware/rate-limit.ts       — Redis per-user + per-org + auth limiters (SEC-2.1)
apps/api/src/core/middleware/request-logger.ts   — per-request structured log + requestId (OBS-1.1)
apps/api/src/core/middleware/validate.ts         — Zod body/query/param validation
apps/api/src/core/middleware/auth.middleware.ts  — STUB (real in S2)
apps/api/src/core/middleware/tenant.middleware.ts— STUB (real in S3)
apps/api/src/core/middleware/rbac.middleware.ts  — STUB (real in S3)
apps/api/src/core/middleware/index.ts

# core/prisma + redis
apps/api/src/core/prisma/client.ts               — Prisma singleton; pooler/connection config
apps/api/src/core/redis/client.ts                — ioredis singleton; cache vs queue namespaces

# core/queue
apps/api/src/core/queue/queues.ts                — 8 named queue defs + concurrencies (doc 06 §6.5)
apps/api/src/core/queue/worker-registry.ts       — registers consumers into worker.ts
apps/api/src/core/queue/dlq.ts                   — dead-letter handling
apps/api/src/core/queue/jobs/health-echo.ts      — DEMO job to prove API→queue→worker round-trip (M0)
apps/api/src/core/queue/index.ts

# core/events, scheduler, flags
apps/api/src/core/events/event-bus.ts            — emitter + durable-enqueue convention
apps/api/src/core/events/index.ts
apps/api/src/core/scheduler/scheduler.ts         — single-flight repeatable jobs
apps/api/src/core/scheduler/cron-registry.ts     — registry (empty this sprint; mechanism proven)
apps/api/src/core/flags/flags.ts                 — feature flags + kill switch (INFRA-4.1)

# core/observability
apps/api/src/core/observability/logger.ts        — Winston JSON; PII redaction (OBS-1.1)
apps/api/src/core/observability/otel.ts          — OpenTelemetry init (OBS-1.2)
apps/api/src/core/observability/sentry.ts        — Sentry init; beforeSend PII strip (OBS-1.2)
apps/api/src/core/observability/metrics.ts       — system + counters; cardinality guard (OBS-2.1)

# core/health
apps/api/src/core/health/health.controller.ts    — /health, /health/deep (DB+Redis+queue depth)
apps/api/src/core/health/health.routes.ts

# tests
apps/api/tests/helpers/test-harness.ts            — base harness (extended for tenancy in S3) (M7 seed)
apps/api/tests/helpers/external-mocks.ts          — Meta/Stripe/OpenAI/SendGrid mock scaffolding (M7 seed)
apps/api/tests/integration/health.test.ts         — health endpoints
apps/api/tests/integration/queue-roundtrip.test.ts— enqueue → worker processes demo job
apps/api/tests/unit/envelope.test.ts
apps/api/tests/unit/error-handler.test.ts
apps/api/tests/unit/config-env.test.ts
apps/api/tests/unit/event-bus.test.ts
apps/api/tests/unit/flags.test.ts
```

### 3.8 `apps/web`
```
apps/web/package.json
apps/web/tsconfig.json
apps/web/eslintrc.*                    — extends preset; client-secret-leak guard
apps/web/next.config.ts                — CSP, image domains, env exposure rules
apps/web/tailwind.config.ts            — tokens → Tailwind theme
apps/web/postcss.config.*
apps/web/src/styles/tokens.css         — design tokens from doc 17 (color/type/spacing)
apps/web/src/app/layout.tsx            — root layout + providers
apps/web/src/app/globals.css           — imports tokens
apps/web/src/app/(auth)/layout.tsx     — public group shell (placeholder)
apps/web/src/app/(dashboard)/layout.tsx— protected shell + nav (placeholder; guard wired S2)
apps/web/src/app/(dashboard)/page.tsx  — placeholder dashboard page
apps/web/src/app/api/health/route.ts   — BFF health proxy → api.leados.app/health (proves browser→BFF→API)
apps/web/src/components/providers.tsx  — TanStack Query + theme + toast providers
apps/web/src/components/ui/.gitkeep    — Shadcn baseline primitives land here (button/card/input)
apps/web/src/lib/api-client.ts         — Axios instance + interceptors (bearer/401-refresh/403/500 — refresh wired S2)
apps/web/src/lib/query/provider.tsx    — TanStack Query client config
apps/web/src/lib/store/ui-store.ts     — Zustand UI store (sidebar, etc.)
apps/web/src/lib/socket/client.ts      — Socket.io client stub (connect on auth — S2/S6)
apps/web/tests/smoke.test.*            — renders shell; BFF health proxy returns ok
```

---

## 4. Order of Implementation

Three parallel streams after a shared Day-1 foundation. Dependencies are strict where noted; otherwise parallelize.

### Phase 0 — Foundation (Day 1, whole team, must finish before splitting)
1. D1 monorepo + pnpm/Turborepo + root config files.
2. D2 `packages/config` + `packages/tsconfig` (so every workspace lints/types consistently).
3. **D1 boundary lint rules turned ON now** — before any module-shaped code exists (unrecoverable-if-skipped, R-ARCH-1).
4. Empty `apps/api`, `apps/web`, `packages/shared` workspaces wired into Turborepo; `pnpm install` + `pnpm build` green on empty skeleton.

### Phase 1 — Streams split (Days 2–7)
**Stream A — Backend spine (Eng 1, lead):**
1. D3 `packages/shared` seed (enums/error-codes/envelope/PLAN_LIMITS/permissions/events/base Zod) — A and B both depend on it.
2. D5 error model + envelope; D4 `app.ts` middleware order (auth/tenant/rbac as stubs) + webhook raw-body carve-out.
3. D6 Prisma client + Neon + initial migration (extensions) + **validate transaction-mode pooler**.
4. D7 Redis client → D8 queue defs + worker process + demo job + DLQ → prove round-trip locally.
5. D9 event bus; D10 health endpoints (depends on Prisma+Redis+queue for `/health/deep`).
6. D11 scheduler + registry; D12 flags/kill-switch.

**Stream B — Frontend shell (Eng 2):**
1. D15 design tokens + Tailwind + Shadcn baseline.
2. D16 App Router shell + providers + Axios instance + Socket.io stub.
3. BFF health proxy route (depends on D3 + a reachable API `/health` from Stream A).

**Stream C — DevEx/Infra (Eng 3):**
1. D17 CI pipeline (lint/typecheck/test/build/audit + enum-parity + client-secret-leak) — runs against whatever exists, grows with the code.
2. D18 Docker images + local `docker-compose.dev.yml` (Postgres+Redis) so Stream A/B run locally.
3. D18 Vercel + Railway projects, **same-site custom domains** (`app.`/`api.leados.app`), Cloudflare DNS/WAF/TLS, secrets via AWS Secrets Manager; preview + prod deploy pipelines.

### Phase 2 — Cross-cutting hardening (Days 6–9, converge)
1. D13 observability threaded through middleware (logger → request-logger; OTel spans; Sentry; metrics) — Stream A, reviewed by C.
2. D14 security headers/CORS (same-site allow-list) + rate limiters (needs Redis) — Stream A.
3. Wire `apps/web` BFF health proxy to the deployed preview API; confirm browser→BFF→API→Postgres on a real preview URL.

### Phase 3 — Integration & M0 sign-off (Days 9–10, whole team)
1. End-to-end smoke on a preview deploy: browser hits web → BFF → API `/health/deep` (DB+Redis+queue all green).
2. Enqueue the demo job via an internal trigger → confirm the **separate worker process** consumes it (logs + metric).
3. All CI gates green; preview + prod pipelines proven; no secrets in git; boundary rules failing a deliberate violation test.
4. Sprint review + M0 sign-off; retro; backlog grooming for S2 (Auth).

---

## 5. Definition of Done

### 5.1 Per-deliverable DoD (representative)
- **D1/D2:** `pnpm install/build/lint/typecheck` green on the empty skeleton; a deliberate cross-module deep import **fails lint** in CI.
- **D3:** `packages/shared` builds; consumed by both `apps/api` and `apps/web`; **enum-parity check** (shared ↔ prisma) passes; `PLAN_LIMITS` has both monthly and hourly axes.
- **D4/D5:** a request flows through the full middleware order; errors return the standard envelope with a registry code and **no stack trace** in prod mode; webhook routes receive a raw body (verified by a placeholder route reading raw bytes).
- **D6:** Prisma connects to Neon; initial migration applies and **rolls back cleanly**; pooler confirmed in transaction mode; `/health/deep` reports DB latency.
- **D7/D8:** Redis connected with separate cache/queue namespaces; the **demo job is enqueued by the API and processed by a separate worker process** (the defining M0 proof); failed job lands in DLQ after retries.
- **D9:** event bus emits + handles; a side-effect event also enqueues durably.
- **D10:** `/health` 200 shallow; `/health/deep` reports DB+Redis+queue depth with latencies and degrades to 503 on a downed dependency.
- **D11/D12:** scheduler runs a repeatable job exactly once across two worker instances (single-flight proven); a flag flip toggles behavior at runtime; kill-switch path verified.
- **D13:** every request emits a structured log with `requestId` and **no PII**; a thrown error appears in Sentry with PII stripped; metrics scrape exposes system + counter metrics with **no tenant-id labels**.
- **D14:** security headers present (CSP/HSTS/X-Frame DENY/noSniff); CORS rejects a non-allow-listed origin; rate limiter returns 429 with rate-limit headers past threshold.
- **D15/D16:** dark-themed shell renders with tokens; Axios instance attaches headers and handles 403/500 (401-refresh wired in S2); BFF `/api/health` returns the API's health (browser→BFF→API path proven).
- **D17/D18:** CI required checks block merge on failure; PR opens a working **preview deploy**; `main` deploys web to `app.leados.app` and API to `api.leados.app`; `/health` gates the API deploy; **zero secrets committed** (push protection + scan green).

### 5.2 Sprint-level DoD = **M0 "Spine green"**
1. A real request flows **browser → web (BFF) → API → Postgres** and back, with envelope + structured logging + a trace, on a **deployed preview URL**.
2. A job is **enqueued by the API and processed by a separate worker process**, visible in logs + metrics, with DLQ on failure.
3. **CI is green** on all required gates (lint incl. boundary rules, typecheck, unit + integration tests, build, audit, enum-parity, secret-leak).
4. **Preview deploys per PR** and **production deploys from `main`** work on the same-site custom domains; secrets in AWS Secrets Manager, none in git.
5. Observability is live (logs/traces/metrics/Sentry) and **module-boundary lint rules are enforced** (a violation fails CI).
6. No domain/auth/tenancy code shipped (scope discipline upheld).

### 5.3 Standard merge DoD (every PR this sprint)
Conventional-commit title; linked task id; green CI; ≥1 approval (2 for anything touching `core/prisma`, security, or `packages/shared` contracts); squash-merge; docs updated if structure/architecture changed.

---

## 6. Testing Requirements

### 6.1 Unit (≥70% on spine code that carries logic)
- Env/config loader: rejects missing/invalid vars, fails fast.
- Response envelope + pagination helpers: shapes for success/error/paginated.
- Error handler: maps `AppError` → correct status + code; sanitizes in prod; unexpected error → 500 without stack leak.
- Event bus: emit/handle; durable-enqueue convention invoked for side-effect events.
- Feature flags: on/off evaluation; kill-switch path.
- Logger redaction: PII fields never serialized.

### 6.2 Integration (services + real Postgres/Redis via docker-compose in CI)
- `/health` shallow 200; `/health/deep` reports DB+Redis+queue and returns 503 when a dependency is down.
- **Queue round-trip:** API enqueues the demo job → a worker (separate process in the test runner) processes it → assert side effect/log; a forced-failure job lands in the **DLQ** after retry exhaustion.
- Middleware order: a request passes through the full chain; CORS rejects a bad origin; rate limiter returns 429 past threshold with headers.
- Prisma migration applies and rolls back on a shadow DB (`migrate-check` activated minimally for the extensions migration).

### 6.3 Frontend
- Smoke: root shell renders with tokens; placeholder dashboard mounts; providers initialize.
- BFF: `/api/health` route proxies to the API and returns its health payload (browser→BFF→API proven in a test + on preview).

### 6.4 CI gates (must pass to merge)
lint (incl. **boundary rules** — with a deliberate-violation test asserting the rule fails), typecheck, unit, integration, build, `audit` (0 high/critical), **enum-parity (shared↔prisma)**, **client-secret-leak** check.

### 6.5 Not-yet (scoped to later sprints — stated so they aren't expected at M0)
- **Cross-tenant isolation + RLS suite** → S3 (`TEN-3.1`); the test **harness scaffolding** (`tests/helpers/*`) is created this sprint but the suite itself is empty.
- Auth/session integration tests → S2. Load test, Lighthouse, ZAP, backup-restore → S8.

### 6.6 Manual verification at sign-off
On a preview deploy: open the web app → it calls the BFF → BFF calls the API `/health/deep` → all dependencies green; trigger the demo job → observe the separate worker consume it in logs/metrics; confirm a Sentry test error arrives PII-stripped; confirm a deliberate cross-module import fails CI lint.

---

## Appendix — Sprint 1 Risk Watch

| Risk | Mitigation this sprint |
|---|---|
| Boundary rules added late → erosion (R-ARCH-1) | Enabled in Phase 0, Day 1, before any module-shaped code |
| Pooler mode wrong → breaks S3 tenancy (R-TECH-2) | D6 validates **transaction-mode** pooler now, not in S3 |
| Cross-provider/domain config drift (P0-4 precursor) | D18 stands up same-site `app.`/`api.leados.app` now; cross-domain cookie validated in S2 on this foundation |
| Redis treated as "just cache" (R-TECH-1) | Cache vs queue namespaces separated in D7; queue durability proven in D8 |
| Observability retrofitted later | D13 threaded through middleware this sprint, not deferred |
| Scope creep into auth/tenancy | Auth/tenant/rbac middleware shipped as **stubs**; DoD §5.2.6 enforces no domain code |
