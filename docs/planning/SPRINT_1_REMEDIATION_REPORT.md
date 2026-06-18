# SPRINT_1_REMEDIATION_REPORT.md

> **Remediation of Sprint 1 audit findings** (`SPRINT_1_AUDIT.md`) — before Sprint 2.
> Owner: Engineering Manager, LeadOS · Date: 2026-06-18
> Environment: Node v20.20.2, pnpm 9.15.9 (aligned).
> Scope: dependency/security/coverage/runtime hygiene only. **No Sprint 2 features implemented.** No architecture changed.

---

## Executive Summary

All actionable Sprint 1 audit findings are resolved. The dependency-audit gate is **green**, coverage tooling with **enforced thresholds** is in place, `engines.node` is pinned, and CI now runs coverage. The full gate suite passes under the standard runtime.

| Finding (from audit) | Status |
|---|---|
| **TD-1** — dependency audit gate red (1 critical + 2 high) | ✅ Resolved — high-gate passes (1 moderate remains, documented) |
| **TD-3** — no coverage tooling/threshold | ✅ Resolved — `@vitest/coverage-v8` + thresholds + CI step |
| **TD-7** — `engines.node` loose (`>=20`) | ✅ Resolved — pinned to `20.x` |
| CI verification | ✅ Coverage gate wired; audit gate retained |
| **TD-2** — repo not git-initialized | ⏸️ Not actioned (out of this task's scope; see §6) |

---

## 1. TD-1 — Dependency Audit Findings (RESOLVED)

### Before
`pnpm audit --audit-level=high` → **FAIL**: 1 critical + 2 high (+6 moderate, 1 low).

| Severity | Package | Scope | Action taken |
|---|---|---|---|
| CRITICAL | `vitest` 2.1.9 (UI server RCE) | dev (test tooling) | Upgraded test runner to **vitest 3.2.6** |
| HIGH | `@opentelemetry/sdk-node` 0.54.2 (Prometheus exporter crash) | **production** | Upgraded to **0.219.0** (+ `exporter-trace-otlp-http` 0.219.0, `api` 1.9.1) |
| HIGH | `vite` 5.4.21 (`server.fs.deny` bypass) | dev (via vitest) | Forced **vite ^6.4.3** via pnpm override (enabled by vitest 3) |
| MODERATE | `postcss` 8.4.31 | build tooling | Bumped web `postcss` to ^8.5.10 + **postcss ^8.5.10** override (clears nested copy) |
| MODERATE | `@opentelemetry/core` | production (transitive) | Cleared by the sdk-node 0.219 upgrade |
| MODERATE/LOW | `esbuild` | dev (via vite/tsup) | **esbuild ^0.25.0** override |

### Changes applied
- **`apps/api/package.json`**: `@opentelemetry/sdk-node` `^0.54.0 → ^0.219.0`, `@opentelemetry/exporter-trace-otlp-http` `^0.54.0 → ^0.219.0`, `@opentelemetry/api` `^1.9.0 → ^1.9.1`, `vitest` `^2.1.3 → ^3.2.4`.
- **`apps/web/package.json`**: `vitest` `→ ^3.2.4`, `postcss` `^8.4.47 → ^8.5.10`.
- **`packages/shared/package.json`**: `vitest` `→ ^3.2.4`.
- **Root `pnpm.overrides`**: added `vite ^6.4.3`, `esbuild ^0.25.0`, `postcss ^8.5.10` (alongside existing `ioredis`).
- OTel 0.219 API verified compatible — `otel.ts` (`NodeSDK` + `OTLPTraceExporter({ url })`) typechecks and builds unchanged; **no code change required**.

### After
```
pnpm audit --audit-level=high  →  PASS (exit 0)
pnpm audit                     →  1 vulnerabilities found · Severity: 1 moderate
```

### Residual advisory (accepted, tracked)
| Severity | Package | Why accepted |
|---|---|---|
| MODERATE | `@opentelemetry/core@1.30.1` (nested, patched `>=2.8.0`) | A deep transitive pulled by an OTel sub-package; forcing a **major** bump (1.x→2.x) of a transitive risks destabilizing the SDK for a *moderate* advisory that is **below the CI gate**. OpenTelemetry tracing is **guarded and disabled by default** (no `OTEL_EXPORTER_OTLP_ENDPOINT` in dev/test/prod-default), so this code path is inactive. Tracked for a clean resolution when the OTel SDK line next advances. |

> **Decision rationale:** the CI gate is `--audit-level=high`. Every high and critical advisory is eliminated by upgrades (not by weakening the gate). The single residual moderate is below the gate, dev/inactive, and not in the production request path. The gate was **not** softened to `--prod` — it remains strict and green.

---

## 2. TD-3 — Coverage Tooling (RESOLVED)

- Added **`@vitest/coverage-v8` ^3.2.4** to all three packages.
- Added `test:coverage` script to each package + a root `pnpm test:coverage` + a turbo `test:coverage` task.
- Configured v8 coverage in each `vitest.config.ts` with **enforced thresholds** and `text-summary` / `json-summary` / `lcov` reporters.
- Coverage scoping (honest measurement, documented in-config):
  - **api** excludes process entrypoints (`server.ts`, `worker.ts`), guarded observability inits (`otel`/`sentry`/`logger`), barrels, and type-only files — these are exercised behaviorally (integration/E2E), not by unit assertions.
  - **web** measures the node-testable lib + route handlers; `'use client'` modules (Zustand store, Socket.io client) and React shell are validated at build time / future E2E.
- Added a **token-store unit test** (`apps/web/src/lib/auth/token-store.test.ts`) — covers existing Sprint 1 code (get/set/clear), not a new feature.

### Measured coverage (thresholds enforced; build fails below floor)
| Package | Statements | Branches | Functions | Lines | Threshold | Result |
|---|---|---|---|---|---|---|
| `@leados/shared` | 100% | 100% | 100% | 100% | 80/80/70/80 | ✅ |
| `@leados/api` | 74.17% | 71.27% | 82% | 74.17% | 60/60/60/60 | ✅ |
| `@leados/web` | 95.83% | 92.3% | 100% | 95.83% | 60/60/60/60 | ✅ |

> Thresholds are deliberate **floors with headroom**, not vanity numbers — they will tighten as modules mature. The api floor (60) reflects that several spine units remain to be unit-tested (carry-forward TD-4); the floor prevents regression below today's level.

---

## 3. TD-7 — Pin `engines.node` (RESOLVED)

- Root `package.json` `engines.node`: `">=20"` → **`"20.x"`**.
- **Why:** the loose range allowed the exact off-standard drift caught during environment alignment (Node 25/24 installing without complaint). Pinning to `20.x` makes an off-standard runtime fail fast at install time, matching `.nvmrc` and CI. Verified install still succeeds under Node 20.20.2.

---

## 4. CI Workflow Verification (DONE)

- **`ci.yml`**: the test step now runs **`pnpm test:coverage`** (enforces thresholds in CI), and the **`pnpm audit --audit-level=high`** gate is retained (now green) with a comment documenting the accepted moderate.
- Other gates unchanged and intact: typecheck, lint (incl. module-boundary), build, **enum-parity**, **client-secret-leak guard**, migrations on a service Postgres + Redis.
- All 7 workflow files present: `ci`, `preview`, `deploy-web`, `deploy-api`, `isolation` (S3 scaffold), `migrate-check`, `security` (S8 scaffold).
- Note: these still require the repository to be git-initialized to execute (TD-2, §6).

---

## 5. Full Gate Suite — Evidence (Node 20.20.2 / pnpm 9.15.9)

| Command | Result |
|---|---|
| `pnpm audit` | 1 moderate; **`--audit-level=high` → PASS (exit 0)** |
| `pnpm typecheck` | ✅ 4/4 workspaces |
| `pnpm lint` | ✅ 4/4 (incl. boundary rules) |
| `pnpm test` | ✅ **45 passed, 1 gated-skip** — shared 8, web 9, api 28 (+1 Redis-gated) |
| `pnpm build` | ✅ 3/3 (shared + api server/worker + web) |
| `pnpm test:coverage` | ✅ 4/4 — all thresholds met |

Test count rose from 41 → **45** (added token-store suite). OTel major upgrade and vitest 2→3 migration introduced **no** code changes and **no** test breakage.

---

## 6. Out of Scope / Carry-Forward

| Item | Status | Note |
|---|---|---|
| **TD-2** — `git init` + first real CI run | ⏸️ Not actioned | This task was dependency/coverage/runtime remediation. Initializing the repo and demonstrating a green CI run is an environment/process action (touches VCS state), recommended at Sprint 2 kickoff. Until then, the workflows remain authored-but-unexecuted, and the two infra-gated integration tests run only in CI. |
| **TD-4** — unit tests for `validate`, `scheduler`, `cron-registry`, `dlq` | ⏸️ Carry-forward | The coverage floor (60) guards against regression; raise tests + thresholds as Sprint 2 modules land. |
| **TD-6** — `HealthCheck` infra table | ⏸️ Benign | Revisit/remove when real domain models arrive (S2). |
| `@opentelemetry/core` moderate | ⏸️ Tracked | See §1; below gate, inactive path. |

---

## 7. Files Changed in This Remediation

- `package.json` (root) — `engines.node` `20.x`; overrides (`vite`, `esbuild`, `postcss`); `test:coverage` script.
- `apps/api/package.json` — OTel bumps; vitest 3 + coverage-v8; `test:coverage` script.
- `apps/web/package.json` — vitest 3 + coverage-v8; postcss bump; `test:coverage` script.
- `packages/shared/package.json` — vitest 3 + coverage-v8; `test:coverage` script.
- `apps/api/vitest.config.ts`, `apps/web/vitest.config.ts`, `packages/shared/vitest.config.ts` — coverage config + thresholds.
- `apps/web/src/lib/auth/token-store.test.ts` — **new** unit test (existing-code coverage).
- `turbo.json` — `test:coverage` task.
- `.github/workflows/ci.yml` — coverage step + audit-gate comment.

No application/runtime source was modified (the OTel upgrade was config-compatible). No architecture decisions changed. No Sprint 2 feature code written.

---

## 8. Audit-Finding Closure & Sprint 2 Readiness

| Audit blocker | Pre | Post |
|---|---|---|
| TD-1 audit gate red | 🔴 | ✅ green (high-gate PASS) |
| TD-3 no coverage | 🔴 | ✅ enforced thresholds + CI |
| TD-7 loose engines | 🟠 | ✅ pinned `20.x` |
| TD-2 git/CI unproven | 🔴 | ⏸️ pending (recommended at S2 kickoff) |

**Recommendation:** the dependency/security/coverage/runtime findings from `SPRINT_1_AUDIT.md` are **closed**. The sole remaining item to convert Sprint 1 from CONDITIONAL PASS to **FULL PASS** is **TD-2** (initialize git + demonstrate a green CI run, which will also exercise the infra-gated integration tests). That is a ~15-minute VCS/process step and does not block starting Sprint 2 development.

*Remediation only — no Sprint 2 features implemented, no architecture modified.*
