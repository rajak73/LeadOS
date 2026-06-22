# Sprint 7 — Architecture Review

**Author:** Principal Engineer (source-code audit at HEAD `6523980`)
**Date:** 2026-06-21
**Status:** REVIEW — design contract for Sprint 7. No implementation until approved.
**Theme:** Intelligence & Automation layer — AI Lead Scoring · Workflow Automation · Smart Follow-ups · Notification Engine · Analytics & Insights · Productivity Features

**Authoritative inputs (read in full before this document):**
`FINAL_ARCHITECTURE.md` (the contract), `SPRINT_6_EXECUTION_PLAN.md`, `SPRINT_6_FINAL_ARCHITECTURE_SIGNOFF.md`, `SPRINT_6_M6_FINAL_APPROVAL.md`, `SPRINT_6_UI_UX_PLAN.md`.
**Companion deliverables:** `SPRINT_7_EXECUTION_PLAN.md`, `SPRINT_7_RISK_ASSESSMENT.md`, `SPRINT_7_ACCEPTANCE_CRITERIA.md`.
**UI companion (already authored):** `SPRINT_7_UI_MODERNIZATION_PLAN.md` — the Productivity-Features milestone (M6) executes against it.

> **Prime finding:** Sprint 7 is mostly **activation, not greenfield.** The queues (`WORKFLOW_EXECUTION`, `AI_SCORING`, `NOTIFICATION_DELIVERY`, `EMAIL_DELIVERY`), feature flags (`ai.scoring.enabled`, `workflows.execution.enabled`), plan limits (`aiCallsPerMonth/Hour`, `activeWorkflows`), permission keys (`workflows.*`, `analytics.*`, `ai`), and the `AiScore` model + `Lead.aiScore` cache were all laid down in Sprints 4–6 as deliberate seams. Sprint 7 fills them. This sharply lowers architectural risk.

---

## 1. Current State Audit (Post–Sprint 6)

### 1.1 Implemented backend modules (`apps/api/src/modules/`)

| Module | Status | Responsibility |
|--------|--------|----------------|
| `auth` | ✅ | Identity, JWT (in-memory access + rotating refresh), org membership, sessions |
| `rbac` | ✅ | Permission catalog, 4 system roles, `requirePermission` middleware, own-only filtering |
| `leads` | ✅ | Lead CRUD, CSV import/export (BullMQ), convert-to-contact, activity/notes/files |
| `contacts` | ✅ | Contact CRUD, activity/notes/files |
| `deals` | ✅ | Deal CRUD, stage state machine, forecast, activity |
| `pipelines` | ✅ | Pipeline + stage CRUD, reorder (⚠ activity emission missing — B-2, fixed Sprint 7 M1) |
| `tasks` | ✅ | Task CRUD (model has `TaskType.FOLLOW_UP`, priority, status, `dueDate`, related FKs) |
| `notes` / `files` | ✅ | Sub-resources for leads/contacts/deals |
| `instagram` | ✅ | Meta OAuth, encrypted tokens, daily refresh cron, `InstagramAdapter` |
| `inbox` | ✅ | Conversations, messages, send pipeline + rate limit, saved replies, create-lead-from-conversation |
| `webhooks` | ✅ | Persist-then-process, HMAC verify, idempotent at message grain |

### 1.2 Core infrastructure already in place (Sprint 7 builds on, does not create)

- **Queues** (`core/queue/names.ts`): 11 named queues. **Defined but with no registered worker:** `WORKFLOW_EXECUTION` (c=10), `AI_SCORING` (c=5), `NOTIFICATION_DELIVERY` (c=15), `EMAIL_DELIVERY` (c=20). DLQ (`dlq.ts`), 3 attempts + exp backoff.
- **Scheduler** (`core/scheduler/`): single-flight repeatable jobs via stable `jobId`; one cron registered (`instagram-token-refresh`). Adding crons is a registry append.
- **Event bus** (`core/events/event-bus.ts`): `emit()` (in-process) and `emitDurable(event, payload, queue, jobName)` (enqueue + emit). **32 `DomainEvent`s** parity-checked with `ActivityType` and `schema.prisma` via `check:enum-parity`.
- **Activity system** (`core/activities/activity.service.ts`): immutable append (DB triggers block update/delete), related FKs `relatedLeadId/ContactId/DealId/PipelineId/PipelineStageId` (**no `relatedConversationId` yet** — added M1). Discriminated `ActivityMetadata` union (32 members).
- **Realtime** (`core/realtime/`): `emitToOrg()` (API process), `notifyOrg()` (worker → Redis emitter → API adapter → browser). Org rooms, JWT socket auth. **No persistent notification store — emits are ephemeral.**
- **Feature flags** (`core/flags/flags.ts`): runtime + `FLAG_*` env override. Includes `ai.scoring.enabled`, `workflows.execution.enabled`.
- **Plan limits** (`packages/shared/.../plan-limits.ts`): includes `aiCallsPerMonth`, `aiCallsPerHour`, `activeWorkflows`, `dataExport`, `apiAccess`.
- **Permissions** (`packages/shared`): catalog already has `workflows.*`, `analytics.{read,read_own,read_all,export}`, `ai` resource, plus `tasks.*`.
- **Schema:** `AiScore` model (`ai_scores`, tenant-scoped, immutable); `Lead.aiScore SmallInt?` + `aiScoreUpdatedAt` denorm cache; `Task` model. **22 tenant tables**, latest migration `0016`.
- **Tenancy:** `withTenant(orgId, fn)` — interactive txn + `SET LOCAL` GUC + Prisma tenant extension + RLS backstop.

### 1.3 What is genuinely absent (Sprint 7 creates)

| Capability | Absent artifact |
|-----------|-----------------|
| AI scoring | `ai` module, OpenAI/LLM client, `OPENAI_API_KEY`, prompt cache, cost/quota counters, `ai-scoring` worker |
| Workflows | `workflow` module, `Workflow`/`WorkflowRun` models, trigger/condition/action engine, `workflow-execution` worker |
| Notifications | `notifications` module, persistent `notifications` + `notification_preferences` tables, `notification-delivery` worker, frontend bell/panel |
| Email | SendGrid adapter, `email-delivery` worker, email env vars |
| Smart follow-ups | follow-up rules, `follow-up-sweep` cron, follow-up UI |
| Analytics | `analytics` module, read-replica aggregate endpoints, dashboard (still a placeholder) |
| Productivity | command palette, saved views, bulk actions, keyboard shortcuts (see `SPRINT_7_UI_MODERNIZATION_PLAN.md`) |

### 1.4 Remaining roadmap items inherited into Sprint 7

1. **B-2 (Sprint 5 deferral):** `PipelineService` does not call `ActivityService.append()` for pipeline CRUD. Signoff §2 mandates the fix in **Sprint 7 M1** (service-only, no migration).
2. **§5.1 deferral:** conversation→activity relation (`relatedConversationId`) deferred to Sprint 7 → **M1 schema change**.
3. **Dashboard placeholder** (`apps/web/.../(dashboard)/page.tsx`) → **M5**.
4. **Notification frontend** (bell/panel, socket move to layout) — scoped in the UI roadmap → **M1 + M6**.
5. **Productivity gaps** (bulk actions, saved views, command palette) — `SPRINT_7_UI_MODERNIZATION_PLAN.md` → **M6**.

---

## 2. Sprint 7 Architecture Design

### 2.1 Shape and invariants (unchanged from `FINAL_ARCHITECTURE`)

Sprint 7 adds four modules — `ai`, `workflow`, `notifications`, `analytics` — to the modular monolith. They obey the load-bearing invariants verbatim:

- **Inv-2 (async-only):** AI calls, workflow execution, and notification/email delivery **never run on the request path** — all go through BullMQ. The request path only *enqueues*.
- **Inv-4 (atomic writes):** every multi-write (e.g. workflow action that updates a lead + creates a task + appends activity) runs inside one `withTenant` transaction; external calls (OpenAI, SendGrid, Meta) live in workers, outside transactions.
- **Inv-5 (no cross-module DB):** modules talk via public service interfaces and the event bus only. The workflow engine reads lead/deal/task state through those modules' services, never their tables.
- **Inv-6 / billing gating:** AI and workflow execution read `effectiveAccessLevel` + `PLAN_LIMITS` before doing work.

### 2.2 The unifying spine: event bus → durable subscribers

All four features hang off the existing event bus. Today `emitDurable` is called ad-hoc per feature. Sprint 7 introduces **durable fan-out subscribers** so one domain event can drive scoring, workflows, and notifications independently:

```
domain mutation (e.g. LeadService.create)
  → eventBus.emitDurable(DomainEvent.LEAD_CREATED, payload, <queue>, <job>)
        │
        ├── AI_SCORING queue        → ai-scoring.worker     → AiScore + Lead.aiScore
        ├── WORKFLOW_EXECUTION queue → workflow.worker        → match workflows → run actions
        └── NOTIFICATION_DELIVERY    → notification.worker     → persist + socket + email
```

**Decision D-1 — one enqueue per consumer, not a shared fan-out job.** Each domain mutation enqueues to each interested queue explicitly (the producer knows its consumers). Rationale: keeps queue-level concurrency/rate isolation (AI is c=5 and cost-capped; notifications are c=15), keeps DLQ semantics per-feature, and avoids a "router" single point of failure. The cost is a few extra `emitDurable` calls per mutation; acceptable. A thin `core/events/fan-out.ts` helper centralizes the standard producer→consumer mapping so producers don't hand-wire every queue.

### 2.3 AI Lead Scoring

**Model provider abstraction (mirrors `InstagramAdapter`).** New `AiAdapter` interface (`scoreLead`, `draftReply`, `summarize`) with a `OpenAiAdapter` implementation. The scoring/workflow/follow-up layers never call OpenAI directly — the provider is swappable and mockable in tests.

- **Trigger:** `emitDurable(..., QUEUE.AI_SCORING, 'score-lead')` on `LEAD_CREATED`, `LEAD_STATUS_CHANGED`, and (config-gated) `MESSAGE_RECEIVED`. Flag-gated by existing `ai.scoring.enabled`.
- **Worker (`ai-scoring.worker.ts`):** loads lead context (read), builds prompt, calls `AiAdapter.scoreLead` (4o-mini default; escalate to 4o only on low-confidence — model routing), writes a new immutable `AiScore` row, updates `Lead.aiScore`/`aiScoreUpdatedAt` denorm in one `withTenant` txn, appends `LEAD_SCORED` activity, emits `notifyOrg`/notification on large score deltas.
- **Cost & quota control (D-2):** durable monthly counting needs a table; burst needs Redis. **New `ai_usage_counters` table** (org-scoped, `periodMonth`, `callCount`, `tokenCount`) for the `aiCallsPerMonth` cap; **Redis sliding window** for `aiCallsPerHour`. A **circuit breaker** (Redis flag, opens on provider error-rate/timeout) plus a **Redis prompt cache** (hash of normalized lead features → score, short TTL) cut cost and protect against provider outages. Over-quota → job is skipped with a `QUOTA_EXCEEDED` activity, never an error to the user.
- **New env:** `OPENAI_API_KEY` (required in prod, fail-fast), `OPENAI_MODEL_PRIMARY`, `OPENAI_MODEL_ESCALATION`, `AI_MONTHLY_HARD_CAP_USD` (org-agnostic platform backstop).

### 2.4 Workflow Automation

**Semantics (blueprint doc 12, unchanged): Trigger → Conditions → Actions.** A workflow is a stored definition; each firing produces a `WorkflowRun` execution record.

**Schema (D-3):**
- `Workflow` — `id, organizationId, name, status (DRAFT|ACTIVE|PAUSED), triggerEvent (DomainEvent string), conditions Json, actions Json, version, createdById, timestamps, deletedAt`. Conditions/actions stored as validated JSON (Zod schema in `packages/shared`) rather than child tables — simpler, versionable, and matches how workflow editors serialize.
- `WorkflowRun` — `id, organizationId, workflowId, triggerEvent, triggerEntityId, status (PENDING|RUNNING|COMPLETED|FAILED|SKIPPED), startedAt, finishedAt, error, actionLog Json (per-action outcome)`. The audit trail of automation.

**Engine:**
- A **durable event subscriber** (`workflow-execution.worker.ts`) consumes the `WORKFLOW_EXECUTION` queue. For each event it loads `ACTIVE` workflows whose `triggerEvent` matches (cached per org), evaluates `conditions` against the entity snapshot, and on match creates a `WorkflowRun` and executes `actions` sequentially inside `withTenant`.
- **Action executors** (registry): `update_lead_status`, `assign_lead`, `add_tag`, `create_task` (→ follow-ups), `send_notification` (→ notification engine), `send_instagram_message` (reuse inbox send, window-checked), `rescore_lead` (→ AI). External-effect actions enqueue to their own queues; in-DB actions run in the run transaction. `WEBHOOK` action is **explicitly V2/out-of-scope** (SSRF egress allow-list per FINAL_ARCHITECTURE §6.5).
- **Loop guard (D-4):** a workflow action emits domain events that could re-trigger workflows. Guard with a per-trigger **execution-depth counter** (carried in the job payload, hard cap e.g. 5) plus a per-(workflow, entity, event-window) **idempotency key** in Redis to prevent the same trigger firing the same workflow twice. Runs exceeding depth are `SKIPPED` with a logged reason.
- **Plan limit:** `activeWorkflows` enforced on activate (existing limit key).
- **Idempotency:** `WorkflowRun` keyed on `(workflowId, triggerEntityId, triggerDedupeKey)`; duplicate event delivery → no second run.

### 2.5 Smart Follow-ups

Built **on top of** Tasks + Workflows + a new cron — not a new primitive.

- **Reactive follow-ups:** workflow `create_task` action with `type=FOLLOW_UP`, `dueDate` offset (e.g. "if lead NEW and no activity 48h → create follow-up task + notify owner").
- **Proactive sweep (D-5):** new single-flight cron `follow-up-sweep` (hourly) scans for staleness signals already present in the schema — `Lead.lastActivityAt`, stale/overdue `Deal` (no `deletedAt`, past `expectedCloseDate`), `InstagramConversation.lastInboundAt` unreplied — and creates follow-up tasks + notifications, idempotently (dedupe on an existing open follow-up task for the same entity).
- **AI-assisted drafts (flag-gated):** follow-up task detail can request an `AiAdapter.draftReply` suggestion (reuses M2 adapter + quota). Optional; degrades gracefully if AI disabled/over-quota.

### 2.6 Notification Engine

The first feature to build, because workflows and follow-ups depend on it.

- **Persistence (D-6):** new `notifications` table (`id, organizationId, userId, type, title, body, entityType, entityId, channel, readAt, createdAt`) + `notification_preferences` (`organizationId, userId, type, inApp bool, email bool`). Notifications become **persist-then-emit**: write row → `notifyOrg`/`emitToOrg` for live in-app → enqueue email if preference + plan allow.
- **`notification-delivery.worker.ts`** (queue exists): fan-out per recipient preference. In-app channel = the persisted row + socket push (already delivered synchronously at create; worker handles email + digesting).
- **`email-delivery.worker.ts`** (queue exists): SendGrid adapter; templated emails (new-message, assignment, follow-up due, workflow alert). Domain auth (SPF/DKIM) is an ops gate (FINAL_ARCHITECTURE M3).
- **Inbox integration:** the existing ephemeral `instagram:message` emit is upgraded to also create a notification row (assignment/new-message), closing the "no audit trail" gap noted in the realtime audit.
- **Frontend:** `NotificationBell` + `NotificationPanel` + `/notifications` page; socket initialization **moves from `InboxPage` to the dashboard layout** so notifications are live app-wide (per UI roadmap P1-1).

### 2.7 Analytics & Insights

- **Read path on the replica (D-7):** analytics queries run against `DATABASE_REPLICA_URL` (already in env) to keep aggregation off the primary. A dedicated read-only Prisma client for analytics; **still tenant-scoped** (RLS applies on the replica too).
- **Aggregates:** dashboard KPIs (active leads, open deals, pipeline value, won-this-month, win rate, avg response time), pipeline funnel by stage, lead-source breakdown, AI-score distribution, activity volume, follow-up SLA.
- **Caching:** Redis-cached aggregate responses (short TTL, per-org key) — analytics tolerates seconds-stale data. **No materialized views in Sprint 7** (deferred; live aggregates + cache are sufficient at current scale). This is an explicit scope cut, logged in the risk doc.
- **Permissions:** `analytics.read_own` (SALES_EXECUTIVE sees own), `analytics.read_all` (MANAGER+), `analytics.export` (existing keys).

### 2.8 Productivity Features

Executes `SPRINT_7_UI_MODERNIZATION_PLAN.md` (already authored): command palette (⌘K, built on existing Radix Dialog — no new dep), saved views, bulk actions, keyboard shortcuts, task/follow-up management surface, notification preferences UI. Backend support (bulk endpoints, `/search`, `/dashboard/stats`, `/org/members`) is itemized there and folded into the relevant milestones here.

---

## 3. Database Changes Required

All new tables are tenant-scoped (added to `TENANT_TABLES`/`TENANT_MODELS`, RLS enabled+forced+policied, verified by `check:rls`). Enum additions go through `check:enum-parity`. Migrations continue from `0016` → `0017+`.

| # | Migration | Change | Milestone |
|---|-----------|--------|-----------|
| 0017 | `notifications_tables` | `notifications` + `notification_preferences` tables (+RLS) | M1 |
| 0018 | `activity_conversation_link` | `Activity.relatedConversationId UUID?` + index (closes §5.1 deferral) | M1 |
| 0019 | `ai_usage_counters` | `ai_usage_counters` table (org, periodMonth, callCount, tokenCount) (+RLS) | M2 |
| 0020 | `workflow_tables` | `workflows` + `workflow_runs` tables (+RLS) | M3 |
| 0021 | `workflow_indexes` | `(organizationId, status, triggerEvent)` on workflows; `(organizationId, workflowId, createdAt)` on runs | M3 |

**Enum additions** (each in `enums.ts` + `events.ts` DomainEvent + `schema.prisma` ActivityType + `activity-metadata.ts` interface — the 4-place parity rule):
- `ActivityType` / `DomainEvent`: `LEAD_SCORED`, `WORKFLOW_TRIGGERED`, `WORKFLOW_ACTION_EXECUTED`, `FOLLOW_UP_CREATED`, `NOTIFICATION_SENT`.
- New Prisma enums: `NotificationType`, `NotificationChannel`, `WorkflowStatus`, `WorkflowRunStatus`.

**`check:rls` table count:** 22 → **25** (notifications, notification_preferences, ai_usage_counters, workflows, workflow_runs = +5; the Activity column add is not a new table). Each milestone states its expected count.

**Index strategy:** new high-write tables (`notifications`, `workflow_runs`) follow the partitioning posture noted in FINAL_ARCHITECTURE §7.3 for `activities`/`messages` — created with range-ready structure; large back-fills use `CREATE INDEX CONCURRENTLY` in a non-transactional migration (the `0015b` precedent).

---

## 4. API Changes Required

New REST surface under `/api/v1`, each with BFF proxy under `apps/web/src/app/api/bff/**` reusing the shared `resolveAccessToken` (`bff-auth.ts`). All Zod-validated, permission-gated, tenant-scoped.

| Area | Endpoints | Permission |
|------|-----------|-----------|
| Notifications (M1) | `GET /notifications`, `POST /notifications/read` (bulk), `POST /notifications/:id/read`, `GET/PUT /notifications/preferences` | authenticated (own) |
| AI scoring (M2) | `GET /leads/:id/score` (current + history), `POST /leads/:id/rescore` (enqueue, flag+quota gated) | `ai.read` / `leads.read` |
| Workflows (M3) | `GET/POST /workflows`, `GET/PATCH/DELETE /workflows/:id`, `POST /workflows/:id/activate|pause`, `GET /workflows/:id/runs`, `GET /workflows/meta` (trigger/action catalog for the builder) | `workflows.*` |
| Follow-ups (M4) | reuse `tasks` endpoints + `GET /tasks?type=FOLLOW_UP&due=...`; `GET /leads/:id/follow-up-suggestion` (AI, flag-gated) | `tasks.*` |
| Analytics (M5) | `GET /analytics/dashboard`, `/analytics/funnel`, `/analytics/lead-sources`, `/analytics/response-times`, `/analytics/ai-scores`, `POST /analytics/export` | `analytics.read*` |
| Productivity (M6) | `POST /leads/bulk`, `POST /deals/bulk`, `POST /inbox/conversations/bulk`, `GET /search`, `GET /org/members`, `GET /dashboard/stats` | per-resource |

**Contract rules:** all list endpoints cursor- or page-paginated consistent with existing modules; all mutations idempotent where externally retriable; error codes added to `error-codes.ts` (`AI_QUOTA_EXCEEDED`, `AI_PROVIDER_UNAVAILABLE`, `WORKFLOW_LIMIT_EXCEEDED`, `WORKFLOW_INVALID_DEFINITION`, `WORKFLOW_DEPTH_EXCEEDED`, `NOTIFICATION_NOT_FOUND`, `ANALYTICS_FORBIDDEN`).

---

## 5. Frontend Changes Required

All under the **non-negotiable UI/UX constraints** (§8). New surfaces and the existing pages they must match:

| Surface | Pattern source (must match) | Milestone |
|---------|------------------------------|-----------|
| Notification bell + panel + `/notifications` page | `ConversationItem` rows, `Badge` glass, `Modal`/popover, `Spinner` | M1 / M6 |
| Lead AI-score badge + factors popover + history | `LeadStatusBadge`, `Badge`, detail-page two-panel (`LeadDetailPage`) | M2 |
| Workflow list + **form-based builder** + run history | `LeadListPage` list, `Select`/`Tabs`/`Modal`, `LeadMetadataForm` field patterns | M3 |
| Follow-ups / "My Tasks" surface + suggestions | `LeadTable`, `DealHealthBadge`, `EmptyState`, `Button` | M4 |
| Dashboard (replace placeholder) + charts | `StatCard` (roadmap P0-5), token-styled SVG charts (no chart lib — §8/risk), `ForecastPanel` | M5 |
| Command palette, saved views, bulk actions, shortcuts, prefs | `SPRINT_7_UI_MODERNIZATION_PLAN.md` (ViewBar, BulkActionBar, CommandPalette on existing Radix Dialog) | M6 |

**Decision D-8 — workflow builder is form-based, not a node canvas.** A drag-and-drop canvas would require a new library (e.g. react-flow), violating "no new component library." The builder is a vertical form: **Trigger** (`Select` of trigger events) → **Conditions** (repeatable field/operator/value rows, same control set as `LeadFilters`) → **Actions** (repeatable action rows, each an action-type `Select` + its params). This mirrors HubSpot's simple workflow editor and Linear's automation rules as **UX references only**, and is fully expressible with existing primitives.

**Decision D-9 — charts use token-styled SVG/CSS, no charting library.** Bar/line/funnel/donut rendered with inline SVG + `currentColor`/token classes. If stakeholders later want a charting dependency, that is a separate explicit approval (logged as a risk). Until then, no new dependency ships.

---

## 6. Worker / Queue Changes Required

No new queues are created — the four needed already exist with concurrency set. Sprint 7 **registers processors** for them and adds one cron.

| Queue (existing) | New worker | Milestone | Notes |
|------------------|-----------|-----------|-------|
| `NOTIFICATION_DELIVERY` (c=15) | `notification-delivery.worker.ts` | M1 | persist-then-emit fan-out, digest |
| `EMAIL_DELIVERY` (c=20) | `email-delivery.worker.ts` | M1 | SendGrid adapter, templated |
| `AI_SCORING` (c=5) | `ai-scoring.worker.ts` | M2 | OpenAI call, quota/circuit-breaker, AiScore write |
| `WORKFLOW_EXECUTION` (c=10) | `workflow-execution.worker.ts` | M3 | match → evaluate → run actions, loop guard |
| `WEBHOOK_PROCESSING` (existing) | +`follow-up` not here | — | unchanged |

**New cron (single-flight, registry append):** `follow-up-sweep` — `0 * * * *` (hourly) → enqueues sweep job that creates due follow-up tasks/notifications. Plus optional `ai-rescore-stale` (daily) to refresh scores on active leads, quota-bounded. Registered identically to `instagram-token-refresh` (stable `jobId`, system queue).

**Rate / cost isolation:** AI worker concurrency stays 5 and is additionally cost-gated; notification/email workers scale independently; workflow worker depth-guarded. DLQ applies to all (existing `dlq.ts`).

---

## 7. Testing Strategy (summary; full matrix in Execution Plan + Acceptance Criteria)

- **Unit:** `AiAdapter` (mocked provider), quota counter math, circuit breaker, workflow condition evaluator, action executors, loop-guard depth, notification fan-out, follow-up staleness detection. Coverage ≥70% per new module (matches Sprint 6 standard); `AiAdapter` quota/breaker ≥90%.
- **Integration (`apps/api/tests/integration/`):** scoring round-trip (LEAD_CREATED → AiScore + denorm), over-quota skip, workflow trigger→condition→action end-to-end, idempotent re-delivery (no double run), loop-guard cap, follow-up sweep creates one task (idempotent), notification persist+read, email enqueue respects preference, analytics aggregates correct + RLS-isolated cross-org, replica read path.
- **Security/RLS:** every new table denies cross-org (`check:rls` = 25); analytics replica respects RLS; AI quota cannot be bypassed cross-org; workflow cannot act on another org's entity.
- **Frontend:** component tests for bell/panel, score badge, workflow builder rows, follow-up list, dashboard cards; BFF route auth tests; **token-compliance gate** (`grep` for hex returns zero in new component dirs).
- **Determinism:** AI tests mock the adapter — no live OpenAI calls in CI. A single opt-in smoke test (env-gated) hits the real provider, mirroring the inbox infra-gated tests.

---

## 8. UI/UX Compliance (NON-NEGOTIABLE — restated and binding)

From the user's Sprint 7 directive and `SPRINT_6_UI_UX_PLAN.md` (still the canonical design reference):

1. **Reuse existing LeadOS design tokens** (`tokens.css`) — background/border/text/primary scales + semantic glass pattern only.
2. **Reuse existing components** (`@/components/ui/`: `Button, Badge, Modal, Select, Tabs, Spinner, Toast`) + the roadmap shared atoms (`StatCard, EmptyState, AvatarInitials, UserSelect`).
3. **No new color palette. No hardcoded hex.** Acceptance gate: `grep` for hex in new component dirs returns zero.
4. **No new component library.** Command palette on the existing Radix Dialog; workflow builder form-based (D-8); charts token-styled SVG (D-9). Any chart/canvas dependency requires separate explicit approval.
5. **No redesign of the dashboard shell.** Nav entries may be *added* in the existing item style (Notifications, Workflows, Analytics, Tasks) but the sidebar structure is untouched.
6. **Consistency with Pipeline, Deal Detail, Inbox, and Instagram Integration pages** — every new page cites a pattern source (§5 table).
7. **HubSpot, Attio, Linear, Stripe are UX references only**, never design systems. We borrow interaction *ideas* (workflow rules, command palette, dashboards, automation) and render them entirely in LeadOS tokens/components.
8. Dark-only; `<Spinner>` not skeletons; `transition-colors` only; emoji/plain-glyph icons (no icon library).

---

## 9. Key Architectural Decisions (index)

| ID | Decision |
|----|----------|
| D-1 | One `emitDurable` per consumer queue (no shared router job); `core/events/fan-out.ts` centralizes the mapping |
| D-2 | AI quota: durable `ai_usage_counters` table (monthly) + Redis sliding window (hourly) + circuit breaker + prompt cache |
| D-3 | Workflow = definition row + `conditions`/`actions` validated JSON; `WorkflowRun` = execution record (no child action tables) |
| D-4 | Workflow loop guard: depth counter in job payload (cap) + Redis idempotency key per (workflow, entity, event) |
| D-5 | Smart follow-ups = Tasks + Workflows + `follow-up-sweep` cron; no new primitive |
| D-6 | Notifications persist-then-emit; new `notifications` + `notification_preferences` tables; socket init moves to layout |
| D-7 | Analytics reads `DATABASE_REPLICA_URL`, Redis-cached, RLS-scoped; no materialized views in Sprint 7 |
| D-8 | Workflow builder is form-based (Trigger→Conditions→Actions), not a node canvas (honors "no new component library") |
| D-9 | Charts are token-styled SVG/CSS; no charting library without separate approval |

---

## 10. Go / No-Go Inputs

**Green (ready):** event bus + durable jobs, queues/flags/limits/permissions pre-provisioned, `AiScore` + Task models exist, tenancy/RLS/activity discipline proven across 6 sprints, design system frozen and documented.

**External / pre-conditions to confirm before the dependent milestone starts:**
- OpenAI API key + billing account (blocks M2 live path; M2 dev/test mock the adapter).
- SendGrid account + verified sending domain SPF/DKIM (blocks M1 email *delivery*; in-app notifications ship without it).
- Read replica (`DATABASE_REPLICA_URL`) provisioned and reachable (blocks M5 live path; falls back to primary in dev).

**Recommendation:** **GO to detailed execution planning.** The architecture is low-risk because Sprint 7 activates existing seams rather than reshaping the system. Proceed to `SPRINT_7_EXECUTION_PLAN.md`; do not write code until the four Sprint 7 documents are approved.

---

*All current-state facts were source-verified at HEAD (`6523980`): module list, queue/flag/limit/permission definitions, `AiScore`/`Task`/`Lead` schema, 22 tenant tables, latest migration `0016`. Where this document and the execution plan conflict, this review governs intent and the execution plan governs file-level detail; a later Sprint 7 signoff (to be authored) supersedes both, mirroring the Sprint 6 process.*
