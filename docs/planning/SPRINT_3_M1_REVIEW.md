# SPRINT_3_M1_REVIEW.md

> **Sprint 3 — Milestone 1 (E1: Tenancy Foundation) — implementation review**
> Author: Engineering, LeadOS · Date: 2026-06-19
> Scope implemented: **M1 only** (TEN-3.1.1 … TEN-3.1.4) per `SPRINT_3_EXECUTION_PLAN.md`. No M2+ work (no `withTenant`, no tenant Prisma extension, no tenant context/ALS, no real `tenantMiddleware`/RBAC). No architecture decisions modified.

---

## 1. What M1 Delivered

The tenancy **correctness floor**: two database roles, RLS enabled + forced + missing-safe on every org-scoped table, a registry-backed coverage gate, and a validated (benchmarked) per-unit-of-work mechanism — all proven against a real Postgres as the **NOBYPASSRLS** application role.

| Task | Delivered |
|---|---|
| **TEN-3.1.1** Two DB roles | `leados_app` (LOGIN, NOSUPERUSER, **NOBYPASSRLS**) + `leados_platform_admin` (LOGIN, **BYPASSRLS**) via idempotent migration `0002`; GRANTs + `ALTER DEFAULT PRIVILEGES` so future tables inherit access. Env wiring: `DATABASE_APP_URL`, `DATABASE_PLATFORM_URL`. |
| **TEN-3.1.2** Enable + FORCE RLS | Migration `0003` enables + **forces** RLS and installs one missing-safe policy (`USING`/`WITH CHECK` on `"organizationId" = current_setting('app.current_organization_id', true)::uuid`) on all four tenant tables + a tested `rollback.sql`. |
| **TEN-3.1.3** Registry + coverage gate | `core/tenancy/tenant-tables.ts` (single source of truth) + `scripts/check-rls-coverage.ts` (`pnpm --filter @leados/api check:rls`) asserting coverage == registry and RLS enabled+forced+policied. |
| **TEN-3.1.4** Pooler validation | `scripts/tenancy-bench.ts` + `docs/planning/TENANCY_POOLING_BENCHMARK.md` — mechanism correct, pooler-safe by construction, overhead negligible (p95 0.445 ms). |

---

## 2. Files Changed

**New**
```
prisma/migrations/0002_tenancy_roles/migration.sql        DB roles + grants (idempotent)
prisma/migrations/0003_rls_policies/migration.sql         ENABLE+FORCE RLS + missing-safe policies
prisma/migrations/0003_rls_policies/rollback.sql          tested rollback (TD-S2-7)
apps/api/src/core/tenancy/tenant-tables.ts                tenant-table registry (source of truth)
apps/api/src/core/tenancy/tenant-tables.test.ts           registry unit tests (5)
apps/api/tests/integration/rls.foundation.test.ts         RLS foundation proof as leados_app (9)
apps/api/scripts/check-rls-coverage.ts                    RLS coverage CLI gate
apps/api/scripts/tenancy-bench.ts                         tenancy micro-benchmark
docs/planning/TENANCY_POOLING_BENCHMARK.md                TEN-3.1.4 validation + results
```
**Modified**
```
apps/api/src/core/config/env.ts     + DATABASE_APP_URL, DATABASE_PLATFORM_URL (optional)
apps/api/package.json               + check:rls, bench:tenancy scripts
.github/workflows/ci.yml            + DATABASE_APP_URL (so the RLS suite runs as leados_app in CI)
turbo.json                          + DATABASE_APP_URL / DATABASE_PLATFORM_URL passThrough
```
No `prisma/schema.prisma` change — RLS is DDL (hand-written migration), consistent with the existing migration approach; no Prisma model is affected.

---

## 3. Tests Added (14)

| Suite | Tests | Proves |
|---|---|---|
| `tenant-tables.test.ts` (unit) | 5 | registry shape/consistency; pinned column + GUC names; disjoint sets; no dupes |
| `rls.foundation.test.ts` (integration, DB-gated, **runs as `leados_app`**) | 9 | RLS enabled+forced+policy on all 4 tables; **coverage == registry**; app role is non-super + NOBYPASSRLS (R3); **unset GUC → 0 rows**; GUC=A → only A's rows; GUC=B → only B's; **WITH CHECK blocks cross-org INSERT**; positive-control insert allowed; **cross-org UPDATE/DELETE affect 0 rows** (target row survives) |

Validation evidence (CI-mirror through turbo, as CI runs): `rls.foundation.test.ts (9 tests)` — **0 skipped, executes + passes**; full api suite **105 passed | 1 skipped** (the 1 skip is the Redis doc-placeholder, locally only). Gating uses the existing DEF-3 guard, so the suite cannot silently skip in CI.

---

## 4. Validation Results (all green)

| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ 4/4 |
| `pnpm lint` | ✅ 4/4 |
| `pnpm build` | ✅ 3/3 |
| `pnpm test` (CI-mirror) | ✅ api 105 passed / 1 skip · shared 18 · web 20 |
| `pnpm test:coverage` (api) | ✅ 75.34 / 83.18 / 72.72 / 75.34 — all ≥ 60 floor |
| `pnpm --filter @leados/api check:rls` | ✅ "OK — 4 tenant tables enabled + forced + policied; coverage matches registry" |
| `bench:tenancy` | ✅ tenant unit-of-work p95 **0.445 ms** (baseline 0.111 ms) |
| migrations `0002`+`0003` applied to real Postgres | ✅ applied; rollback round-trip (apply → rollback → re-apply) verified |

---

## 5. Acceptance Criteria Status (M1-scoped)

From `SPRINT_3_EXECUTION_PLAN.md` §5 — the criteria within M1's remit:

| # | Criterion | Status |
|---|---|---|
| 1 | **RLS everywhere** — every `organizationId`-bearing table ENABLED + FORCED with the missing-safe policy; `check-rls-coverage` passes | ✅ Met |
| 2 | **Unset GUC denies** — no `app.current_organization_id` → 0 rows; writes rejected (`WITH CHECK`) | ✅ Met |
| 4 (partial) | **Cross-tenant denial (RLS layer)** holds as `leados_app` | ✅ Met at foundation level (`roles`); exhaustive per-table app+RLS suite is **M2 (ISO-1/ISO-2)** |
| 5 (partial) | **Unit of work atomic + pinned**; pooler benchmark green with documented p95 | ✅ Mechanism (tx + `SET LOCAL` GUC) validated + benchmarked; the production `withTenant` helper is **M2 (TEN-2.1)** |
| 10 (partial) | tested rollback for new migrations | ✅ `0003` rollback authored + verified locally; full `migrate-check.yml` rollback wiring is **M6** |

**Deferred by design (not M1):** criteria 3 (extension deny-by-default), 6 (RBAC enforced), 7 (active revocation), 8 (audit), 9 (isolation suite as required CI gate) — these belong to M2–M6 and were **not** implemented, per the "M1 only" rule.

No M1 acceptance criterion was skipped.

---

## 6. Risks Discovered

| # | Finding | Disposition |
|---|---|---|
| D1 | **Doc vs schema column name.** `FINAL_ARCHITECTURE` §2 writes `organization_id`; the actual Prisma column is camelCase `"organizationId"`. Policies + registry + checks use the real name. | Resolved (not an architecture change — the doc name was illustrative). Worth a one-line doc footnote. |
| D2 | **App cannot switch to `leados_app` until M2.** Existing auth flows (org bootstrap, login) write to tenant tables (`roles`, `members`, `subscriptions`, `refresh_tokens`) **without** a GUC. Under RLS as `leados_app` those writes would be **denied**. So in M1 the **app still connects as admin**; only the RLS *tests* use `leados_app`. | **Sequencing constraint for M2/M3:** migrate those writes onto `withTenant` (GUC-pinned) **before** flipping the runtime `DATABASE_URL` to `leados_app`. Flagged for M2. |
| D3 | **Prisma raw params bind as `text`.** `$executeRawUnsafe`/`$queryRawUnsafe` need explicit `::uuid` casts for uuid columns. | Handled in tests/scripts; the M2 extension should centralize tenant-id handling to avoid ad-hoc casts. |
| D4 | **`passThroughEnv` ⇒ infra URLs are not in turbo's cache key.** A cached test result can be replayed for an invocation without DB env. | Benign (correctness unaffected; CI runs fresh). Use `--force` when a true cold run is needed. |
| D5 | **Dev/test role passwords live in migration `0002`.** | Acceptable for local/CI parity (mirrors `leados:leados`); production provisions roles + secrets out-of-band — the guarded CREATE is idempotent. Documented in the migration. |
| D6 | **Production pooler latency not yet captured.** Benchmark is on a direct connection; Neon transaction-mode pooler number is pending staging. | Tracked as a **Sprint-4 pre-domain** task; non-blocking for M2/M3 (correctness, not latency, gates the mechanism). |

---

## 7. Next Milestone Readiness — M2 (Tenant Context & Unit-of-Work)

✅ **Ready to begin.** The foundation M2 builds on is in place and CI-executing:

- **Registry + constants** (`TENANT_TABLES`, `TENANT_COLUMN`, `TENANT_GUC`) are ready for the M2 tenant Prisma extension (TEN-2.2) to consume directly.
- **RLS is the backstop** already enforced as `leados_app`, so the M2 extension's app-layer injection has a proven safety net beneath it.
- **Mechanism shape validated** — the `tx + SET LOCAL set_config` pattern is benchmarked; `withTenant` (TEN-2.1) formalizes exactly this.
- **Roles + env wiring** exist for the eventual runtime switch to `leados_app`.

**Carry-in constraint for M2 (from D2):** sequence the work as (1) `withTenant` + extension + context, (2) migrate the existing auth bootstrap/login writes onto `withTenant`, (3) only then promote `tenantMiddleware` and switch the runtime connection to `leados_app`. Doing the switch before the writes are GUC-wrapped would break register/login under RLS.

**Recommended M2 start:** TEN-2.1 (`withTenant`) → TEN-2.2 (tenant extension, deny-by-default) → TEN-2.3 (context/ALS) → TEN-2.4 (real `tenantMiddleware`), landing the ISO-2 (RLS) + extension unit tests alongside.

---

*Implementation review — M1 (E1) only. No M2+ code, no architecture changes, no acceptance criteria skipped.*
