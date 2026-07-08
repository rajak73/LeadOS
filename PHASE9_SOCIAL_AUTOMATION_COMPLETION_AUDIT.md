# PHASE 9 — SOCIAL AUTOMATION COMPLETION AUDIT

## Goal
Audit and verify how much LeadOS is truly complete regarding Instagram/WhatsApp/Facebook auto-reply and lead capture behavior in the current free deployment mode.

## 1. Existing Webhook Implementation
- Webhook routes (`/api/webhooks/instagram`, `/api/webhooks/whatsapp`) exist and correctly verify Meta's `X-Hub-Signature-256`.
- Payloads are safely ingested into the `webhook_events` table as `PENDING` events.
- Actual parsing into Conversations, Messages, and Leads is delegated to a BullMQ background worker (`webhook.worker.ts`).

## 2. Organization Identification
- **Works correctly:** The worker extracts the `recipientIgUserId` or `phoneNumberId` from the payload, queries the `InstagramAccount` or `WhatsAppAccount` table, and resolves the correct `organizationId`.
- All subsequent database operations run safely inside a `withTenant(organizationId)` context.

## 3. Existing Customer Lookup (Same Organization)
- **Works correctly:** The `findOrCreateLead` function executes a tenant-scoped query (`db.lead.findFirst`) using the sender's Instagram/Facebook ID or Phone Number. 
- It reliably finds existing customers belonging *only* to that specific organization.

## 4. New Customer Flow (Name & Phone)
- **Simulated / Not Fully Implemented:** When a new user messages the platform, the system creates a `Lead` record with a placeholder name (e.g., "IG User" or their WhatsApp profile name). 
- It does **not** currently execute an interactive auto-reply flow asking for their name and phone number. Lead enrichment via Meta API (`getSenderProfile`) is explicitly marked as "deferred" in the codebase.

## 5. Duplicate Prevention (Same Organization)
- **Works correctly:**
  - Idempotency is enforced at the webhook layer using a `UNIQUE(source, externalEventId)` constraint.
  - Concurrent lead creation handles race conditions by gracefully catching Prisma `P2002` unique constraint errors and re-querying.
  - Messages use a `createIfNotExists` repository method based on the Meta `mid` (Message ID).

## 6. Multi-Organization Customer Isolation
- **Works correctly:** Because all lead queries and creations are wrapped in `withTenant(organizationId)`, the exact same Instagram user messaging two different LeadOS tenants will correctly result in two isolated `Lead` records in the database.

## 7. Reply Sending Worker Dependency
- **Depends entirely on the worker queue:** The `InboxService.sendMessage` function optimistically creates a local message record and then enqueues an `INSTAGRAM_SEND_JOB` or `WHATSAPP_SEND_JOB` to BullMQ.
- The actual HTTP call to the Meta Graph API only happens inside the background worker.

## 8. What is Blocked Because Worker is Skipped?
Because the Render background worker is skipped in this free deployment:
1. **Inbound Messages:** Webhooks are saved to the database but are **never** processed into the Inbox (Conversations/Messages/Leads).
2. **Outbound Messages:** Agent replies sent from the UI will be saved locally as "SENT" but will **never** be delivered to Meta.
3. **Automations:** Workflow executions, AI lead scoring, and lead enrichments will not run.

## 9. What is Blocked Because Meta Approval is Missing?
1. **Public Lead Capture:** The app can only receive messages from developer test accounts. Real users cannot message the bot.
2. **Public Replies:** The app cannot send outbound messages to non-test users. (WhatsApp requires business verification/approved templates; Instagram requires Advanced Access).

---

## Summary & Completion Percentage
- **Core Webhook Ingestion:** 100% (Saves to DB securely)
- **Multi-Tenant Routing:** 100% (Flawless isolation)
- **Inbox Processing Worker:** 90% (Code is complete but won't run in free mode)
- **Auto-Reply Bot / Interactive Flows:** 0% (No conversational bot asks for name/phone yet; workflows are stubbed)
- **Production Readiness without Worker:** 0%

## Final Recommendation & Cheapest Workaround
The social automation feature **is not functional in the current free deployment mode** because BullMQ requires a running background worker to drain the Redis queues.

**Cheapest / Free Workaround:**
Implement a lightweight, synchronous HTTP cron endpoint (e.g., `GET /api/cron/drain-queues`) that can be pinged by a free service like cron-job.org every minute. This endpoint would manually trigger the processing logic in `webhook.worker.ts` and `instagram-send.worker.ts` without needing a dedicated 24/7 worker process.

**Alternative:**
Deploy the Render Background Worker (cheapest paid tier is ~$7/month).
