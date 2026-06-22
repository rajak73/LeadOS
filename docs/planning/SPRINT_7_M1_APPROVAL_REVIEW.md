# Sprint 7 — M1 Approval Review (Notification Engine + Email + Foundations)

**Author:** Principal Engineer (source-verified audit at HEAD `6523980`)
**Date:** 2026-06-22
**Milestone:** M1 — Notification Engine + Email Delivery + Foundations
**Status:** READINESS REVIEW — verifies the codebase against the Sprint 7 M1 requirements. No code written, no files modified.
**Verdict:** ✅ **GO — with two scope corrections** (B-2 already complete; baseline enum count is 31 not 32). Details in §3.

**Inputs read in full:** `SPRINT_7_ARCHITECTURE_REVIEW.md`, `SPRINT_7_EXECUTION_PLAN.md`, `SPRINT_7_RISK_ASSESSMENT.md`, `SPRINT_7_ACCEPTANCE_CRITERIA.md`, `SPRINT_7_UI_MODERNIZATION_PLAN.md`.
**Method:** every current-state claim in the Sprint 7 docs that M1 depends on was re-verified against live source (not taken on trust). Results below.

---

## 1. Executive Summary

M1 is **low-risk and largely an activation milestone.** All four pieces of infrastructure M1 needs already exist as deliberate seams from Sprints 4–6:
- `NOTIFICATION_DELIVERY` (c=15) and `EMAIL_DELIVERY` (c=20) queues are defined with **no processors registered** — M1 registers them.
- The realtime spine (`emitToOrg`, `notifyOrg`, org rooms, Socket.io + Redis adapter/emitter) is complete and proven in Sprint 6 — M1 adds **persistence** in front of it.
- The activity/enum/parity machinery (`ActivityService.append`, `check:enum-parity`, discriminated `ActivityMetadata`) is in place — M1 extends it by 5 types.
- The module/tenancy/RLS conventions are uniform across 11 modules — the `notifications` module follows them verbatim.

**Two corrections to the Sprint 7 planning docs** were found during verification (§3). Neither blocks M1; both *reduce* M1 scope or improve accuracy.

---

## 2. Verification Matrix — Sprint 7 doc claims vs. live source

Every claim M1 relies on, checked against the actual code. ✅ = claim accurate.

| # | Claim (from Sprint 7 docs) | Verified? | Evidence |
|---|----------------------------|:---------:|----------|
| 1 | `NOTIFICATION_DELIVERY` + `EMAIL_DELIVERY` queues exist, concurrency 15/20 | ✅ | `core/queue/names.ts` |
| 2 | No worker registered for either queue | ✅ | `core/queue/worker-registry.ts` registers only system, lead-import, lead-export, webhook-processing, instagram-send |
| 3 | `emitToOrg(orgId,event,payload)` / `notifyOrg(orgId,event,payload)` exist; ephemeral only | ✅ | `core/realtime/socket-server.ts`, `notification-publisher.ts` — fire-and-forget, no DB writes |
| 4 | No persistent notification storage today | ✅ | no `Notification` model; realtime is pub/sub only |
| 5 | `Notification` / `NotificationPreference` models absent | ✅ | `prisma/schema.prisma` |
| 6 | `NotificationType` / `NotificationChannel` enums absent | ✅ | `prisma/schema.prisma` |
| 7 | `Activity.relatedConversationId` absent (5 related FKs: lead/contact/deal/pipeline/pipelineStage) | ✅ | `prisma/schema.prisma` Activity model |
| 8 | None of `NOTIFICATION_SENT / LEAD_SCORED / WORKFLOW_TRIGGERED / WORKFLOW_ACTION_EXECUTED / FOLLOW_UP_CREATED` exist | ✅ | `events.ts`, `enums.ts`, `activity-metadata.ts` |
| 9 | `NOTIFICATION_NOT_FOUND` error code absent | ✅ | `packages/shared/src/errors/error-codes.ts` (16 codes, none for notifications) |
| 10 | 22 tenant tables; `notifications` / `notification_preferences` not among them | ✅ | `core/tenancy/tenant-tables.ts` (TENANT_TABLES = 22, TENANT_MODELS = 22) |
| 11 | `notifications.email.enabled` flag absent | ✅ | `core/flags/flags.ts` (5 flags) |
| 12 | `SENDGRID_API_KEY` / `EMAIL_FROM` / `EMAIL_REPLY_TO` env vars absent | ✅ | `core/config/env.ts` |
| 13 | Latest migration is `0016` | ✅ | `prisma/migrations/0016_instagram_fk` (also `0015b` concurrent-index precedent) |
| 14 | Inbox IG-message path fires `notifyOrg(orgId,'instagram:message',…)` | ✅ | `core/queue/workers/webhook.worker.ts` (~L331–339), inside/after the `withTenant` txn |
| 15 | No notifications web components / BFF route / hook | ✅ | `apps/web/src` — no `components/notifications/`, no `bff/notifications`, no `useNotifications` |
| 16 | Socket init currently only in `InboxPage` (must move to layout — R-RT-1) | ✅ | only `components/inbox/InboxPage.tsx` + `lib/socket/client.ts` reference the socket; `(dashboard)/layout.tsx` is a static RSC |
| 17 | `check:enum-parity` gate exists (4-place parity enforcement) | ✅ | `scripts/check-enum-parity.mjs` |
| 18 | Module pattern: service(class)+repository+controller+routes+index; `buildXModule(requirePermission)` | ✅ | `modules/deals/*` is the template |
| 19 | `ActivityService.append(db, ctx, input)` signature + `ActivityAppendInput` | ✅ | `core/activities/activity.service.ts` |
| 20 | Cursor pagination convention `{at,id}` JSON → `{ items, nextCursor }` | ✅ | `modules/inbox/inbox.controller.ts` + `inbox.repository.ts` |

**20/20 M1-relevant claims verified accurate.** Plus the two corrections below.

---

## 3. Discrepancies Found (corrections to the Sprint 7 docs)

### D-1 · **B-2 is ALREADY RESOLVED — pipeline activity emission exists at HEAD** (scope reduction)

The Sprint 7 Architecture Review §1.4 and Execution Plan M1 scope item #3 state *"PipelineService does not call ActivityService.append() for pipeline CRUD"* and schedule the fix in M1. **This is no longer true at HEAD.**

`apps/api/src/modules/pipelines/pipeline.service.ts` emits a full activity **and** audit row for **all seven** pipeline operations, inside `withTenant`:

| Method | ActivityType emitted | Audit |
|--------|---------------------|-------|
| `create()` | `PIPELINE_CREATED` (+ `PIPELINE_STAGE_CREATED` per seeded stage) | created |
| `update()` | `PIPELINE_UPDATED` | updated |
| `delete()` | `PIPELINE_DELETED` | deleted |
| `createStage()` | `PIPELINE_STAGE_CREATED` | created |
| `updateStage()` | `PIPELINE_STAGE_UPDATED` | updated |
| `deleteStage()` | `PIPELINE_STAGE_DELETED` | deleted |
| `reorderStages()` | `PIPELINE_STAGE_REORDERED` | reordered |

All seven `PIPELINE_*` `ActivityMetadata` interfaces already exist in the union. The Sprint 6 signoff §2 deferred this, but it was evidently completed during Sprint 6 implementation.

**Impact on M1:** scope item #3 changes from *implement* to **verify-and-cover**: confirm an integration test asserts a pipeline-create produces an `activities` row with `relatedPipelineId` (Acceptance Criterion M1-7). If such a test already exists, M1-7 is satisfied with zero code. **This removes the only service-logic change from M1's "foundations" bucket.**

### D-2 · **Baseline enum/event count is 31, not "32"** (accuracy)

Architecture Review §1.2 says *"32 DomainEvents."* Actual at HEAD: **DomainEvent = 31, ActivityType = 31, ActivityMetadata union = 31** — all three in parity (this matches Sprint 6 signoff §5.1 A9's "31 after Sprint 6"). M1 adds 5 → **36** across all four files. The plan's intent is unaffected; the corrected target count is 36, and `check:enum-parity` must pass at 36.

### D-3 · **An email abstraction already exists** (reuse, don't duplicate)

Execution Plan M1 proposes creating `core/email/sendgrid.adapter.ts` fresh. But `apps/api/src/modules/auth/email.ts` **already defines** an `EmailSender` interface + `LoggingEmailSender` stub, with a comment that SendGrid wiring activates *"when `SENDGRID_API_KEY` is present."* M1 should **promote/relocate this existing abstraction** to `core/email/` and add a `SendGridEmailSender` implementation, rather than invent a parallel `EmailAdapter`. Keeps one email abstraction in the codebase. (Auth's verification/reset emails can migrate later — not M1 scope.)

### D-4 · **Domain services do NOT use `eventBus.emitDurable` today** (wire M1 directly, not via the "spine")

The Architecture Review §2.2 describes a durable fan-out "spine" where mutations call `emitDurable`. Verified: the deals/leads services currently emit **only activities** — no `emitDurable` calls exist in domain services. The event-bus fan-out spine is an **M2/M3 concern**. For M1, notification creation must be wired by **direct `notificationService` calls at the existing emit points** (the inbox webhook path and conversation-assignment), *not* by introducing the fan-out spine. This keeps M1 minimal and avoids prematurely reshaping every domain service.

---

## 4. M1 Gap Analysis (the user's item-4 checklist)

### 4.1 Existing infrastructure M1 builds on (no work)
- Queues `NOTIFICATION_DELIVERY` (c=15), `EMAIL_DELIVERY` (c=20) + DLQ + retry/backoff.
- Realtime: `emitToOrg` (API), `notifyOrg` (worker), org rooms, JWT socket auth, Redis adapter/emitter.
- `ActivityService.append`, discriminated `ActivityMetadata`, `check:enum-parity` gate.
- Tenancy: `withTenant`, GUC, RLS, `TENANT_TABLES`/`TENANT_MODELS`, `check:rls`.
- Module template (`modules/deals/*`), `requirePermission`, `requireTenantContext`, cursor pagination, `asTenantCreate`.
- Worker process startup (`initNotificationPublisher` before `startWorkers`).
- `EmailSender`/`LoggingEmailSender` abstraction (to be promoted — D-3).
- B-2 pipeline activity emission (**already done** — D-1).

### 4.2 Missing — Database
- `notifications` table (tenant-scoped, RLS) — **migration 0017**.
- `notification_preferences` table (tenant-scoped, RLS, `@@unique(orgId,userId,type)`) — migration 0017.
- `Activity.relatedConversationId UUID?` + index — **migration 0018** (closes §5.1 deferral).
- New Prisma enums `NotificationType`, `NotificationChannel`.
- `ActivityType` += `NOTIFICATION_SENT` (+ scaffold `LEAD_SCORED`, `WORKFLOW_TRIGGERED`, `WORKFLOW_ACTION_EXECUTED`, `FOLLOW_UP_CREATED` — R-PARITY-1).
- `tenant-tables.ts`: 22 → **24**.

### 4.3 Missing — Shared package
- `DomainEvent` += the same 5 keys; update `AllEvents`/`EventName`.
- `ActivityMetadata`: 5 new interfaces + union extension (31 → 36).
- `error-codes.ts` += `NOTIFICATION_NOT_FOUND`.

### 4.4 Missing — API (modules + core)
- `modules/notifications/` — repository, service, controller, routes, index.
- `core/email/` — promoted `EmailSender` + `SendGridEmailSender` + `templates.ts`.
- `core/queue/workers/notification-delivery.worker.ts`, `email-delivery.worker.ts`; register both in `worker-registry.ts`.
- `env.ts` += `SENDGRID_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` (optional dev / required-in-prod-when-email-enabled).
- `flags.ts` += `notifications.email.enabled` (default **off**).
- `app.ts` — mount `/api/v1/notifications`.
- Inbox integration: persist notification in the webhook IG-message path + on assignment (direct service call — D-4).

### 4.5 Missing — API endpoints
- `GET /api/v1/notifications` (cursor, `?unread=`)
- `POST /api/v1/notifications/:id/read`
- `POST /api/v1/notifications/read` (bulk/all)
- `GET /api/v1/notifications/preferences`
- `PUT /api/v1/notifications/preferences`

### 4.6 Missing — Workers
- `notification-delivery` processor (fan-out per preference; email enqueue gated).
- `email-delivery` processor (calls `EmailSender`; `LoggingEmailSender` in dev/CI).

### 4.7 Missing — Frontend (web)
- `components/notifications/{NotificationBell, NotificationPanel, NotificationRow}.tsx`.
- `lib/hooks/useNotifications.ts`.
- `app/(dashboard)/notifications/page.tsx`.
- BFF: `app/api/bff/notifications/route.ts` (+ `[id]/read`, `read`, `preferences`).
- Modify `(dashboard)/layout.tsx`: mount bell + **move socket init here from `InboxPage`** (R-RT-1).
- `components/nav/NavLinks.tsx`: add Notifications entry.

### 4.8 Missing — Tests
- Integration `notifications.integration.test.ts`: persist-on-create; `notifyOrg` invoked; mark-read flips `readAt`; preferences default + suppress email; **cross-org isolation** (R-SEC-1); IG message → notification row.
- Unit: `EmailSender`/`SendGridEmailSender` (mock) + `LoggingEmailSender` in CI.
- **R-RT-1 regression test:** after socket-init moves to layout, a new DM still invalidates conversation queries (web).
- **B-2 (D-1):** confirm/أdd test that pipeline-create produces an `activities` row.
- Frontend: bell unread count, panel renders, mark-all-read.
- Gates: `check:rls` = 24; `check:enum-parity` OK at 36.

---

## 5. Risk Posture for M1 (from `SPRINT_7_RISK_ASSESSMENT.md`)

| Risk | Class | M1 status |
|------|-------|-----------|
| R-SEC-1 cross-tenant leak (new tables) | P0 | Mitigated by RLS + `check:rls`=24 + cross-org test (mandatory gate) |
| R-RT-1 socket move breaks inbox realtime | P1 | Mitigated by layout-owns-one-socket + regression test |
| R-PARITY-1 enum/metadata drift | P1 | Mitigated by adding all 5 types in 4 files at once + `check:enum-parity` |
| R-NOTIF-1 notification noise | P1 | Mitigated by `notification_preferences` from day one + sensible defaults |
| R-EMAIL-1 deliverability | P1 | In-app primary; email behind `notifications.email.enabled` (off) until SPF/DKIM |

All M1 P0/P1 risks have defined, test-backed mitigations. No unmitigated blocker.

---

## 6. Open Design Decisions for the Implementation Plan to Resolve

These are not blockers; they are choices the M1 plan makes explicit (see `SPRINT_7_M1_IMPLEMENTATION_PLAN.md` §Decisions):

- **DM1-a — recipient resolution:** new IG message notifies `conversation.assignedToId` if set; if unassigned, **no per-user row** (rely on the existing org-room `instagram:message` emit + Unassigned tab). Avoids fan-out-to-all.
- **DM1-b — permissions:** notifications are inherently self-scoped; **no new RBAC key** — endpoints rely on `authMiddleware`+`tenantMiddleware` and filter by `ctx.userId`. (Alternative: add `notifications.read_own`.)
- **DM1-c — email default OFF** behind `notifications.email.enabled`; `LoggingEmailSender` in dev/CI; in-app is the primary channel.
- **DM1-d — persist-then-emit ordering** in the worker: create the notification row inside the existing `withTenant` txn in `processInstagramMessage`, then emit (worker uses `notifyOrg`).
- **DM1-e — preference defaulting:** compute effective preference (default when no row); do **not** pre-seed preference rows.
- **DM1-f — scaffold all 5 new types** in M1 (only `NOTIFICATION_SENT` used now); the other 4 are inert until their milestones (R-PARITY-1).

---

## 7. Verdict

```
╔══════════════════════════════════════════════════════════════╗
║                          G O                                  ║
║  Sprint 7 M1 is approved to proceed to implementation         ║
║  planning, with two corrections applied:                      ║
║   • B-2 (pipeline activity) is ALREADY DONE → verify-only.    ║
║   • Baseline enum count is 31 → target 36 (not 33).           ║
║  All 20 M1-relevant current-state claims verified accurate.   ║
║  All M1 P0/P1 risks have test-backed mitigations.             ║
║  No new external dependency is required to start (email is    ║
║  flag-gated off; in-app notifications need no third party).   ║
╚══════════════════════════════════════════════════════════════╝
```

**Proceed to `SPRINT_7_M1_IMPLEMENTATION_PLAN.md`.** No code is written until that plan is approved.

---

*All findings source-verified at HEAD `6523980` on 2026-06-22. This review covers M1 only. M2–M6 readiness will be reviewed at their respective milestone gates, mirroring the Sprint 6 per-milestone signoff process.*
