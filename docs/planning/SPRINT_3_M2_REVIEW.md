# SPRINT_3_M2_REVIEW.md

> **Sprint 3 — Milestone 2 (E2: Tenant Context & Unit-of-Work) — implementation review**
> Author: Engineering, LeadOS · Date: 2026-06-19
> Scope implemented: **M2 only** (TEN-2.1 … TEN-2.4) per `SPRINT_3_EXECUTION_PLAN.md`. No E3/E4/E5/E6 work. No architecture decisions modified. **Runtime connection NOT switched to `leados_app`** (D2 honored).

---

## 1. What M2 Delivered

The tenancy **mechanism** that sits on top of the M1 RLS floor: a single-transaction unit-of-work that pins the tenant GUC, a deny-by-default Prisma extension that auto-scopes every tenant-model operation, a request-scoped tenant context, and a real membership-validating `tenantMiddleware`.

| Task | Delivered |
|---|---|
| **TEN-2.1** `withTenant` | One interactive `$transaction` whose first statement is `set_config('app.current_organization_id', orgId, true)` (SET LOCAL), exposing a tenant-scoped client to the callback. Atomic — rolls back on throw. |
| **TEN-2.2** Tenant extension (deny-by-default) | `tenantExtension(orgId)` injects the tenant column on **every** tenant-model op (`create`/`createMany`/`upsert`/`find*`/`update*`/`delete*`/`count`/`aggregate`/`groupBy`); any other op on a tenant model throws `TenantScopeError`. Non-tenant models pass through. Injection logic is a **pure, unit-tested** function. |
| **TEN-2.3** `TenantContext` (ALS) | `AsyncLocalStorage`-backed context (`organizationId/userId/role/isSuperAdmin`; `permissions`/`ownOnly` reserved for M4) with `runWithTenantContext`/`getTenantContext`/`requireTenantContext`. |
| **TEN-2.4** Real `tenantMiddleware` | Replaces the stub: validates ACTIVE membership (Redis-cached 5 min, positive-only, Redis-blip-tolerant), 403s non-members, and runs the request inside the tenant context. DI-built (`createTenantMiddleware`) for testability. |

---

## 2. Files Changed

**New (src)**
```
apps/api/src/core/tenancy/with-tenant.ts            withTenant unit-of-work (TEN-2.1)
apps/api/src/core/tenancy/tenant-extension.ts       injectTenant() + tenantExtension() (TEN-2.2)
apps/api/src/core/tenancy/context.ts                AsyncLocalStorage TenantContext (TEN-2.3)
apps/api/src/core/tenancy/membership.ts             CachedMembershipValidator + lookup (TEN-2.4)
```
**New (tests)**
```
apps/api/src/core/tenancy/tenant-extension.test.ts   injection matrix + deny-by-default (22)
apps/api/src/core/tenancy/context.test.ts            ALS semantics (5)
apps/api/src/core/tenancy/membership.test.ts         cache logic w/ fakes (4)
apps/api/src/core/middleware/tenant.middleware.test.ts  middleware w/ fake validator (4)
apps/api/tests/integration/tenancy.withTenant.test.ts   withTenant + extension vs real DB (7)
```
**Modified**
```
apps/api/src/core/middleware/tenant.middleware.ts   stub → real (membership + context)
apps/api/src/core/tenancy/tenant-tables.ts          + TENANT_MODELS / isTenantModel (extension input)
```
No schema/migration change (M2 is application-layer). `app.ts` unchanged — `tenantMiddleware` keeps the same export name, so middleware order is identical.

---

## 3. Tests Added (42)

| Suite | Tests | Proves |
|---|---|---|
| `tenant-extension.test.ts` (unit) | 22 | tenant column injected for the whole op matrix; create/createMany/upsert data; `where` ops incl. extendedWhereUnique; **tenant cannot be escaped** (caller-supplied org overridden); args not mutated; **deny-by-default throws** for unscopable ops |
| `context.test.ts` (unit) | 5 | context visible in-scope, undefined out-of-scope, `require` throws outside, **propagates across awaits**, nested isolation |
| `membership.test.ts` (unit) | 4 | cache-hit skips DB; miss → DB + caches positive; **negatives not cached**; **Redis blip falls through to DB** |
| `tenant.middleware.test.ts` (unit) | 4 | unauth pass-through; member → context set + `next()`; **non-member → 403**; validator error forwarded |
| `tenancy.withTenant.test.ts` (integration, DB-gated) | 7 | reads scoped; **can't escape tenant via `where`**; **auto-inject on create**; **cross-org write can't reach another org**; **transaction rollback on throw**; non-tenant models unaffected |

The integration suite runs over the **admin** connection (RLS bypassed), so it isolates and proves the **app-layer extension** specifically — complementing M1's RLS-layer proof. Executes in CI via the DEF-3 guard.

---

## 4. Validation Results (all green)

| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ 4/4 |
| `pnpm lint` | ✅ 4/4 |
| `pnpm build` | ✅ 3/3 |
| `pnpm test` (api, CI-mirror) | ✅ **147 passed / 1 skip** (the skip is the Redis doc-placeholder, local only) |
| `pnpm test:coverage` (api) | ✅ **77.61 / 85.87 / 73.91 / 77.61** — all ≥ 60 floor (up from 75.34) |
| **Existing auth flows** (register/login/refresh over real DB) | ✅ **still pass** — register happy-path 201, login + refresh suites green |

D2 verification: the runtime still connects via the admin `prisma` singleton; auth routes are public (mounted before the `/api/v1` chain), so the now-real `tenantMiddleware` does not touch them. No tenant write path was forced under RLS-as-`leados_app`. **Existing auth flows continue working.**

---

## 5. Acceptance Criteria Status

M2 is the mechanism; it advances (does not yet fully close) these plan §5 criteria:

| # | Criterion | M2 status |
|---|---|---|
| — | **TEN-2.1/2.2/2.3/2.4 delivered + tested** | ✅ Met |
| 3 | **App-layer deny-by-default** — unscopable op on a tenant model rejected | ✅ Met (extension throws `TenantScopeError`; proven by unit matrix) |
| 5 | **Unit of work atomic + pinned** | ✅ `withTenant` = one interactive tx with `SET LOCAL` GUC; rollback-on-throw proven |
| 4 (partial) | cross-tenant denial | ✅ at the **app layer** (extension forces tenant; cross-org writes can't reach another org). The exhaustive per-table app+RLS suite (**ISO-1/ISO-2**) is **M6** |

**Deferred by design (not M2):** criteria 6 (RBAC enforcement), 7 (active revocation invalidation), 8 (audit), 9 (isolation suite as required CI gate), 10 (migrate-check rollback wiring) — these are E4/E5/E6 and were **not** implemented. No M2 acceptance criterion was skipped.

---

## 6. Risks Discovered

| # | Finding | Disposition |
|---|---|---|
| **D-M2-1** | **Create typing DX gap.** The extension injects `organizationId` at runtime, but Prisma's generated `create`/`createMany` input types still *require* it — so an org-free `create({ data: { name } })` does **not** typecheck. Tests use a documented cast. | Expected; the **M3 tenant-repository layer (E3)** should expose org-free create signatures so callers never pass (or cast) `organizationId`. Flagged for M3. |
| **D-M2-2** | **`tenantMiddleware` runs before RBAC, but RBAC is still a stub.** With M2 live, an authenticated `/api/v1/*` request now requires ACTIVE membership (403 otherwise); `requirePermission` still passes through (M4). So routes are membership-gated but not yet permission-gated. | Intended interim state; closes in M4. No public/auth route affected (those are mounted before the chain). |
| **D-M2-3** | **Negative-membership not cached.** A non-member re-hits the DB every request (chosen to avoid stale lockout before M4's active invalidation). Slightly higher DB load for repeated unauthorized attempts. | Acceptable; the auth-layer rate limit bounds abuse. Revisit with M4's active invalidation if needed. |
| **D-M2-4** | **`withTenant` always opens a transaction**, even for a single read. Negligible per the M1 benchmark (p95 0.445 ms), but worth noting for hot read paths. | Monitor; a read-only fast path (no tx) could be added later if a hot path needs it. Not needed now. |
| **D-M2-5** | **Membership lookup reads a tenant table (`organization_members`) scoped to the same org being validated.** Correct under both admin (extension scopes) and future `leados_app` (GUC+RLS scope), because the user's own membership row lives in that org. | Verified by design; the integration path exercises `withTenant` reads. No action. |

---

## 7. Readiness for M3 (E3: Tenant-Aware Data Layer)

✅ **Ready.** M3 consumes exactly what M2 produced:

- **`withTenant` + extension** are the data-access primitive M3's tenant repository base (TEN-3.2.1) wraps; the org-free create DX (D-M2-1) is the first thing M3 should solve at the repository typing layer.
- **`TenantContext`** is in place for services to read `organizationId` from context (TEN-3.2.3) instead of from caller input.
- **`tenantMiddleware`** already establishes the context on `/api/v1/*`, so repositories invoked from those routes will have it.

**Carry-in constraint (unchanged from D2 → now actionable in M3):** M3 migrates the existing auth bootstrap/login writes onto `withTenant`, and **only after** every tenant-table write is wrapped may a later step switch the runtime connection to `leados_app`. Until then, RLS-as-`leados_app` would reject those un-wrapped writes — so the connection switch stays out of M3's early tasks and lands once TEN-3.2.2 is complete.

**Recommended M3 start:** TEN-3.2.1 (tenant repository base + org-free create typing, resolving D-M2-1) → TEN-3.2.2 (migrate org-scoped auth reads/writes onto `withTenant`) → TEN-3.2.3 (service guard rejecting tenant-model access outside a `withTenant` scope).

---

*Implementation review — M2 (E2) only. No E3+ code, no architecture changes, runtime connection unchanged, no acceptance criteria skipped.*
