# SPRINT_5_EXECUTION_PLAN.md

> **Sprint 5 — Pipeline & Deals + Async Backbone Start — execution plan**
> Author: Engineering, LeadOS · Date: 2026-06-20
> Source of truth: `FINAL_ARCHITECTURE.md`, `DEVELOPMENT_ROADMAP.md`, `SPRINT_4_FINAL_SIGNOFF.md`, `MODULE_DEPENDENCY_GRAPH.md`, `docs/blueprint/08-DATABASE-DESIGN.md`, `docs/blueprint/10-PRODUCT-FEATURES.md`.
> Planning only — no code, no file changes.

---

## 0. Context & Premise

Sprint 4 delivered the complete CRM Core backend (leads, contacts, tasks, notes, files, activity feed, list/search, CSV import/export) and is **FULL PASS** (commit `9aa5337`, 393 tests, 85.88% coverage, 15 RLS-enforced tables, isolation suite 54/54).

Sprint 5 has two parallel tracks:

**Track A — Pipeline & Deals:** The first layer that converts CRM activity into revenue data. Pipelines and stages define the sales process; deals are lead-linked opportunities that move through stages. This is the backbone of the Kanban board and weighted forecast. The Lead model from Sprint 4 is the primary foreign key; deals reference both leads and contacts.

**Track B — Async Backbone (Webhook Subsystem Skeleton):** Sprint 6 (Instagram Inbox) requires a proven webhook receiver before any social integration work begins. The FINAL_ARCHITECTURE.md mandate — **persist-then-200, HMAC-verified, idempotent** — must be implemented and proven in Sprint 5 so Sprint 6 builds on a working foundation, not a scaffold.

**Sprint 5 is also the first sprint with real frontend work.** The Pipeline Kanban (Screen 4) and Deal Detail (Screen 5) ship in this sprint. The frontend deferred from Sprint 4 (Leads List, Lead Detail) is not in scope here — it remains deferred until the frontend sprint is scheduled explicitly.

### What Sprint 4 Left for Sprint 5

| Item | Origin | Required action |
|---|---|---|
| **D-S4-1** | Deferred scope | Frontend for Leads List (Screen 2), Lead Detail (Screen 3) not built in Sprint 4 (backend-only sprint). Must be scheduled; not blocking Sprint 5 Kanban work. |
| **D-S4-2** | BullMQ | `webhook` queue not yet provisioned. Must be added before M4 (webhook skeleton). |
| **D-S4-3** | `TENANT_TABLES` registry | Currently at 15 tables. Must grow by 4 in Sprint 5: `pipelines`, `pipeline_stages`, `deals`, `webhook_events`. |
| **D-S4-4** | `PLAN_LIMITS` | Single-pipeline gate for Starter plan not yet in `packages/shared`. Required before M2. |

---

## 1. Cross-Cutting Constraints

All Sprint 4 conventions carry forward unchanged. Every task in Sprint 5 must satisfy all of the following before the milestone is considered implementable.

| Constraint | Enforcement |
|---|---|
| **Tenant scoping** | Every mutation and query on a tenant model goes inside `withTenant(organizationId, callback)`. The Prisma extension injects `organizationId` on every operation. No module may call the base Prisma client directly on a tenant-scoped model. |
| **RLS** | All new tenant tables (`pipelines`, `pipeline_stages`, `deals`, `webhook_events`) require `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, and a `tenant_isolation` policy using the missing-safe GUC form. `check:rls` must pass at 19 tables after M1. |
| **RBAC** | Every new endpoint calls `requirePermission(permission)`. New permissions added to `packages/shared/src/constants/permissions.ts` before routes are written. Follows the established pattern: `pipelines.read`, `pipelines.create`, `pipelines.update`, `pipelines.delete`, `deals.read`, `deals.create`, `deals.update`, `deals.delete`, `deals.read_own`, `deals.update_own`. |
| **Activity emission** | Every auditable mutation (deal create, stage move, won/lost, pipeline create/update) calls `ActivityService.append(db, ctx, input)` within the same `withTenant` transaction. `ActivityType` constants added to `packages/shared` before services are written. |
| **Audit recording** | Every mutation calls `PrismaAuditRecorder.record(input)` after the transaction (existing pattern) or `buildAuditRow(input, ctx)` + `db.auditLog.create()` inside the transaction (worker pattern). PII fields (none in Pipeline/Deal models) not applicable here, but the pattern must be followed. |
| **Plan limits** | Deal count and pipeline count checked against `PLAN_LIMITS[plan]` before create. Single-pipeline limit (Starter) enforced at the service layer, not the route layer. Return `PLAN_LIMIT_EXCEEDED` (existing `ErrorCode`) with the same envelope shape as Sprint 4. |
| **Module boundaries** | `modules/pipelines` and `modules/deals` may import from each other's public service interfaces or from `modules/leads` and `modules/contacts` repository types. They may **never** import another module's Prisma repository or directly call the Prisma client with a cross-module model. ESLint boundary rule must remain clean. |
| **BullMQ workers** | New workers (`webhook-processor`) follow the `registerWorker(name, processor)` pattern in `worker-registry.ts`. Job payloads carry `organizationId`, `userId` where applicable. No `requireTenantContext()` in worker functions. |
| **Atomic multi-write** | Deal won/lost (which may create a contact or update a lead) must be a single `withTenant` transaction. Stage reorder must be a single transaction. No partial updates. |
| **Webhook raw body** | `express.raw()` must be mounted **before** the global `express.json()` on webhook routes, per `FINAL_ARCHITECTURE.md §5.3`. HMAC-SHA256 must verify the raw body buffer, not the parsed JSON. |

---

## 2. Epics & Tasks

### M1 — Schema & RLS Foundation

**Goal:** New domain models in Prisma, migrations with RLS policies, TENANT_TABLES registry updated, `check:rls` passing at 19 tables. No endpoint, no service — schema only.

#### CRM-7.1: Prisma Schema — Pipeline, Deal, Webhook Event Models

New models to add to `schema.prisma`:

**`Pipeline`** (tenant-scoped)
- `id` UUID PK
- `organizationId` UUID FK → Organization (tenant scope)
- `name` String (max 100)
- `isDefault` Boolean (exactly one per org must be default)
- `stages` relation → PipelineStage[]
- `deals` relation → Deal[]
- `createdAt`, `updatedAt`

**`PipelineStage`** (tenant-scoped)
- `id` UUID PK
- `organizationId` UUID FK → Organization (tenant scope)
- `pipelineId` UUID FK → Pipeline (CASCADE delete)
- `name` String (max 100)
- `order` Int (0-based, unique per pipeline)
- `color` String (hex, nullable)
- `probability` Int (0–100, null = not forecasted)
- `isWon` Boolean (exactly one won stage per pipeline allowed)
- `isLost` Boolean (exactly one lost stage per pipeline allowed)
- `createdAt`, `updatedAt`

**`Deal`** (tenant-scoped)
- `id` UUID PK
- `organizationId` UUID FK → Organization (tenant scope)
- `title` String (max 200)
- `value` Decimal? (deal monetary value, nullable)
- `currency` String (3-char ISO 4217, default 'INR')
- `pipelineId` UUID FK → Pipeline
- `stageId` UUID FK → PipelineStage
- `leadId` UUID FK? → Lead (nullable — deal may exist without a lead)
- `contactId` UUID FK? → Contact (nullable)
- `assignedToId` UUID FK? → User
- `status` Enum: `OPEN | WON | LOST`
- `closedAt` DateTime? (set when status becomes WON or LOST)
- `lostReason` String? (max 500)
- `expectedCloseDate` DateTime?
- `customFields` Json (default `{}`)
- `createdById` UUID FK → User
- `deletedAt` DateTime? (soft delete)
- `createdAt`, `updatedAt`

**`WebhookEvent`** (tenant-scoped)
- `id` UUID PK
- `organizationId` UUID FK → Organization (tenant scope)
- `source` Enum: `STRIPE | INSTAGRAM | WHATSAPP | SYSTEM`
- `externalEventId` String (the idempotency key from the source)
- `payload` Json (raw parsed body stored for replay)
- `rawHeaders` Json (relevant headers for debugging)
- `status` Enum: `PENDING | PROCESSING | DONE | FAILED | SKIPPED`
- `attempts` Int (default 0)
- `lastAttemptAt` DateTime?
- `processedAt` DateTime?
- `errorMessage` String?
- `createdAt`, `updatedAt`
- Unique constraint: `(source, externalEventId)` — idempotency key

**New enums:**
- `DealStatus: OPEN | WON | LOST`
- `WebhookSource: STRIPE | INSTAGRAM | WHATSAPP | SYSTEM`
- `WebhookEventStatus: PENDING | PROCESSING | DONE | FAILED | SKIPPED`

**New `ActivityType` constants** (to `packages/shared`):
- `DEAL_CREATED`
- `DEAL_STAGE_MOVED`
- `DEAL_WON`
- `DEAL_LOST`
- `DEAL_UPDATED`
- `PIPELINE_CREATED`
- `PIPELINE_UPDATED`

**Acceptance criteria:**
- `prisma validate` passes
- All new models appear in generated Prisma types
- `packages/shared` exports new enums and activity types before any service is written

#### CRM-7.2: Migrations

Three migrations in order:

**Migration A — `0009_pipeline_tables`**
- CREATE TABLE: `pipelines`, `pipeline_stages`, `deals`
- All FKs with correct ON DELETE behavior (Pipeline CASCADE → PipelineStage; ON DELETE SET NULL for Deal→Lead, Deal→Contact, Deal→AssignedTo)
- Indexes: `(organizationId, status, stageId)` on deals; `(organizationId, pipelineId)` on stages; `(leadId)` on deals; `(contactId)` on deals; `(assignedToId)` on deals

**Migration B — `0010_pipeline_rls`**
- ENABLE/FORCE RLS + `tenant_isolation` policy on `pipelines`, `pipeline_stages`, `deals`
- Immutability: no trigger needed (deals are mutable, unlike activities)

**Migration C — `0011_webhook_events`**
- CREATE TABLE: `webhook_events`
- Unique index: `(source, "externalEventId")`
- Index: `(status, "createdAt")` for the worker re-enqueue query
- ENABLE/FORCE RLS + `tenant_isolation` policy — note: some webhook events (e.g. Stripe subscription webhooks) may not have an org context at receive time; the policy must allow NULL organizationId for initial insert and restrict reads to the org context. Design this carefully.
- `express.raw()` path does not set tenant context; the webhook receiver resolves org from the payload after verification. The RLS exception for initial insert must be handled at the migration level (e.g. a separate INSERT-permissive policy for the `leados_app` role on status=PENDING rows with NULL org, updated later by the worker).

**Acceptance criteria:**
- All migrations are idempotent (`IF NOT EXISTS`)
- `prisma migrate deploy` succeeds on a clean DB
- `prisma db pull` round-trips without schema drift

#### CRM-7.3: TENANT_TABLES Registry and check:rls

- Add `pipelines`, `pipeline_stages`, `deals`, `webhook_events` to the `TENANT_TABLES` registry
- `pnpm --filter api check:rls` must output: `OK — 19 tenant tables enabled + forced + policied`
- Update `PLAN_LIMITS` in `packages/shared` with:
  - `pipelines: 1` for TRIAL and STARTER
  - `pipelines: 5` for GROWTH and SCALE (matches roadmap)
  - `deals: 250` for TRIAL, `deals: 1000` for STARTER, `deals: unlimited` (Number.MAX_SAFE_INTEGER) for GROWTH and SCALE

**M1 acceptance criteria:**
- `check:rls` reports 19 tables ✅
- All 4 new Prisma models are generated ✅
- `packages/shared` exports `DealStatus`, `WebhookSource`, `WebhookEventStatus`, deal/pipeline `ActivityType` values, updated `PLAN_LIMITS` ✅
- `prisma migrate deploy` clean ✅
- No service or endpoint code yet

---

### M2 — Pipeline Module

**Goal:** Pipeline and PipelineStage CRUD, plan-limit enforcement, activity emission, audit, integration tests. Endpoints: `POST /pipelines`, `GET /pipelines`, `GET /pipelines/:id`, `PATCH /pipelines/:id`, `DELETE /pipelines/:id`, `POST /pipelines/:id/stages`, `PATCH /pipelines/:id/stages/:stageId`, `DELETE /pipelines/:id/stages/:stageId`, `PATCH /pipelines/:id/stages/reorder`.

#### CRM-8.1: Pipeline Repository

`PrismaPipelineRepository` extends `TenantRepository`:
- `create(input)` — creates pipeline + optional initial stages in a single transaction
- `findById(id)` — includes stages ordered by `order` ASC
- `findAll()` — all org pipelines with stage counts
- `update(id, input)` — patch pipeline name, isDefault
- `softDelete(id)` — must refuse if pipeline has open deals (return error, not hard-delete)
- `count()` — for plan limit check

`PrismaPipelineStageRepository` extends `TenantRepository`:
- `create(pipelineId, input)` — new stage appended at end (max order + 1)
- `update(stageId, input)` — patch name, color, probability
- `delete(stageId)` — refuse if stage has open deals; refuse if it is the only stage
- `reorder(pipelineId, orderedStageIds[])` — update `order` field for all stages in a single transaction; validates that the array contains exactly the existing stage IDs for that pipeline

**Constraints:**
- Exactly one `isDefault = true` pipeline per org. Setting a new default unsets the previous default in the same transaction.
- Exactly one `isWon` and one `isLost` stage per pipeline. These are set on stage create/update with validation.
- Minimum one stage per pipeline before any deal can be created.

#### CRM-8.2: Pipeline Service

`PipelineService`:
- `create(input)` — plan-limit check (TRIAL/STARTER: max 1 pipeline), `withTenant` transaction, emit `PIPELINE_CREATED` activity, audit record
- `list()` — returns all pipelines with stages
- `getById(id)` — 404 if not found in tenant scope
- `update(id, input)` — `withTenant`, emit `PIPELINE_UPDATED` activity, audit record
- `delete(id)` — refuse with `CONFLICT` if pipeline has open deals; `withTenant`
- `createStage(pipelineId, input)` — `withTenant`, validate won/lost uniqueness
- `updateStage(pipelineId, stageId, input)` — `withTenant`, validate won/lost uniqueness
- `deleteStage(pipelineId, stageId)` — `withTenant`, refuse if deals in stage
- `reorderStages(pipelineId, orderedStageIds[])` — single `withTenant` transaction

**Acceptance criteria:**
- Plan limit: TRIAL org with 1 pipeline cannot create a 2nd (429)
- Setting a stage `isWon = true` when another stage is already won → 400
- Delete pipeline with open deals → 409 conflict
- All mutations emit activity + audit record within the same transaction
- `requireTenantContext()` used in service (not in worker; service runs on request path)

#### CRM-8.3: Pipeline Endpoints + RBAC

Routes (all under `/api/v1/pipelines`):

| Method | Path | Permission | Body schema |
|---|---|---|---|
| GET | `/` | `pipelines.read` | — |
| POST | `/` | `pipelines.create` | `createPipelineSchema` |
| GET | `/:id` | `pipelines.read` | — |
| PATCH | `/:id` | `pipelines.update` | `patchPipelineSchema` |
| DELETE | `/:id` | `pipelines.delete` | — |
| POST | `/:id/stages` | `pipelines.update` | `createStageSchema` |
| PATCH | `/:id/stages/:stageId` | `pipelines.update` | `patchStageSchema` |
| DELETE | `/:id/stages/:stageId` | `pipelines.update` | — |
| PATCH | `/:id/stages/reorder` | `pipelines.update` | `reorderStagesSchema` |

Route ordering: `/stages/reorder` must be registered **before** `/stages/:stageId`.

**Zod schemas** (in `packages/shared`):
- `createPipelineSchema`: `{ name: string(1–100), stages?: [{ name, isWon?, isLost?, color?, probability? }] }`
- `patchPipelineSchema`: `{ name?: string, isDefault?: boolean }`
- `createStageSchema`: `{ name: string(1–100), color?: string(hex), probability?: int(0–100), isWon?: boolean, isLost?: boolean }`
- `patchStageSchema`: same fields as createStageSchema, all optional
- `reorderStagesSchema`: `{ stageIds: string[uuid][] }` (non-empty array)

**M2 acceptance criteria:**
- ≥ 15 integration tests covering: CRUD, plan limit, won/lost uniqueness, reorder, delete-with-deals conflict, RBAC (403 without permission), tenancy (org B cannot access org A's pipelines), 401 without token
- `check:rls` still 19 ✅
- Isolation suite unchanged at 54/54 ✅

---

### M3 — Deal Module

**Goal:** Deal CRUD, stage moves, won/lost lifecycle, weighted forecast endpoint, ownOnly support, activity emission, audit. Endpoints: `POST /deals`, `GET /deals`, `GET /deals/:id`, `PATCH /deals/:id`, `DELETE /deals/:id`, `POST /deals/:id/move`, `POST /deals/:id/won`, `POST /deals/:id/lost`, `GET /deals/forecast`.

#### CRM-9.1: Deal Repository

`PrismaDealRepository` extends `TenantRepository`:
- `create(input)` — validates stageId belongs to the org's pipeline
- `findById(id, ownedByUserId?)` — 404 guard + ownOnly
- `findManyWithFilter(query, ownedByUserId?)` — paginated; filters: `pipelineId`, `stageId`, `status`, `assignedToId`, `leadId`, `contactId`, `search` (title), `closedFrom`, `closedTo`, `valueMin`, `valueMax`
- `update(id, input)` — patch title, value, expectedCloseDate, customFields
- `moveToStage(id, stageId)` — validates new stageId is in same pipeline; sets `stageId`
- `markWon(id)` — sets `status = WON`, `closedAt = now()`
- `markLost(id, reason)` — sets `status = LOST`, `closedAt = now()`, `lostReason`
- `softDelete(id)` — sets `deletedAt`
- `count(filter?)` — for plan limit
- `getWeightedForecast(pipelineId?)` — aggregate query: sum of `value * probability / 100` per stage, grouped by stage; returns `{ stageId, stageName, probability, totalValue, weightedValue, dealCount }[]`

#### CRM-9.2: Deal Service

`DealService`:
- `create(input)` — plan limit check, validate stageId→pipelineId belongs to org, `withTenant`, emit `DEAL_CREATED` activity (with `{ pipelineId, stageId, value }` in metadata), audit
- `list(query)` — `withTenant`, applies ownOnly if `ctx.ownOnly`
- `getById(id)` — `withTenant`, 404
- `update(id, input)` — `withTenant`, emit `DEAL_UPDATED` activity, audit
- `move(id, stageId)` — `withTenant`, validate stage in same pipeline, emit `DEAL_STAGE_MOVED` (metadata: `{ fromStageId, toStageId }`), audit
- `markWon(id)` — `withTenant`, validate deal is OPEN (cannot re-win), emit `DEAL_WON`, audit
- `markLost(id, reason)` — `withTenant`, validate deal is OPEN, emit `DEAL_LOST` (metadata: `{ reason }`), audit
- `delete(id)` — soft delete, `withTenant`, audit
- `forecast(pipelineId?)` — `withTenant`, returns weighted forecast array

**ownOnly:** If `ctx.ownOnly === true`, all queries filter to `assignedToId = ctx.userId`. `getById` on a non-assigned deal returns 404.

**Stage move validation:** `stageId` provided to `move()` must belong to the same `pipelineId` as the deal's current stage. Cross-pipeline moves are not allowed.

**Won/lost finality:** Once a deal is `WON` or `LOST`, `move()` must refuse with a `CONFLICT` error. Only `reopen` (if implemented in a later sprint) can change status back to `OPEN`.

#### CRM-9.3: Deal Endpoints + RBAC

Routes (all under `/api/v1/deals`):

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/` | `deals.read` OR `deals.read_own` | query filter: pipelineId, stageId, status, assignedToId, search, page, limit |
| POST | `/` | `deals.create` | — |
| GET | `/forecast` | `deals.read` | must be before `/:id` |
| GET | `/:id` | `deals.read` OR `deals.read_own` | — |
| PATCH | `/:id` | `deals.update` OR `deals.update_own` | — |
| DELETE | `/:id` | `deals.delete` | soft delete |
| POST | `/:id/move` | `deals.update` OR `deals.update_own` | body: `{ stageId }` |
| POST | `/:id/won` | `deals.update` OR `deals.update_own` | no body |
| POST | `/:id/lost` | `deals.update` OR `deals.update_own` | body: `{ reason? }` |

Route ordering: `/forecast` registered before `/:id`.

**Zod schemas** (in `packages/shared`):
- `createDealSchema`: `{ title, value?, currency?, pipelineId(uuid), stageId(uuid), leadId?(uuid), contactId?(uuid), assignedToId?(uuid), expectedCloseDate?, customFields? }`
- `patchDealSchema`: `{ title?, value?, currency?, assignedToId?, expectedCloseDate?, customFields? }` (stageId and status not patchable directly — use `/move`, `/won`, `/lost`)
- `moveDealSchema`: `{ stageId: uuid }`
- `lostDealSchema`: `{ reason?: string(max 500) }`
- `dealListQuerySchema`: `{ pipelineId?, stageId?, status?, assignedToId?, leadId?, contactId?, search?, valueMin?, valueMax?, page, limit, sortBy?, sortOrder? }`

**M3 acceptance criteria:**
- ≥ 20 integration tests: CRUD, stage move, won/lost finality, cross-pipeline move rejection, ownOnly, plan limit, RBAC matrix, tenancy, 401/403/404/409
- Weighted forecast returns correct values (integration test with known data)
- Won deal cannot be moved to another stage (409)
- SALES_EXECUTIVE cannot see deals assigned to another user (`deals.read_own`)
- Activity emitted and retrievable via `GET /deals/:id/activities` (if activity feed endpoint is wired for deals; otherwise verified in service unit test)
- Isolation suite unchanged ✅

---

### M4 — Webhook Subsystem Skeleton

**Goal:** A production-ready webhook receiver that accepts, HMAC-verifies, deduplicates, and persists events before returning 200, then enqueues them for async processing. The worker skeleton processes events but may log-and-skip in Sprint 5 (real event handlers land in Sprint 6 for Instagram, Sprint 8 for Stripe). This milestone proves the async backbone before Instagram integration begins.

#### CRM-10.1: Webhook Receiver

`apps/api/src/modules/webhooks/webhook.controller.ts`

Single controller with handlers per source:
- `receiveInstagram(req, res)` — verify IG HMAC-SHA256 (`X-Hub-Signature-256`), persist, enqueue, return 200
- `receiveStripe(req, res)` — verify Stripe `stripe-signature`, persist, enqueue, return 200
- `verifyInstagramChallenge(req, res)` — handle Meta's `hub.challenge` GET request for webhook subscription

**HMAC verification:**
- Uses `crypto.timingSafeEqual` — no timing side channels
- Reads `req.rawBody` (Buffer) set by `express.raw()` middleware mounted before `express.json()`
- Invalid signature → 400 (log warning, do NOT 401 — Meta interprets 4xx as a delivery failure and retries)
- Missing signature header → 400

**Persist-then-200 contract:**
- Webhook event is written to `webhook_events` table inside a `withTenant`-equivalent write (note: some events like Stripe may not have an org at receive time — see schema design in M1)
- Idempotency: on `(source, externalEventId)` unique conflict, treat as `SKIPPED` and return 200 immediately — do not re-enqueue
- The 200 is sent only after the DB write confirms — if the DB write fails, return 500 and let the source retry
- Total time from request to 200 must be under Meta's 20-second ack window (the DB write is the only blocking operation)

**Queue:**
- Enqueue to `QUEUE.WEBHOOK` after successful DB write
- Job payload: `{ webhookEventId, source }`
- `express.raw()` path does not set tenant context; the worker resolves org after dequeuing

#### CRM-10.2: Webhook Worker

`apps/api/src/core/queue/workers/webhook.worker.ts`

Registered in `startWorkers()` as `'webhook'` queue processor.

Worker logic (Sprint 5 skeleton):
1. Load `WebhookEvent` by `webhookEventId` (using platform/admin connection, not `withTenant` — no org context yet)
2. Update `status = PROCESSING`, `attempts++`, `lastAttemptAt = now()`
3. Dispatch to source handler: `handleInstagram(event)` | `handleStripe(event)` | `handleSystem(event)`
4. Sprint 5 handlers: log event type and payload summary; mark `status = DONE; processedAt = now()`
5. On error: mark `status = FAILED; errorMessage = err.message`; BullMQ retries up to 3 times with exponential backoff; after exhaustion → DLQ via existing `moveToDeadLetter()`

**Re-enqueue on Redis recovery** (FINAL_ARCHITECTURE.md §7.3, R-TECH-1):
- A startup check queries `webhook_events WHERE status = 'PENDING' AND createdAt < now() - interval '5 minutes'` and re-enqueues them. This handles the case where the API crashed after DB write but before Redis enqueue.

#### CRM-10.3: Webhook Routes

`apps/api/src/modules/webhooks/webhook.routes.ts`

Routes (unversioned — `FINAL_ARCHITECTURE.md §5.3`):

| Method | Path | Auth | Middleware |
|---|---|---|---|
| GET | `/api/webhooks/instagram` | none | none (challenge verification) |
| POST | `/api/webhooks/instagram` | none | `express.raw()` before JSON |
| POST | `/api/webhooks/stripe` | none | `express.raw()` before JSON |

These routes are mounted in `app.ts` **outside** the `/api/v1/` authenticated router, **before** `express.json()`, as established by `FINAL_ARCHITECTURE.md §5.3`:
```
app.use('/api/webhooks', express.raw({ type: '*/*', limit: '1mb' }), webhookRouter);
```
This mount already exists for IG per the architecture doc. Sprint 5 confirms it for Stripe as well.

**New queue registration** (in `names.ts`):
- `QUEUE.WEBHOOK = 'webhook'`
- `QUEUE_CONCURRENCY['webhook'] = 5`

**M4 acceptance criteria:**
- POST `/api/webhooks/instagram` with valid HMAC → 200, event persisted with `status = PENDING`, job enqueued
- POST `/api/webhooks/instagram` with invalid HMAC → 400, nothing persisted
- POST `/api/webhooks/instagram` with duplicate `externalEventId` → 200, `status = SKIPPED`, not re-enqueued
- GET `/api/webhooks/instagram?hub.verify_token=...&hub.challenge=...` → returns `hub.challenge` value
- Worker processes job: `status` transitions PENDING → PROCESSING → DONE
- Worker failure: `status = FAILED`, error message stored
- Re-enqueue on startup: PENDING events older than 5 minutes are re-enqueued
- `check:rls` still 19 ✅ (webhook_events has its own RLS policy)
- ≥ 8 integration tests covering the above

---

### M5 — Frontend: Pipeline Kanban (Screen 4) + Deal Detail (Screen 5)

**Goal:** First production frontend features. Kanban board with drag-and-drop stage moves, Deal Detail with activity feed and metadata panel. Uses the API endpoints from M2 and M3.

#### FE-1: Project Setup and API Client

Before any screen is built:

**API client (if not already done in Sprint 4 frontend):**
- Axios instance at `apps/web/src/lib/api-client.ts` with `Authorization: Bearer <token>` interceptor reading from in-memory Zustand store
- TanStack Query client with stale-while-revalidate defaults
- Error handling: `AppError` envelope parsed into typed query errors

**BFF route handlers** (Next.js, for RSC data fetches):
- `GET /bff/pipelines` → proxies `GET /api/v1/pipelines` with the server-side session cookie
- `GET /bff/deals?pipelineId=...` → proxies `GET /api/v1/deals?pipelineId=...`

**Type generation:**
- `packages/shared` Zod schemas used as the single source of types (inferred via `z.infer<>`) for both API and frontend — no duplicated type definitions

#### FE-2: Pipeline Kanban (Screen 4)

`apps/web/src/app/(dashboard)/pipeline/page.tsx`

**Layout:**
- Pipeline selector (dropdown if GROWTH/SCALE has multiple pipelines; hidden if only one)
- Horizontal scrollable Kanban board — one column per stage
- Each column: stage name, deal count, total value, deal cards
- "Add Deal" button at top of each column

**Deal cards:**
- Title, assigned user avatar, value, expected close date
- Lead/contact linked name (if any)
- Color indicator (low/medium/high value — threshold TBD)

**Drag and drop:**
- `@dnd-kit/core` + `@dnd-kit/sortable` — DO NOT use react-beautiful-dnd (archived)
- Drag a card between columns → optimistic UI update (move card immediately) → `POST /api/v1/deals/:id/move` → on error, revert to original position with toast
- Framer Motion for card enter/exit animations on drop
- `dragOverlay` renders the card at full opacity while dragging; source position shows ghost at 40% opacity

**Optimistic updates:**
- TanStack Query `useMutation` with `onMutate` → `cancelQueries` → `setQueryData` (optimistic) → `onError` → `setQueryData` (revert) → `onSettled` → `invalidateQueries`
- The board does not re-fetch during a drag sequence to prevent card position flicker

**Won/Lost:**
- Right-click on card (or "..." menu) → "Mark Won" / "Mark Lost" (with reason modal for Lost)
- Won deals removed from board after transition (or shown in a collapsed "Won" column — design choice to align with Screen 4 spec in doc 17)

**Plan gating:**
- If `plan = TRIAL | STARTER` and a 2nd pipeline exists (edge case from data migration), show an upgrade prompt instead of the pipeline selector

**Acceptance criteria for FE-2:**
- Board renders all stages and deals for the active pipeline
- Drag-and-drop moves a deal between stages (API call confirmed)
- Optimistic revert on API error (test by mocking network failure)
- Won/Lost action fires correct endpoint and removes card from board
- Empty pipeline (no deals) shows an empty state with "Add Deal" CTA
- SALES_EXECUTIVE only sees their own deals (ownOnly applied in query)
- Kanban is responsive down to 1280px width (horizontal scroll below that)

#### FE-3: Deal Detail (Screen 5)

`apps/web/src/app/(dashboard)/pipeline/deals/[id]/page.tsx`

**Layout (two-panel):**
- **Left panel (60%):** Deal metadata form, linked lead/contact card, stage timeline (breadcrumb of stages with current highlighted), won/lost CTA
- **Right panel (40%):** Activity feed (same component as Lead Detail will use), Notes tab, Files tab

**Deal metadata form:**
- Editable inline: title, value, currency, expected close date, assigned user (dropdown), custom fields
- PATCH on blur / submit (no auto-save)
- Shows `createdAt`, `updatedAt`, `closedAt` (read-only)

**Stage timeline:**
- Horizontal list of pipeline stages; current stage highlighted; click to move (fires `/move` endpoint)
- Won/Lost stages shown at end; clicking "Won" fires `/won`; clicking "Lost" opens reason modal

**Activity feed:**
- Paginated list of activities with infinite scroll (TanStack Query `useInfiniteQuery`)
- Icons per `ActivityType` — `DEAL_CREATED`, `DEAL_STAGE_MOVED` (shows from/to stage names), `DEAL_WON`, `DEAL_LOST`
- Reuses the activity feed component pattern (to be shared with Lead Detail in a later sprint)

**Notes and Files tabs:**
- Reuse the note/file components from Lead Detail scope (Sprint 4 deferred frontend)
- In Sprint 5: stub tabs that show "Coming soon" if Lead Detail frontend is not yet built, OR implement if the shared components are available

**Acceptance criteria for FE-3:**
- Deal Detail opens from clicking a Kanban card
- All metadata fields editable and persisted via PATCH
- Stage timeline correctly shows current stage and allows moves
- Activity feed loads and paginates correctly
- Won/Lost actions confirmed in Deal Detail view also

#### FE-4: Deal Health Indicators

Augments both the Kanban cards and Deal Detail:
- **Stale deal warning:** if `updatedAt` or last activity older than 14 days AND deal is OPEN — yellow border on card, "No activity in N days" badge on detail
- **Expected close date overdue:** if `expectedCloseDate < today` AND deal is OPEN — red badge
- **High value indicator:** if value > threshold (configurable, initial: 50,000 INR) — diamond icon on card

These are computed client-side from the deal data — no additional API calls.

**M5 acceptance criteria:**
- Kanban renders and drag-drop works end-to-end with real API
- Deal Detail shows correct data and allows edits
- Health indicators render correctly for stale/overdue/high-value deals
- Mobile layout (< 768px): Kanban shows single column (active stage); navigation arrows for other stages
- `pnpm --filter web build` clean (no TS errors, no lint errors)
- Lighthouse performance score ≥ 90 on the Pipeline page (local dev build)

---

### M6 — Deferred Sprint 4 Frontend (Leads List + Lead Detail)

**Scope note:** This milestone is **tentative**. If capacity permits after M1–M5 are delivered, implement the frontend that was explicitly deferred from Sprint 4.

#### FE-5: Leads List (Screen 2)

`apps/web/src/app/(dashboard)/leads/page.tsx`

- Table view with pagination (TanStack Query, server-side)
- Filter bar: status, source, tags, assignedToId, AI score range, date range
- Search input (debounced, fires `?search=` query)
- Sort by: firstName, createdAt, aiScore (column header click)
- Saved filter presets (Zustand, persisted to localStorage)
- Inline edit: status dropdown in the row
- "Import CSV" button → opens upload modal → calls `POST /leads/import` → polls `GET /leads/import/:jobId`
- "Export CSV" button → calls `POST /leads/export` → polls for download URL → triggers download

**Acceptance criteria for FE-5:**
- List loads with correct pagination and meta
- All filters work independently and in combination
- Search debounce fires after 300ms
- CSV import modal handles error rows (shows row-level errors)
- SALES_EXECUTIVE sees only their own leads (ownOnly reflected in query results)

#### FE-6: Lead Detail (Screen 3)

`apps/web/src/app/(dashboard)/leads/[id]/page.tsx`

- Two-panel layout: left (lead form + linked deals), right (activity feed + notes + files tabs)
- Editable lead metadata
- Status machine: status dropdown with allowed transitions only (matches backend)
- Convert to Contact button (fires `POST /leads/:id/convert`)
- Linked deals panel: lists open deals for this lead; "Create Deal" CTA
- Activity feed with infinite scroll
- Notes CRUD (rich text editor — Tiptap or Quill)
- File upload with presigned URL flow

**Note:** If M6 cannot fit in Sprint 5, it moves to Sprint 5.5 (a buffer sprint) or is bundled into Sprint 6's frontend scope.

---

## 3. Acceptance Criteria (Sprint 5 exit gates)

All of the following must hold before Sprint 5 is considered complete.

### Infrastructure & CI

| Criterion | Proof |
|---|---|
| `check:rls` covers all 19 tenant tables | `pnpm --filter @leados/api check:rls` → `OK — 19 tenant tables enabled + forced + policied` |
| Isolation suite green and unchanged | `pnpm --filter @leados/api test:isolation` → 54/54 |
| Full API test suite green | 0 failures; coverage ≥ 60% |
| Frontend build clean | `pnpm --filter web build` → 0 TS errors, 0 lint errors |
| Module boundary lint enforced | `pnpm lint` fails on any cross-module direct import |

### Tenancy & Isolation

| Criterion | Proof |
|---|---|
| Org A pipelines/deals invisible to org B | Integration test: pipeline created in orgA not returned for orgB token |
| Stage reorder is atomic | Integration test: reorder with invalid stage ID rolls back, no partial reorder |
| Webhook event idempotency | Same `externalEventId` submitted twice → second returns 200, status = SKIPPED, no duplicate row |
| Webhook HMAC verified over raw body | Integration test: tampered body after signature → 400 |

### RBAC & Plan Limits

| Criterion | Proof |
|---|---|
| TRIAL org limited to 1 pipeline | Integration test: create 2nd pipeline on TRIAL → 429 |
| `deals.read_own` enforced | SALES_EXECUTIVE cannot see deal assigned to another user → 404 |
| Won deal cannot be moved | POST `/deals/:id/move` on WON deal → 409 |
| Stage delete blocked if deals present | DELETE stage with open deals → 409 |

### Data Correctness

| Criterion | Proof |
|---|---|
| Weighted forecast calculation correct | Integration test: 2 deals × known value × probability = expected weighted total |
| Pipeline default uniqueness | Setting a new default pipeline unsets the previous default atomically |
| isWon/isLost uniqueness per pipeline | Setting 2 stages as isWon in same pipeline → 400 |
| Stage reorder preserves all stage IDs | Reorder with missing stage ID → 400 |
| Webhook re-enqueue on startup | PENDING events older than 5min in DB → re-enqueued on worker startup |

### Test Counts (Sprint 5 additions)

| Suite | Minimum |
|---|---|
| Pipeline integration (`pipelines.integration.test.ts`) | ≥ 15 |
| Deal integration (`deals.integration.test.ts`) | ≥ 20 |
| Webhook integration (`webhook.integration.test.ts`) | ≥ 8 |
| Frontend (component/e2e) | ≥ 5 (Kanban drag-drop, Deal Detail render, health indicators) |
| **Total new tests** | **≥ 48** |

---

## 4. Dependencies

### On Sprint 4

| Sprint 5 need | Sprint 4 deliverable |
|---|---|
| `deals.leadId` FK target | `leads` table (M2) |
| `deals.contactId` FK target | `contacts` table (M3) |
| `ActivityService.append(db, ctx, input)` | M4 (explicit ctx, worker-compatible) |
| `buildAuditRow(input, ctx)` + `asTenantCreate()` | M2–M5 audit patterns |
| `PLAN_LIMITS` structure and usage pattern | M2 (leads), extended here for pipelines/deals |
| `TenantRepository` base class | M1 (Sprint 4) |
| `withTenant(organizationId, callback)` | M1 (Sprint 4) |
| `registerWorker(name, processor)` pattern | M6B (Sprint 4) |
| `enqueue()` / `getQueue().getJob()` patterns | M6B (Sprint 4) |
| `StorageService.putObject()` (for webhook raw body storage, if needed) | M5 (Sprint 4) |
| `check:rls` script | M1 (Sprint 4) — extend for 4 new tables |
| `express.raw()` mounted before JSON | Already in `app.ts` for `/api/webhooks` per FINAL_ARCHITECTURE.md |

### External

| Dependency | Required by | Risk |
|---|---|---|
| `@dnd-kit/core`, `@dnd-kit/sortable` | M5 Kanban | Low — stable library, no license risk |
| `framer-motion` | M5 Kanban animations | Low — already in stack per FINAL_ARCHITECTURE.md §8 |
| Meta webhook HMAC format confirmed | M4 IG receiver | Medium — confirmed in architecture; spike validates exact header name in Sprint 6 |
| Stripe webhook secret available in dev env | M4 Stripe receiver | Low — Stripe test secret available immediately |

### Internal sequencing

```
M1 (schema) → M2 (pipeline) → M3 (deal) → M4 (webhook)
                                    ↘
                                    M5 (frontend, depends on M2 + M3 APIs)
                                    ↘
                                    M6 (deferred leads UI, depends on M5 infra)
```

M5 can begin as soon as M2 and M3 APIs are stable (even before M4). M4 and M5 can run in parallel after M2+M3.

---

## 5. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| **R-S5-1** | **Webhook RLS design for pre-org events.** Stripe `customer.created` fires before the org is known in some flows; the `webhook_events` RLS policy cannot enforce tenant isolation on insert. | M | M | Design `webhook_events` with a nullable `organizationId` on insert; a separate INSERT policy for `leados_app` role on rows where `organizationId IS NULL`; read policy enforces the GUC. Worker resolves the org from the event payload and back-fills `organizationId` before marking DONE. |
| **R-S5-2** | **Kanban performance at 500+ deals.** Rendering 500 deal cards in one pipeline column will cause layout thrash. | M | M | Virtualize each column with `@dnd-kit` + `react-virtual` (or `tanstack-virtual`). Add a column deal count limit display ("Showing first 50 — filter to see more"). The API `GET /deals` already paginates; the Kanban call must set a per-column limit. |
| **R-S5-3** | **Optimistic drag-and-drop race condition.** If two users drag the same deal simultaneously, the second write wins silently. | L | L | Server wins; last write wins. Stale data shown for < 5s until TanStack Query refetches. Acceptable for V1. V2 can add a deal lock or OCC version field. |
| **R-S5-4** | **Single-pipeline constraint data integrity.** If `isDefault` is managed in application code without a DB constraint, a crash between unsetting old default and setting new default could leave 0 or 2 defaults. | M | M | Add a partial unique index in the migration: `CREATE UNIQUE INDEX ON pipelines ("organizationId") WHERE "isDefault" = true`. This enforces at the DB layer. The application-side `withTenant` transaction handles the two-step atomically, but the DB index is the backstop. |
| **R-S5-5** | **M6 (deferred frontend) capacity.** M1–M5 is already a full two-week sprint. M6 is stretch. | H | L | M6 is explicitly tentative. If it cannot fit, it bundles into Sprint 6 frontend scope (which already has the Inbox). Sprint 6 capacity must account for this. |
| **R-S5-6** | **Meta App Review (Sprint 6 gate).** While not Sprint 5's problem, the webhook receiver in M4 is the foundation. If M4 slips, Sprint 6 Instagram work is blocked. | L | H | M4 is a pure backend task with no external dependency. Prioritize it after M1 if M2/M3 are in review. |

---

## 6. Recommended Implementation Order

```
Day 1:   M1 — Prisma schema additions (Pipeline, PipelineStage, Deal, WebhookEvent)
         M1 — packages/shared: new enums, activity types, PLAN_LIMITS update

Day 2:   M1 — Migration 0009_pipeline_tables
         M1 — Migration 0010_pipeline_rls
         M1 — Migration 0011_webhook_events
         M1 — TENANT_TABLES update + check:rls passes at 19

Day 3:   M2 — PipelineRepository + PipelineStageRepository
         M2 — PipelineService

Day 4:   M2 — Pipeline routes + controller
         M2 — Integration tests (≥ 15)

Day 5:   M3 — DealRepository
         M3 — DealService

Day 6:   M3 — Deal routes + controller
         M3 — Integration tests (≥ 20)

Day 7:   M4 — WebhookController (HMAC verify, persist, enqueue)
         M4 — WebhookEvent routes (unversioned, raw body)
         M4 — QUEUE.WEBHOOK + registerWorker('webhook', ...)

Day 8:   M4 — WebhookWorker (PROCESSING → DONE/FAILED skeleton)
         M4 — Re-enqueue on startup
         M4 — Integration tests (≥ 8)

Day 9:   M5 — API client + TanStack Query + BFF route handlers
         M5 — FE-2: Kanban board shell + deal card component

Day 10:  M5 — FE-2: @dnd-kit drag-and-drop + optimistic update
         M5 — FE-3: Deal Detail layout + metadata form

Day 11:  M5 — FE-3: Stage timeline + won/lost flow
         M5 — FE-3: Activity feed component (infinite scroll)
         M5 — FE-4: Health indicators

Day 12:  M5 — Frontend tests (component / Playwright e2e)
         M5 — Frontend build clean + Lighthouse check
         M6 — Begin if capacity (Leads List screen)

Day 13:  Buffer: fix failing tests, typecheck, lint, build
         M6 — Lead Detail (stretch)

Day 14:  Full test suite + coverage + isolation suite
         SPRINT_5_M6_FINAL_SIGNOFF.md (or SPRINT_5_FINAL_SIGNOFF.md)
         Write SPRINT_5_REVIEW.md
```

---

## 7. What Sprint 5 Does NOT Cover

| Out of scope | Rationale |
|---|---|
| Instagram OAuth connect + real webhook processing | Sprint 6 — Meta API spike must precede |
| Stripe billing integration | Sprint 8 |
| Real-time deal updates via Socket.io | Sprint 6 (realtime tier starts there) |
| WhatsApp integration | Sprint 9–10 (V2) |
| AI deal scoring | Sprint 7 |
| Multiple pipelines UI (pipeline management settings screen) | Sprint 5 Kanban uses the default pipeline; management screen deferred |
| Deal activity feed endpoint (if not needed for FE-5) | Deal activity endpoint (`GET /deals/:id/activities`) uses the existing `ActivityService.listForEntity` pattern — wire it only if FE-3 requires it; otherwise deferred |
| Saved filter presets (server-persisted) | Sprint 5 uses localStorage; server-side saved filters deferred to Sprint 7 |
| Bulk deal operations | Not in V1 scope |
| Pipeline analytics / deal velocity | Sprint 8 analytics sprint |

---

## 8. Sprint 5 Exit / Demo Criterion

Per `DEVELOPMENT_ROADMAP.md` Sprint 5:

> **M3** — drag-drop pipeline + deal lifecycle + forecast, plan-gated; webhook skeleton accepts+verifies+persists a test event idempotently.

**Demo checklist:**
1. OWNER creates a pipeline with 4 stages (Prospecting → Qualified → Proposal → Won). Plan limit prevents STARTER org from adding a 2nd pipeline.
2. OWNER creates 3 deals, assigns to different members. SALES_EXECUTIVE logs in and sees only their assigned deal.
3. OWNER drags a deal from Prospecting to Proposal — card moves, API call fires, activity feed on the deal shows `DEAL_STAGE_MOVED`.
4. OWNER marks a deal Won — deal disappears from Kanban board, `DEAL_WON` activity appears.
5. OWNER opens Deal Detail — sees stage timeline (Proposal highlighted), value, expected close date, activity feed, and can edit the title inline.
6. `GET /deals/forecast` returns weighted values per stage (Proposal: 60% × value, etc.).
7. POST `/api/webhooks/instagram` with valid HMAC → 200; check DB: `webhook_events` row with `status = PENDING`; check Redis: job enqueued; worker runs → `status = DONE`.
8. POST `/api/webhooks/instagram` with same event ID again → 200; `status = SKIPPED`; no duplicate row.
9. `check:rls` → 19 tables; isolation suite → 54/54; full test suite → 0 failures.

---

*Planning only. No code. No file changes. No commits.*
*Source of truth: `FINAL_ARCHITECTURE.md`, `DEVELOPMENT_ROADMAP.md`, `SPRINT_4_FINAL_SIGNOFF.md`, `MODULE_DEPENDENCY_GRAPH.md`, `docs/blueprint/08-DATABASE-DESIGN.md`, `docs/blueprint/10-PRODUCT-FEATURES.md`.*
