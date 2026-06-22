# LeadOS Fix Report

Date: 2026-06-22

## Summary

The implementation audit found no source-code application defects in Sprint 7 M1 behavior. Two test-stability defects and one stale local dev-process issue were resolved.

## Files Modified

- `apps/web/vitest.config.ts`
- `apps/api/vitest.config.ts`

## Files Created

- `docs/planning/IMPLEMENTATION_AUDIT.md`
- `docs/planning/FIX_REPORT.md`
- `docs/planning/FINAL_STATUS_REPORT.md`

## Migrations Added

None.

## Fixes Applied

### FIX-1: Web full-suite jsdom timeout

Root cause:

- `pnpm test` failed in the web package because `ComposeBar.test.tsx` and `CreateLeadModal.test.tsx` exceeded Vitest's default 5s timeout under full monorepo parallel load.
- Both test files passed in isolation, proving this was suite contention rather than component behavior.

Change:

- Added `testTimeout: 10_000` to `apps/web/vitest.config.ts`.

Result:

- `pnpm --filter @leados/web test` passed with 36 test files and 163 tests.
- Full `pnpm test` later passed.

### FIX-2: API auth refresh hook timeout

Root cause:

- `pnpm test` failed in `apps/api/src/modules/auth/auth.refresh.test.ts`.
- The failing setup was `beforeEach(async () => ctx = await loggedIn())`, which performs register/login work using bcrypt.
- API Vitest already had `testTimeout: 30000`, but Vitest hook timeout remained at the default 10s.

Change:

- Added `hookTimeout: 30000` to `apps/api/vitest.config.ts` so hooks match the existing bcrypt-aware test timeout.

Result:

- `auth.refresh.test.ts` passed in the full monorepo test run.
- Full `pnpm test` passed with API 560 passed, 1 skipped.

### FIX-3: Stale port-3000 Next dev runtime

Root cause:

- Existing local process on port 3000 was `next-server (v15.5.19)` and served stale `.next` chunks.
- `GET /api/bff/notifications` failed with `Cannot find module './341.js'`.
- A clean temporary Next dev instance on port 3001 passed login, notification BFF, and dashboard checks, proving the source/build was valid.

Change:

- Restarted the stale port-3000 Next dev process.

Result:

- Default local URL checks passed:
  - `GET /login` -> `200 OK`
  - `POST /api/auth/login` -> `200 OK`
  - `GET /api/bff/notifications` -> `200 OK`
  - `GET /` -> `200 OK`

## Commands Executed

Validation:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `pnpm test`
- `pnpm --filter @leados/api check:rls`
- `pnpm check:enum-parity`
- `pnpm --filter @leados/web test`

Runtime smoke:

- `pnpm --filter @leados/api seed:dev`
- `pnpm --filter @leados/web dev`
- `curl http://127.0.0.1:4000/health`
- `curl http://127.0.0.1:3000/login`
- `curl -X POST http://127.0.0.1:3000/api/auth/login`
- `curl http://127.0.0.1:3000/api/bff/notifications`
- `curl http://127.0.0.1:3000/`

## Final Test Results

| Gate | Result |
| --- | --- |
| Typecheck | PASS |
| Lint | PASS |
| Build | PASS |
| Test | PASS |
| API RLS coverage | PASS |
| Enum parity | PASS |

## Remaining Blockers

None for Sprint 7 M1.

## Notes

The local dev user was seeded idempotently using the existing `seed:dev` script:

- Email: `admin@leados.local`
- Password: `Admin1234!`

This changed local development database state only; no schema or migration changes were introduced.

