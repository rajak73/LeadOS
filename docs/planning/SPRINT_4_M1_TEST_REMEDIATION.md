# Sprint 4 M1 — Test Remediation

**Date**: 2026-06-19
**Status**: ✅ RESOLVED — all tests pass

---

## Problem

`pnpm test` reported 34 test files passing / 9 skipped (including `crm.rls.test.ts`,
`rls.foundation.test.ts`, `isolation.rls.test.ts`, and all other DB-gated suites).

The DB-gated tests self-skipped because `isPostgresUp()` returned `false`, even though
Postgres was running and reachable on `localhost:5432`.

---

## Root Cause

**Vitest's `envDir` does not inject `process.env` early enough for top-level awaits.**

The test files call `isPostgresUp()` at the top level (module evaluation time):

```typescript
// crm.rls.test.ts, rls.foundation.test.ts, etc.
const pgUp = await isPostgresUp();
```

`isPostgresUp()` calls `pingDatabase()`, which calls `prisma.$queryRaw`. Prisma reads
`DATABASE_URL` from `process.env` at query time. If it is absent, Prisma throws and
`pingDatabase()` returns `false`, silently skipping all 9 DB suites.

The workspace `.env` file lives at the repo root (`/lead_os/.env`). Vitest running inside
`apps/api/` does not load it unless told to — its default `envDir` is the package directory
(`apps/api/`), where no `.env` file exists.

The `turbo.json` `passThroughEnv` list is correct (it includes `DATABASE_URL`,
`DATABASE_APP_URL`, etc.), but `passThroughEnv` only forwards vars that already exist in
the **calling shell**. On a fresh terminal the root `.env` is never sourced, so those vars
are absent and Turbo passes nothing.

### Why tests passed previously

Earlier sessions ran `pnpm test:coverage` with explicit env vars already exported in the
shell, or hit the Turbo cache from a run where vars were set. Without that shell state,
`pnpm test` silently skipped all 9 DB suites and reported a false-green "no failures".

---

## Fix

Added a Vitest `globalSetup` file that runs **before any test module is evaluated**,
loading non-empty entries from the root `.env` into `process.env`. Empty values are
intentionally skipped — they are documentation placeholders in `.env.example`/`.env`, and
injecting them (e.g. `JWT_ACCESS_SECRET=`) would fail Zod's `min(1)` validation in
`env.ts`.

CI is unaffected: the `if (!(key in process.env))` guard means CI-set vars are never
overwritten, and `DATABASE_URL` etc. are provided by `ci.yml` / `docker-compose services`.

---

## Files Modified

| File | Change |
|---|---|
| `apps/api/tests/global-setup.ts` | Created — parses root `.env`, sets missing non-empty vars in `process.env` before test modules load |
| `apps/api/vitest.config.ts` | Added `globalSetup: ['./tests/global-setup.ts']` |

---

## Validation Evidence

```
pnpm turbo run test --force   (no DATABASE_URL in shell)

@leados/shared:test:   Test Files  2 passed (2)
@leados/shared:test:        Tests  18 passed (18)
@leados/web:test:      Test Files  6 passed (6)
@leados/web:test:           Tests  20 passed (20)
@leados/api:test:      Test Files  43 passed (43)
@leados/api:test:           Tests  288 passed | 1 skipped (289)

pnpm test (Turbo cache hit)

  Test Files  43 passed (43)
       Tests  288 passed | 1 skipped (289)
  Cached:    4 cached, 4 total
```

All 9 previously-skipped DB-gated test files now run and pass:
- `tests/integration/crm.rls.test.ts` — 13 tests pass
- `tests/integration/rls.foundation.test.ts` — 9 tests pass
- `tests/integration/isolation.rls.test.ts` — 18 tests pass
- `tests/integration/isolation.rbac.test.ts` — 23 tests pass
- `tests/integration/rbac.enforcement.test.ts` — 7 tests pass
- `tests/integration/audit.integration.test.ts` — 4 tests pass
- `tests/integration/tenancy.reassignment.test.ts` — 5 tests pass
- `tests/integration/tenant.middleware.e2e.test.ts` — 5 tests pass
- `tests/integration/org-scoped-auth.integration.test.ts` — 5 tests pass

---

## Sprint 4 M1 — Final Gate Status

| Check | Result |
|---|---|
| `pnpm typecheck` | ✅ PASS |
| `pnpm lint` | ✅ PASS |
| `pnpm build` | ✅ PASS |
| `pnpm check:rls` | ✅ PASS — 15 tenant tables |
| `pnpm test` | ✅ PASS — 43 files / 288 passed / 1 skipped |

Sprint 4 M1 is approved. Ready for M2.
