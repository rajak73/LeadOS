# SPRINT_3_M3_REVIEW.md

> **Sprint 3 — Milestone 3 (E3: Tenant-Aware Data Layer) — implementation review**
> Author: Engineering, LeadOS · Date: 2026-06-19
> Scope implemented: **M3 only** (TEN-3.2.1 … TEN-3.2.3) per `SPRINT_3_EXECUTION_PLAN.md`. No E4/E5/E6 work. No architecture decisions modified. **Runtime connection NOT switched to `leados_app`** (D2 honored).

---

## 1. What M3 Delivered

A sanctioned, guarded tenant data layer on top of the M2 mechanism: a repository base that can only run inside a `withTenant` scope, the migration of the genuinely org-scoped auth operations onto `withTenant` (with org-free creates — resolving TD-M2-1), and a scope guard that rejects tenant-data-layer use outside a unit of work.

| Task | Delivered |
|---|---|
| **TEN-3.2.1** Tenant repository base | `core/tenancy/tenant-repository.ts` — abstract `TenantRepository` (takes the `withTenant` tx client; asserts scope at construction), `WithoutTenant<T>` type + `asTenantCreate` (org-free create inputs; the organizationId-stripping cast lives **once** here — **resolves TD-M2-1**). |
| **TEN-3.2.2** Migrate org-scoped auth reads/writes | `getMembershipRole` (read) and `createRefreshToken` (write) now run through `withTenant` + the extension via `OrgScopedAuthRepository` (org-free create — no `organizationId` passed). Pre-tenant/cross-tenant identity ops stay raw, **documented**. |
| **TEN-3.2.3** Service guard | `core/tenancy/scope.ts` — `withTenant` marks a tenant scope (AsyncLocalStorage); `assertTenantScope()` (called by the repository base) throws `TenantScopeViolationError` if a tenant repository is used outside a `withTenant` scope. |

---

## 2. Files Changed

**New**
```
apps/api/src/core/tenancy/scope.ts                         tenant-scope tracking + assertTenantScope (TEN-3.2.3)
apps/api/src/core/tenancy/scope.test.ts                    scope guard unit tests (5)
apps/api/src/core/tenancy/tenant-repository.ts             TenantRepository base + WithoutTenant (TEN-3.2.1)
apps/api/src/core/tenancy/tenant-repository.test.ts        base/guard unit tests (3)
apps/api/src/modules/auth/org-scoped-auth.repository.ts    OrgScopedAuthRepository (TEN-3.2.2)
apps/api/tests/integration/org-scoped-auth.integration.test.ts   migrated methods + guard over real DB (5)
```
**Modified**
```
apps/api/src/core/tenancy/with-tenant.ts        wrap the callback in runInTenantScope (scope marker)
apps/api/src/modules/auth/auth.repository.ts    migrate getMembershipRole + createRefreshToken; document raw exceptions
```
No schema/migration change; no `app.ts` change; the `AuthRepository` interface is unchanged (only the Prisma impl of two methods), so the in-memory fake and all service unit tests are unaffected.

---

## 3. Tests Added (13)

| Suite | Tests | Proves |
|---|---|---|
| `scope.test.ts` (unit) | 5 | scope absent outside / present inside; `assertTenantScope` throws outside, passes inside; **propagates across awaits**; restored after run |
| `tenant-repository.test.ts` (unit) | 3 | base **throws outside** a scope, **constructs inside**; `asTenantCreate` passthrough |
| `org-scoped-auth.integration.test.ts` (DB-gated) | 5 | migrated `getMembershipRole` returns role + **no cross-org leak**; `createRefreshToken` **injects organizationId** (org-free create persists scoped); `OrgScopedAuthRepository` works inside `withTenant` and **throws outside** (guard over real DB) |

---

## 4. Validation Results (all green)

| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ 4/4 |
| `pnpm lint` | ✅ 4/4 |
| `pnpm build` | ✅ 3/3 |
| `pnpm test` (api, CI-mirror) | ✅ **176 passed / 1 skipped** (+13 vs 163) |
| `pnpm test:coverage` (api) | ✅ **80.19 / 86.33 / 79.47 / 80.19** — all ≥ 60 floor (up from 79.11) |
| **Existing auth flows** (register/login/refresh) | ✅ still pass (register 201; login + refresh suites green) |
| **D2 compliance** | ✅ runtime still admin; `withTenant` uses the admin `prisma` singleton; no connection switch |

---

## 5. Acceptance Criteria Status

| Item | Status |
|---|---|
| **TEN-3.2.1** repository base + org-free create typing (**TD-M2-1 resolved**) | ✅ Met |
| **TEN-3.2.2** org-scoped auth reads/writes on `withTenant`; raw identity ops documented | ✅ Met |
| **TEN-3.2.3** guard rejecting tenant-data-layer use outside a `withTenant` scope | ✅ Met |
| D2 sequencing honored; auth flows working | ✅ Met |
| Unit + integration tests added | ✅ Met (13) |

**Deferred by design (not M3):** RBAC enforcement (E4/M4), audit (E5/M5), the cross-tenant isolation suite as a required CI gate (E6/M6), and the `leados_app` runtime connection switch (still gated on D2 — pending the items in §6).

---

## 6. Risks Discovered

| # | Finding | Disposition |
|---|---|---|
| **D-M3-1** | **Guard scope.** The TEN-3.2.3 guard governs the **sanctioned tenant data layer** (`TenantRepository`), not arbitrary raw `prisma.<model>` calls. Raw access is held in check by the existing module-boundary lint rule (only the auth module touches these tables) + the documented identity exceptions. A **global** guard extension (rejecting *all* raw tenant-model access outside scope) is a stronger future hardening — not done in M3 because it would also reject the legitimate identity ops and the admin-connection verification tests, and risk the auth flow. | Acceptable for M3; logged as a future hardening option. |
| **D-M3-2** | **Identity reads will break under `leados_app` + RLS.** Several auth ops legitimately read tenant tables **without** a single-org GUC: `getActiveMemberships` (login discovery across a user's orgs), `findRefreshTokenByHash` (opaque-token lookup), `listSessions`/`revokeAllUserSessions` (per-user across orgs). Under RLS as `leados_app` these return **0 rows** (missing-safe deny). So **before the connection switch**, login/refresh/session discovery needs a strategy: a `SECURITY DEFINER` lookup, the `leados_platform_admin` (BYPASSRLS) role for identity discovery, or a user→orgs index outside RLS. | **Forward risk for the connection switch** (not M3 scope). Flag for the milestone that performs the switch (after M3, gated by D2). |
| **D-M3-3** | `createRefreshToken` / `getMembershipRole` now open a `withTenant` transaction per call (one extra tx during login/refresh). Negligible per the M1 benchmark (p95 0.445 ms). | Monitor; a read-only fast path could be added if a hot path needs it (TD-M2-3 territory). |
| D-M3-4 | `refresh_tokens.family` is a **uuid** column (not free text) — surfaced while writing the test. Production already generates uuid families; no code defect. | Informational. |

---

## 7. Readiness for M4 (E4: RBAC Enforcement) — ✅ READY

| Entry criterion | Status |
|---|---|
| `TenantContext` carries the request's org/user/role (with `permissions`/`ownOnly` reserved) | ✅ in place since M2; RBAC populates the reserved fields |
| Roles + permission rows seeded at org bootstrap (RBAC enforcement consumes these) | ✅ delivered in S2 |
| Tenant data layer + scope guard available for permission-resolution reads | ✅ delivered in M3 |
| `requirePermission` exists as a stub to promote to real enforcement | ✅ present |
| Membership cache present (RBAC-2.4 adds **active invalidation** — the MT-2/SEC-M2-2 fix) | ✅ cache in place; invalidation is M4 |

**M4 (E4: RBAC) is clear to begin.** Recommended start: RBAC-2.1 (permission resolution from roles → `PermissionKey[]`, with `ownOnly` detection, populating `TenantContext`) → RBAC-2.2 (promote `requirePermission` to real enforcement + own-only filtering) → RBAC-2.3 (role-assignment endpoints) → RBAC-2.4 (**active membership/permission cache invalidation**, closing MT-2/SEC-M2-2).

> Carry-forward to the connection-switch milestone (not M4 unless bundled): resolve **D-M3-2** (identity reads under RLS) before switching the runtime to `leados_app`.

---

*Implementation review — M3 (E3) only. No E4+ code, no architecture changes, runtime connection unchanged, no acceptance criteria skipped.*
