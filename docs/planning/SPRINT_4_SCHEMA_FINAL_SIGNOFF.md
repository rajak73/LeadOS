# SPRINT_4_SCHEMA_FINAL_SIGNOFF.md

> **CTO-Level Final Signoff Audit — Sprint 4 Schema**
> Reviewer: Independent CTO-level audit
> Date: 2026-06-19
> Scope: Pre-implementation gate. Validates SPRINT_4_ARCHITECTURE_AUDIT.md findings against SPRINT_4_SCHEMA_REMEDIATION_PLAN.md, SPRINT_4_SCHEMA_REVISION.md, 08-DATABASE-DESIGN.md, 09-PRISMA-SCHEMA.md, SPRINT_4_EXECUTION_PLAN.md, FINAL_ARCHITECTURE.md, packages/shared/src, and core/tenancy.
> Method: Read-only. No files modified.

---

## 1. Overall Verdict

**CONDITIONAL PASS**

The remediation documents are thorough and the schema has been substantially improved from the pre-audit state. All BLOCKING and CRITICAL findings from the architecture audit have been addressed in planning documentation. However, **eleven defects remain** across the Prisma schema document and supporting materials, ranging from a HIGH-severity migration sequencing flaw (tasks.relatedDealId has a live FK in 09 while the plan says it should be deferred), to MEDIUM-severity Prisma consistency issues (missing index on `contacts.createdFromLeadId`, missing Activity model `@@index` for the org-only case, missing reverse relation on `Note.relatedDealId`), to LOW-severity documentation gaps (PLAN_LIMITS `customFieldsPerObject` ceiling discrepancy, acceptance criteria count mismatch, FTS index in 08 §8.7 is stale).

**None of the open defects are blocking on their own, but DEF-1 (tasks.relatedDealId live FK) must be corrected in the Prisma schema document before migration 0006 is authored.** The remaining defects are all fixable in documentation or migration without schema redesign.

**Approval is granted to begin M1 (E1: schema and migration) subject to the Required Changes listed in §13.**

---

## 2. Blocker Audit

### REC-1 — `pipelineStageId` FK cannot exist in Sprint 4
**Status: RESOLVED**

08-DATABASE-DESIGN.md §leads table: column declared as `UUID | NULL | ⚠ No FK in Sprint 4 — deferred to Sprint 5 (pipeline_stages table not yet created)`.

09-PRISMA-SCHEMA.md Lead model: `pipelineStageId String? @db.Uuid // deferred FK → pipeline_stages (Sprint 5)`. No `@relation` directive. No PipelineStage.leads reverse relation (correctly removed, with comment documenting the deferral).

SPRINT_4_EXECUTION_PLAN.md CRM-1.1: `pipelineStageId (plain UUID — FK deferred Sprint 5)`.

SPRINT_4_EXECUTION_PLAN.md CRM-1.2: Sprint 5 action documented as `ALTER TABLE leads ADD CONSTRAINT leads_pipelineStageId_fkey FOREIGN KEY (...)`.

No residual risk. Correctly deferred.

---

### REC-2 — Lead WON status: invariant decision
**Status: RESOLVED**

Decision recorded (Option A). `WON` excluded from `PatchLeadInput` Zod schema. Service-layer enforcement documented in CRM-2.2 and CRM-2.3. `convert()` atomically sets `status = 'WON'` and `convertedToContactId` inside `withTenant`. LOST → WON direct PATCH returns 400. Terminal states correctly enforced.

No residual risk.

---

## 3. Critical/High Finding Audit

### REC-3 — `ai_scores` table absent
**Status: RESOLVED**

Table defined in 08-DATABASE-DESIGN.md (§ai_scores), 09-PRISMA-SCHEMA.md (AiScore model), and SPRINT_4_EXECUTION_PLAN.md CRM-1.1.

Schema cross-check:
- `id UUID PK` ✓
- `organizationId UUID FK → organizations.id NOT NULL` ✓
- `leadId UUID FK → leads.id NOT NULL` ✓
- `score SMALLINT NOT NULL` ✓
- `confidence DECIMAL(3,2) NULL` ✓
- `factors JSONB NULL` ✓
- `recommendation TEXT NULL` ✓
- `triggeredBy VARCHAR(50) NULL` ✓
- `modelVersion VARCHAR(50) NULL` ✓
- `createdAt TIMESTAMP NOT NULL` ✓
- No `updatedAt`, No `deletedAt` ✓ (immutable)

`leads.aiScore` and `leads.aiScoreUpdatedAt` retained as denormalized cache ✓

Added to TENANT_TABLES (position 12 of 15) ✓. RLS policy documented in migration 0008 ✓.

No residual risk on the schema itself.

---

### REC-4 — `custom_field_definitions` table absent
**Status: RESOLVED**

Table defined in 08-DATABASE-DESIGN.md (§custom_field_definitions), 09-PRISMA-SCHEMA.md (CustomFieldDefinition model with enums CustomFieldObjectType and CustomFieldType), and SPRINT_4_EXECUTION_PLAN.md CRM-1.1.

Schema cross-check:
- `id, organizationId, objectType (LEAD|CONTACT|DEAL), fieldKey, displayLabel, fieldType, options (JSONB NULL), isRequired, position, createdById, createdAt, updatedAt, deletedAt` ✓
- `UNIQUE (organizationId, objectType, fieldKey) WHERE deletedAt IS NULL` ✓
- `CHECK (fieldType NOT IN ('SELECT', 'MULTI_SELECT') OR options IS NOT NULL)` ✓
- PLAN_LIMITS enforcement on create documented ✓

**Minor observation:** `PLAN_LIMITS.customFieldsPerObject` is 10 for TRIAL and STARTER, 30 for GROWTH, 50 for SCALE (per `packages/shared/src/constants/plan-limits.ts`). The architecture audit originally specified "Up to 50 custom fields per object type" as an absolute. The actual plan-limits file correctly tiers this. 08-DATABASE-DESIGN.md mentions PLAN_LIMITS.customFieldsPerObject = 50, which is only true for SCALE tier. This is a documentation inconsistency but not a schema defect — the code in plan-limits.ts is authoritative and correct. Recorded as DEF-10 (LOW).

No structural residual risk.

---

### REC-5 — `lastActivityAt` missing from `leads`
**Status: RESOLVED**

`lastActivityAt DateTime?` added to Lead model in 09 ✓. `@@index([organizationId, lastActivityAt(sort: Desc)])` added ✓. Write-through contract documented in CRM-4.1 (ActivityService.append updates leads.lastActivityAt in same transaction when relatedLeadId is set) ✓.

Same column added to Contact model ✓ with same write-through contract ✓.

No residual risk.

---

### REC-6 — Remove `leads.notes TEXT NULL`
**Status: RESOLVED**

Column is absent from the Lead model in 09-PRISMA-SCHEMA.md ✓. Column is absent from 08-DATABASE-DESIGN.md leads table ✓. Removal is confirmed in SPRINT_4_SCHEMA_REVISION.md Change 1 ✓. "Quick note at creation time" use case covered by Note creation in same transaction ✓.

No residual risk.

---

### REC-7 — `ActivityMetadata` discriminated union — untyped contract
**Status: PARTIALLY RESOLVED**

The discriminated union is defined in the remediation plan (Part 2 of SPRINT_4_SCHEMA_REMEDIATION_PLAN.md) and the requirement is documented in SPRINT_4_EXECUTION_PLAN.md CRM-1.1 ("packages/shared/src/types/activity-metadata.ts — ActivityMetadata discriminated union (before E4 code)").

**However:** `packages/shared/src/types/index.ts` currently contains only `RequestContextMeta`. The `activity-metadata.ts` file does **not yet exist** in the actual codebase. The plan requires it to exist before E4 code begins. This is acceptable as a planning document (the file will be created during M1), but the signoff must note it as a required pre-E4 gate, not a pre-migration gate.

Status: PLANNED but not yet implemented. No migration risk. Must be completed before E4 code starts. Tracked as DEF-9 (MEDIUM — implementation gate, not schema gate).

---

### REC-8 — `mergedIntoLeadId` missing from `leads`
**Status: RESOLVED**

`mergedIntoLeadId String? @db.Uuid // deferred self-ref FK (merge milestone)` present in Lead model in 09 ✓. Column documented in 08 leads table ✓. No FK constraint in Sprint 4 ✓. Merge milestone FK action documented ✓.

No residual risk.

---

### REC-9 — `instagramAccountId` missing from `leads`
**Status: RESOLVED**

`instagramAccountId String? @db.Uuid // deferred FK → instagram_accounts (Sprint 6)` present in Lead model in 09 ✓. Column documented in 08 ✓. Sprint 6 `ALTER TABLE` action documented ✓.

No residual risk.

---

### REC-10 — `team_invites` table absent
**Status: RESOLVED**

Table defined in 08 (§team_invites) and 09 (TeamInvite model) ✓. Auth path note documented (admin `prisma` client for token validation on link click; `withTenant` for member INSERT after acceptance) ✓. `leados_app` vs admin client distinction explicit ✓. Added to TENANT_TABLES ✓.

No residual risk.

---

### REC-11 — `saved_replies` shell table absent
**Status: RESOLVED**

Shell table defined in 08 (§saved_replies) and 09 (SavedReply model) ✓. "No routes or service code in Sprint 4" documented ✓. Routes added in Sprint 6 documented ✓. Added to TENANT_TABLES ✓.

No residual risk.

---

### REC-12 — `activities` table: range-partitioned from creation
**Status: RESOLVED**

PARTITION BY RANGE(`createdAt`) documented in 08 activities table ✓. Initial partitions documented: `activities_2026` (2026-01-01 → 2027-01-01) and `activities_default` (DEFAULT) ✓. Immutability triggers `activities_no_update` and `activities_no_delete` documented in 08 ✓. CHECK constraint documented ✓. Prisma note (Prisma treats partitioned tables as regular models; DDL hand-authored in custom migration) documented in SPRINT_4_SCHEMA_REVISION.md Change 7 ✓. CRM-1.2 migration checklist includes partitioned DDL, triggers, and initial partitions ✓.

No residual risk on documentation.

---

### REC-13 — `activities` CHECK constraint
**Status: RESOLVED**

`CHECK ("relatedLeadId" IS NOT NULL OR "relatedDealId" IS NOT NULL OR "relatedContactId" IS NOT NULL)` documented in 08 activities table ✓. Included in remediation plan's migration SQL pattern ✓. Execution plan CRM-1.2 includes it ✓.

No residual risk.

---

### REC-14 — Notes content format
**Status: RESOLVED**

Decision: ProseMirror/Tiptap JSON stored as JSONB. `content Json @default("{}")` in Note model (09) ✓. Comment "Never render content as raw HTML" ✓. `toPlainText(doc)` for workflow interpolation documented ✓. Zod schema note for Sprint 4 permissive + Sprint 6 tightened documented ✓.

No residual risk.

---

### REC-15 — Event name constants mandate
**Status: PARTIALLY RESOLVED**

`packages/shared/src/constants/events.ts` exists. **However:** the existing `DomainEvent` constants use dot-notation format (`'lead.created'`, `'lead.status_changed'`, `'deal.stage_changed'`) while `ActivityType` enum values use SCREAMING_SNAKE_CASE (`LEAD_CREATED`, `LEAD_STATUS_CHANGED`, `DEAL_STAGE_MOVED`). These two namespaces are inconsistent and the remediation plan calls for constants matching ActivityType values before E2 code begins.

Additionally, the existing `DomainEvent` constant `DEAL_STAGE_CHANGED` maps to `'deal.stage_changed'`, but the ActivityType enum (correctly updated in Change 9) renames this to `DEAL_STAGE_MOVED`. The old event name constant is NOT updated in the existing `events.ts` file. This creates an inconsistency if domain services import from events.ts.

Furthermore, several ActivityType values from the canonical 19 are not present in the events.ts `DomainEvent` constant at all: `LEAD_WON`, `LEAD_LOST`, `CONTACT_UPDATED`, `TASK_CREATED`, `TASK_COMPLETED`, `TASK_CANCELLED`, `NOTE_ADDED`, `NOTE_UPDATED`, `NOTE_DELETED`, `FILE_UPLOADED`, `FILE_DELETED`, `DEAL_CREATED`, `DEAL_WON`, `DEAL_LOST`.

The plan mandates these be added before E2 code begins. They are not yet added. This is acceptable pre-implementation but is a pre-E2 gate that must not be missed.

Recorded as DEF-8 (MEDIUM — pre-E2 implementation gate).

---

### REC-16 — `leads.source` immutability: DB trigger
**Status: RESOLVED**

Trigger `leads_source_immutable` (BEFORE UPDATE, prevents source change) documented in 08 leads table and in SPRINT_4_SCHEMA_REVISION.md Change 10. Included in CRM-1.2 migration 0006 checklist ✓.

No residual risk.

---

### REC-17 — FTS index not filtered to exclude soft-deleted rows
**Status: RESOLVED (with one documentation stale note)**

Partial FTS index `WHERE deletedAt IS NULL` documented in 08 leads table indexes ✓. Phone added to FTS index ✓. Documented in CRM-1.2 migration 0007 checklist ✓.

**Minor documentation defect:** 08-DATABASE-DESIGN.md §8.7 (Indexes Summary) still contains the old FTS index definition without `WHERE deletedAt IS NULL` and without `phone`. The §8.7 index block is stale relative to the updated leads table definition above it. Recorded as DEF-11 (LOW — documentation only; the authoritative definition is in §leads table and execution plan).

---

### REC-18 — ActivityType-to-entity documentation
**Status: PARTIALLY RESOLVED**

Documented as a requirement in SPRINT_4_EXECUTION_PLAN.md CRM-4.1 (service validates required FK is present for each type). ActivityMetadata union in the remediation plan covers the required entity for each type. The comment block above ActivityType enum is documented in 09. Validation at service layer is planned.

No schema risk. Implementation gate.

---

## 4. Prisma Consistency Findings

The following defects were found by reading `09-PRISMA-SCHEMA.md` directly.

### DEF-1 — HIGH: `Task.relatedDeal` is a live FK relation (not deferred)

**Location:** 09-PRISMA-SCHEMA.md, Task model, line ~646–648.

```prisma
relatedDeal      Deal?        @relation(fields: [relatedDealId], references: [id])
```

The Task model has a full `@relation` directive from `relatedDeal` to `Deal`, with `Deal` having a reverse `tasks Task[]` relation. This means Prisma will generate a FK constraint `tasks.relatedDealId → deals.id` in the migration.

The `deals` table does NOT exist in Sprint 4 (it is a Sprint 5 table). Migration 0006 will fail with `ERROR: referenced relation "deals" does not exist` — **the exact same class of error as the original pipelineStageId blocker (REC-1)**.

08-DATABASE-DESIGN.md §tasks table shows `relatedDealId | UUID | FK → deals.id, NULL` with a note "no FK constraint in Sprint 4 — deals table is Sprint 5" in the remediation schema plan, but the Prisma model in 09 still has the `@relation` directive.

SPRINT_4_EXECUTION_PLAN.md CRM-1.1 mentions `relatedDealId (plain UUID — FK deferred Sprint 5)` for Task, but this is NOT reflected in the Prisma schema document.

**This defect must be fixed before migration 0006 is written.** The `relatedDeal Deal?` relation field and `@relation` directive must be removed from the Task model. `relatedDealId` must become `relatedDealId String? @db.Uuid // no FK in Sprint 4 — deals table is Sprint 5`. The `Deal.tasks Task[]` reverse relation must be removed from the Deal model.

---

### DEF-2 — MEDIUM: `Note.relatedDeal` missing `@relation` deferral — inconsistent with remediation

**Location:** 09-PRISMA-SCHEMA.md, Note model, lines ~687–698.

The Note model has `relatedDealId String? @db.Uuid // no FK in Sprint 4 (deals table is Sprint 5)` which correctly omits the `@relation` directive. **However**, the Prisma-generated migration will still attempt to infer the FK if Prisma sees a `relatedDealId` field alongside a `Deal` model with no explicit `@ignore`. In practice, Prisma only creates a FK if `@relation` is present — so the field alone is safe.

Upon re-read, this is correctly handled: no `@relation` directive on Note for `relatedDealId`, and `Deal.notesList Note[]` does NOT appear to reference Note via a relation back to relatedDealId. **No defect.** Withdrawn.

---

### DEF-2 (Renumbered) — MEDIUM: Missing `@@index([organizationId])` on `Activity` model for org-only queries

**Location:** 09-PRISMA-SCHEMA.md, Activity model, lines ~674–678.

The Activity model has:
```prisma
@@index([organizationId, relatedLeadId, createdAt(sort: Desc)])
@@index([organizationId, relatedDealId, createdAt(sort: Desc)])
@@index([organizationId, relatedContactId, createdAt(sort: Desc)])
```

But there is no `@@index([organizationId, createdAt(sort: Desc)])` for org-level timeline queries (e.g., "show all recent activity for this org" — the admin dashboard or audit view). 08-DATABASE-DESIGN.md §activities does document this index: `(organizationId, createdAt DESC)`. The Prisma model is missing it.

This is a missing index, not a correctness error, but it is documented in 08 and must be added to 09. Recorded as DEF-2 (MEDIUM).

---

### DEF-3 — MEDIUM: Missing `@@index([organizationId, createdFromLeadId])` on `Contact` model

**Location:** 09-PRISMA-SCHEMA.md, Contact model, lines ~522–530.

The Contact model indexes: `(organizationId, email)`, `(organizationId, phone)`, `(organizationId, assignedToId)`, `(organizationId, lastActivityAt(sort: Desc))`, `deletedAt`.

`createdFromLeadId` is not indexed. The `findByCreatedFromLeadId(leadId)` method is explicitly called out in SPRINT_4_EXECUTION_PLAN.md CRM-3.1 as a needed method ("used to check if a lead has already been converted"). Without an index on `createdFromLeadId`, the convert-check query (executed on every `POST /leads/:id/convert`) will full-scan the contacts table within the tenant.

08-DATABASE-DESIGN.md does not mention this index either — the omission is in both documents. Recorded as DEF-3 (MEDIUM).

---

### DEF-4 — MEDIUM: `CustomFieldDefinition` unique constraint uses `@@unique` not a partial index

**Location:** 09-PRISMA-SCHEMA.md, CustomFieldDefinition model, line ~781.

```prisma
@@unique([organizationId, objectType, fieldKey])
```

08-DATABASE-DESIGN.md specifies: `UNIQUE (organizationId, objectType, fieldKey) WHERE deletedAt IS NULL` — a **partial** unique index that excludes soft-deleted records. This is important: without the partial index, you cannot create a new `budget_amount` field after the old `budget_amount` field was soft-deleted (the unique constraint would reject it).

Prisma's `@@unique` generates a non-partial unique constraint. The remediation plan (Part 2, custom_field_definitions) explicitly called this out as `UNIQUE (organizationId, objectType, fieldKey) (partial: WHERE deletedAt IS NULL)`. The Prisma schema does not implement this correctly — it would need a custom migration with `CREATE UNIQUE INDEX ... WHERE deletedAt IS NULL` and the `@@unique` block removed.

This defect means that the partial unique index documented in 08 is not what will be generated by the Prisma schema. It will be a non-partial unique constraint, preventing re-creation of a field key after soft-delete. Recorded as DEF-4 (MEDIUM).

---

### DEF-5 — MEDIUM: `Subscription` model missing `lastStripeEventAt` and `lastSyncedAt` fields

**Location:** 09-PRISMA-SCHEMA.md, Subscription model, lines ~1012–1033.

The Subscription model does not contain `lastStripeEventAt DateTime?` or `lastSyncedAt DateTime?` despite:
- 08-DATABASE-DESIGN.md §subscriptions table explicitly including both columns (P0-6 documented)
- FINAL_ARCHITECTURE.md §4.4 mandating these fields
- The header of 09-PRISMA-SCHEMA.md carrying an `⚠ UPDATED` banner noting: "Subscription: add `lastStripeEventAt DateTime?` and `lastSyncedAt DateTime?` (P0-6 ordering/reconciliation)"

The fields are called out in the document header as "apply these field changes when the schema is implemented" but are not present in the actual model definition below. This creates a discrepancy between what the document says must be added and what the model currently shows. Recorded as DEF-5 (MEDIUM — the fields are documented in 08 and FINAL_ARCHITECTURE; the 09 model must be updated to include them).

---

### DEF-6 — LOW: `Activity` model has no `@id` partition-key guidance

**Location:** 09-PRISMA-SCHEMA.md, Activity model, line ~656.

```prisma
id String @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
```

For a partitioned table (`PARTITION BY RANGE(createdAt)`), Postgres requires that the partition key column (`createdAt`) be included in the primary key. The primary key of a partitioned table must include all partition key columns. With only `id` as PK and `createdAt` as the partition key but not part of the PK, Postgres will reject the table creation with: `ERROR: insufficient columns in PRIMARY KEY for table "activities"`.

The remediation plan's migration SQL shows `id UUID NOT NULL DEFAULT uuid_generate_v4()` without `PRIMARY KEY`, instead intending the PK to be defined separately or as `(id, "createdAt")`. The Prisma model's `@id` on `id` alone will generate `PRIMARY KEY (id)` which Postgres will reject on the partitioned table.

This is a **known Postgres partitioning constraint**: the primary key must contain the partition key. The migration SQL must use `PRIMARY KEY (id, "createdAt")` instead of `PRIMARY KEY (id)`. This means Prisma's `@id` declaration cannot be used as-is — the primary key constraint must be hand-authored in the custom migration SQL. The Prisma model should note this explicitly (not rely on Prisma to generate the PK for activities).

Recorded as DEF-6 (LOW — the execution plan already says the activities DDL is hand-authored in a custom migration; but a comment in the Prisma model noting the composite PK requirement is missing and engineers may be misled).

---

### DEF-7 — LOW: `Contact.instagramConversations` reverse relation is missing

**Location:** 09-PRISMA-SCHEMA.md, Contact model; InstagramConversation model.

The InstagramConversation model has `relatedContactId String? @db.Uuid` but unlike relatedLeadId (which has `relatedLead Lead? @relation(...)` and the Lead model has `instagramConversations InstagramConversation[]`), there is no `relatedContact Contact? @relation(...)` field in InstagramConversation and no reverse `instagramConversations InstagramConversation[]` in the Contact model.

This means `prisma generate` will produce a Prisma client where you cannot navigate from a Contact to its Instagram conversations. While this is a Sprint 6 entity, the Prisma schema already models it and the relation is incomplete.

Note: `relatedLeadId` in InstagramConversation DOES have a proper relation and reverse. The contact side does not. Recorded as DEF-7 (LOW — Sprint 6 concern; the table is already in the schema).

---

## 5. Migration Sequencing Findings

### leads (0006)
References: organizations ✓ (exists Sprint 3), users (assignedToId, createdById) ✓, contacts (convertedToContactId — circular FK, resolved via ALTER TABLE after both tables created per CRM-1.2) ✓. `pipelineStageId` correctly plain UUID (no FK) ✓. `instagramAccountId` correctly plain UUID ✓. `mergedIntoLeadId` correctly plain UUID ✓.

**Migration sequencing: PASS**

### contacts (0006)
References: organizations ✓, users (assignedToId, createdById) ✓, leads (createdFromLeadId — circular FK, same resolution) ✓.

**Migration sequencing: PASS**

### tasks (0006)
References: organizations ✓, users (assignedToId, createdById) ✓, leads (relatedLeadId) ✓, contacts (relatedContactId) ✓.

**`relatedDealId` — FAIL (DEF-1 above):** The Prisma model has a live FK relation to deals. Migration 0006 will fail. See DEF-1.

**Migration sequencing: FAIL for tasks due to DEF-1**

### notes (0006)
References: organizations ✓, users (createdById) ✓, leads (relatedLeadId — has @relation) ✓, contacts (relatedContactId — has @relation) ✓. `relatedDealId String? @db.Uuid` with no @relation ✓ (correctly deferred).

**Migration sequencing: PASS**

### files (0006)
References: organizations ✓, users (uploadedById) ✓, leads (relatedLeadId — has @relation) ✓, contacts (relatedContactId — has @relation) ✓. `relatedDealId String? @db.Uuid` with no @relation ✓ (correctly deferred).

**Migration sequencing: PASS**

### activities (0006)
References: organizations ✓, users (performedById) ✓. `relatedLeadId`, `relatedDealId`, `relatedContactId` are all plain UUID with @relation in the Prisma model but the activities table DDL is hand-authored as a custom migration (not relying on Prisma generate). The `@relation` directives in the Prisma model will produce FK constraints in a Prisma-generated migration — but since this table uses a custom migration, this must be handled carefully. The custom migration SQL in REC-12 correctly omits FK constraints from the base DDL, treating these as plain UUIDs.

**Residual risk:** Prisma may still attempt to emit the FK constraints in the auto-generated migration diff. The execution of a custom migration vs. a Prisma-generated one must be done correctly. This is an implementation detail for the migration author. No documentation defect; operational risk only.

**Migration sequencing: PASS (pending correct custom migration authoring)**

### ai_scores (0006)
References: organizations ✓, leads (leadId) ✓ — leads table is created in the same migration; ordering matters. The remediation plan SQL creates leads before ai_scores; execution plan CRM-1.2 lists them in order. Correct.

**Migration sequencing: PASS**

### custom_field_definitions (0006)
References: organizations ✓, users (createdById) ✓. No cross-sprint FK dependencies.

**Migration sequencing: PASS**

### team_invites (0006)
References: organizations ✓, roles ✓ (exists Sprint 3), users ✓.

**Migration sequencing: PASS**

### saved_replies (0006)
References: organizations ✓, users ✓.

**Migration sequencing: PASS**

---

## 6. RLS/Tenant Isolation Findings

### TENANT_TABLES count
Plan: 15 tables (5 Sprint 3 + 10 Sprint 4). Verified:

| # | Table | Has organizationId? |
|---|---|---|
| 1 | organization_members | YES ✓ |
| 2 | roles | YES ✓ |
| 3 | subscriptions | YES (UNIQUE FK) ✓ |
| 4 | refresh_tokens | NO — refresh_tokens has userId FK, no organizationId |
| 5 | audit_logs | YES (nullable) ✓ |
| 6 | leads | YES ✓ |
| 7 | contacts | YES ✓ |
| 8 | tasks | YES ✓ |
| 9 | activities | YES ✓ |
| 10 | notes | YES ✓ |
| 11 | files | YES ✓ |
| 12 | ai_scores | YES ✓ |
| 13 | custom_field_definitions | YES ✓ |
| 14 | team_invites | YES ✓ |
| 15 | saved_replies | YES ✓ |

**Finding on refresh_tokens:** `refresh_tokens` does not have an `organizationId` column. The RLS policy `USING ("organizationId" = current_setting('app.current_organization_id', true)::uuid)` cannot be applied to this table as-is. However, refresh_tokens is correctly a user-scoped (not org-scoped) table — a user's refresh token is valid across org contexts if the user belongs to multiple orgs. Its presence in TENANT_TABLES from Sprint 3 was likely an intentional design where the RLS policy uses `userId` rather than `organizationId`. The Sprint 3 signoff presumably validated this; it predates the current review scope. However, the CRM-1.2 and CRM-1.3 documentation in Sprint 4 does not call this out explicitly. This is a pre-existing concern from Sprint 3, not a new Sprint 4 defect. Tracked as a remaining risk (see §12).

**Finding on audit_logs:** `audit_logs.organizationId` is nullable (NULL for platform-level actions). The RLS policy `USING ("organizationId" = current_setting(...))` will deny platform-level audit logs to any org query (NULL ≠ any UUID). This is the correct behavior. No defect.

### All 10 new Sprint 4 tables have organizationId: PASS ✓

### `check:rls` expected count
Updated from 11 to 15. SPRINT_4_EXECUTION_PLAN.md CRM-1.3 and CRM-1.2 both state 15. SPRINT_4_SCHEMA_REMEDIATION_PLAN.md Part 3 states 15. Consistent ✓.

**Finding:** The acceptance criteria section (§3 of SPRINT_4_EXECUTION_PLAN.md) states: `pnpm --filter @leados/api check:rls` reports `OK — 15 tenant tables enabled + forced + policied` in the main acceptance criteria table, **but also** has an older line in the infrastructure table that reads "check:rls covers all 11 tenant tables." This stale "11" reference remains in the acceptance criteria. Recorded as DEF-11 entry added to the defect list (LOW — stale reference in acceptance criteria).

### RLS policy form
Migration 0008 mandates USING + WITH CHECK using `current_setting('app.current_organization_id', true)::uuid` (missing-safe form per FINAL_ARCHITECTURE.md §2.1). Documented in SPRINT_4_SCHEMA_REMEDIATION_PLAN.md Part 3 ✓.

### `withTenant` and `leados_app` vs admin client distinction
- `team_invites` auth path: admin client for token validation on link click ✓, `withTenant` for member INSERT after acceptance ✓. Documented in 08, 09, and the remediation plan.
- No planned service is documented to use admin client for tenant-scoped operations. The only admin-client uses documented are: auth identity reads (P0-2 boundary), and team_invite token lookup (same D-M3-2 boundary). Both are correct.

### ActivityService.append() write-through
The `withTenant` transaction pattern for write-through is explicitly documented in CRM-4.1: append activity row, then update `leads.lastActivityAt = now()` and/or `contacts.lastActivityAt = now()` in the same transaction ✓.

**RLS/Tenant isolation: PASS** (subject to the refresh_tokens pre-existing concern in §12)

---

## 7. Sprint 5–7 Compatibility Findings

### Pipeline FK deferred to Sprint 5
`leads.pipelineStageId` plain UUID in Sprint 4 ✓. Sprint 5 migration action documented: `ALTER TABLE leads ADD CONSTRAINT leads_pipelineStageId_fkey FOREIGN KEY ("pipelineStageId") REFERENCES pipeline_stages(id) ON DELETE SET NULL` ✓. Both 08-DATABASE-DESIGN.md and SPRINT_4_SCHEMA_REVISION.md Change 2 document this ✓.

**PASS**

### Instagram FK deferred to Sprint 6
`leads.instagramAccountId` plain UUID in Sprint 4 ✓. Sprint 6 migration action documented: `ALTER TABLE leads ADD CONSTRAINT leads_instagramAccountId_fkey FOREIGN KEY ("instagramAccountId") REFERENCES instagram_accounts(id) ON DELETE SET NULL` ✓. SPRINT_4_SCHEMA_REVISION.md Change 4 ✓.

**PASS**

### Workflow Engine (Sprint 7) — ActivityType enum coverage
The 19-value ActivityType enum provides sufficient trigger types for Sprint 7 workflow conditions:
- Lead lifecycle: LEAD_CREATED, LEAD_STATUS_CHANGED, LEAD_ASSIGNED, LEAD_WON, LEAD_LOST ✓
- Contact lifecycle: CONTACT_CREATED, CONTACT_UPDATED ✓
- Task lifecycle: TASK_CREATED, TASK_COMPLETED, TASK_CANCELLED ✓
- Note lifecycle: NOTE_ADDED, NOTE_UPDATED, NOTE_DELETED ✓
- File lifecycle: FILE_UPLOADED, FILE_DELETED ✓
- Deal lifecycle: DEAL_CREATED, DEAL_STAGE_MOVED, DEAL_WON, DEAL_LOST ✓
- Message events deferred to Sprint 6 (documented) ✓

The Workflow Engine trigger config `{ type: 'LEAD_STATUS_CHANGED', config: {} }` will map to exactly these enum values. **PASS**

### saved_replies as Sprint 6 content
Shell table documented as Sprint 4 creation, Sprint 6 routes ✓. "No routes or service code in Sprint 4" ✓. **PASS**

### relatedDealId on notes/files/tasks — Sprint 5 FK
- `notes.relatedDealId`: plain UUID no @relation ✓
- `files.relatedDealId`: plain UUID no @relation ✓
- `tasks.relatedDealId`: **FAIL** — has live @relation (DEF-1). Sprint 5 FK add action is NOT documented for tasks.relatedDealId (only for leads.pipelineStageId). Sprint 5 migration must include `ALTER TABLE tasks ADD CONSTRAINT tasks_relatedDealId_fkey FOREIGN KEY ("relatedDealId") REFERENCES deals(id) ON DELETE SET NULL`.

**Sprint 5 compatibility: PARTIAL** — tasks FK deferral must be fixed (DEF-1) and the Sprint 5 migration action must be documented.

---

## 8. Deferred FK Findings

### leads.pipelineStageId (deferred to Sprint 5)
- Plain UUID NULL in 08-DATABASE-DESIGN.md ✓
- `String? @db.Uuid` with no @relation in 09-PRISMA-SCHEMA.md ✓
- Comment `// deferred FK → pipeline_stages (Sprint 5)` in 09 ✓
- Sprint 5 migration action documented ✓

**PASS**

### leads.instagramAccountId (deferred to Sprint 6)
- Plain UUID NULL in 08-DATABASE-DESIGN.md ✓
- `String? @db.Uuid` with no @relation in 09-PRISMA-SCHEMA.md ✓
- Comment `// deferred FK → instagram_accounts (Sprint 6)` in 09 ✓
- Sprint 6 migration action documented ✓

**PASS**

### leads.mergedIntoLeadId (deferred to merge milestone)
- Plain UUID NULL in 08-DATABASE-DESIGN.md ✓
- `String? @db.Uuid` with no @relation in 09-PRISMA-SCHEMA.md ✓
- Comment `// deferred self-ref FK (merge milestone)` in 09 ✓
- Merge milestone action noted (Sprint 4 scope: column always NULL) ✓

**PASS**

### tasks.relatedDealId (should be deferred to Sprint 5)
- Documented as plain UUID in 08-DATABASE-DESIGN.md remediation plan Part 2 ✓
- **FAIL in 09-PRISMA-SCHEMA.md:** live @relation to Deal exists in Task model ✓ would create FK at migration time
- Comment `// no FK in Sprint 4 — deals table is Sprint 5` present as a comment on the relatedDealId field in 09 — but the @relation directive below it contradicts this comment
- Sprint 5 migration action NOT documented for tasks.relatedDealId

**FAIL — see DEF-1**

### notes.relatedDealId (deferred to Sprint 5)
- Plain UUID NULL in 08-DATABASE-DESIGN.md ✓
- `String? @db.Uuid` with no @relation in 09-PRISMA-SCHEMA.md ✓ (comment `// no FK in Sprint 4 (deals table is Sprint 5)` present)
- Sprint 5 migration action not explicitly documented (same gap as tasks), but acceptably low risk since this is a non-critical read path

**PASS (minor documentation gap on Sprint 5 action)**

### files.relatedDealId (deferred to Sprint 5)
- Plain UUID NULL in 08-DATABASE-DESIGN.md ✓
- `String? @db.Uuid` with no @relation in 09-PRISMA-SCHEMA.md ✓ (comment `// no FK in Sprint 4 (deals table is Sprint 5)` present)

**PASS (same minor documentation gap as notes)**

---

## 9. Activity Partitioning Findings

### PARTITION BY RANGE(createdAt)
Documented in 08-DATABASE-DESIGN.md §activities ✓. Initial partitions documented: `activities_2026` and `activities_default` ✓. Annual partition creation via ops runbook noted ✓.

### Immutability triggers
`activities_no_update` (BEFORE UPDATE) and `activities_no_delete` (BEFORE DELETE) — both documented in 08 §activities ✓. Both in CRM-1.2 migration 0006 checklist ✓.

### CHECK constraint
`CHECK ("relatedLeadId" IS NOT NULL OR "relatedDealId" IS NOT NULL OR "relatedContactId" IS NOT NULL)` documented in 08 §activities ✓.

### Prisma implications acknowledged
SPRINT_4_SCHEMA_REVISION.md Change 7: "No Prisma model field changes (Prisma treats partitioned tables as regular models; the DDL is hand-authored in the custom migration)" ✓. CRM-1.1 note: Activity requires hand-authored migration DDL ✓.

### Composite PK requirement
**Finding (DEF-6):** Postgres requires the partition key (`createdAt`) to be included in the primary key of a partitioned table. The Prisma model's `@id` on `id` alone will not produce the correct composite PK. The custom migration SQL must use `PRIMARY KEY (id, "createdAt")`. The Prisma model should carry a comment noting this. Currently absent.

### Activity partitioning: PASS with DEF-6 noted

---

## 10. AI Scoring / Custom Fields Findings

### ai_scores table
- `id UUID PK` ✓
- `organizationId UUID FK NOT NULL` ✓ (tenant key)
- `leadId UUID FK NOT NULL` ✓
- `score SMALLINT NOT NULL` (Prisma: `Int @db.SmallInt`) ✓
- `confidence DECIMAL(3,2) NULL` (Prisma: `Decimal? @db.Decimal(3, 2)`) ✓
- `factors JSONB NULL` (Prisma: `Json?`) ✓
- `recommendation TEXT NULL` (Prisma: `String? @db.Text`) ✓
- `triggeredBy VARCHAR(50) NULL` (Prisma: `String? @db.VarChar(50)`) ✓
- `modelVersion VARCHAR(50) NULL` (Prisma: `String? @db.VarChar(50)`) ✓
- `createdAt TIMESTAMP NOT NULL` ✓
- NO `updatedAt` ✓ (immutable)
- NO `deletedAt` ✓ (immutable)

`leads.aiScore` + `leads.aiScoreUpdatedAt` retained as denormalized read cache ✓. Write-through contract implicit (Sprint 7 AI service writes ai_scores row then updates lead) — documented in SPRINT_4_SCHEMA_REVISION.md Change 12 ✓.

PLAN_LIMITS for AI calls (`aiCallsPerMonth`, `aiCallsPerHour`) exist in `packages/shared/src/constants/plan-limits.ts` ✓.

**ai_scores: PASS**

### custom_field_definitions table
- All required columns present ✓
- `objectType ENUM NOT NULL (LEAD|CONTACT|DEAL)` — `CustomFieldObjectType` enum defined in 09 ✓
- `fieldKey VARCHAR(100) NOT NULL` ✓
- `displayLabel VARCHAR(100) NOT NULL` ✓
- `fieldType ENUM NOT NULL (TEXT|NUMBER|DATE|SELECT|MULTI_SELECT|BOOLEAN|URL)` — `CustomFieldType` enum defined in 09 ✓
- `options JSONB NULL` — `Json?` in 09 ✓
- `isRequired BOOLEAN DEFAULT false` ✓
- `position SMALLINT NOT NULL` ✓ (`Int @db.SmallInt`)
- `createdById UUID FK NOT NULL` ✓
- `deletedAt TIMESTAMP NULL` ✓
- `createdAt`, `updatedAt` ✓

`customFields JSONB` columns on leads/contacts retained as value store ✓.

PLAN_LIMITS `customFieldsPerObject` enforced on create — documented ✓. Note that the PLAN_LIMITS actual values (10/10/30/50 for TRIAL/STARTER/GROWTH/SCALE) are correct in `plan-limits.ts`. The reference to "50 custom fields per object type" in 08-DATABASE-DESIGN.md plan limit section is SCALE-tier only; it is not wrong, but could be clearer (tracked in DEF-10).

**Partial unique index defect (DEF-4):** `@@unique([organizationId, objectType, fieldKey])` in Prisma will not generate a partial unique index. See DEF-4.

**custom_field_definitions: CONDITIONAL PASS (DEF-4 must be addressed)**

---

## 11. Open Defects

| # | Severity | Description | Fix Required Before |
|---|---|---|---|
| DEF-1 | HIGH | `Task.relatedDeal Deal? @relation(...)` is a live FK relation in 09-PRISMA-SCHEMA.md. Migration 0006 will fail with `ERROR: referenced relation "deals" does not exist`. Must be converted to plain `relatedDealId String? @db.Uuid` with no @relation and no Deal.tasks reverse relation. Sprint 5 migration action must be documented. | Migration 0006 authored |
| DEF-2 | MEDIUM | Activity model in 09-PRISMA-SCHEMA.md is missing `@@index([organizationId, createdAt(sort: Desc)])`. This index is documented in 08-DATABASE-DESIGN.md §activities and in SPRINT_4_SCHEMA_REMEDIATION_PLAN.md migration 0007 checklist but not in the Prisma model. | Migration 0007 authored |
| DEF-3 | MEDIUM | Contact model missing index on `createdFromLeadId`. The method `findByCreatedFromLeadId(leadId)` is called on every `POST /leads/:id/convert`. Without an index, this is a full table scan per tenant. Neither 08 nor 09 documents this index. | Migration 0007 authored |
| DEF-4 | MEDIUM | `CustomFieldDefinition @@unique([organizationId, objectType, fieldKey])` generates a non-partial unique constraint. 08-DATABASE-DESIGN.md and the remediation plan specify a partial unique index `WHERE deletedAt IS NULL`. The Prisma `@@unique` block must be removed and a custom migration must use `CREATE UNIQUE INDEX ... WHERE deletedAt IS NULL`. Without this, re-creating a soft-deleted field key will fail. | Migration 0006 authored |
| DEF-5 | MEDIUM | `Subscription` model in 09-PRISMA-SCHEMA.md is missing `lastStripeEventAt DateTime?` and `lastSyncedAt DateTime?`. These are P0-6 requirements, mandated by FINAL_ARCHITECTURE.md §4.4 and present in 08-DATABASE-DESIGN.md. The 09 document header calls them out as changes to apply but the model itself does not include them. | Migration (Subscription is a Sprint 3 table; this should be added as an additive migration or noted as part of the existing Sprint 3 migration for accuracy in planning) |
| DEF-6 | LOW | Activity model `@id` on `id` alone will fail for a partitioned table in Postgres. Postgres requires the partition key (`createdAt`) to be part of the PK for range-partitioned tables. The custom migration must use `PRIMARY KEY (id, "createdAt")`. A comment must be added to the Activity model in 09 noting this Prisma limitation. | Migration 0006 authored (comment) |
| DEF-7 | LOW | `InstagramConversation.relatedContactId` has no corresponding `@relation` field or Contact reverse relation. The Lead side (relatedLeadId, relatedLead, Lead.instagramConversations) is complete. The Contact side is incomplete. | Sprint 6 (this table is Sprint 6; low urgency but should be documented now) |
| DEF-8 | MEDIUM | `packages/shared/src/constants/events.ts` does not yet contain constants for all 19 ActivityType values. The existing `DomainEvent` uses dot-notation format (`'lead.created'`) inconsistent with ActivityType SCREAMING_SNAKE_CASE. `DEAL_STAGE_CHANGED` in events.ts conflicts with the renamed `DEAL_STAGE_MOVED` in ActivityType. Must be updated before E2 code begins. | Before E2 code |
| DEF-9 | MEDIUM | `packages/shared/src/types/activity-metadata.ts` does not yet exist in the codebase. The `ActivityMetadata` discriminated union is defined only in planning documents. Must be created before E4 (ActivityService) code begins. | Before E4 code |
| DEF-10 | LOW | 08-DATABASE-DESIGN.md references "50 custom fields per object type" as the plan limit without clarifying this is SCALE-tier only. TRIAL/STARTER = 10, GROWTH = 30, SCALE = 50 per `plan-limits.ts`. Minor documentation imprecision. | Documentation update |
| DEF-11 | LOW | Two documentation inconsistencies: (a) §8.7 in 08-DATABASE-DESIGN.md contains a stale FTS index definition without `WHERE deletedAt IS NULL` and without `phone`. (b) The acceptance criteria in SPRINT_4_EXECUTION_PLAN.md §3 still contains a stale reference to "11 tenant tables" in the CI gate table alongside the correct "15" in the Tenancy gate table. | Documentation update |

---

## 12. Remaining Risks

These are not defects but warrant monitoring during implementation:

**R-1: refresh_tokens in TENANT_TABLES without organizationId**
`refresh_tokens` is in the 15-table TENANT_TABLES registry inherited from Sprint 3 but lacks `organizationId`. The RLS policy for this table must use a different scoping mechanism (likely by userId with JOIN to organization_members, or an organization_id column added). This was accepted in the Sprint 3 signoff and is outside Sprint 4 scope, but the Sprint 4 `check:rls` count of 15 must still correctly account for however this table's RLS policy is implemented.

**R-2: Activity custom migration vs Prisma migration conflict**
The `activities` table must be created via a hand-authored custom migration (for PARTITION BY RANGE). Prisma may still attempt to generate a migration diff that includes a `CREATE TABLE activities` statement without partitioning, or may generate FK creation statements that conflict with the custom DDL. Care must be taken during `pnpm db:migrate` to ensure the custom migration is applied instead of, not in addition to, any Prisma-generated migration for activities.

**R-3: tasks.relatedDeal FK in Prisma will cause Prisma migrate to generate a FK to deals**
Even after DEF-1 is fixed in the planning document (09), if the actual `prisma/schema.prisma` file still has the relation when migration 0006 is authored, the migration will fail. This requires the actual Prisma schema file to be updated, not just the planning document.

**R-4: events.ts format inconsistency may cause silent workflow failures**
If engineers use `DomainEvent.LEAD_STATUS_CHANGED` (which maps to `'lead.status_changed'`) as the eventBus emit key, and the Workflow Engine in Sprint 7 evaluates conditions against `ActivityType.LEAD_STATUS_CHANGED` (the string `'LEAD_STATUS_CHANGED'`), workflow triggers will never fire. The format inconsistency in DEF-8 is a pre-E2 gate that, if missed, will produce a class of silent runtime failures that are extremely difficult to debug in Sprint 7.

**R-5: Prisma `@@unique` on CustomFieldDefinition — soft-delete field key collision**
Until DEF-4 is fixed, the non-partial unique constraint means that once an org creates a field key `budget_amount` and later soft-deletes it, they can never create a new `budget_amount` field. For SCALE-tier orgs who frequently iterate on their custom field schema, this will be a user-reported bug in the first month.

**R-6: File storage orphan accumulation**
Soft-deleted files remain in S3/Cloudinary indefinitely. Accepted as a Sprint 8 / pre-launch item per REC-20, but must not be forgotten.

**R-7: tasks.relatedDealId Sprint 5 ALTER TABLE not documented**
The Sprint 5 migration documentation only documents `ALTER TABLE leads ADD CONSTRAINT leads_pipelineStageId_fkey`. It does not document `ALTER TABLE tasks ADD CONSTRAINT tasks_relatedDealId_fkey`, `ALTER TABLE notes ADD CONSTRAINT notes_relatedDealId_fkey`, or `ALTER TABLE files ADD CONSTRAINT files_relatedDealId_fkey`. These three FK additions are needed in Sprint 5 to maintain referential integrity on deals. If not documented now, they may be missed.

---

## 13. Required Changes Before Implementation

The following must be completed before any engineer authors migration 0006.

### BLOCKING (migration 0006 will fail without these):

**RC-1 [DEF-1]:** Remove `relatedDeal Deal? @relation(...)` from the Task model in 09-PRISMA-SCHEMA.md. Remove `tasks Task[]` from the Deal model. Change `relatedDealId` in Task to `relatedDealId String? @db.Uuid // no FK in Sprint 4 — FK deferred to Sprint 5`. Add Sprint 5 migration action: `ALTER TABLE tasks ADD CONSTRAINT tasks_relatedDealId_fkey FOREIGN KEY ("relatedDealId") REFERENCES deals(id) ON DELETE SET NULL`.

**RC-2 [DEF-4]:** Remove `@@unique([organizationId, objectType, fieldKey])` from the CustomFieldDefinition Prisma model in 09-PRISMA-SCHEMA.md. Document in CRM-1.2 that migration 0006 must include `CREATE UNIQUE INDEX custom_field_definitions_org_type_key_key ON custom_field_definitions ("organizationId", "objectType", "fieldKey") WHERE "deletedAt" IS NULL` (hand-authored, not Prisma-generated). Add `// partial unique index authored in custom migration — see 0006_crm_tables` comment.

### HIGH PRIORITY (before migration authoring):

**RC-3 [DEF-6]:** Add a comment block to the Activity model in 09-PRISMA-SCHEMA.md noting that the primary key for the partitioned table must be `(id, "createdAt")` and that the `@id` on `id` alone will not work for Postgres partition tables. Document in CRM-1.2 that the custom migration must use `PRIMARY KEY (id, "createdAt")`.

**RC-4 [DEF-5]:** Add `lastStripeEventAt DateTime?` and `lastSyncedAt DateTime?` to the Subscription model in 09-PRISMA-SCHEMA.md. These are P0-6 required fields already in 08-DATABASE-DESIGN.md.

**RC-5 [DEF-2]:** Add `@@index([organizationId, createdAt(sort: Desc)])` to the Activity model in 09-PRISMA-SCHEMA.md and to migration 0007 checklist.

**RC-6 [DEF-3]:** Add `@@index([organizationId, createdFromLeadId])` to the Contact model in 09-PRISMA-SCHEMA.md and to migration 0007 checklist.

### PRE-CODE GATES (before E2/E4 implementation begins):

**RC-7 [DEF-8]:** Update `packages/shared/src/constants/events.ts` to add all 19 ActivityType event names in a consistent format, and rename `DEAL_STAGE_CHANGED` → `DEAL_STAGE_MOVED` to match the canonicalized ActivityType enum. Decide and document the format convention (dot-notation vs SCREAMING_SNAKE_CASE) once and enforce it. This must be done before E2 code begins.

**RC-8 [DEF-9]:** Create `packages/shared/src/types/activity-metadata.ts` with the full `ActivityMetadata` discriminated union per the remediation plan definition. This must be done before E4 (ActivityService) code begins.

### DOCUMENTATION UPDATES (can be done concurrently with M1):

**RC-9 [DEF-11a]:** Update 08-DATABASE-DESIGN.md §8.7 FTS index definition to match the partial index with `WHERE deletedAt IS NULL` and including `phone`.

**RC-10 [DEF-11b]:** Update SPRINT_4_EXECUTION_PLAN.md §3 acceptance criteria table (Infrastructure & CI) to change "11 tenant tables" to "15 tenant tables".

**RC-11 [R-7]:** Add Sprint 5 migration actions for tasks.relatedDealId, notes.relatedDealId, and files.relatedDealId FK constraints to the Sprint 5 migration documentation (or as notes in the SPRINT_4_SCHEMA_REVISION.md deferred FK section).

---

## 14. M1 Approval

**STATUS: APPROVED TO BEGIN, BLOCKED ON RC-1 AND RC-2**

M1 (E1: Schema & RLS Foundation — CRM-1.1 through CRM-1.3) may not begin until:

1. **RC-1 is resolved:** Task model in 09-PRISMA-SCHEMA.md must have `relatedDealId` as a plain UUID with no @relation directive. Without this, migration 0006 will fail in the same way the original pipelineStageId FK would have failed.

2. **RC-2 is resolved:** CustomFieldDefinition `@@unique` must be removed from 09-PRISMA-SCHEMA.md and the custom partial unique index approach must be documented in CRM-1.2. Without this, soft-deleted custom field keys can never be reused.

3. **RC-4 is resolved:** Subscription model must be updated in 09 to include the P0-6 required fields. While not strictly a Sprint 4 migration concern (Subscription already exists), the Prisma schema document must be accurate before `prisma generate` is run, or `pnpm typecheck` will disagree with 08.

RC-3 (Activity PK comment), RC-5, RC-6 (index additions) must be done before migration 0007 is authored. RC-7, RC-8 must be done before E2 and E4 code begin respectively. RC-9 through RC-11 are documentation cleanup.

Once RC-1, RC-2, and RC-4 are completed, the schema is sound for M1 implementation.

**E2 through E6 implementation is conditionally approved** pending the pre-code gates RC-7 (before E2) and RC-8 (before E4).

---

*Read-only audit. No files modified except this signoff document.*
*Source files reviewed: SPRINT_4_ARCHITECTURE_AUDIT.md, SPRINT_4_SCHEMA_REMEDIATION_PLAN.md, SPRINT_4_SCHEMA_REVISION.md, docs/blueprint/08-DATABASE-DESIGN.md, docs/blueprint/09-PRISMA-SCHEMA.md, docs/planning/SPRINT_4_EXECUTION_PLAN.md, docs/planning/FINAL_ARCHITECTURE.md, packages/shared/src/types/index.ts, packages/shared/src/constants/enums.ts, packages/shared/src/constants/events.ts, packages/shared/src/constants/plan-limits.ts.*
