# CI_REMEDIATION_REPORT.md

> **CI workflow remediation** — fixes for the failures identified in `SPRINT_1_FINAL_SIGNOFF.md`.
> Owner: Engineering Manager, LeadOS · Date: 2026-06-18
> Scope: **GitHub Actions workflow configuration only.** No application code, no architecture, no Sprint 2 work.
> Environment: Node v20.20.2, pnpm 9.15.9.

---

## Summary

The Sprint 1 final sign-off found the actual CI pipeline **red** despite all local gates passing, due to two workflow-configuration defects. Both are now fixed across **all** affected workflows. All 7 workflow files validate as well-formed YAML, and the local gates remain green (no application code was touched).

| Defect | Files affected | Status |
|---|---|---|
| **A** — duplicate pnpm version (`version: 9` + `packageManager`) | `ci.yml`, `deploy-web.yml`, `preview.yml`, `migrate-check.yml` | ✅ Fixed |
| **B** — `secrets` context in a job/step `if:` condition | `deploy-web.yml`, `preview.yml`, `deploy-api.yml` | ✅ Fixed |

---

## Defect A — Duplicate pnpm version specification

### Root cause
`pnpm/action-setup@v4` was configured with `version: 9` **and** the repo declares `packageManager: pnpm@9.15.9` in `package.json`. `action-setup@v4` rejects a double specification:
```
Error: Multiple versions of pnpm specified:
  - version 9 in the GitHub Action config with the key "version"
  - version pnpm@9.15.9 in the package.json with the key "packageManager"
```
This failed the `build-test` job at the *Set up pnpm* step — **before install, typecheck, lint, test, coverage, build, or audit could run.**

### Fix
Removed the `version:` input from every `pnpm/action-setup@v4` usage, making `packageManager` in `package.json` the **single source of truth** for the pnpm version.

**Before:**
```yaml
- uses: pnpm/action-setup@v4
  with:
    version: 9
```
**After:**
```yaml
# pnpm version comes from package.json `packageManager` (single source of truth).
- uses: pnpm/action-setup@v4
```

### Files fixed (4)
- `ci.yml` (as required)
- `deploy-web.yml`
- `preview.yml`
- `migrate-check.yml` — **also had the identical defect.** Although not in the original numbered list, `SPRINT_1_FINAL_SIGNOFF.md` §6 item 1 said "(and any workflow using `pnpm/action-setup`)", and this workflow triggers on `prisma/**` changes (frequent in Sprint 2). Fixing it now prevents a guaranteed red run later.

> `deploy-api.yml` does not use `pnpm/action-setup` (docker-only), so Defect A does not apply to it.

---

## Defect B — `secrets` context in `if:` conditions

### Root cause
GitHub Actions does **not** allow the `secrets` context in `if:` expressions (job-level is rejected outright, causing 0s workflow-startup failures). `deploy-web.yml` and `preview.yml` used it at **job level**; `deploy-api.yml` used it at **step level**.

### Fix
Mapped the secret to a **job-level `env:`** variable and gated on `env.*` (GitHub's recommended pattern). This keeps the "skip when the deploy token is absent" behavior without referencing `secrets` in a conditional.

**Before (deploy-web.yml / preview.yml — job level):**
```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    if: ${{ secrets.VERCEL_TOKEN != '' }}    # invalid
```
**After:**
```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
    steps:
      ...
      - run: pnpm install --frozen-lockfile
        if: ${{ env.VERCEL_TOKEN != '' }}
      - name: Deploy to Vercel production
        if: ${{ env.VERCEL_TOKEN != '' }}
        run: npx vercel deploy --prod --token=${{ secrets.VERCEL_TOKEN }}
```

**Before (deploy-api.yml — step level):**
```yaml
- name: Release (Railway/ECS)
  if: ${{ secrets.RAILWAY_TOKEN != '' }}
```
**After:**
```yaml
jobs:
  build-images:
    env:
      RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
    steps:
      ...
      - name: Release (Railway/ECS)
        if: ${{ env.RAILWAY_TOKEN != '' }}
```

### Files fixed (3)
- `deploy-web.yml` — job-level `if: secrets` removed; deploy steps now gated on `env.VERCEL_TOKEN`.
- `preview.yml` — job-level `if: secrets` removed; deploy steps now gated on `env.VERCEL_TOKEN`.
- `deploy-api.yml` — step-level `secrets`-in-`if` replaced with `env.RAILWAY_TOKEN` gating (also the deliberate review item from the task).

---

## Verification

### Workflow lint
```
version: 9 remaining          → none ✓
job-level if: secrets remaining → none ✓
secret-gated steps now use env  → env.VERCEL_TOKEN / env.RAILWAY_TOKEN ✓
YAML validity (all 7 files)     → all valid ✓
```

### Required local gates (Node 20.20.2 / pnpm 9.15.9)
| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ 4/4 workspaces |
| `pnpm lint` | ✅ 4/4 (incl. module-boundary rules) |
| `pnpm test` | ✅ 45 passed, 1 gated-skip (shared 8, web 9, api 28 +1 Redis-gated) |
| `pnpm build` | ✅ 3/3 (shared + api server/worker + web) |

### Scope confirmation
`git diff --name-only` shows **only** workflow files changed — no application code:
```
.github/workflows/ci.yml
.github/workflows/deploy-api.yml
.github/workflows/deploy-web.yml
.github/workflows/migrate-check.yml
.github/workflows/preview.yml
```

---

## Expected CI behavior after these fixes

- **`ci.yml`** — proceeds past pnpm setup and runs the full gate chain (install → migrations → build shared → typecheck → lint → test+coverage → build → audit → enum-parity → secret-leak guard) against the service Postgres + Redis, which also enables the infra-gated integration tests (`queue-roundtrip`, deep-health). All gates pass locally, so CI is expected green.
- **`deploy-web.yml` / `preview.yml`** — start cleanly; the deploy steps **no-op when `VERCEL_TOKEN` is unset** (no secrets configured yet) rather than failing the workflow.
- **`deploy-api.yml`** — builds the docker images; the release step **no-ops when `RAILWAY_TOKEN` is unset**.

> One residual non-blocking item (not a failure): GitHub's runner deprecation warning that `actions/checkout@v4` / `pnpm/action-setup@v4` run on Node 24. Informational only; can be addressed by bumping action versions when convenient.

---

## Status & Next Step

- ✅ All identified CI workflow defects fixed (Defects A and B), across every affected workflow.
- ✅ All workflow YAML valid; local gates green; **only workflow config changed**.
- ⏭️ **Next (outside this task's scope):** commit and push these workflow changes, then confirm the `CI` workflow run is **green** on GitHub. That green run satisfies the final FULL PASS condition from `SPRINT_1_FINAL_SIGNOFF.md` §7 and flips Sprint 1 to **FULL PASS**.

*CI workflow configuration only. No application code modified; no architecture changed; Sprint 2 not started.*
