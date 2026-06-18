# DEPLOY_WEB_FAILURE_ANALYSIS.md

> **Analysis of the "Deploy Web" GitHub Actions failure** (post CI-workflow remediation).
> Auditor: Engineering Manager, LeadOS · Date: 2026-06-18
> Method: read-only inspection of GitHub Actions run logs. No code, workflows, or architecture modified.
> Run analyzed: **Deploy Web · `27775927898`** · commit `67a5b94` ("fix: github actions workflow configuration") · result **failure (9s)**.

---

## TL;DR

The Deploy Web failure is a **cosmetic side effect of running with no deployment secrets configured** — *not* a code, build, or deploy-logic error. The actual deploy steps **correctly skipped** (no `VERCEL_TOKEN`); the job was marked red only because `actions/setup-node@v4`'s **pnpm cache post-step** tried to save a cache path that never got created (because `pnpm install` was skipped). 

**The `CI` workflow — the quality gate — is GREEN** for the same commit. **Deploy Web does NOT block Sprint 1 FULL PASS.**

---

## 1. Exact Error

From `Deploy Web` run `27775927898`, job `deploy` (9s):

```
JOBS
X deploy in 9s
  ✓ Set up job
  ✓ Run actions/checkout@v4
  ✓ Run pnpm/action-setup@v4
  ✓ Run actions/setup-node@v4
  - Run pnpm install --frozen-lockfile       ← SKIPPED (if: env.VERCEL_TOKEN != '')
  - Deploy to Vercel production              ← SKIPPED (if: env.VERCEL_TOKEN != '')
  X Post Run actions/setup-node@v4           ← FAILED HERE
  ✓ Post Run pnpm/action-setup@v4
  ✓ Complete job
```

Failing step log (`Post Run actions/setup-node@v4`):
```
##[error]Path Validation Error: Path(s) specified in the action for caching
do(es) not exist, hence no cache is being saved.
```

Two notable points from the run:
- The **pnpm-version conflict from the previous run is GONE** — `Run pnpm/action-setup@v4` now passes (✅), confirming the earlier remediation worked.
- `pnpm install` and `Deploy to Vercel production` show `-` (not run) — they were **skipped** by their `if: ${{ env.VERCEL_TOKEN != '' }}` guards.

---

## 2. Root Cause

A two-part interaction:

1. **No `VERCEL_TOKEN` secret is configured** in the repository. By design (the env-gating fix in `CI_REMEDIATION_REPORT.md`), the job maps `VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}` and gates `pnpm install` + the deploy step on `if: env.VERCEL_TOKEN != ''`. With no secret, both steps **skip** — the intended "don't deploy without credentials" behavior. ✅ working as designed.

2. **`actions/setup-node@v4` is configured with `cache: pnpm` unconditionally** (job step, no `if`). The action's **post-job cache-save step always runs** and tries to resolve/validate the pnpm store path to cache it. Because `pnpm install` was **skipped**, the pnpm store directory was **never created**, so the cache path does not exist → `Path Validation Error` → the post-step errors → **the whole job is marked failed**.

**Therefore:** the red status is produced by the `setup-node` pnpm-cache post-step encountering nothing to cache (a consequence of the conditional install being skipped). It is **not** a failure of the build, the app, or the deploy logic — the deploy itself never attempted to run.

> Supporting annotation in the run (non-causal): `Path(s) specified in the action for caching do(es) not exist, hence no cache is being saved` — exactly the cache-path-missing condition described above.

---

## 3. Is it expected because deployment secrets are not configured?

**Yes — substantially.** Breaking it down:

| Aspect | Verdict |
|---|---|
| Did the deploy step run / attempt to deploy? | **No** — it was correctly **skipped** because `VERCEL_TOKEN` is unset. The "no-op when token absent" intent succeeded. |
| Is the *job's red status* expected/desirable? | **No** — it is an **unintended cosmetic artifact**. A skipped deploy should surface as success/neutral, not failure. |
| Would configuring the secrets make it pass? | **Yes** — with `VERCEL_TOKEN` set, `pnpm install` runs, the pnpm store exists, the cache post-step finds its path, and the deploy proceeds (subject to valid Vercel project/org IDs). |
| Is it a source/build/quality problem? | **No** — `pnpm typecheck/lint/test/build` and the `CI` workflow are all green. |

So the failure is **expected as a direct consequence of deployment secrets not being configured**, surfaced as a job-failure only because of the `cache: pnpm` post-step running when install was skipped. It is a workflow-hygiene nit, not a real deploy or code failure.

---

## 4. Does it block Sprint 1 FULL PASS?

**No.**

- The FULL PASS condition from `SPRINT_1_FINAL_SIGNOFF.md` §7 is a **green `CI` run**. For commit `67a5b94`, the **`CI` workflow succeeded** (`build-test`, 1m18s): install → migrations → build shared → typecheck → lint → **test + coverage thresholds** → build → audit → enum-parity → secret-leak guard, all passed (shared 8, web 9, api 28 +1 gated-skip).
- **Deploy Web** (and **Deploy API**) are **deployment** workflows that require external infrastructure secrets (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`; `RAILWAY_TOKEN`). Provisioning the deploy targets/secrets is **not a Sprint 1 deliverable** — Sprint 1 is the platform spine, not a live deployment. These workflows are not source/quality gates.
- A deployment workflow that cannot deploy because credentials are intentionally absent does not invalidate the source quality validated by CI.

**Conclusion:** the Deploy Web failure is **out of scope** for the Sprint 1 FULL PASS gate. The gate is satisfied by the green CI run.

---

## 5. Recommended (non-blocking) cleanup — for later, not applied here

To make the deploy/preview workflows report **green or skipped** (instead of red) when deploy secrets are absent, any of:

- **Option A (cleanest): gate the whole job on a repository *variable*** (the `vars` context **is** allowed in a job-level `if`, unlike `secrets`):
  ```yaml
  jobs:
    deploy:
      if: ${{ vars.WEB_DEPLOY_ENABLED == 'true' }}   # job shows "skipped" (neutral) when off
  ```
- **Option B: don't run the pnpm cache when install is conditional** — either drop `cache: pnpm` from `setup-node` in the deploy workflows, or add `if: ${{ env.VERCEL_TOKEN != '' }}` to the `setup-node` step so its cache post-step doesn't run when nothing is installed.
- **Option C: configure the real secrets** (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`) when the Vercel project is provisioned — the full deploy then runs and the cache path exists.

Also informational (not a failure): the GitHub runner **Node 20→24 deprecation** warning on `actions/checkout`, `setup-node`, `pnpm/action-setup` — address by bumping action versions when convenient.

> These are workflow-config refinements, deliberately **not** applied in this read-only analysis.

---

## 6. Secondary Observation (noted, out of scope)

In the green `CI` run, the api suite still reports `28 passed | 1 skipped` — i.e., the **infra-gated integration test (`queue-roundtrip`) was skipped even in CI**, despite the Redis service being declared. This suggests the runtime Redis probe (`isRedisUp`) did not detect the service in CI (timing/connectivity), so the gated test has **still not executed end-to-end**. This does not affect the Deploy Web analysis or the CI green status (the companion `runIf` assertion handles the skip), but it is worth a follow-up so the queue round-trip is actually proven in CI. Tracked separately from this analysis.

---

## 7. Determination

| Question | Answer |
|---|---|
| Exact error | `Path Validation Error: Path(s) specified in the action for caching do(es) not exist` in `Post Run actions/setup-node@v4` (pnpm cache save) |
| Root cause | `pnpm install` skipped (no `VERCEL_TOKEN`) → pnpm store never created → `setup-node`'s unconditional `cache: pnpm` post-step fails on the missing path |
| Expected due to missing deploy secrets? | **Yes** — deploy correctly skipped; the red mark is a cosmetic cache-post-step artifact of running without secrets |
| Blocks Sprint 1 FULL PASS? | **No** — the `CI` quality gate is GREEN for the same commit; deploy workflows require infra secrets that are not a Sprint 1 deliverable |

**Sprint 1 FULL PASS is supported by the green `CI` run. The Deploy Web failure is a non-blocking, expected-under-no-secrets workflow artifact, with optional cleanup recommended.**

*Read-only analysis. No code, workflows, or architecture were modified.*
