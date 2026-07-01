# LEADOS_AGENT_HANDOFF

## 1. Project Summary
* **Project name:** LeadOS
* **Repo:** https://github.com/rajak73/LeadOS
* **Branch:** sprint8-10-review
* **Current deployment target:** Render frontend + Render backend API + Render worker
* **Database target:** Neon Postgres
* **Redis target:** Upstash Redis

## 2. Current Status
* GitHub Actions are now green on sprint8-10-review.
* Latest verified green checks:
  * CI
  * Migration Check
  * Tenant Isolation Suite
  * Preview Deploy
* Latest known fix commit: `eb4c421` (including enum parity, migration, table, and constraint fixes).
* Phase 7B can now start.
* Cloud connection remains pending.

## 3. What Has Been Completed
* Super Admin UI
* Social routing/Facebook webhook fix
* Lead scoring QA
* Workflow stop-condition fix
* create_task UUID fix
* Lead scoring UI polish
* Marketing/features/pricing/onboarding
* Render deployment docs
* Commit/push to GitHub

## 4. Critical Safety Rules
* Do not ask for production secrets unless Phase 7B is approved.
* Do not print secrets.
* Do not run production migration until CI green.
* Do not deploy until approved.
* Do not scan whole repo unless file-specific context is insufficient.
* It is now okay to ask for Neon/Upstash/Render public/config values for Phase 7B.
* Do not ask for Meta/Gemini/Stripe keys unless required later.
* Do not run demo seed in production.
* Do not run migrate reset/db push on production.
* Do not print database/Redis URLs or secrets.

## 5. Current Next Task
**Current next task:** Phase 7B — Cloud Connection Verification + Production Migration + Render Deployment Smoke Test

**Goal:** Use Founder-provided Neon, Upstash, and Render URLs/config values to verify production connectivity safely, run Prisma migrate deploy only with explicit approval, verify API health, frontend response, CORS, worker status, and signup/auth smoke tests. Mask all secrets and do not print any secret values.

## 6. Files to Read First
In future sessions, read only:
* `LEADOS_AGENT_HANDOFF.md`

Then, only if needed:
* `PHASE7B_CLOUD_CONNECTION_VERIFICATION_REPORT.md`
* `PHASE7A_MANUAL_CLOUD_SETUP_GUIDE.md`
* `RENDER_DEPLOYMENT_RUNBOOK.md`

**Do not read every file.**

## 7. Useful Commands
* `git branch --show-current`
* `git log --oneline -5`
* `git status --short`
* `gh run list --branch sprint8-10-review` (if gh is available)
* `gh run view <id> --log-failed` (if needed)

## 8. What Not To Do
* Do not run full repo grep unless needed.
* Do not run all tests unless needed.
* Do not run browser automation.
* Do not deploy.
* Do not use production URLs.
* Do not request Meta/Gemini/Stripe keys unless logs prove missing required envs.

## 9. Resume Instruction
Future agent: Start by reading this file only. Do not scan the repo. Continue from the Current Next Task section.
