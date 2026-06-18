# DEPLOY_API_FAILURE_ANALYSIS.md

> **Analysis of the "Deploy API" GitHub Actions failure** (post CI-workflow remediation).
> Auditor: Engineering Manager, LeadOS · Date: 2026-06-18
> Method: read-only inspection of GitHub Actions run logs + Dockerfile/schema. No code, workflows, or architecture modified.
> Run analyzed: **Deploy API · `27775927903`** · commit `67a5b94` ("fix: github actions workflow configuration") · result **failure (22s)**.

---

## TL;DR

The Deploy API failure is a **genuine Docker image-build defect**, **NOT** a deployment-secrets issue and **NOT** cosmetic. The `Build API image` step (which runs unconditionally) fails because `infra/docker/api.Dockerfile` does **not copy the root `.npmrc`** into the build context — so inside the container the Prisma package-hoisting that makes `prisma generate` work in this pnpm monorepo is missing, triggering Prisma's `pnpm add prisma` auto-install loop, which fails. A compounding secondary issue is that the `node:20-alpine` base lacks OpenSSL and the schema declares no musl `binaryTargets`.

This is **distinct from the Deploy Web failure** (which was a cosmetic cache side-effect of missing secrets). Here the production image **cannot be built as written** — a real defect in Sprint 1 deliverable **D18 (Dockerfiles)**.

**It does not block Sprint 1 FULL PASS** (the FULL PASS gate is the green `CI` run, which excludes image builds), **but it is a real must-fix defect** — higher priority than the Deploy Web nit.

---

## 1. Exact Error

From `Deploy API` run `27775927903`, job `build-images` (22s):
```
JOBS
X build-images in 22s
  ✓ Set up job
  ✓ Run actions/checkout@v4
  X Build API image            ← FAILED
  - Build worker image         ← not reached
  - Release (Railway/ECS)      ← SKIPPED (if: env.RAILWAY_TOKEN != '')
  ✓ Complete job
```

The `Build API image` step (`docker build -f infra/docker/api.Dockerfile ...`) failed at `api.Dockerfile:13`:
```
api.Dockerfile:13
  13 | >>> RUN pnpm install --frozen-lockfile || pnpm install
ERROR: process "/bin/sh -c pnpm install --frozen-lockfile || pnpm install" did not complete successfully: exit code: 1
##[error]Process completed with exit code 1.
```

The underlying failure inside the build (from the postinstall during `pnpm install`):
```
apps/api postinstall$ prisma generate --schema=../../prisma/schema.prisma
prisma:warn Prisma failed to detect the libssl/openssl version to use, and may not work as expected.
            Defaulting to "openssl-1.1.x". Please manually install OpenSSL and try installing Prisma again.
apps/api postinstall: Error: Command failed with exit code 1: pnpm add prisma@5.22.0 -D --silent
 ELIFECYCLE  Command failed with exit code 1.
```

---

## 2. Root Cause

Two converging Dockerfile defects; the first is fatal:

### Primary (fatal) — `.npmrc` not copied into the image
`infra/docker/api.Dockerfile` (deps stage) copies the workspace manifests but **not the root `.npmrc`**:
```dockerfile
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages ./packages
COPY apps/api/package.json ./apps/api/package.json
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile || pnpm install
```
Verified: `grep .npmrc` in both Dockerfiles → **not present**.

The repo's `.npmrc` contains the Prisma package-hoisting that this monorepo depends on:
```
public-hoist-pattern[]=*prisma*
public-hoist-pattern[]=@prisma/*
```
This was the exact fix applied during local bootstrap so that `prisma generate` (which resolves `@prisma/client`/`prisma` relative to the **root** `prisma/schema.prisma`) can find them despite pnpm's isolated layout. **Without `.npmrc` in the image**, `prisma generate` cannot resolve its packages → Prisma falls back to **auto-installing the CLI** (`pnpm add prisma@5.22.0 -D --silent`) → that command fails (the same auto-install loop documented in the original bootstrap), failing the `RUN pnpm install` layer and the whole build.

### Secondary (compounding) — Alpine base lacks OpenSSL + no musl binaryTarget
- Base image is `node:20-alpine` (musl libc). Prisma logs: *"Prisma failed to detect the libssl/openssl version… Please manually install OpenSSL."* Alpine doesn't ship the OpenSSL libs Prisma's query engine needs.
- The Prisma generator block declares no `binaryTargets`, so the `linux-musl-openssl-3.0.x` engine isn't generated. Even if the `.npmrc` issue were fixed, the image would need `apk add openssl` + a musl `binaryTarget` (or a glibc base) for Prisma to run at runtime.

**Both are Dockerfile/image-build defects** — independent of application source, the CI quality gates, and deployment secrets.

---

## 3. Is it expected because deployment secrets are not configured?

**No.** This is the key difference from the Deploy Web analysis.

| Aspect | Verdict |
|---|---|
| Which step failed? | **`Build API image`** — a `docker build` step that runs **unconditionally** (no secret gate). |
| Was the secret-gated step the cause? | **No** — the only secret-gated step, `Release (Railway/ECS)` (`if: env.RAILWAY_TOKEN != ''`), was correctly **skipped** and never reached. |
| Would configuring `RAILWAY_TOKEN` fix it? | **No** — the image build fails **before** any release/secret step; secrets are irrelevant to a `docker build`. |
| Is it a real defect or a no-secrets artifact? | **A real defect** — the Dockerfile cannot build the image as written, regardless of secrets. |

So, unlike Deploy Web (where the deploy correctly skipped and the red mark was a cache post-step artifact), Deploy API fails on a genuine build defect that has **nothing to do with missing deploy secrets**.

---

## 4. Does it block Sprint 1 FULL PASS?

**No — but with an important caveat that distinguishes it from Deploy Web.**

- The FULL PASS condition (`SPRINT_1_FINAL_SIGNOFF.md` §7) is a **green `CI` workflow run**. The `CI` workflow **succeeded** for this commit (`27775927924`, build-test 1m18s: install → migrations → typecheck → lint → test+coverage → build → audit → enum-parity → secret-leak). Image building is **not part of `ci.yml`** — it only runs in `deploy-api.yml`. So by the gate's definition, this failure does not block FULL PASS.
- **Live deployment is not a Sprint 1 deliverable** — no deploy target/secrets are provisioned in Sprint 1. The deployment workflows are scaffolding for later.

**Caveat (be honest):** unlike the Deploy Web cosmetic nit, this is a **real defect in a Sprint 1 deliverable** — D18 explicitly includes "api/worker Dockerfiles," and those Dockerfiles **do not build**. It does not block the CI-gate-based FULL PASS, but it means *"the container image is not yet buildable,"* which must be fixed before any image build or deployment (Sprint 2 or whenever containers are first built). It should be tracked as a **known defect / carry-forward**, at higher priority than the Deploy Web issue.

> Net: **not a FULL PASS blocker** under the agreed gate (green CI), **but a genuine Dockerfile defect that must be remediated** before the image is built/shipped.

---

## 5. Recommended fix — for later, not applied here (read-only)

Both Dockerfiles (`api.Dockerfile`, `worker.Dockerfile`) need the same fixes:

1. **Copy `.npmrc` into the build context** so Prisma resolution works (fixes the fatal auto-install loop):
   ```dockerfile
   COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .npmrc ./
   ```
2. **Make Prisma work on the base image.** Either:
   - **Simplest:** switch the base from `node:20-alpine` to **`node:20-slim`** (Debian; ships OpenSSL; Prisma's default debian engine resolves) — no schema change needed; **or**
   - Keep Alpine and add `RUN apk add --no-cache openssl` **and** declare `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]` in the Prisma generator block (`prisma/schema.prisma`).
3. **(Defense-in-depth)** set `ENV PRISMA_GENERATE_SKIP_AUTOINSTALL=true` in the deps stage so Prisma can never trigger the `pnpm add prisma` auto-install path even if resolution hiccups.

> Note: option 2's Alpine path touches `prisma/schema.prisma` (a `binaryTargets` line) — choosing `node:20-slim` keeps the fix to the Dockerfiles only. These are infrastructure changes, deliberately **not** made in this read-only analysis. Also still pending: the GitHub runner **Node 20→24 deprecation** warning (informational).

---

## 6. Comparison: Deploy Web vs Deploy API

| | Deploy Web (`27775927898`) | Deploy API (`27775927903`) |
|---|---|---|
| Failing step | `Post Run actions/setup-node@v4` (cache save) | `Build API image` (`docker build`) |
| Nature | **Cosmetic** — cache post-step has no path because install was skipped | **Real build defect** — image cannot be built |
| Caused by missing secrets? | Yes (deploy skipped; cache artifact) | **No** (build fails before any secret step) |
| Underlying issue | `cache: pnpm` runs when install is skipped | `.npmrc` not copied → Prisma auto-install loop; + Alpine OpenSSL/binaryTarget |
| Severity | Low (workflow hygiene) | **Medium** (Sprint 1 deliverable D18 non-functional) |
| Blocks FULL PASS? | No | No (CI gate green) — but must-fix carry-forward |

---

## 7. Determination

| Question | Answer |
|---|---|
| Exact error | `docker build` of `api.Dockerfile:13` fails: `apps/api postinstall: Error: Command failed with exit code 1: pnpm add prisma@5.22.0 -D --silent` (Prisma CLI auto-install loop), with Alpine OpenSSL detection warnings |
| Root cause | `.npmrc` (Prisma hoist config) not copied into the image → `prisma generate` can't resolve packages → auto-install loop fails; compounded by `node:20-alpine` lacking OpenSSL + no musl `binaryTargets` |
| Expected due to missing deploy secrets? | **No** — the build step runs unconditionally and fails before the secret-gated Release step (which correctly skipped); secrets are irrelevant to the build |
| Blocks Sprint 1 FULL PASS? | **No** — the `CI` quality gate is green and image-building is not part of CI; **but** it is a genuine, must-fix defect in Sprint 1 deliverable D18 (Dockerfiles), to remediate before any image build/deploy |

**Sprint 1 FULL PASS remains supported by the green `CI` run. The Deploy API failure is a real (non-secrets, non-cosmetic) Dockerfile build defect that does not block the CI-defined FULL PASS but must be tracked and fixed before containerized deployment.**

*Read-only analysis. No code, workflows, or architecture were modified.*
