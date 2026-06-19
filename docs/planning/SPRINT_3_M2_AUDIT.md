# SPRINT_3_M2_AUDIT.md

> **Sprint 3 — Milestone 2 (E2: Tenant Context & Unit-of-Work) — independent audit**
> Auditor: Engineering Manager, LeadOS · Date: 2026-06-19
> Method: read-only, evidence-based. Gates re-run from scratch; code re-read; the headline security finding reproduced against the live database. Companion to `SPRINT_3_M2_REVIEW.md` (the implementer's review) — verified independently, not taken on trust.
> References: `SPRINT_3_EXECUTION_PLAN.md`, `SPRINT_3_M1_REVIEW.md`, `SPRINT_3_M2_REVIEW.md`, `FINAL_ARCHITECTURE.md` §2.

---

## Executive Verdict

### ⚠️ CONDITIONAL PASS — completion **95%**

All four M2 tasks are delivered, tested, and green on every gate; the mechanism matches `FINAL_ARCHITECTURE.md` §2.1; the D2 sequencing constraint is honored and existing auth flows are intact. It is **conditional** because of **one verified app-layer isolation gap** (DEF-M2-1: tenant not pinned in update/upsert *data*), plus a test-depth gap and a known interim membership-cache staleness window. None block M3 development; all are tracked below.

| Dimension | Result |
|---|---|
| Task completeness (TEN-2.1…2.4) | 4/4 delivered |
| Architecture compliance (§2.1/§2.4) | High — one **incomplete** app-layer sub-behavior (write-data pinning) |
| Validation gates | ✅ all green (independently re-run) |
| D2 compliance | ✅ runtime still admin; not switched to `leados_app` |
| Auth compatibility | ✅ register/login/refresh pass |
| Security | ⚠️ 1 medium (DEF-M2-1, mitigated post-switch) + 1 tracked interim (MT-2) |

---

## 1. Gate Verification (re-run from scratch, this audit)

| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ 4/4 |
| `pnpm lint` | ✅ 4/4 |
| `pnpm build` | ✅ 3/3 |
| `pnpm test` (api, CI-mirror) | ✅ **147 passed / 1 skipped** (skip = Redis doc-placeholder) |
| `pnpm test:coverage` (api) | ✅ **77.61 / 85.87 / 73.91 / 77.61** — all ≥ 60 floor |

The M2 review's reported numbers are accurate.

---

## 2. Task-by-Task Validation

### TEN-2.1 `withTenant` — ✅ correct
Matches §2.1: a single interactive `$transaction`; **first statement** is `set_config('app.current_organization_id', $1, true)` (SET LOCAL, transaction-scoped → connection-pinned); `organizationId` is **parameterized** (`$1`) and the GUC name is a constant, so no injection vector; atomic (rollback-on-throw proven by integration test). Note (TD): always opens a transaction, even for a single read.

### TEN-2.2 tenant extension — ⚠️ correct for reads/creates; **incomplete for write-data**
- ✅ `injectTenant` is pure and unit-tested across the full op matrix; deny-by-default throws `TenantScopeError` for any unhandled op; non-tenant models pass through; caller-supplied `organizationId` in `where`/create-`data` is **overridden** (can't escape tenant on read/create).
- ⚠️ **Gap (DEF-M2-1):** for `update`/`updateMany`/`upsert`, the extension injects the tenant column into `where` but **not into `data`**. It therefore does not prevent a write from *reassigning* a row to another org via `data.organizationId`. See §3.

### TEN-2.3 `TenantContext` (AsyncLocalStorage) — ✅ correct
`run`/`get`/`require` semantics correct; **async propagation across awaits** unit-tested; nested-scope isolation verified. `permissions`/`ownOnly` correctly reserved (unset) for M4.

### TEN-2.4 `tenantMiddleware` — ✅ functionally correct; ⚠️ test-depth gap
DI-built; unauth pass-through; member → context + `next()`; non-member → 403; validator error forwarded; positive-only cache, Redis-blip-tolerant (falls through to DB). **Gap (TD-M2-2):** no end-to-end integration test drives a real JWT through the assembled app to assert 403/200 + context-in-route; the production wiring (`prismaMembershipLookup`, `redisMembershipCache`, the exported singleton) is therefore not exercised by tests.

---

## 3. Defects

### DEF-M2-1 — Cross-tenant row reassignment via update `data` (Medium, security) — **VERIFIED**

The extension scopes `where` but not `data` on writes, so a caller scoped to org A can move one of A's own rows into org B by setting `data.organizationId = B`. On the **M2 runtime (admin connection, RLS bypassed)** this is unguarded.

**Reproduced live** (seed role R in org A, then the extension-shaped statement `UPDATE roles SET "organizationId"=B WHERE id=R AND "organizationId"=A`):
- **As admin (M2 runtime):** executed **with no error** → row reassigned to org B.
- **As `leados_app` (post-switch, GUC=A):** identical statement **rejected** — `new row violates row-level security policy for table "roles"` (RLS `WITH CHECK`).

**Assessment:** this is a *partial* realization of §2.1 P0-2 ("every operation incl. writes is scoped → no cross-tenant update") at the **app layer**. The database backstop (RLS `WITH CHECK`) fully closes it — **but only after the runtime connects as `leados_app`**, which (per D2) has not happened and is not scheduled until late M3+. So a window exists across M2–M3 where this is unguarded.
**Reachability:** realistic only if application code passes `organizationId` in an update payload (uncommon in normal code), but it is an unguarded path and violates defense-in-depth.
**Recommended fix (M3):** have the extension **pin/strip `organizationId` in `update`/`updateMany`/`upsert` `data`** (override to the active tenant, or delete the key so it cannot be set), independent of the RLS backstop. Cheap, and it makes the app layer match the §2.1 intent now rather than relying solely on the connection switch.

---

## 4. Technical Debt

| ID | Item | Priority |
|---|---|---|
| TD-M2-1 | **Create typing DX gap** (D-M2-1): the extension injects `organizationId` at runtime, but Prisma's `create`/`createMany` input still *requires* it — org-free creates don't typecheck (tests cast). Fix at the M3 tenant-repository typing layer. | Medium |
| TD-M2-2 | **No end-to-end `tenantMiddleware` integration test** (real JWT → 403/200 + context in a route); production wiring (`prismaMembershipLookup`, `redisMembershipCache`, exported middleware) uncovered. | Medium |
| TD-M2-3 | `withTenant` always opens a transaction, even for single reads. Negligible now (M1 benchmark p95 0.445 ms); add a read-only fast path only if a hot path needs it. | Low |
| TD-M2-4 | Interactive-transaction default timeout (~5 s) not configurable in `withTenant`; a long unit of work could time out. | Low |

---

## 5. Architectural Deviations

**None material.** The mechanism (GUC via SET LOCAL as the first statement + an all-operations deny-by-default extension + RLS backstop) is faithful to §2.1. The only divergence is that the app-layer write-scoping is **incomplete** (DEF-M2-1) — the design's full guarantee is still met *via RLS*, but only after the `leados_app` switch; the app-layer half should be completed for defense-in-depth. This is an implementation completeness gap, not a design change.

---

## 6. Security Concerns

| ID | Concern | Severity | Window / Mitigation |
|---|---|---|---|
| SEC-M2-1 | Cross-tenant row reassignment via update `data` (= DEF-M2-1) | Medium | Unguarded on the admin connection through M2–M3; closed by RLS once switched to `leados_app`. Recommend pinning data in the extension now. |
| SEC-M2-2 | **MT-2 staleness reopened.** Positive membership is cached 5 min with **no active invalidation** — a suspended/removed member stays valid for ≤5 min. §2.4 explicitly wants this closed (active invalidation on revocation). | Medium | Deferred to **M4 (RBAC-2.4)** per plan ordering; bounded to 5 min; negatives are not cached. Tracked, consistent with the plan. |
| SEC-M2-3 | GUC value not validated as a UUID before `set_config` | Low (note) | Safe-by-failure (an invalid value fails the RLS `::uuid` cast → deny) and `organizationId` originates from a signed JWT. No action. |

No secrets exposure, no injection vector (GUC name constant, org id parameterized), no new high/critical dependency advisory.

---

## 7. D2 Compliance & Auth Compatibility (explicit checks)

- **D2 sequencing — ✅ compliant.** `withTenant` uses the admin `prisma` singleton (`DATABASE_URL` = `leados`); `DATABASE_APP_URL` (`leados_app`) is referenced only by tests/scripts. No runtime path connects as `leados_app`, and no existing tenant write was forced under RLS. The connection switch correctly has **not** happened.
- **Auth compatibility — ✅ intact.** `register` (201 over real DB), `login`, and `refresh` suites all pass. Auth routes are public (mounted before the `/api/v1` chain), so the now-real `tenantMiddleware` does not touch them.
- **Tenant isolation — ✅ for reads/creates** (integration-proven: reads scoped, can't escape via `where`, auto-inject on create, cross-org delete can't reach another org, rollback-on-throw); ⚠️ **incomplete for update-`data`** (DEF-M2-1).
- **Deny-by-default — ✅ enforced** (unit-proven: unscopable op throws `TenantScopeError`).

---

## 8. M3 Readiness Assessment — ✅ READY (with two carry-ins)

M3 (E3: Tenant-Aware Data Layer) is cleared to begin; `withTenant` + extension + context + middleware are the primitives it builds on. Two items should be sequenced **early in M3**:

1. **Fix DEF-M2-1** — pin/strip `organizationId` in update/upsert `data` in the extension (defense-in-depth that does not wait on the connection switch), **and/or** ensure the `leados_app` switch precedes exposing any update-data path. Because the runtime stays admin through M3, the extension fix is the safer of the two.
2. **Resolve TD-M2-1** at the repository typing layer (org-free create signatures) — the stated first task of E3 (TEN-3.2.1).

Then proceed with TEN-3.2.2 (migrate auth bootstrap/login writes onto `withTenant`) → TEN-3.2.3 (service guard) → only afterward the runtime connection switch. The D2 constraint remains in force until every tenant write is wrapped.

---

## 9. Score Summary

| Dimension | Score |
|---|---|
| Completion (TEN-2.1…2.4) | **95%** (one incomplete extension sub-behavior) |
| Architecture compliance | High (no design deviation; one app-layer completeness gap) |
| Validation gates | ✅ all green |
| Security | ⚠️ 1 medium (mitigated post-switch) + 1 tracked interim |
| **Verdict** | **⚠️ CONDITIONAL PASS** |

**Condition to clear to FULL:** fix DEF-M2-1 (extension write-data pinning) and add the end-to-end `tenantMiddleware` integration test (TD-M2-2). Both fit naturally into M3; neither blocks starting M3.

*Audit only — no code, no implementation, no commits.*
