# SPRINT_3_EXECUTION_PLAN.md

> **Sprint 3 — Multi-Tenancy + RBAC — execution plan**
> Author: Engineering, LeadOS · Date: 2026-06-19
> Source of truth: existing project state + `FINAL_ARCHITECTURE.md` §2 (tenancy, authoritative), §2.3 (super admin), §2.4 (tenant resolution), the `packages/shared` permission model, and `SPRINT_2_BACKEND_SCOPE_SIGNOFF.md` (S2 closed, DEF-3 resolved → DB-gated suites execute in CI).
> Planning only — no code, no file changes.

---

## 0. Context & Premise

Sprint 2 delivered identity/org/member/role/permission **models** (seeded at org bootstrap) and the **unit-of-work `$transaction`** pattern, but the tenancy mechanism and RBAC enforcement are deliberately **stubs**:
- `tenantMiddleware` — pass-through (`core/middleware/tenant.middleware.ts`).
- `requirePermission(PermissionKey)` — pass-through factory (`core/middleware/rbac.middleware.ts`).
- No tenant Prisma extension, no RLS, no per-request GUC, no `audit_logs`.

Sprint 3 promotes these to **real, enforced** implementations exactly per `FINAL_ARCHITECTURE.md` §2 (the corrected P0-1/2/3 mechanism), and stands up the **cross-tenant isolation suite** as a required CI gate — now possible because DEF-3 is resolved (DB/Redis-gated tests execute in CI, run `27783897434`).

### Existing tenant-scoped tables (S3 must protect these now)
`organization_members`, `roles`, `subscriptions`, `refresh_tokens` (all carry `organization_id`). `permissions` is a child of `roles`. Domain tables (`leads`, `contacts`, …) arrive in later sprints — S3 builds the mechanism so they inherit isolation **by default**.

### Objective → Epic map
| Objective | Epic |
|---|---|
| Tenant isolation; PostgreSQL RLS | **E1** Tenancy Foundation (DB roles + RLS) |
| Tenant context propagation; org-scoped data access | **E2** Tenant Context & Unit-of-Work |
| Tenant-aware repositories and services | **E3** Tenant-Aware Data Layer |
| Role-based access control; permission enforcement middleware | **E4** RBAC Enforcement |
| Audit logging foundations | **E5** Audit Foundations |
| Cross-tenant isolation test suite | **E6** Isolation & Enforcement Verification + CI |

---

## 1. Epics & Tasks

### E1 — Tenancy Foundation (DB roles + RLS) — *the correctness floor*

| Task | Deliverable | Key artifacts |
|---|---|---|
| **TEN-3.1.1** Two DB roles | `leados_app` (LOGIN, **no `BYPASSRLS`**) for all tenant traffic; `leados_platform_admin` (**`BYPASSRLS`**) for platform/support only (§2.3). App connects as `leados_app`; document the platform connection as separately-credentialed. | migration `0002_tenancy_roles`; `env.ts` (`DATABASE_URL` → app role; optional `DATABASE_PLATFORM_URL`) |
| **TEN-3.1.2** Enable + FORCE RLS | `ALTER TABLE … ENABLE ROW LEVEL SECURITY; … FORCE ROW LEVEL SECURITY` on every tenant table; **missing-safe** policy `USING (organization_id = current_setting('app.current_organization_id', true)::uuid)` for SELECT/INSERT/UPDATE/DELETE (`WITH CHECK` on writes). | migration `0003_rls_policies` (+ tested rollback script — TD-S2-7 lesson) |
| **TEN-3.1.3** Tenant-table inventory + lint | A single registry of tenant-scoped models (drives the extension **and** an RLS-coverage check); CI assertion that every `organization_id`-bearing table has RLS enabled + FORCED. | `core/tenancy/tenant-tables.ts`; `scripts/check-rls-coverage.mjs` |
| **TEN-3.1.4** Pooler validation (gate) | Benchmark that `SET LOCAL set_config` + RLS works under Neon/PgBouncer **transaction mode** and that GUC + query share one pinned connection; P95 overhead measured. **Blocks E3+ until green.** | `docs/planning/TENANCY_POOLING_BENCHMARK.md` (results) |

### E2 — Tenant Context & Unit-of-Work — *the mechanism (§2.1)*

| Task | Deliverable | Key artifacts |
|---|---|---|
| **TEN-2.1** `withTenant` unit-of-work | Helper that opens one Prisma **interactive `$transaction`**, runs `set_config('app.current_organization_id', orgId, true)` as the **first statement**, then executes the callback against the transaction client. Replaces ad-hoc `$transaction` use. | `core/tenancy/with-tenant.ts` |
| **TEN-2.2** Tenant Prisma extension | Client extension bound to the tx client that injects `organizationId` on **all** ops (`create/createMany/update/updateMany/delete/deleteMany/upsert/find*/*OrThrow/count/aggregate/groupBy`) for tenant models; **deny-by-default** — an unscopeable op on a tenant model throws. | `core/tenancy/tenant-extension.ts` |
| **TEN-2.3** Tenant context propagation | Request-scoped `TenantContext {organizationId, userId, role, permissions, ownOnly}` via `AsyncLocalStorage`; typed accessor; non-tenant (auth/public) paths explicitly opt out. | `core/tenancy/context.ts`; extend `core/types/express.d.ts` |
| **TEN-2.4** Promote `tenantMiddleware` | Real: validate active membership for `req.auth.organizationId`, **Redis-cache membership 5 min** (§2.4), populate `TenantContext`; reject non-members (403). Establishes the cache key purged by RBAC-2.4. | `core/middleware/tenant.middleware.ts` |

### E3 — Tenant-Aware Data Layer

| Task | Deliverable | Key artifacts |
|---|---|---|
| **TEN-3.2.1** Tenant repository base | Convention/base so repositories receive the **tenant tx client** (from `withTenant`) rather than the raw client; raw client reserved for auth/public + platform paths. | `core/tenancy/tenant-repository.ts` |
| **TEN-3.2.2** Migrate org-scoped reads | Move existing org-scoped queries (members, roles, subscription lookups) onto `withTenant` + the extension; auth/login/register stay on the raw client (pre-tenant identity ops, explicitly documented). | `modules/auth/auth.repository.ts` (org-scoped methods), new `modules/org/*` if needed |
| **TEN-3.2.3** Org-scoped service contract | Services obtain `organizationId` from `TenantContext`, never from caller input; add a guard that rejects any tenant-model access outside a `withTenant` scope. | service-layer guard in `core/tenancy/*` |

### E4 — RBAC Enforcement

| Task | Deliverable | Key artifacts |
|---|---|---|
| **RBAC-2.1** Permission resolution | Resolve a member's effective `PermissionKey[]` from role(s) (consuming S2-seeded `ROLE_PERMISSIONS` + custom role rows); detect `*_own` → `ownOnly`; Redis-cached with the membership entry. | `modules/rbac/permission.service.ts` |
| **RBAC-2.2** Promote `requirePermission` | Real enforcement: 403 unless the resolved set contains the required `PermissionKey`; when only `<resource>.<action>_own` is held, set `ctx.ownOnly = true` and expose an **own-only filter** contract for repositories. | `core/middleware/rbac.middleware.ts` |
| **RBAC-2.3** Role assignment endpoints | Minimal org-admin surface: list roles, assign/change a member's role, (optional) custom-role CRUD — all permission-guarded (`org.manage_members` / `roles.*`). | `modules/rbac/rbac.routes.ts`, `.controller.ts` |
| **RBAC-2.4** Active revocation invalidation (MT-2 fix) | On suspend / remove / role-change: **purge** the membership+permission cache key and **denylist** the affected sessions, closing the ≤15-min staleness window (§2.4). | `modules/rbac/*`, `core/auth` session denylist |

### E5 — Audit Foundations

| Task | Deliverable | Key artifacts |
|---|---|---|
| **AUD-1** `audit_logs` model | Tenant-scoped, append-only audit table with **partition-ready** structure (SC-1/DB-2); columns: actor, action, resource, resource_id, before/after (JSON), ip, created_at. RLS-enabled like any tenant table. | migration `0004_audit_logs`; schema model |
| **AUD-2** Audit write path | Service hook to record create/update/delete with **before/after snapshots and PII masking** (email/phone masked per §… data posture); non-blocking but durable. | `core/audit/audit.service.ts` |
| **AUD-3** `platform_audit_logs` | Separate table for `leados_platform_admin` (BYPASSRLS) actions; every platform/support action recorded (§2.3). Super-admin runtime is **scaffold-only** this sprint unless explicitly pulled in. | migration `0005_platform_audit`; `core/audit/platform-audit.ts` |

### E6 — Isolation & Enforcement Verification + CI

| Task | Deliverable | Key artifacts |
|---|---|---|
| **ISO-1** App-layer isolation suite | Two seeded orgs A/B; assert A **cannot** read / write / update / delete / aggregate / count B's rows through the extension; deny-by-default proven for unscopeable ops. | `apps/api/tests/integration/isolation.app.test.ts` |
| **ISO-2** RLS-layer isolation suite | As `leados_app`: unset GUC → **0 rows**; a query attempting cross-org access is denied by RLS even if app injection were bypassed; `WITH CHECK` blocks cross-org writes. | `apps/api/tests/integration/isolation.rls.test.ts` |
| **ISO-3** RBAC enforcement suite | Permission matrix per role; `requirePermission` 403 paths; `ownOnly` filtering; **revocation invalidation** (role change → immediate denial). | `apps/api/tests/integration/rbac.enforcement.test.ts` |
| **ISO-4** Activate CI gate | Flip `.github/workflows/isolation.yml` from scaffold → real required gate; ensure DEF-3 guard makes any infra/env skip a hard failure. | `.github/workflows/isolation.yml` |

---

## 2. Implementation Order (dependency-driven milestones)

> Each milestone ends with `typecheck → lint → test → build` green; integration milestones additionally require the DB/Redis-gated suites to **execute** (DEF-3 guard) in CI.

1. **M1 — Foundation (E1).** DB roles → RLS-enable + FORCE on existing tenant tables → tenant-table registry + RLS-coverage check → **pooling benchmark (TEN-3.1.4) — hard gate**. *Nothing tenant-aware is built until the floor + pooler are proven.*
2. **M2 — Mechanism (E2).** `withTenant` → tenant extension (deny-by-default) → `TenantContext`/ALS → real `tenantMiddleware`. Land **ISO-2 (RLS)** + the extension's **unit tests** alongside.
3. **M3 — Data layer (E3).** Tenant repository base → migrate org-scoped reads onto `withTenant` → service guard. Land **ISO-1 (app-layer)** here.
4. **M4 — RBAC (E4).** Permission resolution → real `requirePermission` + `ownOnly` → role endpoints → revocation invalidation. Land **ISO-3 (RBAC)**.
5. **M5 — Audit (E5).** `audit_logs` (+ partition-ready) → write path with masking → `platform_audit_logs` scaffold.
6. **M6 — Gate & harden (E6/ISO-4).** Activate `isolation.yml` as required; full suite green in CI; coverage thresholds; migrate-check with tested rollback for `0002–0005`.

**Critical path:** M1 → M2 → M3 → M4. E5 can parallelize after M2 (audit table is itself a tenant table). E6 suites are written *within* M2–M4, not deferred to the end.

---

## 3. Testing Strategy

- **Unit (no DB).** Extension injection logic and deny-by-default branch matrix; permission resolution + `ownOnly` detection (in-memory role/permission fixtures); cache-invalidation logic. Reuse the S2 DI + in-memory-fake pattern.
- **Integration (DB-gated, now CI-executing).** Self-gate via `tests/helpers/services.ts` (`isPostgresUp`/`isRedisUp`); the **DEF-3 guard** turns any CI skip into a hard failure, so these *prove* behavior in CI. Includes RLS, app-layer isolation, RBAC enforcement, audit writes.
- **Two-role testing.** Run isolation tests as `leados_app` (RLS enforced) and confirm `leados_platform_admin` BYPASSRLS only on the platform path.
- **Negative-first.** Every isolation assertion is written as "B must be **denied**" (read/write/update/delete/aggregate/count); unset-GUC → 0 rows; unscopeable op → throws; revoked member → 403.
- **Property of completeness.** A test asserts the tenant-table registry equals the set of `organization_id`-bearing tables (no table silently unprotected).
- **Coverage.** Maintain ≥ current floors (api 60, shared 80/60/70/80, web 60); target raising api as the new tenancy/RBAC code is unit-covered.

---

## 4. CI Validation Requirements

Existing gates remain (typecheck, lint incl. module boundaries, `test:coverage` with thresholds, build, `pnpm audit --audit-level=high`, enum-parity, client-secret-leak). Sprint 3 **adds**:

1. **Isolation gate** — `isolation.yml` activated as **required to merge**; runs ISO-1/ISO-2/ISO-3 against ephemeral Postgres (+ Redis) with RLS; must execute (not skip) — enforced by the DEF-3 guard.
2. **RLS-coverage check** — `check-rls-coverage.mjs`: fail if any tenant table lacks `ENABLE`+`FORCE RLS` or a policy, or if a registry/schema mismatch exists.
3. **Migrate-check with rollback** — `migrate-check.yml` extended to apply **and roll back** `0002–0005` on a shadow DB (no destructive migration without a tested rollback — TD-S2-7).
4. **Two-role CI wiring** — CI provisions `leados_app` (no bypass) for the test app connection so RLS is actually exercised (a superuser/owner connection would silently bypass RLS and give false green).
5. **Tenant-scope guard (lint/test)** — assert no tenant-model access occurs outside a `withTenant` scope (deny-by-default smoke).

> CI environment note: continue passing infra env via `turbo.json passThroughEnv`; the isolation job sets `DATABASE_URL` to the **`leados_app`** credential, not a superuser.

---

## 5. Acceptance Criteria (measurable)

Sprint 3 is **DONE** when all hold, green in CI:

1. **RLS everywhere.** Every `organization_id`-bearing table has RLS **ENABLED + FORCED** with the missing-safe policy; `check-rls-coverage` passes.
2. **Unset GUC denies.** A query with no `app.current_organization_id` set returns **0 rows** and writes are rejected (`WITH CHECK`).
3. **Cross-tenant denial (app layer).** Org A cannot read/write/update/delete/aggregate/count org B via the extension; unscopeable ops on tenant models throw (deny-by-default).
4. **Cross-tenant denial (RLS layer).** Same denial holds as `leados_app` even when app injection is bypassed; `leados_platform_admin` BYPASSRLS only on the platform path.
5. **Unit of work is atomic + pinned.** Tenant ops run in one interactive transaction with `SET LOCAL` GUC on the same connection; pooler benchmark (TEN-3.1.4) green with documented P95.
6. **RBAC enforced.** `requirePermission` returns 403 without the permission; the per-role matrix is honored; `ownOnly` restricts to owned rows.
7. **Active revocation.** Role-change/suspend/remove invalidates membership+permission cache and denylists sessions; a revoked member is denied on the **next** request (no ≤15-min window).
8. **Audit foundations.** create/update/delete on audited resources produce `audit_logs` rows with masked PII and before/after snapshots; platform actions write `platform_audit_logs`.
9. **Isolation suite is a required, executing CI gate** (ISO-1/2/3), not skipped.
10. All standard gates green; migrate-check + rollback pass for `0002–0005`.

---

## 6. Risks & Mitigation

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | **Connection un-pinning under pooler** — GUC set on a different connection than the query → RLS silently ineffective | Critical (silent cross-tenant leak) | `SET LOCAL` **inside** the interactive transaction (same connection); **TEN-3.1.4 benchmark gates** before any data-layer work; ISO-2 asserts unset-GUC→0 rows |
| R2 | **Extension misses an operation** → an unscoped query leaks | Critical | **Deny-by-default**: unscopeable op on a tenant model throws; **RLS is the backstop** (defense in depth); completeness test over the op matrix |
| R3 | **False-green tests run as a superuser** (RLS bypassed in CI) | High (suite proves nothing) | CI app connection uses **`leados_app`** (no BYPASSRLS); a dedicated test asserts RLS actually blocks as that role |
| R4 | **Per-op injection / RLS performance overhead** | Medium | Measure in TEN-3.1.4; index `organization_id`; cache membership/permissions (5 min); revisit only if P95 regresses |
| R5 | **Cache staleness on revocation** (MT-2) | High (security) | **Active invalidation** (RBAC-2.4): purge cache key + session denylist on change; ISO-3 proves immediate denial |
| R6 | **Partial repo migration** — some path still uses the raw client on a tenant table | High | Service-layer guard rejecting tenant-model access outside `withTenant`; tenant-scope lint/test (CI §4.5); explicit allow-list for the few legitimate raw-client auth/public paths |
| R7 | **`BYPASSRLS` misuse** beyond platform paths | Critical | Two distinct roles; app **never** connects as platform admin; platform actions fully audited (AUD-3); least-privilege documented |
| R8 | **Audit partitioning complexity** | Medium | Ship **partition-ready structure** now (SC-1/DB-2), not full partition automation; keep writes simple + durable; defer partition rotation tooling |
| R9 | **Destructive migration without rollback** (TD-S2-7) | Medium | migrate-check applies **and** rolls back `0002–0005` on a shadow DB; no merge without a tested rollback |
| R10 | **Hand-written migration drift** (no local shadow DB) | Medium | Validate against CI Postgres (DEF-3 path); RLS-coverage check catches missed tables |

---

## 7. Out of Scope (Sprint 3)

Domain modules (`leads`/`contacts`/`pipelines` — S4/S5) — S3 only builds the mechanism they inherit; full **super-admin runtime** (2FA, 2-hour session) beyond the `platform_audit_logs` scaffold + role; Stripe/billing (S8); GDPR export/erasure pipeline (later); the deferred S2 ride-alongs (`PATCH /auth/me*`, real email SEC-3.2 wiring) may be picked up opportunistically but are **not** S3 acceptance gates.

---

*Planning only — no code implemented, no files modified.*
