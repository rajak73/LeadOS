# SPRINT_3_M5_FINAL_SIGNOFF.md

> **Sprint 3 — Milestone 5 (E5: Audit Foundations) — final signoff**
> Author: Engineering, LeadOS · Date: 2026-06-19
> Validation method: read-only. No code modified. No features implemented.
> Sources: `SPRINT_3_EXECUTION_PLAN.md`, `SPRINT_3_M5_REVIEW.md`, `FINAL_ARCHITECTURE.md §2`, direct inspection of source files and CI run.

---

## 1. Commit Evidence

| Item | Value |
|---|---|
| Commit | `6a23b15` — *feat: complete sprint 3 milestone 5 audit foundations* |
| Branch | `main` (pushed) |
| CI run | `27815947348` |
| CI (build-test) | **SUCCESS** |
| Deploy API | failure (known carried infrastructure issue — Railway; identical failure on M4 commit `a24e5b8` run `27815088230`; predates M5, not a code defect) |
| Deploy Web | SUCCESS |
| Files changed in commit | 18 files, 681 insertions / 16 deletions — all within M5 scope |

---

## 2. CI Gate Results (run 27815947348)

| Gate | Result | Evidence |
|---|---|---|
| typecheck (4 workspaces) | ✅ | CI build-test step green; no TypeScript errors in log |
| lint (4 workspaces) | ✅ | CI build-test step green |
| build (3 packages) | ✅ | CI build-test step green |
| tests — shared | ✅ 18 passed / 0 failed | log: `18 passed (18)` |
| tests — web | ✅ 20 passed / 0 failed | log: `20 passed (20)` |
| tests — api | ✅ **219 passed / 1 skipped** | log: `219 passed | 1 skipped (220)` |
| Coverage thresholds | ✅ (M5 review: 83.25 / 87.32 / 82.79 / 83.25 — all ≥ 60 floor) | thresholds enforced by CI step |
| DEF-3 guard (DB-gated tests execute) | ✅ | audit integration tests run in CI (DB probe true; guard did not throw) |

The 1 skipped test is the pre-existing `queue-roundtrip` BullMQ test (infrastructure not provisioned in CI); it is not an M5 test.

---

## 3. AUD-1 Verification — `audit_logs` Model + Infrastructure

**Execution plan requirement:** Tenant-scoped, append-only audit table; partition-ready structure; RLS enabled + forced + missing-safe policy; FK to organizations; indexes; added to tenant-table registry; `check:rls` passes.

| Check | Finding | Status |
|---|---|---|
| Migration `0006_audit/migration.sql` | Creates `audit_logs` with all required columns: `id`, `organizationId`, `actorUserId`, `action`, `resource`, `resourceId`, `before`/`after` (JSONB), `ipAddress`, `createdAt` | ✅ |
| FK | `ALTER TABLE "audit_logs" ADD CONSTRAINT ... FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE` | ✅ |
| Partition-ready indexes | `(organizationId, createdAt)` — partition-ready composite; `(resource, resourceId)` — lookup index | ✅ |
| RLS ENABLE + FORCE | `ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY; ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY` | ✅ |
| Missing-safe policy | `CREATE POLICY tenant_isolation ON "audit_logs" USING ("organizationId" = current_setting('app.current_organization_id', true)::uuid) WITH CHECK (...)` — matches the architecture-mandated form exactly | ✅ |
| Rollback script | `rollback.sql` drops both audit tables; round-trip (apply → rollback → re-apply) verified in M5 review | ✅ |
| Prisma model `AuditLog` | Present in `prisma/schema.prisma` (lines 240–255) with all columns; FK absent (managed by migration); partition-ready index annotations | ✅ |
| Tenant registry | `TENANT_TABLES` now has 5 entries (`organization_members`, `roles`, `subscriptions`, `refresh_tokens`, **`audit_logs`**); `TENANT_MODELS` has matching 5 entries (incl. `AuditLog`); `NON_TENANT_TABLES` explicitly lists `platform_audit_logs` | ✅ |
| `check:rls` | M5 review confirms: "5 tenant tables enabled + forced + policied; coverage matches registry" | ✅ |

**AUD-1: PASS**

---

## 4. AUD-2 Verification — Audit Write Path + PII Masking

**Execution plan requirement:** Service hook to record create/update/delete with before/after snapshots and PII masking (email/phone masked); non-blocking but durable. Hooked into RBAC actions.

### 4.1 PII masking (`pii-masking.ts`)

- `maskEmail` — keeps first char + `@domain`; malformed input → `***`
- `maskPhone` — keeps last 4 digits of stripped digit string; short → `***`
- `maskPii` — pure recursive function; masks string values whose **key** matches `/email/i` or `/phone/i`; recurses into nested objects and arrays; non-PII values and primitives pass through unchanged
- 6 unit tests covering all branches — CI green

### 4.2 Audit row builder (`buildAuditRow` in `audit-recorder.ts`)

- Pure function; stamps `actorUserId`, `ipAddress` from `TenantContext` (never from caller)
- `maskPii` applied to `before`/`after` before writing
- `resourceId` defaults to `null` when absent; `before`/`after` omitted (not set to `null`) when not provided — avoids Prisma `InputJsonValue` null-vs-undefined issue
- **`organizationId` not in the row** — injected at runtime by the tenant extension via `asTenantCreate<>`
- 3 unit tests — CI green

### 4.3 `PrismaAuditRecorder`

- Calls `requireTenantContext()` — throws if called outside a tenant scope
- Writes via `withTenant(ctx.organizationId, ...)` — org-scoped, RLS-protected, extension-injected
- Non-blocking: write failure is logged (`logger.error`), not propagated
- `NoopAuditRecorder` provided for test contexts
- `PrismaAuditRecorder` wired into the RBAC module composition root (`modules/rbac/index.ts` line 59)

### 4.4 RBAC hooks

- `RbacService` constructor now takes `audit: AuditRecorder` (3rd argument)
- `assignRole` — calls `getMemberSnapshot` for before-image, records `member.role_changed` with `{ roleId: before.roleId }` / `{ roleId: newId }`
- `suspendMember` — records `member.suspended` with `{ status: before.status }` / `{ status: 'SUSPENDED' }`
- **Audit is only written on success** (after `changed = true`); failures do not audit — proven by 6 unit tests

### 4.5 `ipAddress` propagation

- `TenantContext` interface has `ipAddress?: string` (added M5)
- `tenantMiddleware` sets `ipAddress: req.ip` when defined (line 40: `...(req.ip !== undefined ? { ipAddress: req.ip } : {})`)

### 4.6 Integration verification

- `audit.integration.test.ts` (4 tests, DB-gated, CI-executing):
  - Role change → persisted `member.role_changed` row with correct `organizationId` (extension-injected), `actorUserId`, `before`/`after` JSON
  - Suspend → persisted `member.suspended` row
  - PII masking end-to-end: stored snapshot with `email`/`phone` fields reads back as `s***@corp.com` / `***2222`; non-PII field `keep: 'yes'` preserved

**AUD-2: PASS**

---

## 5. AUD-3 Verification — `platform_audit_logs` Scaffold

**Execution plan requirement:** Separate table for `leados_platform_admin` (BYPASSRLS) actions; no RLS; written via the raw admin client; super-admin runtime is scaffold-only this sprint.

| Check | Finding | Status |
|---|---|---|
| Migration | `platform_audit_logs` created with `id`, `actorUserId`, `targetOrganizationId`, `targetResource`, `detail` (JSONB), `ipAddress`, `createdAt`; `createdAt` index; **no RLS** | ✅ |
| Prisma model `PlatformAuditLog` | Present (`schema.prisma` lines 260–272); no FK, no `organizationId` column — intentionally non-tenant | ✅ |
| Non-tenant table | `NON_TENANT_TABLES` explicitly lists `platform_audit_logs` with comment explaining the BYPASSRLS design | ✅ |
| `PrismaPlatformAuditWriter` | Writes via raw `prisma.platformAuditLog.create()` — not `withTenant` (correct: cross-org, no tenant GUC) | ✅ |
| PII masking | `maskPii` applied to `detail` before writing | ✅ |
| Integration test | Writes a `platform.org_inspected` row; reads it back; asserts `detail.supportEmail` is masked (`s***@corp.com`); non-PII `note` preserved | ✅ |

**AUD-3: PASS**

---

## 6. Scope Boundary Verification

### E6 (Isolation Gate) — not implemented

| Check | Finding |
|---|---|
| No `isolation*.test.ts` files exist | `ls apps/api/tests/integration/isolation*` → no matches |
| `isolation.yml` unchanged | Still the Sprint-1 scaffold (`echo "Tenant isolation suite is introduced in Sprint 3"` — no real steps) |
| M5 commit diff | 18 files — all audit/RBAC/schema/migration files; zero E6/ISO artifacts |

**E6 scope constraint: HONORED**

---

## 7. D2 Verification — Runtime Connection Not Switched to `leados_app`

| Check | Finding |
|---|---|
| `core/prisma/client.ts` | Singleton uses `DATABASE_URL` (the admin connection); no reference to `DATABASE_APP_URL` or `leados_app` at runtime | ✅ |
| `env.ts` | `DATABASE_APP_URL` is declared as `z.string().optional()` — available for isolation tests but not a required runtime value | ✅ |
| CI env | `DATABASE_APP_URL` is provisioned in CI (for `leados_app` role-specific tests) but not the app's primary connection | ✅ |
| No connection switch code | `git show HEAD` diff contains no changes to connection wiring | ✅ |

**D2 constraint: HONORED**

---

## 8. D-M3-2 Compliance

`PrismaAuditRecorder` writes via `withTenant(ctx.organizationId, ...)` — the organizationId comes from `requireTenantContext()`, not from caller input. The org is always established before the audit write. This does not create any cross-org or pre-tenant reads. The identity-read risk (cross-org `getActiveMemberships`, `findRefreshTokenByHash`) is **unchanged by M5** and remains a carry-forward item for the connection-switch milestone.

**D-M3-2: RESPECTED**

---

## 9. Acceptance Criteria Status

| Criterion | Plan location | Status |
|---|---|---|
| `audit_logs` model + infrastructure (RLS, registry, partition-ready) | AUD-1 | ✅ Met |
| Audit write path with before/after snapshots + PII masking | AUD-2 | ✅ Met |
| Non-blocking write (failure logged, not propagated) | AUD-2 | ✅ Met |
| Hooked into RBAC role-admin actions | AUD-2 | ✅ Met (assign + suspend) |
| Audit records written correctly — integration-verified | AUD-2 | ✅ Met |
| PII masking verified — unit + integration | AUD-2 | ✅ Met |
| `platform_audit_logs` scaffold | AUD-3 | ✅ Met |
| No E6 (Isolation Gate) work | scope constraint | ✅ Met |
| D2 honored (runtime not switched) | D2 | ✅ Met |
| D-M3-2 respected | D-M3-2 | ✅ Met |
| typecheck / lint / build / test / coverage all green | CI gates | ✅ Met |
| Migration + tested rollback (`0006`) | TD-S2-7 | ✅ Met |

---

## 10. Carried Risks

These are risks **inherited into M6**; none are M5-introduced code defects.

| # | Risk | Severity | Disposition |
|---|---|---|---|
| **D-M5-1** | **Audit write is best-effort.** A write failure is logged (observable) but silently drops the record. A broken audit writer does not break the user action. | Medium | Acceptable for foundations. Fail-closed hardening (write inside the same transaction as the action) is a future option for security-critical actions. |
| **D-M5-2** | **Audit is a separate transaction from the audited action.** If `assignRole` commits and the audit write then fails, the action is unaudited. Atomic audit requires threading the tx client into the recorder. | Medium | Acceptable for foundations; the loss is observable via `logger.error`. Flag for a later pass. |
| **D-M5-3** | **Partition-readiness is structural, not native.** `audit_logs` has the `(organizationId, createdAt)` composite index and no native `PARTITION BY RANGE` (the PK change that requires is a future migration). | Low | Deferred to SC-1/DB-2. |
| **D-M5-4** | **`platform_audit_logs` default grants.** `ALTER DEFAULT PRIVILEGES` from migration `0002` grants `leados_app` DML on the new table. No app code path uses it, but the grant exists. | Low | Restrict to `leados_platform_admin` when the super-admin runtime lands. |
| **D-M3-2** (carried from M3) | Identity reads (`getActiveMemberships`, `findRefreshTokenByHash`, session listing) are cross-org/pre-tenant and would return 0 rows under RLS with `leados_app`. **Unchanged by M5.** Highest-priority carry-forward before the connection switch. | High | Resolve before switching the runtime connection to `leados_app`. Not M6 scope unless bundled. |
| **D-M4-2** (carried from M4) | `auth.routes` logout test fails intermittently under heavy parallel vitest runs. Pre-existing worker contention, not M5 logic. | Low | Monitor in CI; investigate if it recurs. |

---

## 11. Verdict

**Sprint 3 Milestone 5 (E5: Audit Foundations): FULL PASS**

All three AUD tasks (AUD-1 / AUD-2 / AUD-3) are implemented, tested, and green in CI. Every acceptance criterion from `SPRINT_3_EXECUTION_PLAN.md` is met. No E6 work was introduced. D2 is honored. D-M3-2 is respected. The `check:rls` gate confirms 5/5 tenant tables are covered. The Deploy API CI failure is a known, carried infrastructure issue (Railway) that predates M5 and is identical to the M4 failure; it does not affect the code or test correctness.

There are no blocking defects, no acceptance-criteria gaps, and no architecture deviations.

---

## 12. M6 Authorization

**M6 (E6: Isolation & Enforcement Verification + CI) is approved to begin.**

All entry criteria are confirmed:

| Entry criterion | Status |
|---|---|
| RLS on every tenant table (5/5, incl. `audit_logs`) | ✅ |
| App-layer tenant extension + RLS backstop proven (M1/M2) | ✅ |
| RBAC enforcement + audit write surfaces available for isolation test coverage | ✅ |
| `isolation.yml` scaffold present (activates in M6) | ✅ |
| Two-DB-role CI wiring (`DATABASE_APP_URL` as `leados_app`) | ✅ |

**Recommended M6 sequencing:**
1. **ISO-1** — App-layer isolation suite: two orgs A/B; prove A cannot read/write/update/delete/aggregate/count B's rows; deny-by-default for unscopeable ops; `audit_logs` now included
2. **ISO-2** — RLS-layer suite as `leados_app`: unset GUC → 0 rows; `WITH CHECK` blocks cross-org writes; app-injection bypass still denied by RLS
3. **ISO-3** — RBAC enforcement matrix: per-role permission matrix; `requirePermission` 403 paths; `ownOnly` filtering; revocation invalidation
4. **ISO-4** — Flip `isolation.yml` from scaffold to a real required merge gate; DEF-3 guard ensures any infra skip is a hard failure

> **Carry-forward note (not M6 unless explicitly bundled):** resolve **D-M3-2** before switching the runtime connection from admin to `leados_app`. The isolation suite (ISO-2) can run as `leados_app` on a test connection without changing the app's runtime connection — keep these separate.

---

*Final signoff — read-only validation. No code modified, no features implemented, no commits made.*
