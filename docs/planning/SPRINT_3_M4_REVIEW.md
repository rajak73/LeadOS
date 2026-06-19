# SPRINT_3_M4_REVIEW.md

> **Sprint 3 — Milestone 4 (E4: RBAC Enforcement) — implementation review**
> Author: Engineering, LeadOS · Date: 2026-06-19
> Scope implemented: **M4 only** (RBAC-2.1 … RBAC-2.4) per `SPRINT_3_EXECUTION_PLAN.md`. No E5 (Audit) / E6 (Isolation Gate) work. No architecture decisions modified. **Runtime connection NOT switched to `leados_app`** (D2). **D-M3-2 respected** (permission reads are org-scoped, not cross-tenant discovery).

---

## 1. What M4 Delivered

Real role-based access control: DB-backed cached permission resolution, a real `requirePermission` guard with own-only support, role-admin endpoints, and active cache invalidation that makes role/suspension changes take effect on the member's next request — even with a stale access token.

| Task | Delivered |
|---|---|
| **RBAC-2.1** Permission resolution | `CachedPermissionResolver` resolves a member's CURRENT role + effective permissions org-scoped via `withTenant` (D-M3-2-safe), Redis-cached; permission source = the role's permission rows, with a `ROLE_PERMISSIONS` fallback for system roles. |
| **RBAC-2.2** Real `requirePermission` | `createRequirePermission(resolver)` replaces the stub: 401 if unauthenticated, 403 if the permission isn't held, **own-only** grant via `*_own` (sets `ctx.ownOnly`), super-admin bypass; records `permissions`/`ownOnly` on the tenant context for downstream filtering. Pure `decide()` is unit-tested. |
| **RBAC-2.3** Role assignment endpoints | `GET /api/v1/roles`, `PATCH /api/v1/members/:userId/role`, `POST /api/v1/members/:userId/suspend` — each permission-guarded (`team.read` / `team.update_role` / `team.suspend`), org from the tenant context (never the client). |
| **RBAC-2.4** Active cache invalidation | On role change / suspend, the member's **permission cache AND the M2 membership cache** are purged → the next request re-resolves from the DB. Closes the MT-2 / SEC-M2-2 staleness window. |

**Key security property:** enforcement uses the **DB-resolved** current role, not the token's role claim — so a privilege change is honored immediately after invalidation, and a stale token cannot retain dropped permissions.

---

## 2. Files Changed

**New (core)**
```
apps/api/src/core/authz/permission-check.ts        decide() + PermissionResolver contract (RBAC-2.2)
apps/api/src/core/authz/permission-check.test.ts   decision-matrix unit tests (6)
apps/api/src/core/middleware/rbac.middleware.test.ts  guard unit tests (7)
```
**New (rbac module)**
```
apps/api/src/modules/rbac/permission-resolver.ts        CachedPermissionResolver + lookup (RBAC-2.1)
apps/api/src/modules/rbac/permission-resolver.test.ts   cache + invalidation unit tests (4)
apps/api/src/modules/rbac/rbac.repository.ts            org-scoped role/member ops (withTenant)
apps/api/src/modules/rbac/rbac.service.ts              role admin + invalidation (RBAC-2.3/2.4)
apps/api/src/modules/rbac/rbac.service.test.ts         service unit tests (6)
apps/api/src/modules/rbac/rbac.controller.ts           thin controllers
apps/api/src/modules/rbac/rbac.routes.ts               permission-guarded routes
apps/api/src/modules/rbac/index.ts                     composition root + member invalidator
apps/api/tests/integration/rbac.enforcement.test.ts    end-to-end enforcement + invalidation (7)
```
**Modified**
```
apps/api/src/core/middleware/rbac.middleware.ts   stub → real (createRequirePermission)
apps/api/src/core/middleware/index.ts             export createRequirePermission (was requirePermission)
apps/api/src/app.ts                               wire rbac module: real requirePermission + role routes
apps/api/tests/integration/health.test.ts         /api/v1/ping unauth now 401 (RBAC live) — see D-M4-1
```
No schema/migration change; the `AuthRepository` is untouched (auth flows unaffected).

---

## 3. Tests Added (30)

| Suite | Tests | Proves |
|---|---|---|
| `permission-check.test.ts` (unit) | 6 | full grant; `*_own` → ownOnly; full beats own; non-own-scopable actions; deny; admin keys |
| `rbac.middleware.test.ts` (unit) | 7 | 401 unauth; allow + records perms/ownOnly; own-only; **403 missing perm**; 403 no membership; super-admin bypass; resolver error forwarded |
| `permission-resolver.test.ts` (unit) | 4 | DB on miss + cache; cache hit (no 2nd lookup); **invalidate → fresh lookup**; null not cached |
| `rbac.service.test.ts` (unit) | 6 | assign/suspend invalidate on success; **no invalidate on failure**; unknown-role + member-not-found errors; listRoles delegates |
| `rbac.enforcement.test.ts` (DB-gated) | 7 | SALES → ping 200; **SALES → role-change 403**; OWNER lists roles; OWNER assigns; **ACTIVE INVALIDATION (stale token → 200)**; OWNER suspends; **SUSPEND INVALIDATION → 403** |

**Authorization-failure coverage:** unauthenticated → 401; insufficient permission → 403 (unit + integration); non-member → 403; suspended → 403.
**Cache-invalidation coverage:** deterministic at the resolver level (unit, fake cache) AND end-to-end (integration: a stale SALES token gains OWNER rights immediately after promotion; a suspended member is rejected on the next request).

---

## 4. Validation Results (all green)

| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ 4/4 |
| `pnpm lint` | ✅ 4/4 |
| `pnpm build` | ✅ 3/3 |
| `pnpm test` (api, CI-mirror) | ✅ **206 passed / 1 skipped** (+30 vs 176) |
| `pnpm test:coverage` (api) | ✅ **82.59 / 87.73 / 82.58 / 82.59** — all ≥ 60 floor (up from 80.19) |
| **Existing flows** (register / login / refresh / tenant) | ✅ still pass (register 201; login/refresh; tenant.middleware.e2e member 200 / non-member 403) |
| **D2 compliance** | ✅ runtime still admin; `withTenant` uses the admin singleton; no connection switch |
| **D-M3-2 respected** | ✅ permission resolution reads `organization_members` org-scoped via `withTenant` (org known from auth context) — no cross-tenant discovery added |

---

## 5. Acceptance Criteria Status

| Item | Status |
|---|---|
| **RBAC-2.1** permission resolution + cache | ✅ Met |
| **RBAC-2.2** real `requirePermission` + own-only | ✅ Met |
| **RBAC-2.3** role assignment endpoints | ✅ Met (roles list, assign role, suspend) |
| **RBAC-2.4** active membership + permission cache invalidation | ✅ Met (purges both caches; verified end-to-end) |
| Comprehensive unit + integration tests | ✅ 30 added |
| Authorization-failure tests | ✅ 401/403/non-member/suspended |
| Cache-invalidation verified | ✅ unit (deterministic) + integration |

**Deferred by design (not M4):** audit logging (E5/M5), the cross-tenant isolation suite as a required CI gate (E6/M6), and the `leados_app` runtime connection switch (D2).

---

## 6. Risks Discovered

| # | Finding | Disposition |
|---|---|---|
| **D-M4-1** | **`/api/v1/ping` behavior change.** With real RBAC, an *unauthenticated* `/api/v1/ping` now returns **401** (was 200 through the Sprint-1 stub). Intended RBAC enforcement; the Sprint-1 health-test assertion was updated to expect 401. Not a regression (the success path — member token → 200 — is covered in `tenant.middleware.e2e` + `rbac.enforcement`). | Resolved; documented. |
| **D-M4-2** | **Test flakiness under heavy parallelism.** `auth.routes` *logout idempotent* (a no-DB test) failed once during a full parallel coverage run; it passes deterministically in isolation (2×) and on re-run. Pre-existing vitest-worker contention, not M4 logic. | Monitor in CI; if it recurs, investigate worker concurrency / per-file app build cost. |
| **D-M4-3** | **Permission source duality.** Resolution prefers the role's DB permission rows; for a system role with no seeded rows it falls back to `ROLE_PERMISSIONS`. Correct for system roles (the bootstrap seeds equivalent rows) and forward-compatible with custom roles (DB rows). | Acceptable; revisit when custom-role CRUD lands. |
| **D-M4-4** | **Super-admin bypass.** `isSuperAdmin` bypasses org permission checks but still must pass the tenant membership gate, so a platform admin who is not a member is blocked at `tenantMiddleware`. Full platform super-admin paths (BYPASSRLS, §2.3) are future. | By design for M4; tracked for the super-admin milestone. |
| **D-M3-2** (carried) | Identity reads under `leados_app` + RLS still need a strategy before the connection switch. **Unchanged by M4** (RBAC reads are org-scoped, not cross-tenant discovery). | The connection-switch milestone (highest-priority carry-forward). |

---

## 7. Readiness for M5 (E5: Audit Foundations) — ✅ READY

| Entry criterion | Status |
|---|---|
| `TenantContext` carries actor org/user/role **+ now `permissions`/`ownOnly`** (audit can record who + with what authority) | ✅ |
| Guarded, org-scoped tenant data layer for writing audit rows | ✅ (M3) |
| RBAC enforcement in place (audited actions are now permission-gated) | ✅ (M4) |
| Role-admin actions (assign/suspend) that audit should capture exist | ✅ (M4) |

**M5 (E5: Audit) is clear to begin.** Recommended start: AUD-1 (`audit_logs` model — tenant-scoped, partition-ready, RLS-enabled like any tenant table; add to the tenant-table registry) → AUD-2 (audit write path with before/after snapshots + PII masking; hook the RBAC role-admin actions first) → AUD-3 (`platform_audit_logs` scaffold for the BYPASSRLS path).

> Carry-forward to the connection-switch milestone (not M5 unless bundled): resolve **D-M3-2** before switching the runtime to `leados_app`.

---

*Implementation review — M4 (E4) only. No E5/E6 code, no architecture changes, runtime connection unchanged, D-M3-2 respected, no acceptance criteria skipped.*
