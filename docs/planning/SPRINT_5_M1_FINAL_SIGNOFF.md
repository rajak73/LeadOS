# Sprint 5 M1 — Final Signoff

**Date:** 2026-06-20
**Reviewer:** Independent verification pass (every modified file read; live DB queried)
**Verdict:** APPROVED

---

## Verification Method

Every file listed in the M1 review was read in full. All live-DB state (RLS, indexes, FK constraints, enum values, migration log) was queried directly against Postgres. CI-gate scripts were re-executed from a clean run.

---

## Check 1 — Prisma Schema

**File:** `prisma/schema.prisma`

| Check | Result |
|---|---|
| `prisma validate` re-run | PASS |
| 4 new enums declared: `WebhookSource`, `WebhookEventStatus`, `DealStatus` (pre-existing), `ActivityType` extended | PASS |
| `ActivityType` extended with `DEAL_UPDATED`, `PIPELINE_CREATED`, `PIPELINE_UPDATED` (22 values total) | PASS |
| `Pipeline` model — correct fields, `@@index([organizationId])`, `@@map("pipelines")` | PASS |
| `PipelineStage` model — `organizationId` NOT NULL, `pipelineId` FK, `@@index([organizationId, pipelineId])`, `@@index([pipelineId, order])` | PASS |
| `Deal` model — all FK relations named correctly (`"TaskDeal"`, `"ActivityDeal"`, `"NoteDeal"`, `"FileDeal"`), soft-delete `deletedAt`, `@@map("deals")` | PASS |
| `WebhookEvent` model — `organizationId String?` (nullable), `@@unique([source, externalEventId])`, `@@index([status, createdAt])` | PASS |
| Organization back-refs: `pipelines Pipeline[]`, `pipelineStages PipelineStage[]`, `deals Deal[]`, `webhookEvents WebhookEvent[]` | PASS |
| User back-refs: `assignedDeals Deal[] @relation("DealAssignee")`, `createdDeals Deal[] @relation("DealCreator")` | PASS |
| Lead back-ref: `deals Deal[]` | PASS |
| Contact back-ref: `deals Deal[]` | PASS |
| Task `relatedDeal` relation activated: `@relation("TaskDeal", fields: [relatedDealId], references: [id])` | PASS |
| Activity `relatedDeal` relation activated: `@relation("ActivityDeal", ...)` | PASS |
| Note `relatedDeal` relation activated: `@relation("NoteDeal", ...)` | PASS |
| File `relatedDeal` relation activated: `@relation("FileDeal", ...)` | PASS |
| `onDelete: Restrict` on `deals.pipelineId` and `deals.stageId` (correct — can't orphan a deal by deleting its stage) | PASS |
| `onDelete: SetNull` on `deals.leadId`, `deals.contactId`, `deals.assignedToId` | PASS |
| `onDelete: Restrict` on `deals.createdById` | PASS |

**Verdict: PASS**

---

## Check 2 — Migrations

### 0010_pipeline_tables

| Check | Result |
|---|---|
| `pipelines` — all columns match schema; `organizationId` NOT NULL; FK CASCADE on org delete | PASS |
| Partial unique index `pipelines_org_default_uidx ON (organizationId) WHERE isDefault = true` | PASS — confirmed in live DB |
| `pipeline_stages` — `organizationId` NOT NULL; `pipelineId` FK CASCADE; `probability` CHECK constraint | PASS |
| `DealStatus` enum creation idempotent via DO block | PASS |
| `deals` — `organizationId` NOT NULL; all 8 FKs present with correct ON DELETE rules; all 6 indexes | PASS |
| Deferred FK activation — `tasks_related_deal_fkey` ON DELETE SET NULL | PASS — confirmed in live DB |
| Deferred FK activation — `activities_related_deal_fkey` ON DELETE SET NULL | PASS — confirmed in live DB |
| Deferred FK activation — `notes_related_deal_fkey` ON DELETE SET NULL | PASS — confirmed in live DB |
| Deferred FK activation — `files_related_deal_fkey` ON DELETE SET NULL | PASS — confirmed in live DB |
| All DDL idempotent (`IF NOT EXISTS`, `DO $$ BEGIN IF NOT EXISTS`) | PASS |

### 0011_pipeline_rls

| Check | Result |
|---|---|
| `pipelines`: ENABLE ROW LEVEL SECURITY + FORCE + `DROP POLICY IF EXISTS` + `CREATE POLICY tenant_isolation` using missing-safe GUC form | PASS |
| `pipeline_stages`: same pattern | PASS |
| `deals`: same pattern | PASS |
| Live DB confirms — all 3 tables: `rls_enabled = t`, `rls_forced = t`, `policyname = tenant_isolation`, `cmd = ALL` | PASS |
| Policy `qual` in live DB exactly: `("organizationId" = (current_setting('app.current_organization_id'::text, true))::uuid)` | PASS |

### 0012_webhook_events

| Check | Result |
|---|---|
| `WebhookSource` enum created idempotently: `{STRIPE, INSTAGRAM, WHATSAPP, SYSTEM}` | PASS — confirmed in live DB |
| `WebhookEventStatus` enum created idempotently: `{PENDING, PROCESSING, DONE, FAILED, SKIPPED}` | PASS — confirmed in live DB |
| `ActivityType` extended: `ADD VALUE IF NOT EXISTS` for all 3 Sprint 5 values | PASS — live DB shows 22 values |
| `webhook_events` — `organizationId UUID` (nullable, no NOT NULL), FK with CASCADE on org delete | PASS |
| `externalEventId TEXT` (not UUID — correct; Stripe IDs are `evt_xxx` strings) | PASS |
| Unique index `(source, externalEventId)` — idempotency key | PASS — confirmed in live DB |
| Status index `(status, createdAt)` — for PENDING re-enqueue scan | PASS |
| ENABLE + FORCE ROW LEVEL SECURITY | PASS — confirmed in live DB |
| `webhook_insert` policy: `FOR INSERT WITH CHECK (true)` — permissive | PASS |
| `webhook_select` policy: `organizationId IS NULL OR organizationId = GUC` | PASS — confirmed in live DB |
| `webhook_update` policy: same guard | PASS |
| No DELETE policy — correct; deleted via CASCADE when org is deleted; no app-layer soft-delete on webhook events | PASS |

**Verdict: PASS**

---

## Check 3 — RLS Coverage

```
RLS coverage check: OK — 19 tenant tables enabled + forced + policied; coverage matches registry.
```

TENANT_TABLES (19): organization_members, roles, subscriptions, refresh_tokens, audit_logs, leads, contacts, tasks, activities, notes, files, ai_scores, custom_field_definitions, team_invites, saved_replies, **pipelines, pipeline_stages, deals, webhook_events**

TENANT_MODELS (19): OrganizationMember, Role, Subscription, RefreshToken, AuditLog, Lead, Contact, Task, Activity, Note, File, AiScore, CustomFieldDefinition, TeamInvite, SavedReply, **Pipeline, PipelineStage, Deal, WebhookEvent**

Both arrays have length 19 and are in lock-step. The `check:rls` script asserts exact match between this registry and the live DB state.

**Verdict: PASS**

---

## Check 4 — Enum Parity

```
enum-parity: OK (17 shared enum(s) checked).
```

`enums.ts` vs `schema.prisma` cross-check confirms:
- `WebhookSource` — 4 values: STRIPE, INSTAGRAM, WHATSAPP, SYSTEM — identical in both files
- `WebhookEventStatus` — 5 values: PENDING, PROCESSING, DONE, FAILED, SKIPPED — identical in both files
- `ActivityType` — 22 values — identical in both files (Sprint 5 additions present in both)
- `DealStatus` — 3 values: OPEN, WON, LOST — unchanged, still matching

**Verdict: PASS**

---

## Check 5 — Shared Schemas

### `packages/shared/src/schemas/pipeline.ts`

| Check | Result |
|---|---|
| `createStageSchema` — name min(1) max(100), color hex-validated, probability 0–100 int | PASS |
| `patchStageSchema` — all fields optional, same constraints | PASS |
| `reorderStagesSchema` — `stageIds: string[].uuid().min(1)` | PASS |
| `createPipelineSchema` — name min(1) max(100), isDefault optional, stages array optional | PASS |
| `patchPipelineSchema` — name and isDefault both optional | PASS |
| All types exported as named exports | PASS |

### `packages/shared/src/schemas/deal.ts`

| Check | Result |
|---|---|
| `createDealSchema` — title max(200), value nonnegative, pipelineId/stageId UUID required | PASS |
| `patchDealSchema` — notably does NOT include `stageId` or `status` (correct; those are separate endpoints) | PASS |
| `moveDealSchema` — only `stageId` | PASS |
| `lostDealSchema` — reason optional, max(500) | PASS |
| `dealListQuerySchema` — extends paginationQuerySchema; status filter uses `z.nativeEnum(DealStatus)` | PASS |
| Imports `paginationQuerySchema` from `./index.js` (not hardcoded) | PASS |
| Imports `DealStatus` from `../constants/enums.js` | PASS |

### `packages/shared/src/index.ts`

Both `export * from './schemas/pipeline.js'` and `export * from './schemas/deal.js'` are present and in correct position (after file.js, before types/index.js).

**Verdict: PASS**

---

## Check 6 — Plan Limits

**File:** `packages/shared/src/constants/plan-limits.ts`

| Check | Result |
|---|---|
| `deals: number` added to `PlanLimits` interface | PASS |
| TRIAL: `deals: 250` | PASS |
| STARTER: `deals: 1000` | PASS |
| GROWTH: `deals: Number.POSITIVE_INFINITY` | PASS |
| SCALE: `deals: Number.POSITIVE_INFINITY` | PASS |
| All 4 plan objects fully satisfy `PlanLimits` interface (TS2741 was fixed in-session) | PASS |
| `pipelines` field already existed; `deals` is the only M1 addition | PASS |

**Verdict: PASS**

---

## Check 7 — Activity Metadata

**File:** `packages/shared/src/types/activity-metadata.ts`

| Check | Result |
|---|---|
| `DealUpdatedMetadata` — `type: DEAL_UPDATED`, `dealId: string`, `fields: string[]` | PASS |
| `PipelineCreatedMetadata` — `type: PIPELINE_CREATED`, `pipelineId: string`, `name: string` | PASS |
| `PipelineUpdatedMetadata` — `type: PIPELINE_UPDATED`, `pipelineId: string`, `fields: string[]` | PASS |
| All 3 added to `ActivityMetadata` union | PASS |
| All existing variants (22 total) still present in union | PASS |
| `ActivityAppendInput` includes `relatedDealId?: string` (required for Deal activity routing) | PASS |
| Discriminated union is exhaustive — every `ActivityType` value has exactly one matching metadata variant | PASS (22 types, 22 union members) |

**Verdict: PASS**

---

## Check 8 — Isolation Tests

**File:** `apps/api/tests/integration/isolation.rls.test.ts`

| Check | Result |
|---|---|
| ISO-2f (pipelines): seed uses admin prisma (bypasses RLS); assertions use `asTenant` (enforces RLS) | PASS |
| ISO-2f: `GUC=orgA → contains pipelineA, NOT pipelineB` | PASS |
| ISO-2f: `GUC=orgB → contains pipelineB, NOT pipelineA` | PASS |
| ISO-2g (pipeline_stages): parent pipelines seeded separately; proper cleanup order (stages before pipelines) | PASS |
| ISO-2g: cross-org stage visibility assertions correct | PASS |
| ISO-2h (deals): full dependency chain seeded (pipeline → stage → deal); cleanup in reverse FK order | PASS |
| ISO-2h: cross-org deal visibility assertions correct | PASS |
| `afterAll` cleanup in all 3 groups deletes in FK-safe order (child before parent) | PASS |
| All 3 new `beforeAll` blocks guard on `if (!pgUp) return` | PASS |
| Total test count: 24 (was 18, +6 new) | CONFIRMED by test run |
| Test run with JWT secrets set: **24/24 PASS** | CONFIRMED |
| Pre-existing env failure (empty JWT in `.env`) confirmed as baseline regression, not M1 regression | CONFIRMED |

**Verdict: PASS**

---

## Check 9 — Build Integrity

| Gate | Output | Result |
|---|---|---|
| `@leados/shared build` | DTS + ESM clean, 51.90 KB .d.ts | PASS |
| `@leados/api tsc --noEmit` | No errors | PASS |
| `@leados/api lint` | No errors | PASS |
| `@leados/api build` | Build success in 30ms | PASS |
| Integration test suite (all files) | 22 files, 239 tests, 1 skipped | PASS |

---

## Issues Found

**None.** Zero issues found during independent verification pass.

The one pre-existing issue (empty JWT secrets in `.env` causing `pnpm test:isolation` to fail at module load time) is documented in the M1 review, confirmed as baseline-reproducible on the unmodified main branch, and is explicitly outside Sprint 5 M1 scope.

---

## Final Verdict

| Area | Status |
|---|---|
| Prisma schema | APPROVED |
| Migration 0010 (tables + deferred FKs) | APPROVED |
| Migration 0011 (RLS — pipelines, stages, deals) | APPROVED |
| Migration 0012 (webhook_events + dual-policy RLS) | APPROVED |
| check:rls (19 tables) | APPROVED |
| check:enum-parity (17 enums) | APPROVED |
| Shared schemas (pipeline.ts, deal.ts) | APPROVED |
| Plan limits (deals field) | APPROVED |
| Activity metadata (3 new variants) | APPROVED |
| Isolation tests (+6 new, all pass) | APPROVED |
| Build gates (tsc, lint, build, tests) | APPROVED |

**Sprint 5 M1 is APPROVED. All checks pass. No issues found.**

Ready for M2 (Pipeline HTTP layer) when explicitly directed.
