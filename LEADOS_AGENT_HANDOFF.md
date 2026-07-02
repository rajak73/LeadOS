# LEADOS_AGENT_HANDOFF

## 1. Project Summary
* **Project name:** LeadOS
* **Repo:** https://github.com/rajak73/LeadOS
* **Branch:** sprint8-10-review
* **Live URLs:**
  * **API:** https://leados-api.onrender.com
  * **Frontend:** https://leados-web.onrender.com
* **Current deployment target:** Render frontend + Render backend API + cron-job.org
* **Database target:** Neon Postgres
* **Redis target:** Upstash Redis

## 2. Infrastructure & Phase 8 Status
* Render API is live.
* Render Frontend is live.
* Neon is connected.
* Upstash Redis is connected.
* Background worker is skipped because it is paid.
* cron-job.org is active and triggering every 5 minutes.
* **Phase 8A:** Marketing UI completed.
* **Phase 8C:** Dashboard light UI implemented.
* **Phase 8D:** QA/deploy report exists (`PHASE8D_DASHBOARD_UI_DEPLOYMENT_VERIFICATION_REPORT.md` confirms successful deployment).

## 3. Phase 9 Final Status: PHASE 9 CLOSED
* **Phase 9 cron final verification:**
  * API health: PASS
  * no-auth cron: 401 PASS
  * wrong-auth cron: 401 PASS
  * authorized cron: PASS
  * cron-job.org Last Execution Status: 200 PASS
  * `CRON_SECRET` rotated successfully.
  * No secret committed.
  * No production migration run.
  * No real Meta API calls made.
* **Social automation truth:**
  * Simulation mode works.
  * Interactive capture simulation works.
  * Real Meta credentials are **NOT** configured.
  * Real Instagram/WhatsApp/Facebook automation is **NOT** production-ready.
  * No real social messages sent.
* **Phase 9D Safety:**
  * Simulation bypass requires `isSimulation: true`.
  * Missing Meta credentials do **NOT** mark real messages SENT.
  * Real sends without credentials fail safely.
  * `captureState` stored in `Lead.customFields` as `NEEDS_NAME_PHONE`.

## 4. Remaining Blockers
* Real Meta credentials missing.
* Meta App Review/Advanced Access missing.
* Background worker skipped due to free mode.
* Cron has up to 5-minute latency.

## 5. Current Next Task
**Recommended next phase:** Phase 10 — Organization Data Assignment + Admin Visibility Review

**Goal:**
* Superadmin can see all organizations.
* Superadmin can see org summaries safely.
* Org admin only sees own organization data.
* Leads/customers/deals/messages/tasks are correctly organization-scoped.
* No cross-tenant leakage.
* No production seed/migration without approval.

## 6. Critical Safety Rules
* Do not print secrets.
* Do not commit `.env` files.
* Do not run production migration without explicit approval.
* Do not run `prisma migrate reset` or `prisma db push`.
* Do not call real Meta APIs.
* Do not send real social messages.
* Do not weaken tenant isolation.
* Do not run demo seed on production.
* Do not delete production data.
* Do not create paid worker or paid service.
* Do not insert fake production data without approval.
* Do not modify auth/session logic without approval.
* Do not modify Prisma schema/migrations without approval.

## 7. Useful Commands
* `git branch --show-current`
* `git log --oneline -5`
* `git status --short`

## 8. Resume Instruction
Future agent: Start by reading this file only. Do not scan the repo. Continue from the Current Next Task section.
