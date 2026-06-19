# TD_M2_2_REMEDIATION.md

> **TD-M2-2 — End-to-end `tenantMiddleware` integration test — remediation**
> Engineer: Platform · Date: 2026-06-19
> Closes the sole remaining FULL-PASS condition from `SPRINT_3_M2_FINAL_SIGNOFF.md`. Scope: **test-only.** No production code, no architecture change, no M3, no connection switch, no RBAC.
> References: `SPRINT_3_M2_FINAL_SIGNOFF.md`, `SPRINT_3_M2_REVIEW.md`, `FINAL_ARCHITECTURE.md` §2.

---

## 1. Goal

The M2 audit/sign-off held FULL PASS on one item: the production `tenantMiddleware` wiring (real JWT → `authMiddleware` → `CachedMembershipValidator` → `prismaMembershipLookup` via `withTenant` → `TenantContext` → route) was unit-tested with fakes but never exercised **end-to-end**. This adds that test.

---

## 2. Files Changed

**New (test only)**
```
apps/api/tests/integration/tenant.middleware.e2e.test.ts   end-to-end tenantMiddleware (5 tests)
```
**No production code changed.** The test drives the real, already-shipped middleware singletons — it adds coverage, not behavior.

---

## 3. Tests Added (5)

DB-gated integration suite (executes in CI via the DEF-3 guard; Redis optional — the validator falls through to the DB when the cache is unavailable). It seeds a real org + user + `OWNER` role + **ACTIVE** `organization_member`, plus a second org with **no** membership, and signs **real JWTs** with `signAccessToken`.

| Test | Asserts |
|---|---|
| member request → 200 | a member's token through the **real `/api/v1/ping`** (full `buildApp()` chain) returns 200 (`pong: true`) |
| non-member request → 403 | a token for an org the user is not a member of is rejected with 403 |
| **TenantContext reaches the handler** | a probe app composing the **real `authMiddleware` + real `tenantMiddleware`** exposes `getTenantContext()` to its handler; asserts `organizationId` / `userId` / `role` match the token claims |
| non-member rejected before handler | the probe handler is never reached for a non-member (403) |
| unauthenticated passes through | no token → no `req.auth` → `tenantMiddleware` passes through, handler runs with **no** tenant context (membership-gating applies only to authenticated requests; downstream guards enforce auth) |

This exercises exactly the wiring TD-M2-2 flagged as uncovered: `prismaMembershipLookup` (DB membership read through `withTenant`), the Redis cache adapter (with graceful fall-through), the exported `tenantMiddleware` singleton, the 403 path, and `TenantContext` propagation into a real handler.

---

## 4. Validation Evidence

| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ 4/4 |
| `pnpm lint` | ✅ 4/4 |
| `pnpm build` | ✅ 3/3 |
| `pnpm test` (api, CI-mirror) | ✅ **163 passed / 1 skipped** (+5 vs prior 158) |
| `pnpm test:coverage` (api) | ✅ **78.38 / 85.81 / 76.59 / 78.38** — all ≥ 60 floor; **up from 77.95 / 85.66 / 74.46 / 77.95** |
| Existing auth flows (register/login/refresh) | ✅ still pass |

The coverage rise — notably **functions 74.46% → 76.59%** — reflects the now-exercised production middleware wiring (`tenantMiddleware` singleton, `prismaMembershipLookup`, the Redis cache adapter) that was previously only reached via fakes.

> Note: when Redis is down locally, the validator logs an ioredis "error event" to stderr and falls through to the DB (the documented Redis-blip tolerance) — tests pass; in CI (Redis up) the path is cache-backed and silent.

---

## 5. Constraints Honored

- ✅ **Test-only** — no production code, **no architecture change**.
- ✅ **No M3** — no repository layer, no schema work.
- ✅ **No runtime connection switch** — `withTenant` (used by the membership lookup) still uses the admin `prisma` singleton.
- ✅ **No RBAC work** — `requirePermission` remains the existing stub; the e2e path passes through it unchanged.
- ✅ Used the existing `/api/v1/ping` route for the 200/403 assertions; a minimal probe app (composing the **real** middleware) was added only to assert context contents, since `ping` does not expose the context.

---

## 6. M2 FULL PASS Recommendation

**Recommend upgrading Sprint 3 Milestone 2 from CONDITIONAL PASS → FULL PASS.**

Both FULL-PASS conditions the M2 audit set are now met:

| Condition | Status |
|---|---|
| (1) DEF-M2-1 fixed (extension write-data pinning) | ✅ closed + verified (`DEF_M2_1_REMEDIATION.md`) |
| (2) End-to-end `tenantMiddleware` integration test (TD-M2-2) | ✅ **added here** |

M2 now has **zero open defects**, all acceptance criteria met, all gates green, and both the isolation guarantee and the membership-gating wiring proven end-to-end. The remaining technical debt is non-blocking and correctly scheduled: **TD-M2-1** (org-free create typing) → M3 (TEN-3.2.1); **TD-M2-3/TD-M2-4** (always-tx, tx timeout) → low/later; **SEC-M2-2 / MT-2** (membership active cache invalidation) → M4 (RBAC-2.4) per `FINAL_ARCHITECTURE.md` §2.4.

**M2 (E2) = FULL PASS recommended. M3 (E3) is clear to begin.**

*Remediation only — test addition. No production code, no architecture change, no commits.*
