# SPRINT_3_M6_FINAL_SIGNOFF.md

> **Sprint 3 — Milestone 6 (E6: Isolation & Enforcement Verification + CI) — final signoff**
> Author: Engineering, LeadOS · Date: 2026-06-19
> Validation method: **read-only** — actual GitHub Actions logs for pushed commit. No code changes, no commits, no pushes.
> Source of truth: `SPRINT_3_EXECUTION_PLAN.md`, `FINAL_ARCHITECTURE.md §2`, `SPRINT_3_M6_REVIEW.md`, CI run logs.

---

## 1. Identity

| Field | Value |
|---|---|
| **Commit** | `4235aa310aa5b4bb31f839e454af187ce2746d84` |
| **Branch** | `main` |
| **CI run ID** | `27818177294` (workflow: CI) |
| **Isolation Suite run ID** | `27818177252` (workflow: Tenant Isolation Suite) |
| **Deploy Web run ID** | `27818177292` — success |
| **Deploy API run ID** | `27818177288` — failure (infrastructure; see §7) |
| **CI triggered at** | 2026-06-19T09:43:04Z |
| **CI completed at** | 2026-06-19T09:44:26Z (CI) / 2026-06-19T09:43:44Z (Isolation Suite) |

---

## 2. Workflow Results

### 2a. CI workflow (run 27818177294) — ✅ SUCCESS

| Step | Status |
|---|---|
| Install dependencies | ✅ |
| Apply migrations | ✅ |
| Build shared | ✅ |
| Typecheck | ✅ |
| Lint (incl. module-boundary rules) | ✅ |
| Test (unit + integration) with coverage thresholds | ✅ |
| Build | ✅ |
| Audit (fail on high/critical) | ✅ |
| Enum parity (shared ↔ prisma) | ✅ |
| Client secret-leak guard | ✅ |

All 15 steps concluded `success`. Job `build-test` → `success`. Overall workflow → **success**.

### 2b. Tenant Isolation Suite (run 27818177252) — ✅ SUCCESS

| Step | Status |
|---|---|
| Install dependencies | ✅ |
| Build shared package | ✅ |
| Apply migrations (creates leados_app + leados_platform_admin roles + RLS policies) | ✅ |
| Run isolation suite (ISO-1 / ISO-2 / ISO-3) | ✅ |
| Verify RLS coverage matches registry | ✅ |

Job `Isolation Suite (ISO-1 / ISO-2 / ISO-3)` → `success`. Overall workflow → **success**.

### 2c. Deploy Web (run 27818177292) — ✅ SUCCESS

### 2d. Deploy API (run 27818177288) — ❌ FAILURE (infrastructure — see §7)

---

## 3. Test Counts — Verified from CI Logs

### Full suite (CI run 27818177294, step: Test with coverage thresholds)

```
Test Files   42 passed (42)
Tests       273 passed | 1 skipped (274)
```

The 1 skipped test is the pre-existing `queue-roundtrip` BullMQ test that requires Redis locally and has always been skipped (it runs when Redis is available). It is not an isolation test.

### Isolation Suite (Isolation run 27818177252, step: Run isolation suite)

Raw log output (ANSI stripped):

```
✓ tests/integration/isolation.app.test.ts   (13 tests)  184ms
✓ tests/integration/isolation.rls.test.ts   (18 tests)  269ms
✓ tests/integration/isolation.rbac.test.ts  (23 tests)  289ms

Test Files  3 passed (3)
Tests      54 passed (54)
```

**Zero tests skipped. All 54 executed against real Postgres + Redis services.**

### Execution proof (DEF-3)

The isolation suite ran in CI where `CI=true` is set automatically by GitHub Actions. The DEF-3 guard in `tests/helpers/services.ts` converts any `isPostgresUp()` false return into a hard throw when `CI=true`. Because the suite returned 54 green results (not a throw and not 54 skips), this proves:

1. Postgres was reachable with both the admin connection (`DATABASE_URL`) and the `leados_app` NOBYPASSRLS connection (`DATABASE_APP_URL`).
2. RLS policies were active (applied by the `db:migrate` step preceding the test step).
3. Every ISO-1, ISO-2, and ISO-3 test body executed against real data, not a stub.

---

## 4. Coverage — Verified from CI Logs

Source: CI run `27818177294`, step "Test (unit + integration) with coverage thresholds", `@leados/api` workspace.

| Metric | CI Result | Floor | Status |
|---|---|---|---|
| Statements | **83.7%** (1710/2043) | 60% | ✅ |
| Branches | **88.24%** (368/417) | 60% | ✅ |
| Functions | **83.87%** (156/186) | 60% | ✅ |
| Lines | **83.7%** (1710/2043) | 60% | ✅ |

All four dimensions exceed the 60% floor. No coverage threshold failures.

---

## 5. check:rls — Verified from Isolation Suite Logs

Source: Isolation run `27818177252`, step "Verify RLS coverage matches registry".

```
RLS coverage check: OK — 5 tenant tables enabled + forced + policied; coverage matches registry.
```

All 5 tenant tables (`organization_members`, `roles`, `subscriptions`, `refresh_tokens`, `audit_logs`) confirmed: `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, and missing-safe policy present. Registry matches codebase.

---

## 6. Acceptance Criteria Verification

All criteria from `SPRINT_3_EXECUTION_PLAN.md §5`.

### ISO-1 — App-layer cross-tenant isolation

| Criterion | Evidence | Status |
|---|---|---|
| Two orgs A/B seeded and isolated in a single test run | `isolation.app.test.ts` beforeAll seeds orgA + orgB | ✅ |
| All ops covered: findMany, count, aggregate, groupBy, create, updateMany, deleteMany | 6 describe groups in ISO-1 | ✅ |
| Cross-org read returns 0 rows | findMany scoped to orgA = 2 rows, none from orgB; count targeting orgB's row id = 0 (extension adds orgA constraint) | ✅ |
| Cross-org updateMany → 0 affected, orgB row unchanged | ISO-1d: result.count = 0; admin verify shows name unchanged | ✅ |
| Cross-org deleteMany → 0 deleted, orgB row survives | ISO-1e: result.count = 0; admin verify shows row still exists | ✅ |
| Deny-by-default: unsupported ops throw TenantScopeError | ISO-1f: `injectTenant('findRaw', …)` / `executeRaw` / `unscopedCustomOp` → TenantScopeError | ✅ |
| Standard ops do NOT throw | ISO-1f: 15 standard ops verified no-throw | ✅ |
| Suite executed (not skipped) | CI log: 13 tests, 0 skipped | ✅ |

### ISO-2 — RLS-layer isolation (leados_app NOBYPASSRLS)

| Criterion | Evidence | Status |
|---|---|---|
| Connects as leados_app via DATABASE_APP_URL | `appPrisma = new PrismaClient({ datasourceUrl: DATABASE_APP_URL })` | ✅ |
| Unset GUC → 0 rows on all 5 tenant tables | ISO-2a: 5 separate tests, one per table, each expects 0 | ✅ |
| GUC=orgA → only orgA rows on all 5 tables | ISO-2b: 6 tests covering roles (×2), org_members, audit_logs, subscriptions, refresh_tokens | ✅ |
| WITH CHECK rejects cross-org insert | ISO-2c: roles insert for orgB under GUC=orgA → throws; org_members same | ✅ |
| Cross-org UPDATE/DELETE → 0 affected, target row unchanged | ISO-2d: updateMany/deleteMany on orgB roles = 0; raw UPDATE on orgB member = 0 | ✅ |
| Positive control: own-org writes succeed | ISO-2e: insert for orgA while GUC=orgA = success; update own row = 1 | ✅ |
| check:rls confirms policy coverage | 5/5 tables confirmed via `check:rls` script | ✅ |
| Suite executed (not skipped) | CI log: 18 tests, 0 skipped | ✅ |

### ISO-3 — RBAC enforcement matrix

| Criterion | Evidence | Status |
|---|---|---|
| All 4 system roles tested on all endpoints | OWNER/ADMIN/MANAGER/SALES_EXECUTIVE on /ping, /roles, /members/:id/role, /members/:id/suspend | ✅ |
| Unauthenticated → 401 | ISO-3a/b/c/d: no-token cases return 401 | ✅ |
| Non-member → 403 | ISO-3a: unknown userId token → 403 at tenantMiddleware | ✅ |
| Permission denials: MANAGER + SALES_EXECUTIVE blocked on team.update_role and team.suspend | ISO-3c/d: 4 tests return 403 | ✅ |
| Permission grants: OWNER + ADMIN pass team.update_role; OWNER passes team.suspend | ISO-3c/d: 3 tests return 200 | ✅ |
| Super-admin bypass: isSuperAdmin=true bypasses permission check | ISO-3e: MANAGER + isSuperAdmin=true → 200 on team.update_role endpoint | ✅ |
| Cache invalidation: role-change flushes cache; next request reflects new role | ISO-3f: SALES_EXECUTIVE promoted to OWNER → stale SALES token gains team.update_role → 200 | ✅ |
| Suspended member rejected at membership gate | ISO-3d: suspended target → GET /ping → 403 | ✅ |
| Suite executed (not skipped) | CI log: 23 tests, 0 skipped | ✅ |

### ISO-4 — Isolation gate activated

| Criterion | Evidence | Status |
|---|---|---|
| `isolation.yml` triggers on push to main | Workflow ran on commit `4235aa3` push | ✅ |
| Postgres 16-alpine + Redis 7-alpine services wired | Workflow YAML services block; migration step succeeded (required Postgres) | ✅ |
| `DATABASE_APP_URL` (leados_app) passed to test process | ISO-2 18 tests ran as leados_app and exercised RLS — proven by with-check rejections | ✅ |
| `db:migrate` step runs before test step | Step 8 (migrate) precedes step 9 (test) in isolation run | ✅ |
| `test:isolation` script executes all 3 suites | 3 test files × correct counts confirmed in log | ✅ |
| `check:rls` step follows test step | Step 10 ran and returned OK | ✅ |
| DEF-3 guard prevents silent all-skip | CI=true; 54 real tests ran; 0 skipped | ✅ |

### Architecture constraints

| Constraint | Evidence | Status |
|---|---|---|
| **D2**: Runtime connection NOT switched to leados_app | No source changes; admin `prisma` client unchanged; only test code uses appPrisma (leados_app) | ✅ |
| **D-M3-2**: Not addressed in M6 | No identity read code modified; isolation tests use explicit GUC or withTenant org scope | ✅ |
| No Sprint 4 work | Files changed: 3 test files + package.json + isolation.yml + 2 docs. No src/ changes. | ✅ |
| No architecture decisions modified | Schema unchanged; no migration changes; no new source modules | ✅ |

---

## 7. Deploy API Failure — Root Cause and Disposition

**Run:** `27818177288` · **Workflow:** Deploy API · **Conclusion:** failure

**Failing step:** Build API image

**Root cause from log:**
```
Prisma failed to detect the libssl/openssl version to use, and may not work as expected.
Defaulting to "openssl-1.1.x".
Error: Command failed with exit code 1: pnpm add prisma@5.22.0 -D --silent
ELIFECYCLE  Command failed with exit code 1.
```

This is a Docker image build failure: the Prisma CLI's postinstall script cannot detect the container's OpenSSL version during `docker build`, causing the image layer to fail. This failure is **pre-existing and unrelated to M6**:

- M4 commit `a24e5b8`: Deploy API → failure (same pattern, run `27815088230`)
- M5 commit `6a23b15`: Deploy API → failure (same pattern, run `27815947349`)
- M6 commit `4235aa3`: Deploy API → failure (same pattern, run `27818177288`)

M6 changed zero Dockerfile, zero Prisma schema, zero dependency versions. The failure predates M6 and is not caused by it. Deploy Web succeeded on this commit. All code quality and test gates are green.

**Disposition:** Known infrastructure defect in the Docker build environment. Not a gate for M6 completion. Carry-forward as **D-INFRA-1**.

---

## 8. Open Defects

| # | Finding | Severity | Disposition |
|---|---|---|---|
| **D-M6-1** | **ownOnly integration gap.** No current HTTP endpoint exercises the `leads.read_own` or `*_own` permission variants in integration. SALES_EXECUTIVE's ownOnly path is proven at unit level only (`rbac.middleware.test.ts` + `permission-check.test.ts`). | Low | By design — no domain endpoints (leads, contacts) exist yet. Must be verified end-to-end when domain modules land in Sprint 4+. |
| **D-M6-2** | **Branch protection not set.** The `isolation / Isolation Suite (ISO-1 / ISO-2 / ISO-3)` check must be added manually to GitHub branch protection required status checks for `main`. Without this, the workflow runs but does not gate merges. | Low | One-time admin action; cannot be done via code. Pending platform admin who manages the repository settings. |
| **D-INFRA-1** | **Deploy API Docker image build fails** due to Prisma OpenSSL detection in container build layer. Pre-existing on M4, M5, M6. | Low (non-blocking) | Infrastructure issue; no M6 code is causative. Tracked separately from M6 completion. |

---

## 9. Carry-Forward Risks

| # | Risk | Origin | Status |
|---|---|---|---|
| **D-M3-2** | Identity reads (auth flows, `findUserById`) connect as admin but would return 0 rows under `leados_app` + RLS if runtime were switched. Highest-priority risk before connection-switch milestone. | M3 | Unchanged by M6. Must be resolved before switching runtime connection from admin to `leados_app`. |
| **D-M5-1** | Audit writes are best-effort (separate transaction from the audited action). If the audit write fails after the main action commits, no audit row is produced. | M5 | Unchanged. Acceptable for MVP; hardening deferred. |
| **D-M5-2** | Audit write is in a separate transaction — no atomicity guarantee between action and audit row. | M5 | Unchanged. Same disposition as D-M5-1. |

---

## 10. Readiness Assessment

### Sprint 3 milestone chain

| Milestone | Verdict |
|---|---|
| M1 — Tenancy Foundation (E1) | ✅ FULL PASS |
| M2 — Tenant Context & UoW (E2) | ✅ FULL PASS |
| M3 — Tenant-Aware Data Layer (E3) | ✅ FULL PASS |
| M4 — RBAC Enforcement (E4) | ✅ FULL PASS |
| M5 — Audit Foundations (E5) | ✅ FULL PASS |
| **M6 — Isolation Gate (E6)** | **✅ FULL PASS** |

### What M6 added to the security posture

1. **Three-layer isolation proof**: the application extension (ISO-1), the PostgreSQL RLS backstop (ISO-2), and the RBAC permission matrix (ISO-3) are now independently verified in CI. No single-layer bypass can produce a silent false-green.
2. **Two-role test setup verified**: `leados_app` (NOBYPASSRLS) was proven reachable in CI and exercised RLS WITH CHECK — 18 tests ran as that role and produced the expected denials.
3. **Deny-by-default confirmed**: `TenantScopeError` is thrown for any Prisma operation not on the scoped allow-list.
4. **Cache invalidation end-to-end**: role promotion flushes the RBAC cache; the next request reflects the new role immediately.
5. **Required CI gate wired**: `isolation.yml` executes on every push to main and every PR touching `apps/api/**` or `prisma/**`. DEF-3 guard ensures the suite cannot silently skip in CI.

### Remaining before Sprint 4 domain modules

- Resolve **D-M6-2** (branch protection) — admin action only.
- Track **D-M6-1** (ownOnly) — verifiable once lead/contact endpoints land.
- Plan **D-M3-2** resolution before any runtime connection switch.

---

## 11. Final Verdict

```
╔══════════════════════════════════════════════╗
║   Sprint 3 Milestone 6 (E6): FULL PASS      ║
╚══════════════════════════════════════════════╝
```

**Basis:**

- CI workflow `27818177294` → **success**. Typecheck, lint, build, test (273/274), coverage (83.7/88.24/83.87/83.7), audit, enum parity, secret-leak guard — all green.
- Isolation Suite `27818177252` → **success**. ISO-1 (13), ISO-2 (18), ISO-3 (23) = **54 tests, 0 skipped**, executed against real Postgres + leados_app NOBYPASSRLS in CI with DEF-3 guard active.
- `check:rls` → **OK**. 5/5 tenant tables covered.
- Deploy API failure is a **pre-existing Docker infrastructure issue** (Prisma OpenSSL detection), present identically on M4 and M5. It is not caused by M6 and does not gate M6 completion.
- **D2 respected**: runtime connection remains admin; no connection switch.
- **D-M3-2 respected**: not addressed in M6.
- **No Sprint 4 work**: zero source changes; tests + CI wiring only.

All Sprint 3 acceptance criteria from `SPRINT_3_EXECUTION_PLAN.md §5` are met. Sprint 3 is complete.

**Sprint 4 is authorized to begin.**

---

*Read-only validation. No code changes. No commits. No pushes.*
*Source: GitHub Actions run logs for commit `4235aa310aa5b4bb31f839e454af187ce2746d84`.*
