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

## 2. Infrastructure & Past Phase Status
* Render API is live.
* Render Frontend is live.
* Neon is connected.
* Upstash Redis is connected.
* Background worker is skipped because it is paid.
* cron-job.org is active and triggering every 5 minutes.
* **Phase 8:** Dashboard UI implemented.
* **Phase 9:** Cron job verification passed. `CRON_SECRET` rotated.
* **Phase 10:** Demo Data (Phase 10E) and Admin/Tenant QA (Phase 10F) completed safely.

## 3. Phase 11 Status (Meta Integration Setup)
* **Phase 11A (Completed):** Meta Integration Readiness Audit completed. Architecture is ready.
* **Phase 11B (Completed):** Meta Developer Setup Guide provided.
* **Latest Commit Hash:** `95578f1`
* **Real Integration Status:** NOT READY. Simulation mode works. Real credentials are not configured yet.

## 4. Current Blockers (Phase 11C: BLOCKED)
**Phase 11C is BLOCKED because the founder has NOT created the Meta Developer Account yet.**

*   Meta Developer Account: NOT CREATED YET
*   Meta App ID: PENDING
*   Instagram Business Account: PENDING
*   Facebook Page Connection: PENDING
*   WhatsApp Cloud API Test Number: PENDING
*   Test Users: PENDING
*   Render Meta Env Variables: PENDING
*   Local/Staging Meta Env Variables: PENDING
*   Real Instagram automation: NOT READY
*   Real WhatsApp automation: NOT READY
*   Real Facebook automation: NOT READY
*   Simulation mode: STILL AVAILABLE

## 5. Callback Paths to Configure (For Founder Later)
*   **Instagram Webhook:** `https://leados-api.onrender.com/api/webhooks/instagram`
*   **Instagram OAuth Callback:** `https://leados-api.onrender.com/api/instagram/callback`
*   **WhatsApp Webhook:** `https://leados-api.onrender.com/api/webhooks/whatsapp`

## 6. Required Environment Variable Names (No Values)
*   `INSTAGRAM_APP_ID`
*   `INSTAGRAM_APP_SECRET`
*   `INSTAGRAM_OAUTH_REDIRECT_URI`
*   `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`
*   `META_APP_SECRET`
*   `META_WHATSAPP_VERIFY_TOKEN`
*   `META_WHATSAPP_PHONE_ID`
*   `META_API_VERSION`
*   `FLAG_INSTAGRAM_SENDS_ENABLED`
*   `FLAG_WHATSAPP_SENDS_ENABLED`

## 7. Critical Safety Rules
* Do not print secrets.
* Do not ask founder to paste secrets in chat.
* Do not create or edit `.env` with real Meta values.
* Do not call Meta Graph API yet.
* Do not send real social messages.
* Do not deploy.
* Do not run production migration.
* Do not run seed/reset/db push.
* Do not weaken tenant isolation.
* Do not implement impersonation.
* Do not duplicate routes/services if existing ones exist. Reuse first.

## 8. Useful Commands
* `git branch --show-current`
* `git log --oneline -5`
* `git status --short`

## 9. Resume Instruction
Future agent: Start by reading this file only. Do not scan the repo. Continue from the Current Blockers section.
