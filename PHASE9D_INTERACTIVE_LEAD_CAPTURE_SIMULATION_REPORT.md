# Phase 9D — Interactive Lead Capture Simulation Report

## 1. Approved Scope
Implemented the Simulated Interactive Lead Capture flow (`NEEDS_NAME_PHONE`) within the inbound webhook processing pipeline to request missing contact details (Name and Phone) from new Instagram and WhatsApp senders. This feature was built entirely in simulation mode.

## 2. Simulation-Only Clarification
**CRITICAL:** Real Meta credentials (app IDs, secrets, verify tokens) have NOT been provided yet. Therefore, this entire flow was implemented and verified locally using simulation scripts. No real users have been contacted, and no real Meta APIs were called.

## 3. Founder Decisions
- **Simulation Mode:** Explicitly approved. Send workers skip real Meta API calls and save outbound replies as "SENT" locally.
- **Migration Avoided:** Explicitly avoided creating new Prisma migrations or Enums. 
- **DB State Tracking:** Used the existing `Lead.customFields` JSON property to track `captureState: 'NEEDS_NAME_PHONE'`.
- **Queue Preservation:** Preserved the full internal queue architecture (webhook ingestion -> cron drain -> send worker -> cron drain) to validate the end-to-end simulated cycle.

## 4. Existing Schema Findings
- The `Lead` model already possessed a `customFields` JSON column, which proved perfect for tracking ephemeral states without schema migrations.
- Outbound responses correctly utilize the existing `Message` and `WhatsAppMessage` models.
- The `Activity` model supported a safe fallback `NOTE` type for logging the successful capture of details, avoiding a new DB Enum constraint.

## 5. No AI Constraint
As explicitly requested, **no AI APIs (OpenAI, Gemini, Groq) were used** for this flow.
- Name and phone parsing use deterministic, rule-based heuristics (`RegEx`).
- `FLAG_AI_SCORING_ENABLED` remains disabled for this flow.
- If AI is desired in the future, it is documented as strictly optional (`GEMINI_API_KEY` for free tier, or `OPENAI_API_KEY`/`GROQ_API_KEY` for prod).

## 6. Migration Avoidance Confirmation
**SUCCESS.** No schema migrations were created. No new tables, columns, or enums were required.

## 6. customFields Capture State Design
- When a new lead with missing details messages the system, `lead.customFields.captureState` is set to `"NEEDS_NAME_PHONE"`.
- This state is checked on subsequent inbound messages.
- Once a phone number is successfully parsed from the message body, `captureState` is cleared from the JSON object.

## 7. Queue Decision: Redis send queue preserved
The webhook worker intentionally enqueues outbound simulated messages into `instagram-send` and `whatsapp-send` queues instead of directly saving them as SENT in the database. This ensures the BullMQ logic and queue structure is validated as part of the simulation flow.

## 8. Implementation Summary
- **Service Created:** `InteractiveCaptureService` handles the state transitions, name/phone parsing heuristics, and triggering outbound responses.
- **Inbound Integration:** Hooked into `webhook.worker.ts` post-lead-creation for both Instagram and WhatsApp.
- **Outbound Simulation:** Updated `instagram-send.worker.ts` and `whatsapp-send.worker.ts` to bypass Meta API calls and safely resolve jobs locally if the `SIMULATION_MODE` condition is met (missing secrets or explicitly disabled flags).

## 9. Files Changed
- `apps/api/src/modules/inbox/interactive-capture.service.ts` (New)
- `apps/api/src/core/queue/workers/webhook.worker.ts`
- `apps/api/src/core/queue/workers/instagram-send.worker.ts`
- `apps/api/src/core/queue/workers/whatsapp-send.worker.ts`
- `apps/api/scripts/manual-qa/simulate-instagram-webhook.ts`
- `apps/api/scripts/manual-qa/simulate-whatsapp-webhook.ts`
- `apps/api/scripts/manual-qa/verify-social-smoke-results.ts`

## 10. Manual QA Scripts Updated
- **Simulation Scripts:** Now accept an optional command-line argument to inject custom text (e.g., `tsx simulate-instagram-webhook.ts "Hi, I want pricing"`).
- **Verification Script:** Now correctly formats `firstName`, `phone`, and tracks the live `captureState` of leads.

## 11. Validation Results
- API Typecheck: PASS
- API Lint: PASS
- API Build: PASS

## 12. Smoke Test Steps
1. Run: `tsx apps/api/scripts/manual-qa/simulate-instagram-webhook.ts "Hi, I want pricing"`
2. Verify DB: Lead is created, `captureState` is `NEEDS_NAME_PHONE`. Outbound capture request is generated and enqueued.
3. Drain Queues: Ensure the queue drain processes the webhook and sends the simulated reply.
4. Run: `tsx apps/api/scripts/manual-qa/simulate-instagram-webhook.ts "My name is Rahul and my phone is 9876543210"`
5. Drain Queues again.
6. Verify DB: `captureState` cleared, lead `phone` updated to `9876543210`, lead `firstName` updated to `Rahul`.

## 13. Tenant Isolation Confirmation
All capture logic retrieves the `organizationId` from the securely identified `Lead` record. Simulated Send Workers enforce lookups based strictly on the associated `accountId` and `organizationId`. 

## 14. What Is Still Blocked Without Real Meta Credentials
- **Real Instagram Integration:** Cannot be configured.
- **Real WhatsApp Integration:** Cannot be configured.
- **Meta Webhook Subscriptions:** Cannot process real events.
- **App Review:** Blocked.
- **Outbound Replies:** All responses remain confined to local database storage via the simulation bypass.

## 15. Safety Confirmations
- ✅ No real Meta APIs called
- ✅ No real messages sent
- ✅ No secrets printed
- ✅ No env files committed
- ✅ No production migration run
- ✅ No seed/reset/db push
- ✅ No paid worker created
- ✅ Tenant isolation preserved

## 16. PASS/FAIL Verdict
**PASS.** The simulated interactive lead capture flow successfully requests and parses missing contact details without executing real Meta APIs.

## 17. Next Founder Action
- Review the `PHASE9D_INTERACTIVE_LEAD_CAPTURE_SIMULATION_REPORT.md`
- Once approved, proceed with next steps or wait to configure real Meta credentials to transition this flow to production.
