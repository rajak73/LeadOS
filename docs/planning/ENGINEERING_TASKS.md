# ENGINEERING_TASKS.md

> **Owner:** Engineering Manager, LeadOS
> **Source of truth:** `docs/planning/FINAL_ARCHITECTURE.md` (architecture), `IMPLEMENTATION_PLAN.md` (phases), `DEVELOPMENT_ROADMAP.md` (sprints), `MODULE_DEPENDENCY_GRAPH.md` (deps), `docs/blueprint/*` (requirements).
> **Structure:** `Epic └─ Feature └─ Task └─ Subtask`. Every **Task** carries Priority · Effort · Dependencies · Acceptance Criteria · Sprint. Subtasks are checklist items under their task.
> No code is produced here.

## Conventions

- **Priority:** `P0` = required for V1 public launch (launch blocker) · `P1` = before scale / V2 · `P2` = future / V3.
- **Effort:** ideal engineering hours for one senior engineer (excludes the 20% per-sprint tech-debt reserve, doc 21). Ranges rounded; a Task > 24h should be re-split during sprint planning.
- **Sprint map (from DEVELOPMENT_ROADMAP.md):** S1 Spine · S2 Auth · S3 Tenancy/RBAC · S4 CRM Core · S5 Pipeline+Webhook backbone · S6 Instagram · S7 AI+Workflow+Notifications · S8 Billing+Analytics+Hardening → **V1 launch**. S9–18 = V2. S19–36 = V3.
- **Task IDs** are stable references for dependencies (e.g., `TEN-2.1`).
- **Cross-cutting rule:** every tenant-scoped Task implicitly depends on the Tenancy epic (TEN) being green, and every create-path on Plan-Limits (BILL-4). Stated explicitly only where it drives sequencing.

---

# EPIC 1 — Infrastructure (INFRA)
*Goal: a production-shaped skeleton everything plugs into. Phase P0. Mostly Sprint 1.*

## Feature 1.1 — Monorepo & Toolchain
- **INFRA-1.1 — Monorepo scaffold** · `P0` · `8h` · S1
  - Deps: none
  - AC: `backend/`, `frontend/`, `packages/shared` build independently and together; shared package importable by both; single root install works.
  - Subtasks: workspace config; path aliases; shared `tsconfig` base; `packages/shared` skeleton (Zod, constants, types).
- **INFRA-1.2 — TypeScript strict + lint + format + hooks** · `P0` · `6h` · S1
  - Deps: INFRA-1.1
  - AC: `tsc --strict` clean; ESLint (incl. security plugin) + Prettier enforced in CI and pre-commit; failing lint blocks commit.
  - Subtasks: tsconfig strict; ESLint config; Prettier; Husky + lint-staged.
- **INFRA-1.3 — Module-boundary lint rules** · `P0` · `6h` · S1
  - Deps: INFRA-1.2
  - AC: `no-restricted-imports` blocks deep cross-module imports; cross-module access only via public service interface or event bus; CI fails on violation (protects R-ARCH-1).
  - Subtasks: boundary rule config; per-module public index convention; CI gate.

## Feature 1.2 — Backend Core Spine
- **INFRA-2.1 — Express app + middleware stack** · `P0` · `10h` · S1
  - Deps: INFRA-1.2
  - AC: middleware order cors→helmet→compression→rateLimit→requestLogger→auth→tenant→rbac→validate→controller→errorHandler; **`express.raw()` mounted before JSON parser on `/api/webhooks/*`**.
  - Subtasks: middleware wiring; raw-body route carve-out; graceful shutdown (drain in-flight).
- **INFRA-2.2 — Error model + response envelope** · `P0` · `6h` · S1
  - Deps: INFRA-2.1
  - AC: `AppError` + global handler; success/error envelope per doc 10 §10.2; error code registry; no stack traces in prod responses.
  - Subtasks: AppError class; error code enum; envelope helpers; sanitization.
- **INFRA-2.3 — Prisma client + Neon wiring** · `P0` · `8h` · S1
  - Deps: INFRA-2.1
  - AC: Prisma connects to Neon dev branch; transaction-mode pooler validated; client singleton; migration command works.
  - Subtasks: datasource/env; pooler mode check; migrate scaffold; Prisma Studio access.
- **INFRA-2.4 — Redis client** · `P0` · `4h` · S1
  - Deps: INFRA-2.1
  - AC: ioredis singleton (TLS); separate logical namespaces for cache vs queue; health-pingable.
  - Subtasks: connection; namespace prefixes; reconnection policy.
- **INFRA-2.5 — BullMQ topology (API ↔ worker process split)** · `P0` · `10h` · S1
  - Deps: INFRA-2.4
  - AC: 8 named queues defined (doc 06 §6.5) with concurrencies; a job enqueued by the API is processed by a **separate** worker process; DLQ on exhausted retries; 3 attempts + exp backoff default.
  - Subtasks: queue defs; worker bootstrap; DLQ; retry policy; queue registry.
- **INFRA-2.6 — Internal event bus** · `P0` · `5h` · S1
  - Deps: INFRA-2.1
  - AC: typed event emitter; **side-effect-driving events also enqueue to BullMQ** (durable) per FINAL_ARCHITECTURE (R-ARCH-3); event-name registry.
  - Subtasks: emitter; durable-event convention; event catalog.
- **INFRA-2.7 — Health endpoints** · `P0` · `4h` · S1
  - Deps: INFRA-2.3, INFRA-2.4, INFRA-2.5
  - AC: `/health` shallow 200; `/health/deep` checks DB+Redis+queue depth with latencies (doc 18 §18.5).
  - Subtasks: shallow probe; deep probe; readiness vs liveness semantics.

## Feature 1.3 — Cron / Scheduling
- **INFRA-3.1 — Single-flight scheduler + cron registry** · `P0` · `8h` · S1–S2
  - Deps: INFRA-2.5
  - AC: BullMQ repeatable jobs with unique ids (single-flight across instances, AR-5); registry documents each cron (cadence, owner, idempotency, failure impact).
  - Subtasks: scheduler; registry doc; leader-safe guarantee test.

## Feature 1.4 — Feature Flags & Config
- **INFRA-4.1 — Feature-flag + kill-switch layer** · `P0` · `6h` · S1
  - Deps: INFRA-2.4
  - AC: env/DB-backed flags; runtime kill switch (e.g., disable Instagram sends); doubles as plan-feature gate (M5).
  - Subtasks: flag store; evaluation API; admin toggle path.

## Feature 1.5 — CI/CD & Environments
- **INFRA-5.1 — CI pipeline** · `P0` · `10h` · S1
  - Deps: INFRA-1.2
  - AC: GitHub Actions runs lint→typecheck→test→build→`npm audit` (high/critical fails); green required to merge.
  - Subtasks: workflow yaml; cache; audit gate; SBOM step.
- **INFRA-5.2 — Deploy pipelines (Vercel + Railway), same-site domains** · `P0` · `10h` · S1
  - Deps: INFRA-5.1
  - AC: preview deploys per PR; `app.leados.app` (web) + `api.leados.app` (API) on one registrable domain (FINAL_ARCH §7.1); Cloudflare DNS/WAF/TLS.
  - Subtasks: Vercel project + custom domain; Railway service + custom domain; Cloudflare; secrets via AWS Secrets Manager path.
- **INFRA-5.3 — Read replica routing** · `P1` · `6h` · S8
  - Deps: INFRA-2.3
  - AC: a dedicated analytics Prisma client targets the Neon read replica; OLTP unaffected.
  - Subtasks: replica connection; analytics client; routing guard.
- **INFRA-5.4 — Partitioned table structures (early)** · `P1` · `12h` · S5–S6
  - Deps: TEN-2.1
  - AC: `leads`/`messages`/`activities`/`audit_logs` created as partitioned (single partition initially); RLS + tenant extension verified to compose with partitioning (SC-1).
  - Subtasks: partition DDL; RLS-on-partition test; partition-add runbook.

---

# EPIC 2 — Authentication (AUTH)
*Goal: secure, same-site auth lifecycle. Phase P1. Sprint 2.*

## Feature 2.1 — Identity Data Model
- **AUTH-1.1 — Users / refresh_tokens models + migration** · `P0` · `6h` · S2
  - Deps: INFRA-2.3
  - AC: `users`, `refresh_tokens` per doc 08; indexes; soft-delete-aware unique on email (partial index, DB-1).
  - Subtasks: schema; partial unique index; migration + rollback test.

## Feature 2.2 — Registration & Verification
- **AUTH-2.1 — Registration + org bootstrap (atomic)** · `P0` · `12h` · S2
  - Deps: AUTH-1.1, TEN-2.1, ORG model (TEN-1.1)
  - AC: single transaction creates user→org→member(OWNER)→trial subscription→default pipeline+stages→seeded roles (FINAL_ARCH §2.1, doc 07 §7.6); partial failure rolls back fully; password policy enforced (8+, classes, ≠email).
  - Subtasks: Zod schema (shared); bcrypt(12) hash; atomic bootstrap; verification email enqueue.
- **AUTH-2.2 — Email verification** · `P0` · `6h` · S2
  - Deps: AUTH-2.1, OBS-email (SEC-3.x SendGrid)
  - AC: single-use, 1h, token hashed at rest; access blocked until verified; resend supported.
  - Subtasks: token issue/hash; verify endpoint; resend; gate.

## Feature 2.3 — Login, Tokens & Sessions
- **AUTH-3.1 — Login + JWT issue + lockout** · `P0` · `10h` · S2
  - Deps: AUTH-2.1, SEC-2.1 (rate limit)
  - AC: 5/15min per IP+email; lockout after 5 fails; JWT access (15m, in-memory) issued; multi-org → org-selection then per-org JWT.
  - Subtasks: credential verify (timing-safe); lockout; JWT signer; org-selection flow.
- **AUTH-3.2 — Refresh rotation + family-reuse detection** · `P0` · `12h` · S2
  - Deps: AUTH-3.1
  - AC: opaque refresh in `HttpOnly;Secure;SameSite=Strict;Path=/api/v1/auth` cookie; SHA-256 stored; rotated each use; replay of used token revokes family + alerts (doc 19 §19.1).
  - Subtasks: cookie issue; rotation; family tracking; reuse alert; revoke-all-on-password-change.
- **AUTH-3.3 — CSRF protection on refresh** · `P0` · `5h` · S2
  - Deps: AUTH-3.2
  - AC: Origin/Referer check + custom header required on `/auth/refresh` (FINAL_ARCH §3.4).
  - Subtasks: origin check; header check; reject path.
- **AUTH-3.4 — Sessions list/revoke** · `P1` · `6h` · S2
  - Deps: AUTH-3.2
  - AC: user views active sessions (device/IP); revoke one; all revoked on password change.
  - Subtasks: session list; revoke endpoint; UI hook.

## Feature 2.4 — Password Reset & SSO
- **AUTH-4.1 — Forgot/reset password** · `P0` · `6h` · S2
  - Deps: AUTH-2.1
  - AC: reset link single-use 1h, token hashed; generic response (no enumeration, SEC-6); audit entry on change.
  - Subtasks: request; hashed token; reset; audit.
- **AUTH-4.2 — Google SSO** · `P1` · `8h` · S2 (deferrable in-sprint)
  - Deps: AUTH-3.1
  - AC: Google OAuth; auto-link by email; org flow honored.
  - Subtasks: OAuth client; callback; link/create.

## Feature 2.5 — BFF Session Layer
- **AUTH-5.1 — Next.js BFF auth proxy** · `P0` · `12h` · S2
  - Deps: AUTH-3.2, INFRA-5.2
  - AC: route handlers on `app.leados.app` hold session cookie server-side, proxy authenticated calls so RSC can fetch data (FINAL_ARCH §3.3); access token never exposed to RSC.
  - Subtasks: route handlers; cookie passthrough; server-side fetch helper; token refresh on server.

---

# EPIC 3 — Multi-Tenancy (TEN)
*Goal: provably correct isolation. Phase P1. Sprint 3 — hard gate before any domain module.*

## Feature 3.1 — Tenant Data Model
- **TEN-1.1 — Organizations / members / migration** · `P0` · `6h` · S2–S3
  - Deps: INFRA-2.3
  - AC: `organizations`, `organization_members` per doc 08; partial-unique slug (DB-1); active-membership constraint.
  - Subtasks: schema; partial unique slug; member uniqueness; migration.

## Feature 3.2 — Tenancy Mechanism (the core)
- **TEN-2.1 — Unit-of-work transaction + tenant GUC** · `P0` · `16h` · S3
  - Deps: INFRA-2.3, TEN-1.1
  - AC: each unit of work runs one interactive transaction whose first statement is `set_config('app.current_organization_id',…,true)`; GUC + queries share one pinned connection (FINAL_ARCH §2.1).
  - Subtasks: request-transaction wiring; set_config first-statement; externals-outside-transaction rule; transaction helper.
- **TEN-2.2 — Tenant Prisma extension (all operations)** · `P0` · `12h` · S3
  - Deps: TEN-2.1
  - AC: injects `organizationId` on create/createMany/update/updateMany/delete/deleteMany/upsert/find*/count/aggregate/groupBy/*OrThrow; deny-by-default for tenant models.
  - Subtasks: per-op injection; deny-by-default list; bind to tx client.
- **TEN-2.3 — RLS policies (missing-safe) + roles** · `P0` · `12h` · S3
  - Deps: TEN-2.1
  - AC: RLS on all tenant tables with `current_setting('app.current_organization_id',true)`; `leados_app` (no bypass) + `leados_platform_admin` (BYPASSRLS) roles.
  - Subtasks: enable RLS; policies; role creation; grant matrix.

## Feature 3.3 — Verification & Performance (launch gate)
- **TEN-3.1 — Cross-tenant isolation test suite** · `P0` · `16h` · S3
  - Deps: TEN-2.2, TEN-2.3
  - AC: every Prisma op × every tenant model asserts org A cannot read/write/aggregate org B; RLS denies on deliberately-unset/wrong GUC; runs in CI as a permanent gate.
  - Subtasks: app-layer tests; RLS SQL tests; GUC-tamper test; CI wiring.
- **TEN-3.2 — Pooling/perf benchmark (go/no-go)** · `P0` · `10h` · S3
  - Deps: TEN-2.1, INFRA-2.3
  - AC: per-unit-of-work transaction pattern meets NFR P95 < 400ms under load on transaction-mode pooler; accepted before domain modules proceed (FINAL_ARCH §9.1).
  - Subtasks: benchmark harness; pooler validation; sign-off.

## Feature 3.4 — Membership Cache & Switching
- **TEN-4.1 — Tenant middleware + invalidatable cache** · `P0` · `8h` · S3
  - Deps: TEN-2.1, RBAC-1.x
  - AC: membership+permissions cached 5m in Redis; **active invalidation on suspend/remove/role-change** (MT-2); context set per request.
  - Subtasks: middleware; cache; invalidation hooks; org-switch.
- **TEN-4.2 — Super-admin platform path** · `P1` · `8h` · S3
  - Deps: TEN-2.3
  - AC: separate JWT claim; `BYPASSRLS` role; 2FA; 2h non-refreshable session; `platform_audit_logs`.
  - Subtasks: claim; role wiring; 2FA; platform audit.

---

# EPIC 4 — RBAC (RBAC)
*Goal: roles, permissions, record-level scope. Phase P1. Sprint 3.*

## Feature 4.1 — Roles & Permissions Model
- **RBAC-1.1 — roles/permissions models + seeding** · `P0` · `8h` · S3
  - Deps: TEN-1.1
  - AC: 4 system roles seeded per org with default permission sets (doc 11 §11.5); `tasks` resource rows added (E5 errata).
  - Subtasks: schema; seed sets; system-role immutability.

## Feature 4.2 — Enforcement
- **RBAC-2.1 — Permission middleware** · `P0` · `8h` · S3
  - Deps: RBAC-1.1, TEN-4.1
  - AC: `requirePermission(resource,action)`; super-admin bypass; sets `ownOnly` when only `*_own` held (doc 11 §11.3).
  - Subtasks: middleware; own-only flag; 403 path.
- **RBAC-2.2 — "Own-only" service filtering** · `P0` · `8h` · S3–S4
  - Deps: RBAC-2.1
  - AC: service layer appends `assignedToId = userId` for own-only roles on leads/deals/contacts/inbox; RLS unaffected.
  - Subtasks: filter helper; per-module application; tests.
- **RBAC-2.3 — Custom roles (Scale)** · `P2` · `16h` · S25–29
  - Deps: RBAC-2.1
  - AC: Scale orgs create/duplicate roles with granular permissions.
  - Subtasks: role editor backend; validation; UI (UI-epic).

---

# EPIC 5 — CRM Core (CRM)
*Goal: leads, tasks, notes, files, import/export. Phase P2. Sprint 4.*

## Feature 5.1 — Leads
- **CRM-1.1 — Lead model + lifecycle** · `P0` · `10h` · S4
  - Deps: TEN-2.2, RBAC-2.2
  - AC: `leads` per doc 08; status machine NEW→…→WON/LOST; immutable source; `email`/`phone` indexable plaintext (P0-7); `lastActivityAt` denormalized (M9).
  - Subtasks: schema; status transitions; indexes (FTS + trgm); lastActivityAt maintenance.
- **CRM-1.2 — Lead CRUD + list (filter/sort/search)** · `P0` · `14h` · S4
  - Deps: CRM-1.1
  - AC: endpoints per doc 10; filters (status/source/assignee/score/tags/date); FTS+trigram search (min 2 chars); cursor pagination option for large tenants (DB-4); saved presets.
  - Subtasks: repo+service; filter builder; search; pagination; presets.
- **CRM-1.3 — Assignment (+ round-robin) & tags** · `P0` · `8h` · S4
  - Deps: CRM-1.2
  - AC: assign to member; round-robin per pipeline; assignment notifies assignee; color tags filterable + bulk ops.
  - Subtasks: assign endpoint; round-robin hook; tag CRUD; bulk tag.
- **CRM-1.4 — Duplicate detection & merge** · `P1` · `10h` · S4
  - Deps: CRM-1.1
  - AC: flag matching email/phone; prompt merge/ignore; merge combines activity history.
  - Subtasks: dedup query; merge service; activity reconciliation.
- **CRM-1.5 — Custom fields** · `P1` · `10h` · S4
  - Deps: CRM-1.1
  - AC: per-object JSONB custom fields; 7 types; ≤ plan limit; validated.
  - Subtasks: field defs; JSONB storage; validation; plan cap.

## Feature 5.2 — Import / Export
- **CRM-2.1 — CSV import (async)** · `P1` · `14h` · S4
  - Deps: CRM-1.1, INFRA-2.5
  - AC: ≤10k rows via queue; field-mapping; dedup on import; plan-limit enforced transactionally (API-4); real-time progress.
  - Subtasks: upload+parse; mapping UI contract; worker; progress; limit guard.
- **CRM-2.2 — CSV/PDF export (async)** · `P1` · `8h` · S8
  - Deps: CRM-1.2
  - AC: filtered export via `data-export` queue; download link; plan-gated (Growth+).
  - Subtasks: export worker; storage; link; gate.

## Feature 5.3 — Tasks, Notes, Files
- **CRM-3.1 — Tasks** · `P0` · `10h` · S4
  - Deps: CRM-1.1
  - AC: types/priority/status; my-tasks + manager views; linked to lead/deal/contact; completion → activity.
  - Subtasks: schema; views; completion hook; overdue flag (feeds WF).
- **CRM-3.2 — Notes (rich text)** · `P1` · `6h` · S4
  - Deps: CRM-1.1
  - AC: rich notes on any record; attributed+timestamped; searchable.
  - Subtasks: schema; editor contract; search.
- **CRM-3.3 — Files (presigned direct upload)** · `P1` · `10h` · S4
  - Deps: INFRA-2.1
  - AC: presigned URL → direct to Cloudinary/S3 → confirm record; bypasses API; per-record listing.
  - Subtasks: presign endpoint; confirm; provider abstraction; listing.

---

# EPIC 6 — Pipeline & Deals (PIPE)
*Goal: Kanban deal management. Phase P3. Sprint 5.*

## Feature 6.1 — Pipeline Config
- **PIPE-1.1 — Pipeline + stages model/CRUD** · `P0` · `10h` · S5
  - Deps: TEN-2.2, RBAC-2.1
  - AC: stages ordered (drag), color, probability, won/lost terminal, `CHECK(NOT(isWon AND isLost))`; default seeded on org create; single-pipeline gate on Starter.
  - Subtasks: schema; reorder; terminal stages; plan gate.

## Feature 6.2 — Deals
- **PIPE-2.1 — Deal model + CRUD** · `P0` · `10h` · S5
  - Deps: PIPE-1.1, CRM-1.1
  - AC: `deals` per doc 08; links lead/contact; value/currency; status OPEN/WON/LOST; `lastActivityAt` denormalized.
  - Subtasks: schema; CRUD; link logic.
- **PIPE-2.2 — Stage move + won/lost (atomic)** · `P0` · `10h` · S5
  - Deps: PIPE-2.1, ACT-1.1
  - AC: move emits `DEAL_STAGE_CHANGED`; won creates/links contact + activity in one transaction; lost requires reason.
  - Subtasks: move; won (atomic); lost+reason; events.
- **PIPE-2.3 — Kanban board API (paged per stage)** · `P0` · `12h` · S5
  - Deps: PIPE-2.1
  - AC: stages with deal count + total value + first-N deals + cursor (no full embed, API-2); shaped per doc 10 §10.8; P95 < 400ms for large tenants.
  - Subtasks: aggregate query; per-stage pagination; EXPLAIN ANALYZE.
- **PIPE-2.4 — Weighted forecast** · `P1` · `6h` · S5
  - Deps: PIPE-2.1
  - AC: weighted = Σ(value×probability); base-currency aware hook (DB-5, INR-only V1); month/quarter views.
  - Subtasks: calc; currency note; views.

## Feature 6.3 — Multiple Pipelines
- **PIPE-3.1 — Multi-pipeline + cross-pipeline view** · `P1` · `12h` · S13–14
  - Deps: PIPE-1.1
  - AC: Growth=5/Scale=unlimited; independent stages/analytics; cross-pipeline deal list.
  - Subtasks: plan gating; per-pipeline analytics; cross view.

---

# EPIC 7 — Contacts (CON)
*Goal: customer records & 360°. Phase P2/V2. Sprint 4 + S13.*

## Feature 7.1 — Contacts Core
- **CON-1.1 — Contact model + CRUD** · `P0` · `10h` · S4
  - Deps: TEN-2.2, RBAC-2.2
  - AC: `contacts` per doc 08; indexable email/phone; tags/custom fields; lifetime value field.
  - Subtasks: schema; CRUD; indexes.
- **CON-1.2 — Lead → Contact conversion (atomic)** · `P0` · `8h` · S4
  - Deps: CON-1.1, CRM-1.1
  - AC: on won, create/link contact + set `lead.convertedToContactId` + activity in one transaction; lead history preserved.
  - Subtasks: atomic conversion; history link; activity.

## Feature 7.2 — Contact 360° (V2)
- **CON-2.1 — Full 360° view + merge + LTV** · `P1` · `14h` · S13
  - Deps: CON-1.1, ACT-1.1
  - AC: contact detail equals lead detail; duplicate merge; lifetime value tracking; related deals/tasks/notes/files.
  - Subtasks: detail aggregate; merge; LTV calc.

---

# EPIC 8 — Activities (ACT)
*Goal: immutable timeline + audit. Phase P2. Sprint 4.*

## Feature 8.1 — Activity Feed
- **ACT-1.1 — Activities model + emission** · `P0` · `10h` · S4
  - Deps: TEN-2.2
  - AC: immutable `activities` (no update/soft-delete); written on every relevant mutation via service-layer emission; monthly range-partitioned early (DB-2); `(org,relatedX,createdAt)` indexes.
  - Subtasks: schema; emission helper; partitioning; indexes.
- **ACT-1.2 — Timeline API** · `P0` · `6h` · S4
  - Deps: ACT-1.1
  - AC: chronological timeline per lead/deal/contact; cursor-paginated.
  - Subtasks: query; pagination; type formatting.

## Feature 8.2 — Audit Log
- **ACT-2.1 — Audit Prisma extension (async, PII-masked)** · `P0` · `10h` · S3–S4
  - Deps: TEN-2.2
  - AC: auditable-model mutations write `audit_logs` (before/after JSONB, phone/email masked); **async/non-blocking** (DB-2); 5-yr retention; monthly partitioned.
  - Subtasks: extension; masking; async write; partitioning.

---

# EPIC 9 — Notifications (NOTIF)
*Goal: in-app + email delivery. Phase P5. Sprint 7.*

## Feature 9.1 — Realtime Tier
- **NOTIF-1.1 — Socket.io tier + Redis adapter** · `P0` · `12h` · S6–S7
  - Deps: INFRA-2.4, AUTH-3.1
  - AC: separate WS tier; Redis adapter from day one (SC-3); org rooms; auth on connect; auto-reconnect; cross-instance delivery tested.
  - Subtasks: server; adapter; room join; auth handshake; reconnect.

## Feature 9.2 — Notifications
- **NOTIF-2.1 — Notifications model + delivery** · `P0` · `10h` · S7
  - Deps: NOTIF-1.1, INFRA-2.5
  - AC: `notifications` table; in-app via WS; email digest via SendGrid; types per doc 03 §3.10; badge count via `(userId,isRead,createdAt)` index.
  - Subtasks: schema; WS push; email worker; badge query.
- **NOTIF-2.2 — Preferences** · `P1` · `6h` · S7
  - Deps: NOTIF-2.1
  - AC: per-user, per-type, per-channel toggles respected.
  - Subtasks: prefs model; enforcement; UI contract.

---

# EPIC 10 — Analytics (ANLY)
*Goal: dashboards & reports. Phase P6/V2. Sprint 8 + S15–16.*

## Feature 10.1 — V1 Dashboards
- **ANLY-1.1 — Dashboard KPIs** · `P0` · `12h` · S8
  - Deps: INFRA-5.3, CRM-1.1, PIPE-2.1
  - AC: new leads/deals won/revenue/pipeline value/avg deal size for 7/30/90d; **served from read replica**; respects analytics RBAC.
  - Subtasks: replica queries; KPI aggregations; period handling.
- **ANLY-1.2 — Lead source breakdown + basic pipeline view** · `P0` · `8h` · S8
  - Deps: ANLY-1.1
  - AC: source donut; deals-per-stage health bar; "as of" timestamp.
  - Subtasks: source agg; stage agg; staleness label.

## Feature 10.2 — Advanced (V2)
- **ANLY-2.1 — Velocity / funnel / drop-off** · `P1` · `14h` · S15
  - Deps: ANLY-1.1
  - AC: avg time-in-stage, conversion per stage, drop-off; per pipeline.
  - Subtasks: stage-transition data; funnel calc; drop-off.
- **ANLY-2.2 — Pre-aggregation layer** · `P1` · `12h` · S15
  - Deps: ANLY-1.1
  - AC: materialized views / rollups refreshed on schedule; dashboards hit rollups not live aggregation (SC-4); P95 < 1.5s.
  - Subtasks: matviews; refresh cron; query routing.
- **ANLY-2.3 — Team / revenue forecast / inbox SLA / custom ranges + export** · `P1` · `16h` · S15–16
  - Deps: ANLY-2.1, AI-forecast
  - AC: all 6 tabs (doc 17 Screen 7) with comparison + PDF/CSV export.
  - Subtasks: team perf; forecast view; SLA; export.

---

# EPIC 11 — Workflow Engine (WF)
*Goal: no-code automation. Phase P5 (V1 subset) → P7 (full). Sprint 7 + S11–12.*

## Feature 11.1 — Engine Core (V1 subset)
- **WF-1.1 — Workflow models + queue** · `P0` · `10h` · S7
  - Deps: INFRA-2.5, TEN-2.2
  - AC: `workflows`/`workflow_executions`; `workflow-execution` queue; ≤5/org gate (Starter); execution logs with retries.
  - Subtasks: schema; queue; plan gate; exec logging.
- **WF-1.2 — Trigger evaluator (V1 triggers) + workflow cache** · `P0` · `8h` · S7
  - Deps: WF-1.1, INFRA-2.6
  - AC: Lead Created, Deal Won, Instagram Message Received; active workflows cached per org, invalidated on edit (WF-6).
  - Subtasks: trigger registry; config match; cache.
- **WF-1.3 — Condition evaluator (grouped boolean)** · `P0` · `12h` · S7
  - Deps: WF-1.2
  - AC: **grouped AND/OR tree** (not flat left-to-right) so precedence is correct (WF-1); full operator set; field resolver.
  - Subtasks: condition tree model; evaluator; operators; resolver.
- **WF-1.4 — Action executor (V1 actions) + interpolation** · `P0` · `12h` · S7
  - Deps: WF-1.3, NOTIF-2.1
  - AC: Create Task, Create Notification, Send Email; Mustache interpolation; **email recipients restricted to in-tenant records** (SEC-3); failed action logged, chain continues.
  - Subtasks: action handlers; interpolation; recipient guard; per-action result log.

## Feature 11.2 — Safety & Reliability
- **WF-2.1 — Loop/recursion guards + per-org concurrency** · `P0` · `10h` · S7
  - Deps: WF-1.4
  - AC: per-execution action cap, per-entity dedup window, max cascade depth, per-org execution rate limit (WF-3, WF-5).
  - Subtasks: depth/loop guard; dedup; org rate limit.
- **WF-2.2 — Score/trigger ordering** · `P1` · `6h` · S7
  - Deps: WF-1.2, AI-1.2
  - AC: score-conditioned workflows gate on `LEAD_SCORE_CHANGED` (or re-evaluate post-score) so score isn't null at LEAD_CREATED (WF-2).
  - Subtasks: trigger gating; re-eval hook; docs.

## Feature 11.3 — Full Engine (V2)
- **WF-3.1 — WAIT/resume with versioned definition** · `P1` · `12h` · S11
  - Deps: WF-1.4
  - AC: WAIT via delayed jobs; resume against a **snapshot/version** of the workflow (WF-4); deactivation-mid-flight behavior defined.
  - Subtasks: delayed job; definition snapshot; resume; deactivation handling.
- **WF-3.2 — Full trigger/action set + SSRF-safe webhook action** · `P1` · `16h` · S11–12
  - Deps: WF-3.1, IG-send, WA-send
  - AC: all 10 triggers/actions incl. WhatsApp/IG send, lead update, assign, tag, **WEBHOOK with egress allow-list + RFC1918/link-local block** (SEC-2).
  - Subtasks: remaining actions; SSRF guard; condition chains.
- **WF-3.3 — Visual builder (React Flow) + template library** · `P1` · `20h` · S11–12
  - Deps: WF-3.2
  - AC: drag-drop canvas (trigger/condition/action/wait nodes); validation-before-save; 10 templates (doc 12 §12.8).
  - Subtasks: canvas; node config; validation; templates.

---

# EPIC 12 — AI Layer (AI)
*Goal: scoring + intelligence, always async. Phase P5/V2. Sprint 7 + S13–14.*

## Feature 12.1 — AI Infrastructure
- **AI-1.1 — OpenAI client + cache + cost controls** · `P0` · `12h` · S7
  - Deps: INFRA-2.4, INFRA-2.5
  - AC: client (timeout/retries); model routing (4o-mini→4o); Redis prompt cache (>60% target); **per-plan call + per-org cost caps** (SC-5); circuit breaker; graceful no-score.
  - Subtasks: client; routing; cache; rate+cost limit; breaker.

## Feature 12.2 — Lead Scoring (V1)
- **AI-1.2 — Lead scoring worker** · `P0` · `12h` · S7
  - Deps: AI-1.1, CRM-1.1
  - AC: `ai-scoring` queue; triggers on create/status/message/task-complete/weekly; writes `aiScore`+`aiScoreUpdatedAt`; emits `LEAD_SCORE_CHANGED` on ±10; never blocks request path.
  - Subtasks: input builder; structured-output call; persist; score-change event.

## Feature 12.3 — AI Expansion (V2)
- **AI-2.1 — Sentiment analysis** · `P1` · `8h` · S13
  - Deps: AI-1.1, IG-inbox
  - AC: per-conversation sentiment + urgency; shown in inbox; batched for cost.
  - Subtasks: prompt; trigger cadence; display field.
- **AI-2.2 — Follow-up recommendations** · `P1` · `10h` · S13
  - Deps: AI-1.1
  - AC: next-best-action on lead/deal (on-demand + nightly batch); reasoning + suggested message.
  - Subtasks: context builder; on-demand; nightly batch.
- **AI-2.3 — Conversation summary** · `P1` · `8h` · S13
  - Deps: AI-1.1, IG-inbox
  - AC: summary + key points on conversation close; stored on conversation.
  - Subtasks: prompt; trigger; storage.
- **AI-2.4 — Opportunity detection** · `P1` · `10h` · S14
  - Deps: AI-1.1
  - AC: stale-deal/score-jump/no-contact alerts surfaced in dashboard + notifications.
  - Subtasks: signal scans; insight gen; surfacing.
- **AI-2.5 — Revenue forecasting (AI-enhanced)** · `P1` · `12h` · S14–16
  - Deps: AI-1.1, PIPE-2.4
  - AC: best/expected/worst case + risks; weighted + AI model; "as of" + confidence.
  - Subtasks: data assembly; model call; analytics surfacing.

---

# EPIC 13 — Instagram Integration (IG)
*Goal: social-first inbox. Phase P4. Spike now → Sprint 6. Gates launch via App Review.*

## Feature 13.1 — Validation & Foundation
- **IG-0.1 — Meta API validation spike** · `P0` · `20h` · pre-S6
  - Deps: none (start immediately)
  - AC: current OAuth flow, scopes, token type/lifetime, real messaging window, webhook fields confirmed on a live test app; doc 14 errata patched; FB Business verification started (FINAL_ARCH §5.1).
  - Subtasks: test app; OAuth trial; send/receive trial; window test; errata.
- **IG-0.2 — InstagramAdapter abstraction** · `P0` · `8h` · S6
  - Deps: IG-0.1
  - AC: interface (connect/subscribe/receive/send/refresh/profile); pinned Graph version; deprecation-tracking task.
  - Subtasks: interface; version pin; tracker.

## Feature 13.2 — Webhook Backbone
- **IG-1.1 — Webhook subsystem (persist-then-process)** · `P0` · `14h` · S5
  - Deps: INFRA-2.1, INFRA-2.5
  - AC: `webhook_events`; HMAC-SHA256 over **raw body** (raw mounted before JSON, SEC-5); persist+200 within ack window; idempotency `(source,externalEventId)`; DLQ; on Redis recovery re-enqueue PENDING (R-TECH-1).
  - Subtasks: raw-body route; HMAC verify; persist; worker; recovery re-enqueue.

## Feature 13.3 — Connect, Receive, Send
- **IG-2.1 — OAuth connect + encrypted token + refresh cron** · `P0` · `14h` · S6
  - Deps: IG-0.2, IG-1.1
  - AC: connect flow (spike-validated); token AES-256-GCM with key-version prefix; daily refresh cron; EXPIRED → owner notify + reconnect UX.
  - Subtasks: OAuth; encrypt store; subscribe webhook; refresh cron; expiry UX.
- **IG-2.2 — Message receive pipeline** · `P0` · `14h` · S6
  - Deps: IG-2.1, CRM-1.1, NOTIF-1.1
  - AC: account→org resolve; conversation upsert; message persist; lead find/create + enrichment (cached, IG-4); dedup at **message `mid`** grain (IG-2); emit `instagram.message.received`; WS push.
  - Subtasks: resolve; upsert; persist; enrich+cache; lead link; event+push.
- **IG-2.3 — Message send pipeline** · `P0` · `12h` · S6
  - Deps: IG-2.1
  - AC: `instagram-send` queue; per-account rate-limiter; status webhooks (delivered/read); **out-of-window failure surfaced in UI** (IG-5).
  - Subtasks: send worker; rate limit; status handling; window/failure UX.

## Feature 13.4 — Inbox Domain
- **IG-3.1 — Conversation model + assignment + SLA + saved replies/labels** · `P0` · `12h` · S6
  - Deps: IG-2.2
  - AC: conversations (unified-table-ready, R-ARCH-2); assignment (manual/round-robin); `firstResponseAt` SLA; saved replies (`/`); labels.
  - Subtasks: schema; assignment; SLA tracking; saved replies; labels.

## Feature 13.5 — App Review
- **IG-4.1 — Meta App Review submission** · `P0` · `10h` · S6
  - Deps: IG-2.2, IG-2.3
  - AC: screen recording, privacy/ToS naming IG data, business verification, demo creds submitted; sandbox path works pre-approval (gates public launch).
  - Subtasks: demo org; recording; policy docs; submission; sandbox path.

---

# EPIC 14 — Billing (BILL)
*Goal: Stripe monetization with trustworthy access control. Phase P6. Sprint 8.*

## Feature 14.1 — Subscriptions & Stripe
- **BILL-1.1 — Billing models + Stripe customer on org-create** · `P0` · `10h` · S8
  - Deps: TEN-1.1
  - AC: `subscriptions`(+`lastStripeEventAt`,`lastSyncedAt`)/`invoices`/`payments`; Stripe customer created on org bootstrap; price IDs via env.
  - Subtasks: schema; customer creation; price config.
- **BILL-1.2 — Checkout (UPI/netbanking/card, INR, GST)** · `P0` · `12h` · S8
  - Deps: BILL-1.1
  - AC: Checkout session; GST via Stripe Tax + GSTIN capture; gap-free sequential invoice numbers (DB sequence); Customer Portal.
  - Subtasks: checkout; tax; invoice numbering; portal.

## Feature 14.2 — Webhooks & Access (P0-6)
- **BILL-2.1 — Ordered + idempotent webhook handler** · `P0` · `12h` · S8
  - Deps: BILL-1.1, IG-1.1 (webhook subsystem)
  - AC: idempotent via `webhook_events`; apply only if newer than `lastStripeEventAt`; derive status from object not event type; all critical events handled.
  - Subtasks: signature verify; ordering guard; event handlers; mirror update.
- **BILL-2.2 — Nightly reconciliation + drift metric** · `P0` · `10h` · S8
  - Deps: BILL-2.1, INFRA-3.1, OBS metrics
  - AC: list-from-Stripe diff/correct (status/period/plan/**seat quantity**, BL-3); update `lastSyncedAt`; emit `leados_billing_mirror_drift` + alert.
  - Subtasks: reconcile job; seat sync; drift metric.
- **BILL-2.3 — Effective-access middleware (fail-open)** · `P0` · `10h` · S8
  - Deps: BILL-2.1
  - AC: single middleware computing `effectiveAccessLevel` (FULL/READ_ONLY/SUSPENDED); fail-open on ambiguity (never lock a paying org); read-only is one composable gate (BL-4).
  - Subtasks: derivation; gate middleware; fail-open path; tests.

## Feature 14.3 — Lifecycle
- **BILL-3.1 — Trial lifecycle + read-only + dunning** · `P0` · `12h` · S8
  - Deps: BILL-2.3, NOTIF-2.1
  - AC: 14-day trial (no card); lifecycle emails; non-destructive read-only on expiry/past-due; dunning timeline; 30-day reversible purge with support hold.
  - Subtasks: trial cron; emails; read-only; dunning; purge (reversible).
- **BILL-3.2 — Upgrade/downgrade + over-limit policy** · `P1` · `10h` · S8/V2
  - Deps: BILL-2.1
  - AC: proration on upgrade; downgrade over-limit reconciliation (BL-2) incl. Portal-initiated; usage guardrails.
  - Subtasks: upgrade; downgrade; over-limit handling; Portal sync.

## Feature 14.4 — Plan Limits (cross-cut)
- **BILL-4.1 — Canonical PLAN_LIMITS + enforcement helper** · `P0` · `8h` · S3–S4
  - Deps: packages/shared
  - AC: one `PLAN_LIMITS` (monthly + hourly axes, reconciling docs 07/13/16, R-ARCH-4); `enforceLimit(org,resource)` used by every create-path.
  - Subtasks: constant; helper; wire into create-paths.

---

# EPIC 15 — Observability (OBS)
*Goal: logs, metrics, traces, alerts. Phase P0 ongoing. Sprint 1 + per-module.*

## Feature 15.1 — Logging & Tracing
- **OBS-1.1 — Structured logging + request logger** · `P0` · `8h` · S1
  - Deps: INFRA-2.1
  - AC: Winston JSON; per-request {method,path,status,duration,org,user,reqId}; **PII excluded** (doc 18 §18.2).
  - Subtasks: logger; request middleware; redaction.
- **OBS-1.2 — OpenTelemetry traces + Sentry** · `P0` · `10h` · S1
  - Deps: OBS-1.1
  - AC: OTel spans; Sentry FE+BE with PII stripped; user/org context; release tagging.
  - Subtasks: OTel setup; Sentry init; beforeSend redaction.

## Feature 15.2 — Metrics & Alerts
- **OBS-2.1 — System + business metrics** · `P0` · `10h` · S1, S8
  - Deps: OBS-1.2
  - AC: http/db/queue/cache/external metrics + business counters (doc 18 §18.3); **tenant id in logs not metric labels** (I8).
  - Subtasks: metric emitters; cardinality guard; business counters.
- **OBS-2.2 — Dashboards + SLO alerts + status page** · `P0` · `12h` · S8
  - Deps: OBS-2.1
  - AC: 5 Grafana dashboards; SLO alerts (error>1%, P95>800ms, queue depth, AI error, **billing drift**); `status.leados.app`; on-call/PagerDuty.
  - Subtasks: dashboards; alert rules; status page; on-call.

---

# EPIC 16 — Security (SEC)
*Goal: harden every layer. Phase ongoing. Sprint 1–2 + S8 + V3.*

## Feature 16.1 — Platform Security
- **SEC-1.1 — Helmet/CSP/HSTS + CORS (same-site)** · `P0` · `6h` · S1
  - Deps: INFRA-2.1
  - AC: CSP/HSTS-preload/X-Frame DENY/noSniff; CORS allow-list = `app.`/`www.leados.app`, `credentials:true` (FINAL_ARCH §6.4).
  - Subtasks: helmet; CSP; CORS allow-list.
- **SEC-2.1 — Rate limiting (per-user + per-org + auth)** · `P0` · `8h` · S1–S2
  - Deps: INFRA-2.4
  - AC: auth 5/15min IP+email; **per-user + per-org** API limits (not org-only, API-1); webhook limiter; rate-limit headers.
  - Subtasks: Redis limiters; per-user dimension; headers.
- **SEC-3.1 — Field encryption (tokens) + key versioning** · `P0` · `8h` · S6
  - Deps: INFRA-2.3
  - AC: AES-256-GCM for OAuth tokens only; **key-version prefix** for rotation (M8); PII NOT app-encrypted (P0-7).
  - Subtasks: encrypt/decrypt util; key versioning; scope guard.
- **SEC-3.2 — SendGrid domain auth + bounce handling** · `P0` · `6h` · S2
  - Deps: INFRA-2.5
  - AC: SPF/DKIM/DMARC verified; bounce/complaint webhooks; suppression honored (M3) — protects activation emails.
  - Subtasks: DNS auth; bounce webhook; suppression.

## Feature 16.2 — Compliance
- **SEC-4.1 — GDPR export + erasure pipeline** · `P0` · `14h` · S6–S8
  - Deps: CRM-1.1, IG-2.2
  - AC: per-subject JSON export ≤30d; hard-delete PII across leads/contacts/messages/activities ≤30d while preserving anonymized audit integrity (M2); also satisfies Meta deletion policy.
  - Subtasks: export job; erasure job; audit preservation; request intake.
- **SEC-4.2 — Pentest/ZAP + secret scanning** · `P1` · `10h` · S8
  - Deps: INFRA-5.1
  - AC: OWASP ZAP on staging deploys; trufflehog/secret scan; `npm audit` 0 high/critical at launch.
  - Subtasks: ZAP job; secret scan; audit gate.

## Feature 16.3 — Enterprise (V3)
- **SEC-5.1 — SAML SSO + IP allowlist + SOC2/HIPAA** · `P2` · `40h` · S24–34
  - Deps: AUTH-3.1
  - AC: SAML (Google/Azure/Okta); IP allowlist; SOC 2 Type II; HIPAA BAA; DPA.
  - Subtasks: SAML; allowlist; SOC2 program; BAA.

---

# EPIC 17 — Frontend UI (UI)
*Goal: premium dark-first product. Phase P0→P6 + V2/V3. Sprints 1–8 + later.*

## Feature 17.1 — Design System & Shell
- **UI-1.1 — Design tokens + Tailwind + Shadcn baseline** · `P0` · `12h` · S1
  - Deps: INFRA-1.1
  - AC: color/type/spacing tokens (doc 17); dark default; Shadcn components themed; WCAG AA focus rings.
  - Subtasks: tokens; Tailwind config; base components; a11y.
- **UI-1.2 — App shell + routing + Axios interceptors** · `P0` · `12h` · S1–S2
  - Deps: UI-1.1, AUTH-5.1
  - AC: `(auth)`/`(dashboard)` groups; nav/sidebar (Zustand); Axios bearer+401-refresh+403-redirect; TanStack Query provider; Socket.io client.
  - Subtasks: layouts; interceptors; query provider; WS client.

## Feature 17.2 — Auth & Onboarding Screens
- **UI-2.1 — Auth screens + onboarding checklist** · `P0` · `12h` · S2
  - Deps: UI-1.2, AUTH-3.1
  - AC: register/login/forgot/reset/verify; org-selection; onboarding checklist (< 10 min, NFR 4.9).
  - Subtasks: forms (RHF+Zod); org switch; checklist.

## Feature 17.3 — CRM Screens
- **UI-3.1 — Leads List (Screen 2)** · `P0` · `14h` · S4
  - Deps: UI-1.2, CRM-1.2
  - AC: search/filter bar; saved presets; lead cards (source/status/score/assignee); quick actions; import/export buttons; pagination.
  - Subtasks: filters; cards; quick actions; presets.
- **UI-3.2 — Lead Detail (Screen 3)** · `P0` · `16h` · S4
  - Deps: UI-3.1, ACT-1.2, CRM-3.1
  - AC: two-panel; AI score gauge + recommendation card; timeline; tasks/notes/files; inline-edit sidebar; convert button.
  - Subtasks: layout; timeline; panels; inline edit.
- **UI-3.3 — Tasks & Contacts screens** · `P1` · `12h` · S4
  - Deps: CRM-3.1, CON-1.1
  - AC: my-tasks/manager views; contact list + detail.
  - Subtasks: task views; contact list; contact detail.

## Feature 17.4 — Pipeline Screens
- **UI-4.1 — Kanban (Screen 4)** · `P0` · `18h` · S5
  - Deps: UI-1.2, PIPE-2.3
  - AC: @dnd-kit drag-drop + Framer Motion; optimistic moves (TanStack); **200 cards without degradation** (virtualized, NFR 4.9); per-stage count/value; filters.
  - Subtasks: board; dnd; optimistic update; virtualization.
- **UI-4.2 — Deal Detail (Screen 5)** · `P0` · `10h` · S5
  - Deps: UI-4.1, PIPE-2.2
  - AC: stage selector; health indicator; won/lost; forecast contribution.
  - Subtasks: layout; stage move; won/lost.

## Feature 17.5 — Inbox Screens
- **UI-5.1 — Social Inbox (Screen 6)** · `P0` · `20h` · S6
  - Deps: UI-1.2, IG-3.1, NOTIF-1.1
  - AC: three-panel; conversation list (cursor, SLA dot, unread); thread w/ read receipts; compose+attach+emoji; saved replies (`/`); create-lead; AI summary card; window warnings.
  - Subtasks: panels; list; thread; compose; saved replies; realtime updates.

## Feature 17.6 — Automation / Analytics / Settings Screens
- **UI-6.1 — Workflow UI (minimal V1)** · `P0` · `10h` · S7
  - Deps: WF-1.4
  - AC: list (status/trigger/last-run/count); simple trigger/condition/action config; execution log.
  - Subtasks: list; config form; exec log.
- **UI-6.2 — Workflow visual builder (V2)** · `P1` · `20h` · S11–12
  - Deps: WF-3.3
  - AC: React Flow canvas; node config; validation; template library modal.
  - Subtasks: canvas; nodes; templates.
- **UI-6.3 — Notifications center (Screen 12)** · `P0` · `8h` · S7
  - Deps: NOTIF-2.1
  - AC: bell + badge; flyout; full page w/ filters; mark-all-read; empty state.
  - Subtasks: bell; flyout; page.
- **UI-6.4 — Analytics screens (Screen 7)** · `P0` · `12h` · S8
  - Deps: ANLY-1.1
  - AC: V1 Overview + Leads tabs; charts; date range; "as of" labels. (Advanced tabs P1/S15–16.)
  - Subtasks: KPI strip; charts; ranges.
- **UI-6.5 — Settings: Org / Team / Billing (Screens 9–11)** · `P0` · `16h` · S8
  - Deps: TEN-1.1, RBAC-1.1, BILL-1.2
  - AC: org general/business-hours/custom-fields/social-connections; team invite+roles; billing plan card + usage meters + invoices + trial banner.
  - Subtasks: org settings; team mgmt; billing UI.

## Feature 17.7 — Mobile & Native (V2/V3)
- **UI-7.1 — Responsive inbox/lead/deal + PWA push** · `P1` · `18h` · S17–18
  - Deps: UI-5.1, UI-3.2, UI-4.2
  - AC: inbox/lead/deal fully responsive; PWA push notifications.
  - Subtasks: responsive passes; PWA; push.
- **UI-7.2 — Native iOS/Android apps** · `P2` · `80h` · S19–24
  - Deps: API platform
  - AC: full inbox, push, offline drafts.
  - Subtasks: app shells; inbox; push; offline.

---

# Appendix A — Sprint Loading Summary (V1)

| Sprint | Epics primarily active | Headline exit (DEVELOPMENT_ROADMAP) |
|---|---|---|
| S1 | INFRA, OBS, SEC(platform), UI(shell) | Spine green; queue topology; CI/CD; design tokens |
| S2 | AUTH, UI(auth), SEC(email) | Full auth lifecycle on same-site domains |
| S3 | TEN, RBAC, ACT(audit), BILL-4.1 | **Tenancy proven (hard gate)** — isolation suite + perf benchmark |
| S4 | CRM, CON, ACT, UI(CRM) | CRM lifecycle usable, RBAC-scoped |
| S5 | PIPE, IG-1.1(webhook), UI(Kanban) | Pipeline live; webhook backbone |
| S6 | IG, NOTIF-1.1, SEC(tokens/GDPR), UI(inbox) | Inbox live; **Meta App Review submitted** |
| S7 | AI, WF(V1), NOTIF, UI(automation/notif) | Intelligent + automated |
| S8 | BILL, ANLY, OBS(dash), SEC(pentest), UI(analytics/settings) | **V1 launch-ready** (doc 20 + P0 gate) |

# Appendix B — Rough Effort by Epic (V1 scope only, ideal hrs)

| Epic | V1 hrs (approx) | Notes |
|---|---|---|
| Infrastructure | ~105 | front-loaded S1 |
| Authentication | ~83 | S2 |
| Multi-Tenancy | ~96 | S3 — critical path |
| RBAC | ~32 | S3 |
| CRM Core | ~120 | S4 |
| Pipeline | ~58 | S5 |
| Contacts | ~26 | S4 |
| Activities | ~26 | S3–S4 |
| Notifications | ~28 | S6–S7 |
| Analytics | ~28 (V1) | S8 |
| Workflow Engine | ~58 (V1 subset) | S7 |
| AI Layer | ~36 (V1) | S7 |
| Instagram | ~108 | spike + S5–S6, gates launch |
| Billing | ~84 | S8 |
| Observability | ~58 | S1 + S8 |
| Security | ~56 (V1) | spread |
| Frontend UI | ~200 (V1) | spread S1–S8 |

> These are planning estimates for a 3-senior-engineer V1 team over 8 two-week sprints. The totals exceed a naive 3×8×80h only because parallelizable streams (platform vs CRM/UX, per MODULE_DEPENDENCY_GRAPH §3.2) overlap; sprint planning re-balances against the 20% tech-debt reserve and the critical path (TEN → CRM → IG → WF). Anything that can't fit is cut to V1.1 per the roadmap's protected deferrals (visual workflow builder, advanced analytics, multi-pipeline already in V2).
