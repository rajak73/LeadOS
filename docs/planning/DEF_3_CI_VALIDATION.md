# DEF_3_CI_VALIDATION.md

> **DEF-3 — CI validation of commit `643759c`**
> Reviewer: Platform / Engineering Manager, LeadOS · Date: 2026-06-19
> Method: read-only inspection of the GitHub Actions run for the pushed DEF-3 fix, plus a local control reproduction of the CI guard. No code, commits, or pushes.

---

## 0. Run under validation

| Field | Value |
|---|---|
| Commit | `643759c4f5ca28a7d0b480d0beea448689518272` — *"feat: complete sprint 2 authentication and identity"* |
| Contains DEF-3 fix? | ✅ Yes — `turbo.json` (passThroughEnv), `rate-limit.ts`, `services.ts` (guard), `ci.yml` (BCRYPT_COST), `vitest.config.ts` |
| CI run | **`27783897434`** (workflow "CI", branch `main`, push) |
| Conclusion | ✅ **success** (1m19s) |
| headSha | `643759c…` (matches) |

This is the first CI run in which the DEF-3 fix is actually present on the commit (the prior green run `27782258700` was on `c001007`, pre-fix).

---

## 1. Did `auth.routes.test.ts` execute? — ✅ YES

CI test-step log:
```
✓ tests/integration/auth.routes.test.ts (12 tests) 212ms
```
**All 12 tests ran, 0 skipped.** Compare the pre-fix run `27782258700`: `auth.routes.test.ts (12 tests | 1 skipped) 69ms`. The previously-skipped DB block now executes — and the runtime jumped 69 ms → 212 ms, consistent with real database work (bcrypt + transactional writes).

---

## 2. Did `queue-roundtrip.test.ts` execute (against Redis)? — ✅ YES

CI log: `✓ tests/integration/queue-roundtrip.test.ts (2 tests | 1 skipped) 34ms`.

This file is intentionally structured so the **count is ambiguous** — it has a real test `describe.skipIf(!redisUp)` and a documentation placeholder `describe.runIf(!redisUp)`; exactly one runs and one skips in *either* infra state, so "2 tests | 1 skipped" appears whether Redis is up or down. The total test count cannot disambiguate it either (the file contributes "1 passed | 1 skipped" in both states).

**Disambiguated via the DEF-3 guard (authoritative, mechanism not inference).** I reproduced the exact CI scenario locally — Postgres **up**, Redis **down**, `CI=true`, run **through turbo**:
```
FAIL tests/integration/queue-roundtrip.test.ts
Error: [DEF-3 guard] Redis probe returned false while running in CI. …
```
This proves two things at once: (i) **turbo forwards `CI`** to the test task, so the guard is *active* in CI; and (ii) when Redis is unreachable in CI, the guard **throws and fails the file**.

Therefore: the CI run was **green with `queue-roundtrip` passing and no guard error** ⟹ the Redis probe returned **true** ⟹ the **real round-trip test executed against Redis** (API enqueue → separate BullMQ worker → completion). The `1 skipped` is the `runIf(!redisUp)` documentation block, correctly skipped *because Redis was up*.

> The 34 ms runtime initially looked too fast for a real round-trip, but the guard is a hard mechanism that overrides that heuristic: had Redis been down, the file would have failed, not passed. (BullMQ on the CI's loopback Redis is simply fast.)

---

## 3. Number of skipped tests — **1** (and it is *not* a gated real test)

api suite: **`Tests 91 passed | 1 skipped (92)`** (down from `90 passed | 2 skipped` pre-fix).

The single remaining skip is the **intentional documentation placeholder** `queue round-trip (skipped: no Redis)`, which *correctly* skips when Redis is up. **Zero real infra-gated tests were skipped.** The net change pre→post fix is `+1 passed / −1 skipped`, fully accounted for by the register-over-Postgres test now executing.

---

## 4. Was the register/login/refresh lifecycle executed against Postgres? — ⚠️ **PARTIAL: register YES; login/refresh NOT over DB**

Honest, precise answer. The **only** DB-gated block in the integration suite is:
```
describe.skipIf(!pgUp)('auth routes — register happy path (DB)') → registers a new org, expects 201
```
This executed against real Postgres and passed — exercising the **full atomic org bootstrap** (user → organization → 4 seeded roles + permissions → OWNER member → trial subscription) through the actual Prisma repository in a single transaction, plus the `0001_identity` schema.

**Login and refresh are *not* covered by a DB-backed integration test.** They are proven at the **service layer** via in-memory repository fakes (`auth.login.test.ts`, `auth.refresh.test.ts` — lockout, rotation, family-reuse, sessions), which run as unit tests and do **not** touch Postgres. So over a real DB, the executed lifecycle is **register + org bootstrap only**; login/refresh DB integration tests do not yet exist. This is a **test-depth gap**, not a DEF-3 regression (see §7), and relates to TD-S2-8.

---

## 5. Did `queue-roundtrip` execute against Redis? — ✅ YES

Same evidence as §2: the real `processes a health-echo job enqueued by the API in a separate worker` test ran (API → SYSTEM queue → separate BullMQ `Worker` → `completed` event with matching nonce). Confirmed by the guard mechanism: a down-Redis would have failed the file in CI; the file passed green.

---

## 6. Coverage results (CI, thresholds enforced) — ✅ all gates met

From the `pnpm test:coverage` step of run `27783897434`:

| Package | Statements | Branches | Functions | Lines | Floor | Result |
|---|---|---|---|---|---|---|
| `@leados/api` | **75.84%** (1071/1412) | **83.63%** (184/220) | **74.16%** (89/120) | **75.84%** | 60/60/60/60 | ✅ |
| `@leados/shared` | 100% (324/324) | 75% (3/4) | 100% (1/1) | 100% | 80/60/70/80 | ✅ |
| `@leados/web` | 89.44% (161/180) | 80.85% (38/47) | 100% (12/12) | 89.44% | 60/60/60/60 | ✅ |

The job is green with no threshold error. **api coverage rose 70.31 → 75.84% statements / 66.66 → 74.16% functions** versus the pre-fix baseline — because the now-executing register test exercises the Prisma `AuthRepository` + composition root that were previously uncovered (partially retiring **TD-S2-8**). The `0001_identity` migration was applied in CI via the `Apply migrations` step (`pnpm db:migrate`, `DATABASE_URL` present) before the tests ran.

---

## 7. Is DEF-3 fully resolved? — ✅ YES (the defect), with one tracked depth note

DEF-3 was: *"infra-gated integration tests skip even in CI → auth lifecycle unproven over a real DB."* On commit `643759c`, in a green CI run:

- ✅ The **Postgres-gated** auth integration test **executes** over a real DB (register + org bootstrap).
- ✅ The **Redis-gated** queue round-trip **executes** against real Redis.
- ✅ The **migration is applied and exercised** in CI.
- ✅ The **DEF-3 guard** converts any future silent skip into a hard CI failure (proven to fire locally) — so a regression cannot quietly return.
- ✅ No real gated test is skipped (the lone skip is an intentional doc placeholder).

**The DEF-3 defect is fully resolved.** Remaining depth note (not a DEF-3 reopen): the DB-backed integration coverage is **register-only**; login/refresh-over-DB integration tests are not yet written (login/refresh are service-layer only). Recommend tracking a follow-up to add DB-backed login + refresh integration tests for full end-to-end depth (TD-S2-8 / S3).

---

## 8. Is Sprint 2 condition (a) now satisfied? — ✅ YES

Condition (a) (per `SPRINT_2_CLOSURE.md` §7): *"DEF-3 resolved + a green CI run that exercises the new migration + auth integration tests over a real DB."*

| Sub-requirement | Evidence | Met |
|---|---|---|
| DEF-3 resolved | §7 above | ✅ |
| Green CI run | run `27783897434` = success on `643759c` | ✅ |
| Exercises the new migration | `Apply migrations` step applied `0001_identity` over the CI Postgres | ✅ |
| Auth integration test over a real DB | `auth.routes.test.ts` register happy-path executed (201) over Postgres | ✅ |
| (bonus) queue over real Redis | executed | ✅ |

**Condition (a) is SATISFIED.** (Caveat carried from §4: the auth DB integration is register-only; the existing integration test does run over a real DB, so (a) as written is met, while deeper login/refresh DB tests remain a tracked enhancement.)

### Effect on the FULL-PASS determination
Condition (a) is now cleared — a material change from `SPRINT_2_FINAL_SIGNOFF.md`, which had it failing on "uncommitted / green-by-skip." **However, Sprint 2 is still not FULL PASS**: upgrade requires **both** (a) and **(b)**, and condition (b) — the deferred items (auth UI screens, Google SSO, `PATCH /auth/me*`, real email) — **remains unmet** (unchanged; verified undelivered in the prior sign-off). Sprint 2 therefore stays **CONDITIONAL PASS**, now with **(a) satisfied and (b) the sole outstanding upgrade condition**.

> Deploy note (context only, not a condition): on `643759c`, Deploy Web = success, **Deploy API = failure** (DEF-1, carried) — outside the (a)/(b) gates.

---

## 9. Summary

| # | Question | Answer |
|---|---|---|
| 1 | `auth.routes.test.ts` executed? | ✅ Yes — 12 tests, 0 skipped |
| 2 | `queue-roundtrip.test.ts` executed? | ✅ Yes — real round-trip ran (guard-proven) |
| 3 | Skipped tests | **1** — an intentional doc placeholder; 0 real gated tests skipped |
| 4 | register/login/refresh over Postgres? | ⚠️ **register YES** (+ org bootstrap); login/refresh **not** over DB (service-layer only) |
| 5 | queue-roundtrip over Redis? | ✅ Yes |
| 6 | Coverage | ✅ api 75.84/83.63/74.16/75.84; shared 100/75/100/100; web 89.44/80.85/100/89.44 — all ≥ floors |
| 7 | DEF-3 fully resolved? | ✅ Yes (defect closed); login/refresh DB-depth is a tracked follow-up |
| 8 | Condition (a) satisfied? | ✅ Yes; (b) still unmet → Sprint 2 remains CONDITIONAL PASS |

*Read-only validation. No implementation, no code changes, no commits, no pushes.*
