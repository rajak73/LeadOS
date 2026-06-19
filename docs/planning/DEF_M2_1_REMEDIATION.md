# DEF_M2_1_REMEDIATION.md

> **DEF-M2-1 — Cross-tenant row reassignment via update data — remediation**
> Engineer: Platform · Date: 2026-06-19
> Closes the gap identified in `SPRINT_3_M2_AUDIT.md` §3. Scope: **the tenant extension only.** No M3, no connection switch, no architecture change.
> References: `SPRINT_3_M2_AUDIT.md`, `SPRINT_3_M2_REVIEW.md`, `FINAL_ARCHITECTURE.md` §2.1.

---

## 1. Root Cause

The tenant extension (`injectTenant`) scoped **`where`** on every operation but did not constrain the **mutation payload (`data`)** on writes:

- `update` / `updateMany` were treated as plain `where`-ops (members of `WHERE_OPS`) — only the filter was injected, the `data` was passed through untouched.
- `upsert` pinned `where` and the `create` branch, but **not** the `update` branch.
- Neither path considered the **`organization` relation** (`organization: { connect: { id } }`) as a second route to set the tenant FK.

So a caller scoped to org A could change a row's owner — by `data.organizationId = B` (scalar) or `data.organization.connect = B` (relation) — while the `where` stayed correctly scoped to A. This realizes only a *partial* §2.1 P0-2 ("every write is scoped → no cross-tenant update"): the row you can target is scoped, but **which org it lands in was not**. In production this was masked solely by RLS `WITH CHECK` — which is **inactive while the runtime connects as the RLS-bypassing admin role** (the D2 window through M2–M3), leaving the app layer unguarded.

---

## 2. Code Changes

Two source files (+ tests). No schema/migration/architecture change.

### `apps/api/src/core/tenancy/tenant-tables.ts`
Added `TENANT_RELATION = 'organization'` — the relation field that also sets the tenant FK (uniform across tenant models; a no-op for `refresh_tokens`, which carries only the scalar).

### `apps/api/src/core/tenancy/tenant-extension.ts`
Write-data is now pinned on **all** write paths; `update`/`updateMany` are pulled out of `WHERE_OPS` into explicit cases:

| Path | Before | After |
|---|---|---|
| `create`, `createMany`, `createManyAndReturn` | force `organizationId` | force `organizationId` **+ strip `organization` relation** |
| `update`, `updateMany` | `where` only | `where` **+ strip relation + override `organizationId`→active org if present** |
| `upsert` | `where` + `create` | `where` + `create` (force) **+ `update` (strip relation, override scalar)** |
| `delete`, `deleteMany`, `find*`, `count`, `aggregate`, `groupBy` | `where` only | `where` only (unchanged) |

Helper functions added: `stripTenantRelation` (removes the relation key), `forceTenantOnCreate` (strip relation + set scalar — create side), `pinTenantOnUpdate` (strip relation + override scalar **if present** — update side). Benign updates that never touch the tenant are left **untouched** (no redundant column write), so normal writes are unaffected.

> Design note: create paths **force** the scalar (the row is born into the tenant); update paths **override only if the caller attempts to set it** (the row already belongs to the tenant via the scoped `where`). Both make reassignment impossible; the asymmetry avoids writing `organizationId` on every benign update.

### Tests
- `apps/api/src/core/tenancy/tenant-extension.test.ts` — **+6 unit tests** (scalar override on update/updateMany/upsert; relation strip on update/create; benign update untouched).
- `apps/api/tests/integration/tenancy.reassignment.test.ts` — **new, 5 tests** proving reassignment is impossible end-to-end.

---

## 3. Before / After Behavior

**The attack (scoped to org A, target one of A's own rows):**

| Vector | Before | After |
|---|---|---|
| `update({ where:{id}, data:{ organizationId: B } })` | row moved to **B** (admin conn; RLS bypassed) | scalar overridden → row **stays in A** |
| `update({ where:{id}, data:{ organization:{connect:{id:B}} } })` | row moved to **B** | relation stripped → row **stays in A** |
| `updateMany({ where:{}, data:{ organizationId: B } })` | A's rows moved to **B** | all rows **stay in A**; B gains nothing |
| `upsert` update branch reassignment | row moved to **B** | row **stays in A** |
| benign `update({ data:{ name } })` | works | **still works** (no regression) |

**Audit reproduction, re-checked:** in `SPRINT_3_M2_AUDIT.md` the extension-shaped `UPDATE … SET "organizationId"=B WHERE id=R AND "organizationId"=A` executed with **no error on the admin connection** (reassigning the row). The new integration test issues the equivalent through the **fixed extension on the same admin connection** and asserts `roleOrg(roleX) === orgX` — i.e. the row is **not** reassigned. The fix holds **without** relying on RLS (proven with RLS bypassed).

---

## 4. Validation Evidence

| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ 4/4 |
| `pnpm lint` | ✅ 4/4 |
| `pnpm build` | ✅ 3/3 |
| `pnpm test` (api, CI-mirror) | ✅ **158 passed / 1 skipped** (was 147 → +11: 6 unit + 5 integration) |
| `pnpm test:coverage` (api) | ✅ **77.95 / 85.66 / 74.46 / 77.95** — all ≥ 60 floor (up from 77.61) |
| **Auth flows** (register/login/refresh over real DB) | ✅ still pass (register 201, login + refresh green) |
| **D2 compliance** | ✅ runtime unchanged — `withTenant` still uses the admin `prisma` singleton; the reassignment proof runs on that RLS-bypassing connection to demonstrate the **app-layer** fix |

> Flake note (honest): the first cold `turbo test:coverage` run exited non-zero once (a transient DB connection hiccup on a cold parallel run); the direct `vitest --coverage` run and an immediate turbo re-run both passed deterministically (158 passed, 77.95% coverage). Not a code defect; coverage numbers unaffected.

**Targeted suite proof:**
```
tenant-extension.test.ts        28 passed   (22 prior + 6 new write-pinning)
tenancy.reassignment.test.ts     5 passed   (scalar / relation / updateMany / upsert / benign)
tenancy.withTenant.test.ts       7 passed   (unchanged — no regression)
```

---

## 5. Constraints Honored

- ✅ **No M3 work** — change is confined to the existing extension + its tests.
- ✅ **No connection switch** — runtime still connects as admin; the fix is proven independent of RLS.
- ✅ **No architecture change** — this *completes* the §2.1 P0-2 app-layer guarantee that was partially implemented; no design decision altered.
- ✅ **Auth flows passing** — verified.
- ✅ Deny-by-default and all prior isolation behavior preserved.

---

## 6. M2 Pass Recommendation

**Recommend upgrading the Sprint 3 M2 isolation verdict from CONDITIONAL PASS → PASS.**

DEF-M2-1 — the one defect that made the M2 audit *conditional* — is now closed at the application layer and proven on the RLS-bypassing connection, so tenant rows cannot be reassigned through any application-layer write (scalar or relation), with or without the RLS backstop. The two remaining M2-audit items are **not** isolation defects and remain correctly scheduled:

- **TD-M2-2** (no end-to-end `tenantMiddleware` integration test) — test-depth, fold into M3.
- **SEC-M2-2 / MT-2** (membership positive-cache active invalidation) — deferred to **M4 (RBAC-2.4)** by plan.

Neither blocks M3. With DEF-M2-1 closed, **M2 (E2) is recommended as PASS**; M3 (E3) may proceed, picking up TD-M2-1 (org-free create typing) and TD-M2-2 early as previously planned.

*Remediation only — scoped to the tenant extension. No M3, no connection switch, no architecture change, no commits.*
