# Sprint 7 — M1 Implementation Plan (Notification Engine + Email + Foundations)

**Author:** Principal Engineer
**Date:** 2026-06-22
**Milestone:** M1 (Days 1–3 of Sprint 7)
**Based on:** `SPRINT_7_M1_APPROVAL_REVIEW.md` (source-verified at HEAD `6523980`), `SPRINT_7_EXECUTION_PLAN.md` M1, `SPRINT_7_ARCHITECTURE_REVIEW.md` §2.6/§3/§6.
**Status:** PLAN — no implementation until approved. Do not write code, migrations, or commits.

> **This plan covers M1 ONLY.** It applies the four corrections from the approval review: **(D-1)** B-2 is already done → verify-only; **(D-2)** baseline enum count 31 → target 36; **(D-3)** reuse the existing `EmailSender` abstraction; **(D-4)** wire notifications by direct service calls, not the event-bus spine.

---

## 0. Goal & Definition of Done

Ship a **persistent, per-user notification system** with in-app (persist + socket) delivery as the primary channel and email as a flag-gated secondary channel, plus the two Sprint-6-deferred foundation items. M1 is DONE when every `SPRINT_7_ACCEPTANCE_CRITERIA.md` M1 criterion (1–13) passes and all global gates (G-1…G-12) are green, with:
- `check:rls` = **24**
- `check:enum-parity` OK at **36** activity types
- R-SEC-1 (cross-org), R-RT-1 (inbox realtime regression), R-PARITY-1 (parity) mitigation tests passing.

---

## 1. Build Order (invariant)

```
1. Shared types/enums  (events.ts, enums.ts, activity-metadata.ts, error-codes.ts)
2. Prisma schema + migrations 0017, 0018
3. tenant-tables.ts (22→24)  +  env.ts  +  flags.ts
4. core/email/ (promote EmailSender + SendGrid impl + templates)
5. notifications module: repository → service → controller → routes → index
6. workers: notification-delivery, email-delivery  +  worker-registry
7. app.ts mount
8. Inbox integration (webhook path + assignment) — direct service calls
9. Integration tests (API)
10. BFF routes
11. Web hooks → components → layout/socket move → nav entry
12. Web tests + B-2 verification test + gates
```

Never controller-before-service; never BFF-before-stable-API; never hook-before-BFF.

---

## 2. Decisions (resolved here — from Approval Review §6)

| ID | Decision |
|----|----------|
| DM1-a | New IG message → notify `conversation.assignedToId` only; unassigned → no per-user row (org-room `instagram:message` emit + Unassigned tab already cover it). |
| DM1-b | Notifications are self-scoped; **no new RBAC permission**. Endpoints rely on `authMiddleware`+`tenantMiddleware`, filtered by `ctx.userId`. Routes mounted via `buildNotificationsModule(requirePermission)` for signature consistency, but per-route guards are omitted (self-scope is the boundary). |
| DM1-c | Email default **OFF** behind `notifications.email.enabled`; `LoggingEmailSender` in dev/CI; in-app primary. |
| DM1-d | Persist-then-emit: create notification row **inside** the existing `withTenant` txn in `processInstagramMessage`, then emit. Worker uses `notifyOrg`. |
| DM1-e | Preferences: compute effective preference (default if no row); do not pre-seed rows. |
| DM1-f | Scaffold all 5 new ActivityType/DomainEvent/metadata in M1; only `NOTIFICATION_SENT` is emitted now. |
| DM1-g | **B-2 = verify-only** (already implemented — Approval Review D-1). Add a test if none exists; no service change. |

---

## 3. Shared Package Changes (`packages/shared/src`)

### 3.1 `constants/enums.ts` — `ActivityType` (31 → 36)
Add: `NOTIFICATION_SENT`, `LEAD_SCORED`, `WORKFLOW_TRIGGERED`, `WORKFLOW_ACTION_EXECUTED`, `FOLLOW_UP_CREATED`.

### 3.2 `constants/events.ts` — `DomainEvent` (31 → 36)
Add the same 5 keys; update `AllEvents` (`{...SystemEvent, ...DomainEvent}`) and the `EventName` union automatically follow.

### 3.3 `types/activity-metadata.ts` — union (31 → 36)
Add 5 interfaces and extend the union. Shapes (M1 only fully specifies `NOTIFICATION_SENT`; the other 4 are minimal scaffolds for parity):
```ts
export interface NotificationSentMetadata {
  type: 'NOTIFICATION_SENT';
  notificationId: string;
  notificationType: string;   // NotificationType value
  recipientUserId: string;
  channel: string;            // NotificationChannel value
}
// LeadScoredMetadata, WorkflowTriggeredMetadata,
// WorkflowActionExecutedMetadata, FollowUpCreatedMetadata
//   — minimal { type, ...id fields } scaffolds; finalized in M2/M3/M4.
```
> The 4 scaffolded interfaces must be added now so `check:enum-parity` + the exhaustive union compile once and never need a 4-file edit again (R-PARITY-1).

### 3.4 `errors/error-codes.ts`
Add `NOTIFICATION_NOT_FOUND: 'NOTIFICATION_NOT_FOUND'` (HTTP 404) to `ErrorCode` and `ERROR_STATUS`.

---

## 4. Database

### 4.1 `prisma/schema.prisma`
- New enums:
  ```
  enum NotificationType    { INBOX_MESSAGE  CONVERSATION_ASSIGNED  /* future: LEAD_SCORED, WORKFLOW_ALERT, FOLLOW_UP_DUE */ }
  enum NotificationChannel { IN_APP  EMAIL }
  ```
- New models (tenant-scoped):
  ```
  model Notification {
    id             String  @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
    organizationId String  @db.Uuid
    userId         String  @db.Uuid          // recipient
    type           NotificationType
    title          String  @db.VarChar(200)
    body           String  @db.Text
    entityType     String? @db.VarChar(40)   // 'conversation' | 'lead' | 'deal' | ...
    entityId       String? @db.Uuid
    channel        NotificationChannel @default(IN_APP)
    readAt         DateTime?
    createdAt      DateTime @default(now())
    // relations + indexes
    @@index([organizationId, userId, readAt, createdAt(sort: Desc)])
    @@map("notifications")
  }

  model NotificationPreference {
    id             String @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
    organizationId String @db.Uuid
    userId         String @db.Uuid
    type           NotificationType
    inApp          Boolean @default(true)
    email          Boolean @default(false)
    createdAt      DateTime @default(now())
    updatedAt      DateTime @updatedAt
    @@unique([organizationId, userId, type])
    @@map("notification_preferences")
  }
  ```
- `Activity` model: add `relatedConversationId String? @db.Uuid` + `@@index([organizationId, relatedConversationId, createdAt(sort: Desc)])` (relation optional; an FK to `instagram_conversations` may be added or left as a loose id — match the existing `relatedPipelineStageId` treatment, which has an index but the relation is optional).
- `ActivityType` Prisma enum: add the same 5 values (parity with `enums.ts`).

### 4.2 Migrations (continue from 0016)
- **`0017_notifications_tables`** — create `notifications` + `notification_preferences`; **RLS enable + force + policy** (`organizationId = current_setting('app.current_organization_id', true)::uuid`) on both; indexes per schema. Standard transactional migration (new empty tables — no `CONCURRENTLY` needed).
- **`0018_activity_conversation_link`** — `ALTER TABLE activities ADD COLUMN "relatedConversationId" UUID;` + `CREATE INDEX … (organizationId, relatedConversationId, createdAt DESC)`. Additive, nullable, no backfill → transactional is fine.
- New Postgres enum types `NotificationType`, `NotificationChannel`, and the `ActivityType` `ADD VALUE`s land in 0017 (or a dedicated enum migration) — additive.

### 4.3 `core/tenancy/tenant-tables.ts`
Add `'notifications'`, `'notification_preferences'` to `TENANT_TABLES` and `Notification`, `NotificationPreference` to `TENANT_MODELS`. Count **22 → 24**. Update the count comment.

---

## 5. Config & Flags

### 5.1 `core/config/env.ts`
Add to the Zod schema:
```
SENDGRID_API_KEY  z.string().optional()
EMAIL_FROM        z.string().email().optional()
EMAIL_REPLY_TO    z.string().email().optional()
```
Production fail-fast: only require these when `notifications.email.enabled` is on (email is opt-in). Do **not** add to the unconditional insecure-list; instead guard: if prod AND email flag on AND `!SENDGRID_API_KEY` → throw. (Keeps the in-app-only deploy valid without SendGrid.)

### 5.2 `core/flags/flags.ts`
Add `notifications.email.enabled` to `FlagKey` and `DEFAULTS` = **false**. Env override `FLAG_NOTIFICATIONS_EMAIL_ENABLED`.

---

## 6. Email Core (`apps/api/src/core/email/`) — promote existing abstraction (D-3)

- **`email-sender.ts`** — relocate/define `EmailSender` interface (mirror `modules/auth/email.ts`): `send({ to, subject, html, text, from?, replyTo? }): Promise<void>`. Implementations: `LoggingEmailSender` (dev/CI default — logs, no network), `SendGridEmailSender` (uses `@sendgrid/mail` or REST; constructed only when `SENDGRID_API_KEY` present).
- **`templates.ts`** — typed templates returning `{ subject, html, text }`: `inboxMessage`, `conversationAssigned` (M1 needs these two; `followUpDue`/`workflowAlert` stubs for later milestones).
- **Selection:** a factory returns `SendGridEmailSender` when `notifications.email.enabled` && `SENDGRID_API_KEY`, else `LoggingEmailSender`. (Leave `modules/auth/email.ts` importing from here or untouched — auth migration is out of M1 scope; note as tech-debt.)
- **No new heavy dependency mandated:** SendGrid can be called via REST (`fetch`) to avoid adding `@sendgrid/mail`; if the SDK is preferred, it's a backend-only dep (not a UI "component library") and is acceptable — call it out at review.

---

## 7. Notifications Module (`apps/api/src/modules/notifications/`)

Follow the `modules/deals/*` template exactly (class service, `Prisma…Repository(db)`, `createXController`, `buildXRouter(controller, requirePermission)`, `buildXModule(requirePermission)`).

| File | Responsibility |
|------|----------------|
| `notification.repository.ts` | `PrismaNotificationRepository` (listForUser cursor, findByIdForUser, markRead, markAllRead/byIds, create) + `PrismaNotificationPreferenceRepository` (getForUser, upsertForUser). |
| `notification.service.ts` | `notifyUser({ userId, type, title, body, entityType?, entityId? })` = **persist-then-emit** (create row in `withTenant` → `emitToOrg`/`notifyOrg` `'notification'` event → if pref.email && `notifications.email.enabled` && plan allows → enqueue `EMAIL_DELIVERY`); `listForUser`, `markRead`, `markAllRead`, `getPreferences` (with defaults — DM1-e), `updatePreferences`. Appends a `NOTIFICATION_SENT` activity on create (DM1-f). |
| `notification.controller.ts` | handlers; self-scope every query/mutation by `ctx.userId` (DM1-b). 404 → `NOTIFICATION_NOT_FOUND`. |
| `notification.routes.ts` | `buildNotificationRouter(controller, requirePermission)` — routes below. |
| `index.ts` | `buildNotificationsModule(requirePermission)`. |

### 7.1 Endpoints (all `/api/v1/notifications`, auth+tenant, self-scoped)
| Method | Path | Notes |
|--------|------|-------|
| GET | `/` | cursor `{at,id}` JSON, `?unread=true`, `?limit` (1–50, default 20); response `{ items, nextCursor }` (matches inbox convention). |
| POST | `/:id/read` | sets `readAt`; 404 if not the caller's. |
| POST | `/read` | body `{ ids?: string[] }` → mark those (or all) read for the caller. |
| GET | `/preferences` | returns effective per-type prefs (defaults applied). |
| PUT | `/preferences` | upsert per-type `{ type, inApp, email }[]`. |

### 7.2 Persist-then-emit ordering
In `notifyUser`: open `withTenant(orgId)` → `repo.create(...)` + `activityService.append(NOTIFICATION_SENT)` (atomic) → after commit, emit socket event → conditionally enqueue email. In the **worker** process the emit uses `notifyOrg` (Redis emitter); in the **API** process it uses `emitToOrg`.

---

## 8. Workers (`apps/api/src/core/queue/workers/`)

- **`notification-delivery.worker.ts`** — consumes `NOTIFICATION_DELIVERY`. Payload `{ organizationId, userId, type, title, body, entityType?, entityId? }`. Calls `notificationService.notifyUser(...)`. (Used when a producer prefers to enqueue rather than call inline; the inbox path may call inline within its own txn — both supported.)
- **`email-delivery.worker.ts`** — consumes `EMAIL_DELIVERY`. Payload `{ to, templateKey, data }`. Resolves template → `EmailSender.send(...)`. `LoggingEmailSender` in dev/CI.
- **`worker-registry.ts`** — register both processors with their queue concurrency (15 / 20). No new queue.

---

## 9. App Mount (`apps/api/src/app.ts`)
Add inside the authenticated `v1` router, alongside the others:
```
v1.use('/notifications', buildNotificationsModule(rbac.requirePermission));
```
(Order before the final `app.use('/api/v1', apiRateLimit, authMiddleware, tenantMiddleware, v1)`.)

---

## 10. Inbox Integration (direct calls — D-4)

- **`core/queue/workers/webhook.worker.ts` (`processInstagramMessage`):** inside the existing `withTenant` block that creates the message/links the lead, if `conversation.assignedToId` is set, call `notificationService` to persist an `INBOX_MESSAGE` notification for that user **before** the existing `notifyOrg(orgId,'instagram:message',…)` emit (DM1-a/d). If unassigned → no per-user row.
- **`modules/inbox/inbox.service.ts` (`updateConversation`):** when `assignedToId` changes to a non-null user, persist a `CONVERSATION_ASSIGNED` notification for the newly assigned user.
- Both are **direct service calls**, not `emitDurable` — consistent with the current architecture (D-4).

---

## 11. Frontend (`apps/web/src`)

Per `SPRINT_6_UI_UX_PLAN.md` constraints (tokens-only, existing primitives, no hex, `<Spinner>`, emoji glyphs) and UI roadmap P1-1.

| File | Notes |
|------|-------|
| `components/notifications/NotificationBell.tsx` | bell glyph + unread count badge (`bg-primary-500/15 text-primary-400 border-primary-500/30`, "9+" cap); opens panel. Client component. |
| `components/notifications/NotificationPanel.tsx` | dropdown/popover on existing Radix Dialog or anchored panel; list + "Mark all read"; `<Spinner>` loading; `EmptyState`. |
| `components/notifications/NotificationRow.tsx` | row styled like `ConversationItem`; unread dot; relative timestamp; click → entity route. |
| `lib/hooks/useNotifications.ts` | React Query: list (+unread count), `markRead`, `markAllRead`, preferences; subscribes to `'notification'` socket event to invalidate. |
| `app/(dashboard)/notifications/page.tsx` | full list page, read/unread states. |
| `app/api/bff/notifications/route.ts` (+ `[id]/read`, `read`, `preferences`) | BFF proxies using shared `resolveAccessToken` (`lib/server/bff-auth.ts`). |
| `app/(dashboard)/layout.tsx` | **mount `NotificationBell`** in the aside; **move socket init here** from `InboxPage` (R-RT-1) via a small client wrapper (the layout is RSC — add a `'use client'` shell that owns the socket + bell, with `children` passed through). |
| `components/nav/NavLinks.tsx` | add a Notifications entry (same item style; optional unread badge). |
| `components/inbox/InboxPage.tsx` | remove socket-init ownership; subscribe to inbox events via the shared socket (keep Sprint 6 reconnect/disconnect→refresh handling). |

**R-RT-1 care:** the layout owns exactly one socket; both inbox and notifications subscribe via `useSocketEvent`. The Sprint 6 `instagram:message` → conversation-query invalidation must still fire (regression test).

---

## 12. Tests

### API integration — `apps/api/tests/integration/notifications.integration.test.ts`
1. `notifyUser` persists a row + appends `NOTIFICATION_SENT` activity.
2. `GET /notifications` cursor pagination + `?unread=true`.
3. `POST /:id/read` flips `readAt`; foreign id → `NOTIFICATION_NOT_FOUND`.
4. `POST /read` (all + id-subset).
5. `GET/PUT /preferences` defaults + upsert.
6. Email enqueued **only** when pref.email && `notifications.email.enabled` (toggle both ways).
7. **R-SEC-1:** org B cannot read/modify org A notifications (`check:rls`=24).
8. **DM1-a/d:** assigned-conversation IG message → notification row for assignee; unassigned → none.

### API unit
- `EmailSender`: `SendGridEmailSender` (mocked transport) + `LoggingEmailSender` (CI default); template rendering.

### Foundations
- **B-2 (DM1-g):** assert pipeline-create produces an `activities` row with `relatedPipelineId` (add only if not already covered).
- **§5.1:** assert `activities.relatedConversationId` column exists + is writable/nullable.

### Web
- Bell unread count; panel renders + mark-all-read; `useNotifications` invalidates on socket event.
- **R-RT-1 regression:** new DM still invalidates `['conversations']` after socket moved to layout.

### Gates
`check:rls`=24 · `check:enum-parity` OK (36) · typecheck/lint/build · token-grep (zero hex in `components/notifications/`).

---

## 13. Files Summary

**Create (API):** `modules/notifications/{repository,service,controller,routes,index}.ts`; `core/email/{email-sender,templates}.ts`; `core/queue/workers/{notification-delivery,email-delivery}.worker.ts`; `tests/integration/notifications.integration.test.ts`; `core/email/email-sender.test.ts`.
**Modify (API):** `prisma/schema.prisma`; `packages/shared/src/constants/{events,enums}.ts`; `packages/shared/src/types/activity-metadata.ts`; `packages/shared/src/errors/error-codes.ts`; `core/tenancy/tenant-tables.ts`; `core/config/env.ts`; `core/flags/flags.ts`; `core/queue/worker-registry.ts`; `core/queue/workers/webhook.worker.ts`; `modules/inbox/inbox.service.ts`; `app.ts`.
**Migrations:** `0017_notifications_tables`, `0018_activity_conversation_link`.
**Create (Web):** `components/notifications/{NotificationBell,NotificationPanel,NotificationRow}.tsx`; `lib/hooks/useNotifications.ts`; `app/(dashboard)/notifications/page.tsx`; `app/api/bff/notifications/{route,[id]/read/route,read/route,preferences/route}.ts`.
**Modify (Web):** `app/(dashboard)/layout.tsx`; `components/nav/NavLinks.tsx`; `components/inbox/InboxPage.tsx`.
**Verify-only (no change expected):** `modules/pipelines/pipeline.service.ts` (B-2 already done — add test if missing).

---

## 14. Exit Criteria (M1)
- Acceptance Criteria M1 #1–13 pass.
- Global gates G-1…G-12 green; `check:rls`=24; `check:enum-parity` at 36.
- R-SEC-1, R-RT-1, R-PARITY-1 mitigation tests pass.
- Email shippable **dark** (flag off, no SendGrid) without breaking any path.
- A new IG DM to an assigned conversation produces a persistent notification visible in the bell within the realtime window; inbox realtime unaffected.

---

*Plan scoped to M1 only and reconciled with source at HEAD `6523980` (2026-06-22). The four approval-review corrections (D-1 B-2-done, D-2 count-31→36, D-3 reuse EmailSender, D-4 direct-calls-not-spine) are incorporated. Await approval before any implementation.*
