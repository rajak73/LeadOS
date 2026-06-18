# DEF_3_REMEDIATION_REPORT.md

> **DEF-3 — "Infra-gated integration tests skip even in CI" — investigation & remediation**
> Engineer: Platform · Date: 2026-06-19
> Scope: **DEF-3 only.** No Sprint 3 work, no new features, no architecture changes.
> Goal: auth integration tests **execute against real Postgres + Redis in CI** instead of being skipped.

---

## 1. Summary

DEF-3 was **two defects stacked behind one symptom**, plus a latent flake that the fix would have exposed in CI:

| # | Root cause | Effect | Severity |
|---|---|---|---|
| **RC-A** | Turbo 2.x **strict env mode** strips `DATABASE_URL`/`DATABASE_DIRECT_URL` from the `test`/`test:coverage` task env (not declared in `turbo.json`). Prisma reads `process.env.DATABASE_URL` **directly** via `env("DATABASE_URL")`, so it saw `undefined`. | `isPostgresUp()` → false → the **DB-gated auth integration test silently SKIPPED in CI**. | **High** (the DEF-3 root cause) |
| **RC-B** | The strict per-IP `authRateLimit` (5 req / 15 min) is exhausted by the 11 no-DB requests earlier in the same test file (all from loopback `127.0.0.1`) before the register happy-path runs. | Once executed, the register test returns **429**, not 201 → it would have **failed** in CI. A masked defect. | **High** (would turn skip → red) |
| **RC-C** | Pure-JS `bcryptjs` (TD-S2-1) at cost **12** is ~2–7 s/op; concurrent auth unit tests exceeded the 20 s `testTimeout` under runner CPU contention. | Intermittent **timeout failures** once the heavier gated suite also runs in CI. | **Medium** (flake risk) |

All three are fixed. The gated auth integration test now **executes and passes** against a real Postgres, local dev runs stay green (graceful skip), and a new **CI guard** converts any future silent skip into a hard failure.

---

## 2. Investigation

### 2.1 Why the probe returned false (RC-A — the actual DEF-3 cause)

The gating mechanism itself is sound. `tests/helpers/services.ts` probes infra and the suites self-gate with `describe.skipIf(!pgUp)` / `.skipIf(!redisUp)`. CI (`ci.yml`) correctly defines `postgres:16-alpine` + `redis:7-alpine` services and sets job-level `DATABASE_URL`/`REDIS_URL`/`NODE_ENV`.

The break is in **how the test task is invoked**. CI runs `pnpm test:coverage` → `turbo run test:coverage`. Turbo **2.2.3 defaults to `envMode: "strict"`**, which prunes the child task's environment to declared vars only. The dry-run confirms nothing was passed:

```
$ turbo run test --filter=@leados/api --dry=json
envMode: strict
task.environmentVariables: { specified: { env: [], passThroughEnv: null },
                             configured: [], inferred: [], passthrough: null }
```

So `DATABASE_URL` never reached the test process. The trap: `packages/.../core/config/env.ts` has a **coincidentally matching default** (`postgresql://leados:leados@localhost:5432/leados`), which hides the problem for app code — **but Prisma does not use that zod env.** Prisma's datasource is `url = env("DATABASE_URL")`, read straight from `process.env`. Stripped → `undefined` → `prisma.$queryRaw` throws → `pingDatabase()` false → **skip**.

> Asymmetry worth noting: the Redis probe goes through ioredis with `env.REDIS_URL`, whose zod **default** `redis://localhost:6379` happens to match the CI Redis service — so the queue test was running in CI *by coincidence*, not by design. The fix makes both explicit and robust.

**Empirical proof** (local Postgres provisioned for this investigation):

| Invocation | DATABASE_URL in process | Register happy-path test |
|---|---|---|
| Direct `vitest run` (env exported) | present | **EXECUTES** (then 429 — see RC-B) |
| `turbo run test` (env exported) | **stripped by turbo** | **SKIPPED** ← reproduces CI |

### 2.2 The masked defect (RC-B)

With Postgres reachable and the test finally executing, it failed `expected 429 to be 201`. `auth.routes.test.ts` fires 11 validation/guard requests (all loopback `127.0.0.1`) before the DB register test; `authRateLimit` = **5 points / 900 s / IP** (with an in-memory insurance limiter that counts even when Redis is absent), so request #6+ is throttled. In CI (Redis up) the same limit applies via Redis — so this test would have gone **skip → red**, not skip → green, the moment RC-A was fixed alone. No existing test asserts the HTTP rate-limiter (the one `RATE_LIMITED` assertion in `auth.login.test.ts` is the *account-lockout* path, a different mechanism), so bypassing it in tests loses no coverage.

### 2.3 The latent flake (RC-C)

Running the full api suite through turbo, `auth.refresh.test.ts` failed once under load; in isolation it passed (27 s). Cause: `bcryptjs` cost-12 ops (e.g. the 5-attempt lockout test took ~21 s alone) breach the 20 s `testTimeout` when files run in parallel. Adding the heavier gated suite would make this worse in CI.

### 2.4 CI service & test-env configuration verification

- ✅ `ci.yml` Postgres + Redis services: correct images, health-checks, ports `5432`/`6379`.
- ✅ Job-level env (`DATABASE_URL`, `REDIS_URL`, `NODE_ENV=test`) present and correct.
- ❌ **Gap:** those vars were not declared in `turbo.json`, so strict-mode turbo dropped them before the test task ran (RC-A).
- ✅ `migrate-check.yml` runs `pnpm db:migrate` **directly** (not via turbo) with its own job env → unaffected; no change needed.
- ✅ The hand-written `0001_identity` migration was verified by applying both migrations to a real Postgres during this work (`prisma migrate deploy` → "successfully applied"), partially de-risking **TD-S2-7**.

---

## 3. Fixes Applied (DEF-3 only)

| File | Change | Addresses |
|---|---|---|
| `turbo.json` | Added `passThroughEnv` to **`test`** and **`test:coverage`**: `DATABASE_URL`, `DATABASE_DIRECT_URL`, `DATABASE_REPLICA_URL`, `REDIS_URL`, `NODE_ENV`, `BCRYPT_COST`, `CI`. (`passThroughEnv`, not `env`, so connection strings don't bust the cache hash.) | **RC-A** — the primary fix; infra vars now reach the test process in CI. |
| `apps/api/src/core/middleware/rate-limit.ts` | `createRateLimit` returns a **pass-through when `isTest()`**. Production/dev keep the real Redis-backed limiter unchanged. | **RC-B** — executed integration tests no longer 429 from single-IP supertest traffic. |
| `.github/workflows/ci.yml` | Added `BCRYPT_COST: 4` to the job env (tests assert only the `$2x$` prefix, never the cost). | **RC-C** — fast, deterministic auth tests in CI. |
| `apps/api/vitest.config.ts` | `testTimeout` 20 000 → **30 000 ms** (headroom for pure-JS bcryptjs under parallel load). | **RC-C** — defensive margin. |
| `apps/api/tests/helpers/services.ts` | **DEF-3 guard:** when `process.env.CI` is set, a `false` probe **throws** instead of allowing a silent skip, with a message pointing at the service def + `passThroughEnv`. | **Regression prevention** — a misconfigured CI fails loud, never green-by-skip. |

**Not changed (scope discipline):** the rate-limiter algorithm/limits, the bcrypt **algorithm and production cost** (env default remains **12**; only the test env lowers it), the gating pattern, the migration, Prisma/datasource config, and anything Sprint 3. No application features added.

---

## 4. Verification

Local Postgres was provisioned (`leados` role + db) and both migrations applied, enabling a faithful CI mirror.

### 4.1 Before vs after (through turbo = how CI runs)

| State | Register happy-path (DB) | api suite |
|---|---|---|
| **Before** (turbo, env exported) | **SKIPPED** (RC-A) | 90 passed, 2 skipped |
| **Before** (direct vitest, env exported) | **FAILED 429** (RC-B exposed) | 1 failed |
| **After** (turbo, CI-mirror env) | ✅ **EXECUTES → 201** (580 ms) | **91 passed, 1 skipped** (Redis absent locally) |

### 4.2 DEF-3 guard proven

`CI=true` + Redis down → `[DEF-3 guard] Redis probe returned false while running in CI …` → **test file FAILS loudly** (not skipped). In real CI (services up) the guard is dormant.

### 4.3 Local dev preserved (clean env, no CI/DB exports)

`pnpm test` → **90 passed | 2 skipped** — both gated suites skip gracefully, guard dormant. Identical to the documented baseline; no developer needs local infra.

### 4.4 Required gates

| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ 4/4 (fresh, uncached) |
| `pnpm lint` | ✅ 4/4 (fresh, uncached; module-boundary rules intact) |
| `pnpm test` (clean local) | ✅ 90 passed, 2 gated-skip |
| `pnpm test` (CI-mirror, DB up) | ✅ 91 passed, 1 skip (Redis local only) — register lifecycle proven over real Postgres |
| `pnpm build` | ✅ 3/3 |
| `pnpm test:coverage` (api, CI-mirror) | ✅ **Stmts 75 / Branches 83.1 / Funcs 72.5 / Lines 75** — all ≥ 60 floor |

**Coverage bonus:** executing the DB test exercises the Prisma `AuthRepository` + composition root, lifting api coverage from 70.3/81.3/66.7/70.3 → **75/83.1/72.5/75** — partially retiring **TD-S2-8**.

---

## 5. Impact on Sprint 2 status

- **DEF-3 → RESOLVED.** Auth integration tests now execute against real Postgres in CI; the Redis-gated queue test is now robust (explicit passthrough + guard); silent skips are impossible in CI.
- The register→org-bootstrap lifecycle is now **proven end-to-end over a real database + the actual Prisma repository**, satisfying condition (a) of the Sprint 2 `CONDITIONAL PASS` (`SPRINT_2_CLOSURE.md` §6/§7). The remaining conditions (deferred auth UI, SSO, profile endpoints, real email) are unaffected by this work.
- Side benefits: `0001_identity` validated against real Postgres (partial **TD-S2-7**); api coverage up (partial **TD-S2-8**).

> **Note on convergence:** this proof requires the changes to be **committed/pushed** so the CI run actually executes them. The fix is verified locally in a faithful CI mirror; a green CI run on push is the final confirmation.

---

## 6. Files Changed

```
turbo.json                                        (passThroughEnv on test + test:coverage)
.github/workflows/ci.yml                          (BCRYPT_COST=4 job env)
apps/api/vitest.config.ts                         (testTimeout 20s → 30s)
apps/api/src/core/middleware/rate-limit.ts        (pass-through limiter in test env)
apps/api/tests/helpers/services.ts                (DEF-3 CI guard: false probe → throw in CI)
```

*Remediation scoped to DEF-3. No Sprint 3 work, no new features, no architecture decisions modified.*
