# SPRINT_4_SCHEMA_SIGNOFF_REMEDIATION.md

> **Post-Signoff Remediation Record**
> Source: `SPRINT_4_SCHEMA_FINAL_SIGNOFF.md` — CONDITIONAL PASS verdict dated 2026-06-19
> Scope: RC-1 through RC-11 only. No application code. No migration SQL. Planning and schema documents only.
> Date applied: 2026-06-19
> Files modified: `docs/blueprint/09-PRISMA-SCHEMA.md`, `docs/blueprint/08-DATABASE-DESIGN.md`, `docs/planning/SPRINT_4_EXECUTION_PLAN.md`
> Status: All RC items addressed. No re-review required for RC-7 and RC-8 (pre-code gates, tracked in execution plan, not schema changes).

---

## RC-1 [DEF-1] — RESOLVED

**Severity:** HIGH (migration 0006 blocker)
**File:** `docs/blueprint/09-PRISMA-SCHEMA.md`

**Problem:** `Task.relatedDeal Deal? @relation(fields: [relatedDealId], references: [id])` was a live Prisma `@relation` directive pointing at the `Deal` model. Prisma generates a FK constraint from this directive. The `deals` table does not exist in Sprint 4 (it is Sprint 5). Migration 0006 would have failed with `ERROR: referenced relation "deals" does not exist` — the same class of failure as the original `pipelineStageId` blocker.

Additionally, `Deal.tasks Task[]` was a live reverse relation that would have been emitted by Prisma on the `Deal` side.

**Changes applied:**

1. Removed `relatedDeal Deal? @relation(fields: [relatedDealId], references: [id])` from the Task model relations block.
2. Added comment block in its place documenting the deferral and the Sprint 5 migration action required:
   ```
   // relatedDeal FK deferred to Sprint 5 — deals table does not exist in Sprint 4.
   // Sprint 5 migration action: ALTER TABLE tasks ADD CONSTRAINT tasks_relatedDealId_fkey
   //   FOREIGN KEY ("relatedDealId") REFERENCES deals(id) ON DELETE SET NULL;
   ```
3. Added inline comment on the `relatedDealId` field: `// no FK in Sprint 4 — deals table is Sprint 5; FK added in Sprint 5 migration`
4. Changed `tasks Task[]` in the Deal model to a comment: `// tasks Task[] relation deferred to Sprint 5 — tasks.relatedDealId FK is added in Sprint 5 migration`

**Result:** Task model has no `@relation` to `Deal`. Prisma will not generate a FK constraint for `tasks.relatedDealId`. Migration 0006 blocker removed.

---

## RC-2 [DEF-4] — RESOLVED

**Severity:** MEDIUM (migration 0006 correctness; silent product bug post-launch)
**File:** `docs/blueprint/09-PRISMA-SCHEMA.md`

**Problem:** `@@unique([organizationId, objectType, fieldKey])` in `CustomFieldDefinition` generates a non-partial unique constraint. The design requires a partial unique index (`WHERE deletedAt IS NULL`) so that a soft-deleted field key can be reused. A non-partial constraint means once an org creates `budget_amount` and soft-deletes it, they can never create a new `budget_amount` field.

**Changes applied:**

1. Removed `@@unique([organizationId, objectType, fieldKey])` from the `CustomFieldDefinition` model.
2. Added a comment block above the model explaining:
   - Why `@@unique` is absent (Prisma cannot generate partial unique indexes)
   - The correct hand-authored migration SQL that must go in `0006_crm_tables`:
     ```sql
     CREATE UNIQUE INDEX custom_field_definitions_org_type_key_key
       ON custom_field_definitions ("organizationId", "objectType", "fieldKey")
       WHERE "deletedAt" IS NULL;
     ```
3. Added inline comment in the model: `// @@unique intentionally absent — partial unique index is hand-authored in migration 0006_crm_tables`
4. Updated the plan-limits documentation in the model comment to reflect the tier-specific limits (10/10/30/50 for TRIAL/STARTER/GROWTH/SCALE) rather than the flat "50" figure (fixing DEF-10 simultaneously).

**Result:** `CustomFieldDefinition` model no longer emits a non-partial unique constraint. Migration 0006 author must include the hand-authored partial unique index SQL.

---

## RC-3 [DEF-6] — RESOLVED

**Severity:** LOW (migration 0006 would fail on Postgres partition PK validation)
**File:** `docs/blueprint/09-PRISMA-SCHEMA.md`

**Problem:** Postgres requires the partition key column to be included in the primary key of a partitioned table. The `Activity` model had `@id` on `id` alone, which generates `PRIMARY KEY (id)`. Postgres rejects this for `PARTITION BY RANGE(createdAt)` with `ERROR: insufficient columns in PRIMARY KEY for table "activities"`. The migration author needed explicit guidance that `PRIMARY KEY (id, "createdAt")` is required.

**Changes applied:**

Added a seven-line comment block immediately above the `model Activity {` declaration:
```
// Activity — append-only immutable log. PARTITIONED BY RANGE(createdAt).
// ⚠ PARTITION PK NOTE: Postgres requires the partition key to be part of the primary key.
// The `@id` on `id` alone is NOT valid for this table. The custom migration (0006_crm_tables)
// must use PRIMARY KEY (id, "createdAt") — NOT PRIMARY KEY (id). Prisma's @id generates
// PRIMARY KEY (id), which Postgres will reject with "insufficient columns in PRIMARY KEY for
// partitioned table". This table's DDL is hand-authored; do not rely on prisma migrate dev
// to generate the CREATE TABLE statement.
```

**Result:** Migration author cannot miss the composite PK requirement. The comment is at the model declaration, before any field is read.

---

## RC-4 [DEF-5] — RESOLVED

**Severity:** MEDIUM (P0-6 compliance gap; Prisma client type mismatch with 08-DATABASE-DESIGN.md)
**File:** `docs/blueprint/09-PRISMA-SCHEMA.md`

**Problem:** The `Subscription` model was missing `lastStripeEventAt DateTime?` and `lastSyncedAt DateTime?`. These fields are mandated by `FINAL_ARCHITECTURE.md §4.4` for Stripe webhook idempotency and event ordering, and are already present in `08-DATABASE-DESIGN.md §subscriptions`. The document header noted them as outstanding, but the model body did not include them — `prisma generate` would produce a Prisma client missing these fields.

**Changes applied:**

Added to the `Subscription` model, after `seatCount` and before `createdAt`:
```prisma
// P0-6: required for Stripe webhook idempotency and reconciliation (FINAL_ARCHITECTURE.md §4.4)
lastStripeEventAt      DateTime?
lastSyncedAt           DateTime?
```

**Result:** `Subscription` model is now consistent with `08-DATABASE-DESIGN.md §subscriptions` and `FINAL_ARCHITECTURE.md §4.4`. The header `⚠ UPDATED` note is now implemented.

---

## RC-5 [DEF-2] — RESOLVED

**Severity:** MEDIUM (missing index for org-level timeline query)
**Files:** `docs/blueprint/09-PRISMA-SCHEMA.md`, `docs/planning/SPRINT_4_EXECUTION_PLAN.md`

**Problem:** The `Activity` model was missing `@@index([organizationId, createdAt(sort: Desc)])`. This index is needed for org-level timeline queries (admin dashboard, audit view — "show all recent activity for this org"). The index was documented in `08-DATABASE-DESIGN.md §activities` but absent from the Prisma model.

**Changes applied:**

1. Added `@@index([organizationId, createdAt(sort: Desc)])` as the first index entry in the Activity model (before the entity-scoped indexes).
2. Updated `0007_crm_indexes` row in the execution plan migration table to include this index explicitly.

**Result:** Org-level timeline queries can use the index. Four activity indexes now exist: org-only, org+lead, org+deal, org+contact — all descending by `createdAt`.

---

## RC-6 [DEF-3] — RESOLVED

**Severity:** MEDIUM (full tenant-table scan on every lead convert)
**Files:** `docs/blueprint/09-PRISMA-SCHEMA.md`, `docs/blueprint/08-DATABASE-DESIGN.md`, `docs/planning/SPRINT_4_EXECUTION_PLAN.md`

**Problem:** `Contact.createdFromLeadId` had no index. `findByCreatedFromLeadId(leadId)` is called on every `POST /leads/:id/convert` to check idempotency (prevent double-convert). Without an index, this is a full scan of the tenant's contacts table on every convert call. Neither `08-DATABASE-DESIGN.md` nor `09-PRISMA-SCHEMA.md` documented this index.

**Changes applied:**

1. Added `@@index([organizationId, createdFromLeadId])` to the Contact model in `09-PRISMA-SCHEMA.md`.
2. Updated the contacts index list in `08-DATABASE-DESIGN.md §contacts` to include `(organizationId, createdFromLeadId)` with a note explaining its purpose.
3. Updated the `0007_crm_indexes` entry in `SPRINT_4_EXECUTION_PLAN.md` to include this index.

**Result:** Convert idempotency check is now O(log n) instead of O(n).

---

## RC-7 [DEF-8] — DOCUMENTED (pre-E2 implementation gate; not a schema doc change)

**Severity:** MEDIUM (silent Sprint 7 workflow failure if missed)
**File:** `docs/planning/SPRINT_4_EXECUTION_PLAN.md`

**Problem:** `packages/shared/src/constants/events.ts` contains `DomainEvent` constants in dot-notation format (`'lead.created'`) that are inconsistent with the `ActivityType` SCREAMING_SNAKE_CASE enum values. The stale `DEAL_STAGE_CHANGED` constant conflicts with the renamed `DEAL_STAGE_MOVED`. The canonical 19 `ActivityType` values are not all present as constants. If domain services import from `events.ts` and the format differs from what the Sprint 7 Workflow Engine evaluates, triggers will silently never fire.

**Changes applied:**

Updated `SPRINT_4_EXECUTION_PLAN.md` shared package additions section to a formal table of **hard gates** with the specific actions required:
- Rename `DEAL_STAGE_CHANGED` → `DEAL_STAGE_MOVED` in `events.ts`
- Add all 19 `ActivityType` values as constants in consistent SCREAMING_SNAKE_CASE format
- Update all existing `eventBus.emit()` call sites in one PR before E2 is reviewed
- Warning note (R-4) about the format inconsistency risk added explicitly

**Note:** The actual file change to `packages/shared/src/constants/events.ts` is an E2 pre-gate implementation task, not a planning document change. This RC item is considered addressed at the planning layer — the gate is now explicit, machine-readable in the execution plan, and cannot be missed by the sprint engineer.

---

## RC-8 [DEF-9] — DOCUMENTED (pre-E4 implementation gate; not a schema doc change)

**Severity:** MEDIUM (E4 ActivityService cannot be type-safe without this file)
**File:** `docs/planning/SPRINT_4_EXECUTION_PLAN.md`

**Problem:** `packages/shared/src/types/activity-metadata.ts` does not exist in the codebase. The `ActivityMetadata` discriminated union is defined only in planning documents. `ActivityAppendInput` needs this union for the `metadata` field to be type-checked at compile time.

**Changes applied:**

Added to the same shared-package gates table in `SPRINT_4_EXECUTION_PLAN.md`: this file must be created before E4 (ActivityService) code begins, containing one variant per `ActivityType` value with the required entity FK and metadata shape for each.

**Note:** Same as RC-7 — the actual file creation is an E1 implementation task (before E4 code). The gate is now explicit in the execution plan.

---

## RC-9 [DEF-11a] — RESOLVED

**Severity:** LOW (stale documentation)
**File:** `docs/blueprint/08-DATABASE-DESIGN.md`

**Problem:** Section §8.7 (Indexes Summary) contained a stale FTS index definition without `WHERE deletedAt IS NULL` and without `phone`. The authoritative definition in the `§leads` table section above it was correct, but §8.7 would mislead migration authors or reviewers reading the summary.

**Changes applied:**

Updated the `idx_leads_search` index definition in §8.7 to:
```sql
-- Full text search on leads (partial — excludes soft-deleted rows; includes phone per FR-LEAD-005)
CREATE INDEX idx_leads_search ON leads USING gin(
  to_tsvector('english',
    coalesce(first_name, '') || ' ' ||
    coalesce(last_name, '') || ' ' ||
    coalesce(email, '') || ' ' ||
    coalesce(phone, ''))
) WHERE deleted_at IS NULL;
```

**Result:** §8.7 is now consistent with the §leads index specification and the `0007_crm_indexes` migration checklist.

---

## RC-10 [DEF-11b] — RESOLVED

**Severity:** LOW (stale acceptance criterion)
**File:** `docs/planning/SPRINT_4_EXECUTION_PLAN.md`

**Problem:** The Infrastructure & CI acceptance criteria table had a stale row `check:rls covers all 11 tenant tables` referencing the pre-remediation count of 11 tables. The Tenancy & Isolation section and CRM-1.2/CRM-1.3 sections correctly said 15, but the CI gate acceptance criterion contradicted them.

**Changes applied:**

Updated the row to:
```
| `check:rls` covers all 15 tenant tables | `pnpm --filter @leados/api check:rls` reports `OK — 15 tenant tables enabled + forced + policied` |
```

**Result:** The acceptance criterion is now consistent with CRM-1.3, the migration documentation, and the TENANT_TABLES registry.

---

## RC-11 [R-7] — RESOLVED

**Severity:** MEDIUM (deferred FK actions not documented; risk of being missed in Sprint 5)
**File:** `docs/planning/SPRINT_4_EXECUTION_PLAN.md`

**Problem:** Sprint 5 `ALTER TABLE` actions for the three `relatedDealId` columns (tasks, notes, files) and the four total deferred FKs (leads.pipelineStageId, leads.instagramAccountId, leads.mergedIntoLeadId) were documented in `SPRINT_4_SCHEMA_REVISION.md` but not in the execution plan that Sprint 5 engineers will actually read. Risk: Sprint 5 ships deals/pipeline without adding these constraints, leaving tables with orphan-capable UUID columns permanently.

**Changes applied:**

Added new section `CRM-1.2a: Deferred FK schedule (Sprint 5 + Sprint 6 migration actions)` in the execution plan immediately after the migration table, with a formal table:

| Column | Target Sprint | Required ALTER TABLE |
|---|---|---|
| `leads.pipelineStageId` | Sprint 5 | `ALTER TABLE leads ADD CONSTRAINT ... REFERENCES pipeline_stages(id) ON DELETE SET NULL` |
| `tasks.relatedDealId` | Sprint 5 | `ALTER TABLE tasks ADD CONSTRAINT ... REFERENCES deals(id) ON DELETE SET NULL` |
| `notes.relatedDealId` | Sprint 5 | `ALTER TABLE notes ADD CONSTRAINT ... REFERENCES deals(id) ON DELETE SET NULL` |
| `files.relatedDealId` | Sprint 5 | `ALTER TABLE files ADD CONSTRAINT ... REFERENCES deals(id) ON DELETE SET NULL` |
| `leads.instagramAccountId` | Sprint 6 | `ALTER TABLE leads ADD CONSTRAINT ... REFERENCES instagram_accounts(id) ON DELETE SET NULL` |
| `leads.mergedIntoLeadId` | Merge milestone | Self-referencing FK — add when merge service is implemented |

With a note: "Sprint 5 migration author must apply all four Sprint 5 ALTER TABLE statements in a single migration after `deals` and `pipeline_stages` tables are created."

**Result:** All deferred FK obligations are documented in the authoritative execution plan, not only in the revision record.

---

## DEF-7 [Contact.instagramConversations reverse relation] — RESOLVED

**Severity:** LOW (Prisma client navigation incomplete for Sprint 6)
**File:** `docs/blueprint/09-PRISMA-SCHEMA.md`

**Problem:** `InstagramConversation.relatedContactId` existed as a plain UUID with no `@relation` directive and no corresponding reverse relation on the `Contact` model. The Lead side (`relatedLeadId` → `relatedLead Lead?`, Lead.instagramConversations []) was complete, but the Contact side was not. Prisma client would not allow navigating from a Contact to its Instagram conversations.

**Changes applied:**

1. Added `relatedContact Contact? @relation(fields: [relatedContactId], references: [id])` to the `InstagramConversation` model.
2. Added `instagramConversations InstagramConversation[]` to the `Contact` model relations block with a Sprint 6 comment.

**Result:** Both sides of the `InstagramConversation ↔ Contact` relation are now symmetric. Prisma client will generate navigation in both directions.

---

## Additional fix: Day plan stale counts

**File:** `docs/planning/SPRINT_4_EXECUTION_PLAN.md`

Updated Day 2 and Day 3 in the execution timeline from "all 6 models" / "6 new tables" to "all 10 new models" / "10 new tables" — these were stale references to the pre-remediation table count.

---

## Summary of All Changes

### `docs/blueprint/09-PRISMA-SCHEMA.md`

| What | Where | Why |
|---|---|---|
| Removed `relatedDeal Deal? @relation(...)` from Task model | Task model, relations block | RC-1: DEF-1 migration blocker |
| Added comment on `relatedDealId` field in Task model | Task model, field declaration | RC-1 |
| Changed `tasks Task[]` to comment in Deal model | Deal model, relations | RC-1 |
| Removed `@@unique([organizationId, objectType, fieldKey])` from CustomFieldDefinition | CustomFieldDefinition model | RC-2: DEF-4 |
| Added comment block documenting partial unique index requirement | Above CustomFieldDefinition model | RC-2 |
| Added plan-limits tier breakdown to comment | CustomFieldDefinition comment | RC-2 + DEF-10 |
| Added 7-line partition PK warning comment | Above Activity model | RC-3: DEF-6 |
| Added `@@index([organizationId, createdAt(sort: Desc)])` to Activity | Activity model | RC-5: DEF-2 |
| Updated Activity immutability comment to name triggers | Activity model | RC-3 (clarity) |
| Added `lastStripeEventAt DateTime?` and `lastSyncedAt DateTime?` to Subscription | Subscription model | RC-4: DEF-5 |
| Added `@@index([organizationId, createdFromLeadId])` to Contact | Contact model | RC-6: DEF-3 |
| Added `instagramConversations InstagramConversation[]` to Contact | Contact model, relations | DEF-7 |
| Added `relatedContact Contact? @relation(...)` to InstagramConversation | InstagramConversation model | DEF-7 |

### `docs/blueprint/08-DATABASE-DESIGN.md`

| What | Where | Why |
|---|---|---|
| Updated FTS index to include `WHERE deleted_at IS NULL` and `phone` | §8.7 Indexes Summary | RC-9: DEF-11a |
| Added `(organizationId, createdFromLeadId)` to contacts index list | §contacts table indexes | RC-6: DEF-3 |

### `docs/planning/SPRINT_4_EXECUTION_PLAN.md`

| What | Where | Why |
|---|---|---|
| Changed "11 tenant tables" → "15 tenant tables" | §3 Infrastructure & CI acceptance criteria | RC-10: DEF-11b |
| Added CRM-1.2a: Deferred FK schedule (6 FKs with Sprint targets and ALTER TABLE SQL) | Between CRM-1.2 and CRM-1.3 | RC-11: R-7 |
| Updated 0007_crm_indexes row to include `createdFromLeadId` and `(organizationId, createdAt DESC)` indexes | CRM-1.2 migration table | RC-5 + RC-6 |
| Replaced shared package additions list with hard-gate table (RC-7, RC-8) | CRM-1.1 shared package additions | RC-7: DEF-8, RC-8: DEF-9 |
| Updated Day 2/3 to "10 new models" / "10 new tables" | Day plan | Stale count |

---

## Remaining Risks (inherited from SPRINT_4_SCHEMA_FINAL_SIGNOFF.md §12)

These risks are acknowledged and not addressed by schema documentation changes — they require operational or implementation care:

| Risk | Status | Owner |
|---|---|---|
| **R-1:** `refresh_tokens` in TENANT_TABLES has no `organizationId` — RLS policy must use a different scoping mechanism | Pre-existing Sprint 3 concern; out of Sprint 4 scope. Sprint 3 signoff must clarify the RLS policy form for this table. | Sprint 3 / Platform team |
| **R-2:** Activity custom migration vs Prisma migration conflict — Prisma may attempt to auto-generate `CREATE TABLE activities` without partitioning, or add FK constraints from the `@relation` directives | Implementation gate: migration author must use `--create-only` or custom migration path. Never run `prisma migrate dev` on `activities` without verifying the generated SQL matches the hand-authored DDL. | E1 migration author |
| **R-3:** Actual `prisma/schema.prisma` file still has stale Task.relatedDeal relation | The planning doc `09-PRISMA-SCHEMA.md` is now correct. The actual `prisma/schema.prisma` file must be updated in sync during E1 implementation. | E1 implementation |
| **R-4:** `events.ts` format inconsistency (dot-notation vs SCREAMING_SNAKE_CASE) will cause silent Sprint 7 failures | Documented as RC-7 gate; must be resolved before E2 code. Not a schema doc fix. | E2 sprint engineer |
| **R-5:** Non-partial unique on `custom_field_definitions` in actual `prisma/schema.prisma` | `09-PRISMA-SCHEMA.md` is now correct (@@unique removed). The actual schema file must not have `@@unique` added. Migration author must write the partial unique index SQL by hand. | E1 migration author |
| **R-6:** File storage orphan accumulation | Accepted as Sprint 8 / pre-launch item. | Sprint 8 |
| **R-7:** Sprint 5 deferred FK actions | Now documented in CRM-1.2a. Execution is Sprint 5's responsibility. | Sprint 5 lead |

---

## Re-Review Assessment

**No full schema re-review is required before M1 begins.**

The original verdict was CONDITIONAL PASS blocked on RC-1, RC-2, and RC-4. All three are now resolved:

- **RC-1 (DEF-1 — migration 0006 blocker):** RESOLVED. Task.relatedDeal `@relation` removed. Migration 0006 will not attempt to create a FK to `deals`.
- **RC-2 (DEF-4 — partial unique index):** RESOLVED. `@@unique` removed from `CustomFieldDefinition`. Hand-authored partial unique index is documented for migration 0006.
- **RC-4 (DEF-5 — P0-6 fields missing):** RESOLVED. `lastStripeEventAt` and `lastSyncedAt` added to Subscription model.

The remaining required changes before migration authoring (RC-3, RC-5, RC-6) are also complete.

The pre-code gates (RC-7, RC-8) are documented as explicit blocking gates in the execution plan — they block E2 and E4 respectively, not M1 (E1).

**M1 (E1: Schema & RLS Foundation — CRM-1.1 through CRM-1.3) is APPROVED TO BEGIN.**

---

*No commits. No pushes. Planning documents only.*
*Next step: E1 implementation — create actual `prisma/schema.prisma` from `09-PRISMA-SCHEMA.md`, then author migration 0006_crm_tables.*
