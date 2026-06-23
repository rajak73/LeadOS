# Project State Handoff Document

This document serves as the single source of truth for the current state of the LeadOS project. It outlines sprint progress, technical decisions, database status, open risks, and next steps for subsequent agent sessions to prevent loss of state across restarts or session resets.

* **Last Updated:** 2026-06-22T16:35:00+05:30 (Sprint 7 M2 Phase B COMPLETE)

---

## 1. Repository Persistence Protocols

To guarantee zero loss of project state after workspace restarts, macOS shutdowns, or session resets, all agents must adhere to the following rules:

1. **Keep Documentation inside the Repository:** Never keep critical architectural decisions, implementation reports, audits, or milestone statuses only in chat. Always write them to files in the repository.
2. **Automatic Updates for Significant Changes:** After every significant change, update this file to reflect the latest:
   * Current sprint status
   * Completed tasks
   * Pending tasks
   * Files modified
   * Migrations added
   * Validation results
   * Next recommended action
3. **Milestone Updates:** After completing any milestone, update this document and the Git Status Summary section.
4. **Session Termination Handoff:** Before ending any session, save a handoff summary into this file, including a timestamp.
5. **Continuous Logging:** Append every major implementation step to `docs/planning/SESSION_LOG.md`.

---

## 2. Current Sprint Status

* **Active Sprint:** Sprint 7 (Intelligence & Automation)
* **Status:** 
  * **Milestone 1 (Notification Engine + Email + Foundations):** ✅ **100% Complete & Validated**
  * **Milestone 2 (AI Lead Scoring):** ✅ **Phase A + Phase B COMPLETE & VALIDATED**
    * Phase A: Database + Backend Foundation (ai_scores, ai_usage_counters, AiService, adapters, queue)
    * Phase B: AI Scoring Engine (prompt compiler, Redis cache, quota, rate-limit, circuit breaker, worker, activity, notifications, email template)
    * All 5 validation gates GREEN: typecheck ✅ lint ✅ build ✅ test 573/573 ✅ RLS 25/25 ✅
  * **Milestones 3–6:** ❌ **Not Started**
* **Overall Sprint 7 Completion:** ~40%

---

## 3. Sprint 6 Completion Summary

* **Milestone 6 (Inbox Saved Replies + Create Lead from Conversation):** Completed and verified.
* **Key Deliverables:**
  * **Backend CRUD:** Built `SavedReply` repository, service, controller, and routes.
  * **Lead Creation:** Added `createLeadFromConversation` handler in `InboxService` which queries `instagramUserId` uniqueness before creating a lead to avoid duplicate constraints.
  * **Frontend UI Components:** Implemented `SavedReplyPicker` (keyboard navigable: Up/Down/Enter/Esc) and `CreateLeadModal` using existing primitives and Design System tokens (no hardcoded hex colors).
  * **BFF Integrations:** Extracted token resolver to a shared helper `bff-auth.ts` across all 14 BFF proxy files and established saved replies and lead creation proxies.
* **Verification Status:** 19 integration tests for saved replies, 14 frontend unit/picker tests, all passing. Builds and lint check successfully. 22 tenant-scoped tables registered.

---

## 4. Sprint 7 Milestone 1 Completion Summary

* **Milestone 1 (Notification Engine + Email Delivery + Foundations):** Completed and validated.
* **Key Deliverables:**
  * **Persistent Notification Store:** Created `NotificationRepository` and `NotificationPreferenceRepository` for managing user notifications, unread counts, cursor lists, and user preference merges.
  * **Realtime Push Integration:** Swapped inbox-centric Socket.io connection to a unified `<AppChrome />` component rendering app-wide. Added `NotificationBell`, `NotificationPanel`, and a dedicated `/notifications` listing page.
  * **Gated Email Delivery:** Built a SendGrid REST interface (`EmailSender`) operating dark behind the default-off feature flag `notifications.email.enabled`.
  * **Deferred Foundations Resolved:**
    * **B-2 (Pipeline Activity):** Verified through tests that pipeline CRUD actions produce `activities` records correctly.
    * **§5.1 (Conversation Link):** Added nullable `activities.relatedConversationId` with indexes and extended the `activities_entity_required` Postgres CHECK constraint via migrations `0018` and `0019` to allow conversation-linked notifications.
* **Verification Status:** 9 notification API integration tests, 5 email sender unit tests, 4 component tests, all passing. RLS coverage expanded to 24 tenant-scoped tables.

---

## 5. Sprint 7 Milestone 2 — Phase A Completion Summary

* **Phase A (Database + Backend Foundation):** Completed and validated.
* **Key Deliverables:**
  * **Database & Migrations:** Deployed migration `0019_ai_usage_counters` to create the `ai_usage_counters` table and enable RLS policies scoped to `app.current_organization_id`. Total RLS-secured tables increased to **25**.
  * **AI Adapter Abstractions:** Created `AiAdapter` interface, rules-based `MockAiAdapter`, and skeleton `OpenAiAdapter`.
  * **Service Logic:** Refined `AiService` type casting, wiring up monthly DB quotas, hourly Redis sliding window caps, circuit breaker protection, and prompt cache checks.
  * **Testing:** Added 8 robust, deterministic unit tests for `AiService` verifying cache hits, breaker actions, and limit locks.
* **Verification Status:** `pnpm typecheck` (PASS), `pnpm lint` (PASS), `pnpm build` (PASS), and `vitest run src/modules/ai/` (8/8 PASS). `pnpm check:rls` confirms 25 tenant tables RLS-secured.

---

## 6. Milestone 2 (AI Lead Scoring) Architecture Decisions

* **Provider Abstraction:** Swappable `AiAdapter` interface containing `scoreLead`, `draftReply`, and `summarize` templates. Currently has `MockAiAdapter` (for test/dev) and `OpenAiAdapter` (OpenAI API integration) to guarantee no live API queries execute in CI.
* **Worker & Queue Design:** Scoring runs asynchronously via the `AI_SCORING` queue processed by `ai-scoring.worker.ts`. Triggered by `LEAD_CREATED`, `LEAD_STATUS_CHANGED`, and configuration-gated `MESSAGE_RECEIVED` events.
* **Cost & Quota Protection:** 
  * Hourly sliding-window checks managed via Redis.
  * Monthly usage counters persisted in a tenant-scoped `ai_usage_counters` database table.
  * A global `AI_MONTHLY_HARD_CAP_USD` config backstop.
  * Prompt caching using a hash of normalized lead properties stored in Redis to bypass LLM calls for identical states.
* **Graceful Degradation:** When limits are exceeded or the API is unavailable, the queue worker logs a `QUOTA_EXCEEDED` or `AI_PROVIDER_UNAVAILABLE` activity and skips execution, preventing user-facing request failure.
* **Model Routing:** Employs a tiered routing strategy using `gpt-4o-mini` by default and escalating to `gpt-4o` only when confidence is low.

---

## 7. Milestone 2 Implementation Checklist (Remaining Tasks)

Refer to the detailed implementation guide at [docs/planning/M2_IMPLEMENTATION_CHECKLIST.md](file:///Users/rajakumar/lead_os/docs/planning/M2_IMPLEMENTATION_CHECKLIST.md). Remaining items:

- [ ] **Phase B: Queue Worker Execution & Triggers**
  * Complete worker processing logic in `ai-scoring.worker.ts` to coordinate context loading, scoring, and score updates.
  * Bind event dispatch trigger calls inside `lead.service.ts` on lead creation and status transition.
- [ ] **Phase C: API REST & BFF Endpoints**
  * Create `GET /leads/:id/score` and `POST /leads/:id/rescore` controllers and routes.
  * Implement BFF routes and React query hooks (`useLeadScore`).
- [ ] **Phase D: Frontend Components Wiring**
  * Develop `LeadScoreBadge` and `LeadScorePopover`.
  * Wire badge display into `LeadTable` columns and detail pages.

---

## 8. Database State

* **RLS Coverage:** **25 tenant-scoped tables** are configured and validated under PostgreSQL Row-Level Security policies.
* **Enum Parity:** 36 `ActivityType` / `DomainEvent` values are verified across `@leados/shared` files and the database schema.
* **Active Tables:**
  * Organization / Membership: `organizations`, `users`, `organization_members`, `roles`, `permissions`, `refresh_tokens`, `verification_tokens`, `subscriptions`, `team_invites`.
  * CRM Core: `leads`, `contacts`, `tasks`, `notes`, `files`, `custom_field_definitions`, `pipelines`, `pipeline_stages`, `deals`.
  * Communication / Logging: `instagram_accounts`, `instagram_conversations`, `messages`, `webhook_events`, `activities`, `audit_logs`, `platform_audit_logs`.
  * Notifications (S7 M1): `notifications`, `notification_preferences`.
  * AI Usage (S7 M2): `ai_usage_counters`.

---

## 9. Next Recommended Task

Initiate **Sprint 7 Milestone 2 Phase B (Queue Worker Execution & Triggers)**:
1. Implement the job handling loop inside `ai-scoring.worker.ts`.
2. Connect database context compiling to build the structured prompt for LLM consumption.
3. Incorporate event dispatch triggers in the Lead CRUD pipeline.
4. Establish integration tests verifying that lead events successfully enqueue scoring jobs and update scores.

---

## 10. Git Status Summary

* **Active Branch:** `main`
* **Latest Commit Hash:** `676c1a4aaae50f0db3b4716ee7719770e7bef750`
* **Latest Commit Message:** `test(notifications): fix NextRequest typing in preferences route tests`
* **Latest Commit Date:** `2026-06-22T13:13:55+05:30`
* **Uncommitted Workspace Files:**
  * *Modified (tracked):* `apps/api/src/core/config/env.ts`, `apps/api/src/core/queue/worker-registry.ts`, `apps/api/src/core/tenancy/tenant-tables.test.ts`, `apps/api/src/core/tenancy/tenant-tables.ts`, `packages/shared/src/errors/error-codes.ts`, `packages/shared/src/types/index.ts`, `prisma/schema.prisma`
  * *Untracked (new):* `apps/api/src/core/queue/workers/ai-scoring.worker.ts`, `apps/api/src/modules/ai/`, `docs/planning/M2_IMPLEMENTATION_CHECKLIST.md`, `docs/planning/M2_PHASE_A_REPORT.md`, `docs/planning/PROJECT_STATE_HANDOFF.md`, `docs/planning/SESSION_LOG.md`, `docs/planning/agent_verification/`, `packages/shared/src/types/ai.ts`, `prisma/migrations/0019_ai_usage_counters/`
