# Sprint 5 M5 — Web Coverage Remediation

**Date:** 2026-06-20
**Status:** RESOLVED

---

## Problem

CI failed after M5 approval with:

```
Coverage for lines (41.28%) does not meet global threshold (60%)
Coverage for statements (41.28%) does not meet global threshold (60%)
```

All 46/46 tests passed. Build, typecheck, and lint were clean. Only coverage was broken.

---

## Root Cause

The coverage config in `apps/web/vitest.config.ts` instruments four groups of files:

```typescript
include: [
  'src/lib/api-client.ts',
  'src/lib/auth/**/*.ts',
  'src/lib/server/**/*.ts',
  'src/app/api/**/*.ts',
],
```

M5 added 8 new BFF route handlers under `src/app/api/bff/` with no accompanying tests. Combined with the pre-existing untested `auth/logout/route.ts`, the `src/lib/server/bff.ts` helper, and `src/lib/server/constants.ts`, the coverage scope had 10 files with zero coverage, dragging the aggregate below 60%.

---

## Coverage Gap Analysis (before remediation)

| File | Tests | Status |
|------|-------|--------|
| `src/lib/api-client.ts` | `api-client.test.ts` | Covered |
| `src/lib/auth/token-store.ts` | `token-store.test.ts` | Covered |
| `src/lib/server/cookies.ts` | `cookies.test.ts` | Covered |
| `src/lib/server/bff.ts` | — | **0% — no tests** |
| `src/lib/server/constants.ts` | — | **0% — no tests** |
| `src/app/api/auth/login/route.ts` | `login/route.test.ts` | Covered |
| `src/app/api/auth/refresh/route.ts` | `refresh/route.test.ts` | Covered |
| `src/app/api/auth/logout/route.ts` | — | **0% — no tests** |
| `src/app/api/health/route.ts` | `health/route.test.ts` | Covered |
| `src/app/api/bff/pipelines/route.ts` | — | **0% — no tests** |
| `src/app/api/bff/deals/route.ts` | — | **0% — no tests** |
| `src/app/api/bff/deals/[id]/route.ts` | — | **0% — no tests** |
| `src/app/api/bff/deals/[id]/move/route.ts` | — | **0% — no tests** |
| `src/app/api/bff/deals/[id]/won/route.ts` | — | **0% — no tests** |
| `src/app/api/bff/deals/[id]/lost/route.ts` | — | **0% — no tests** |
| `src/app/api/bff/deals/[id]/activities/route.ts` | — | **0% — no tests** |
| `src/app/api/bff/deals/forecast/route.ts` | — | **0% — no tests** |

**10 files with 0% coverage** across 229 lines.

---

## Remediation

Added 10 test files — one per untested module. All tests follow the existing pattern established by `auth/login/route.test.ts` and `auth/refresh/route.test.ts`: mock `fetch` globally via `vi.stubGlobal`, call the route handler directly, assert status and body.

### New Test Files

| Test File | Tests | What it covers |
|-----------|-------|----------------|
| `src/lib/server/bff.test.ts` | 6 | `callApi`: headers, auth, refresh token, body serialization, non-JSON response, no Set-Cookie |
| `src/app/api/auth/logout/route.test.ts` | 3 | No-cookie clears session; upstream revoke call fired; upstream failure still clears cookie |
| `src/app/api/bff/pipelines/route.test.ts` | 3 | No cookie → 401; refresh failure → 401; authenticated GET proxies response |
| `src/app/api/bff/deals/route.test.ts` | 5 | GET + POST: no cookie → 401; authenticated; query string forwarded |
| `src/app/api/bff/deals/[id]/route.test.ts` | 4 | GET + PATCH: no cookie → 401; authenticated |
| `src/app/api/bff/deals/[id]/move/route.test.ts` | 2 | No cookie → 401; authenticated POST |
| `src/app/api/bff/deals/[id]/won/route.test.ts` | 2 | No cookie → 401; authenticated POST |
| `src/app/api/bff/deals/[id]/lost/route.test.ts` | 2 | No cookie → 401; authenticated POST with body |
| `src/app/api/bff/deals/[id]/activities/route.test.ts` | 3 | No cookie → 401; authenticated; query string forwarded |
| `src/app/api/bff/deals/forecast/route.test.ts` | 3 | No cookie → 401; authenticated; query string forwarded |

**33 new tests.** Test count: 46 → 79.

### Test Pattern

All BFF route tests follow the two-call mock pattern, because each request involves:
1. `POST /api/v1/auth/refresh` — to exchange the session cookie for an access token
2. The actual API call — proxied to the data API

```typescript
vi.stubGlobal(
  'fetch',
  vi.fn()
    .mockResolvedValueOnce(   // call 1: refresh token exchange
      new Response(JSON.stringify({ success: true, data: { accessToken: 'tok' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    .mockResolvedValueOnce(   // call 2: actual API endpoint
      new Response(JSON.stringify(apiBody), {
        status: apiStatus,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
);
```

Routes that use `request.nextUrl.searchParams` (deals list, activities, forecast) receive a `NextRequest` instance from `next/server`. Routes that only read cookies and JSON body receive a plain `Request`.

---

## Coverage After Remediation

```
pnpm --filter @leados/web test:coverage

 Test Files  21 passed (21)
      Tests  79 passed (79)

 % Coverage report from v8

=============================== Coverage summary ===============================
Statements   : 99.44% ( 357/359 )
Branches     : 83.84% ( 109/130 )
Functions    : 100% ( 30/30 )
Lines        : 99.44% ( 357/359 )
================================================================================
```

| Metric | Before | After | Threshold | Status |
|--------|--------|-------|-----------|--------|
| Statements | 41.28% (161/390) | **99.44% (357/359)** | 60% | PASS |
| Branches | 74.54% (41/55) | 83.84% (109/130) | 60% | PASS |
| Functions | 75% (15/20) | **100% (30/30)** | 60% | PASS |
| Lines | 41.28% (161/390) | **99.44% (357/359)** | 60% | PASS |

All 4 coverage thresholds now exceed 60%. The threshold was not changed. Coverage enforcement was not disabled. No files were excluded from the coverage scope.

---

## What Was Not Changed

- `apps/web/vitest.config.ts` — thresholds and include/exclude patterns unchanged
- No source files modified — tests only
- All 46 pre-existing tests still pass
- Build, typecheck, lint unaffected
