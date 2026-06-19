# SPRINT_4_SCHEMA_APPROVAL.md

> **Gate Review — RC-1 through RC-11 Defect Verification**
> Reviewer: Independent Senior Engineer (final gate review)
> Date: 2026-06-19
> Scope: Post-remediation verification only. Confirms that each RC item from `SPRINT_4_SCHEMA_FINAL_SIGNOFF.md` was correctly applied to planning documents. Read-only. No files modified.
> Files reviewed (in full):
> - `docs/planning/SPRINT_4_SCHEMA_FINAL_SIGNOFF.md` (original audit, RC definitions)
> - `docs/planning/SPRINT_4_SCHEMA_SIGNOFF_REMEDIATION.md` (remediation record)
> - `docs/blueprint/09-PRISMA-SCHEMA.md` (primary target)
> - `docs/blueprint/08-DATABASE-DESIGN.md` (secondary target)
> - `docs/planning/SPRINT_4_EXECUTION_PLAN.md` (tertiary target)

---

## 1. Overall Verdict

**PASS**

All eleven required change items (RC-1 through RC-11) have been correctly applied to the target planning documents. DEF-7 (Contact.instagramConversations reverse relation) was also correctly resolved. No new defects were introduced by the fixes. The schema documents are consistent with one another and with the execution plan. Pre-code gates (RC-7, RC-8) are properly documented as hard blocking gates before E2 and E4 respectively.

---

## 2. RC Verification Table

| RC | Severity | Description | Status | Evidence (file + line numbers) | Notes |
|---|---|---|---|---|---|
| **RC-1** | HIGH | Remove Task.relatedDeal @relation; remove Deal.tasks []; relatedDealId plain UUID; Sprint 5 ALTER TABLE documented | **VERIFIED** | 09-PRISMA-SCHEMA.md lines 639–653: `relatedDealId String? @db.Uuid` with inline comment `// no FK in Sprint 4...`; comment block lines 650–652 documents the deferral and Sprint 5 ALTER TABLE SQL. Deal model line 612: `// tasks Task[] relation deferred to Sprint 5...` (live relation removed). No `@relation` to Deal in Task model; no `tasks Task[]` in Deal model. | FULLY CORRECT. The @relation is gone (not commented out). The Deal model comment replaces what was a live `tasks Task[]` reverse relation. |
| **RC-2** | MEDIUM | Remove @@unique from CustomFieldDefinition; document hand-authored partial unique index in 0006; @@unique must be GONE | **VERIFIED** | 09-PRISMA-SCHEMA.md lines 773–806: comment block above model (lines 778–783) explains why @@unique is absent and provides the exact `CREATE UNIQUE INDEX ... WHERE "deletedAt" IS NULL` SQL. Line 802: `// @@unique intentionally absent — partial unique index is hand-authored in migration 0006_crm_tables`. No `@@unique` block present in the model. | FULLY CORRECT. The @@unique directive is absent — not commented out, genuinely gone. The hand-authored SQL is documented. |
| **RC-3** | LOW | Add comment to Activity model that Postgres requires partition key (createdAt) in PK; comment must state PRIMARY KEY (id, "createdAt") | **VERIFIED** | 09-PRISMA-SCHEMA.md lines 660–666: seven-line comment block beginning `// Activity — append-only immutable log. PARTITIONED BY RANGE(createdAt).` followed by `// ⚠ PARTITION PK NOTE: Postgres requires the partition key to be part of the primary key.` The comment explicitly states `PRIMARY KEY (id, "createdAt") — NOT PRIMARY KEY (id)` and warns that `prisma migrate dev` must not be used for this table. | FULLY CORRECT. Comment is at the model declaration level, before any field, unmissable. |
| **RC-4** | MEDIUM | Add lastStripeEventAt DateTime? and lastSyncedAt DateTime? to Subscription model | **VERIFIED** | 09-PRISMA-SCHEMA.md lines 1048–1050: `// P0-6: required for Stripe webhook idempotency and reconciliation (FINAL_ARCHITECTURE.md §4.4)` followed by `lastStripeEventAt DateTime?` (line 1049) and `lastSyncedAt DateTime?` (line 1050). Both fields are present in the Subscription model body, not merely in the document header. | FULLY CORRECT. Fields are in the model. The document header's "⚠ UPDATED" note (line 10) is now implemented. |
| **RC-5** | MEDIUM | Add @@index([organizationId, createdAt(sort: Desc)]) to Activity model; update 0007_crm_indexes in execution plan | **VERIFIED** | 09-PRISMA-SCHEMA.md line 687: `@@index([organizationId, createdAt(sort: Desc)])` — first index in the Activity model's @@index block, preceding the three entity-scoped indexes (lines 688–690). SPRINT_4_EXECUTION_PLAN.md line 150: `0007_crm_indexes` row explicitly lists `Index (organizationId, createdAt DESC) on activities (org-level timeline queries)`. | FULLY CORRECT. Index is present in the model and documented in the migration checklist. |
| **RC-6** | MEDIUM | Add @@index([organizationId, createdFromLeadId]) to Contact model; add to 08 contacts index list; add to 0007_crm_indexes in execution plan | **VERIFIED** | 09-PRISMA-SCHEMA.md line 530: `@@index([organizationId, createdFromLeadId])` in Contact model. 08-DATABASE-DESIGN.md line 248: contacts indexes list includes `(organizationId, createdFromLeadId) ← required for POST /leads/:id/convert idempotency check`. SPRINT_4_EXECUTION_PLAN.md line 150: `0007_crm_indexes` row includes `Index (organizationId, createdFromLeadId) on contacts (convert idempotency check)`. | FULLY CORRECT. All three locations updated. |
| **RC-7** | MEDIUM | Make events.ts update (all 19 ActivityType constants, rename DEAL_STAGE_CHANGED → DEAL_STAGE_MOVED) an explicit hard gate before E2 begins in SPRINT_4_EXECUTION_PLAN.md | **VERIFIED** | SPRINT_4_EXECUTION_PLAN.md lines 134–141: formal two-row table under "Shared package additions — HARD GATES (block specific E-steps)". Row 1: `packages/shared/src/constants/events.ts` | `E2 starts` | specifying all 19 ActivityType constants in SCREAMING_SNAKE_CASE, rename of `DEAL_STAGE_CHANGED` → `DEAL_STAGE_MOVED`, and update of all emit sites. Warning note (R-4) on lines 141: explicitly calls out the format inconsistency risk and silent Sprint 7 failure scenario. | FULLY CORRECT. Gate is explicit, machine-readable, and unambiguously blocks E2. |
| **RC-8** | MEDIUM | Make activity-metadata.ts creation an explicit hard gate before E4 begins in SPRINT_4_EXECUTION_PLAN.md | **VERIFIED** | SPRINT_4_EXECUTION_PLAN.md lines 134–139: second row in the HARD GATES table: `packages/shared/src/types/activity-metadata.ts` | `E4 starts` | specifying the ActivityMetadata discriminated union with one variant per ActivityType value, required entity FK, and metadata shape. CRM-4.1 (line 331) references this file explicitly for the `ActivityAppendInput` type. | FULLY CORRECT. Gate is explicit and blocks E4 with the correct file and content requirements. |
| **RC-9** | LOW | Update 08-DATABASE-DESIGN.md §8.7 FTS index definition to include WHERE deleted_at IS NULL and phone | **VERIFIED** | 08-DATABASE-DESIGN.md lines 825–832: `idx_leads_search` index definition includes `coalesce(phone, '')` in the tsvector concatenation (line 830) and `WHERE deleted_at IS NULL` predicate (line 832). Comment on line 825 reads `-- Full text search on leads (partial — excludes soft-deleted rows; includes phone per FR-LEAD-005)`. | FULLY CORRECT. Both requirements (phone + WHERE clause) are present. §8.7 is now consistent with the §leads table definition. |
| **RC-10** | LOW | Change "11 tenant tables" → "15 tenant tables" in SPRINT_4_EXECUTION_PLAN.md §3 Infrastructure & CI acceptance criteria table | **VERIFIED** | SPRINT_4_EXECUTION_PLAN.md line 522: the Infrastructure & CI acceptance criteria table row reads `check:rls covers all 15 tenant tables` with proof `pnpm --filter @leados/api check:rls reports OK — 15 tenant tables enabled + forced + policied`. No stale "11" reference remains in §3. | FULLY CORRECT. The stale count is gone. |
| **RC-11** | MEDIUM | Document Sprint 5 ALTER TABLE actions for tasks.relatedDealId, notes.relatedDealId, files.relatedDealId (and leads.pipelineStageId) in SPRINT_4_EXECUTION_PLAN.md | **VERIFIED** | SPRINT_4_EXECUTION_PLAN.md lines 155–168: section `CRM-1.2a: Deferred FK schedule (Sprint 5 + Sprint 6 migration actions)` contains a formal six-row table listing all deferred FKs with target sprint and full ALTER TABLE SQL. Specifically: `leads.pipelineStageId` (Sprint 5, line 161), `tasks.relatedDealId` (Sprint 5, line 162), `notes.relatedDealId` (Sprint 5, line 163), `files.relatedDealId` (Sprint 5, line 164), `leads.instagramAccountId` (Sprint 6, line 165), `leads.mergedIntoLeadId` (Merge milestone, line 166). Closing note on line 168 mandates all four Sprint 5 statements be applied in a single migration. | FULLY CORRECT. All three required columns (tasks, notes, files) plus pipelineStageId documented. Section is in the authoritative execution plan, not only in the revision record. |

---

## 3. DEF-7 Verification

| Item | Status | Evidence | Notes |
|---|---|---|---|
| **DEF-7** — Contact.instagramConversations reverse relation; InstagramConversation.relatedContact @relation | **VERIFIED** | 09-PRISMA-SCHEMA.md line 524: `instagramConversations InstagramConversation[]` in Contact model relations block, with comment `// Sprint 6: reverse relation to InstagramConversation (relatedContactId side)`. Line 899: `relatedContact Contact? @relation(fields: [relatedContactId], references: [id])` in InstagramConversation model. Both sides of the relation are present. | FULLY CORRECT. Both the forward relation on InstagramConversation and the reverse relation on Contact are now symmetrical, matching the pattern used for the Lead side. |

---

## 4. Cross-Check Results

The following cross-checks were performed against the actual content of the three target files:

| Check | Result |
|---|---|
| Task model has NO `@relation` to Deal | PASS. Lines 627–657 of 09-PRISMA-SCHEMA.md: Task model relations are `organization`, `assignedTo`, `createdBy`, `relatedLead`, `relatedContact` only. No `relatedDeal` relation field. |
| Deal model has NO `tasks Task[]` as a live relation | PASS. Deal model (lines 580–621): the tasks line reads `// tasks Task[] relation deferred to Sprint 5 — tasks.relatedDealId FK is added in Sprint 5 migration` (line 612). It is a comment, not a live relation. |
| CustomFieldDefinition has NO `@@unique` block | PASS. CustomFieldDefinition model (lines 784–806): no `@@unique` directive present. Only `@@map` and `@@index` directives. |
| Activity model has BOTH partition PK comment AND @@index([organizationId, createdAt(sort: Desc)]) | PASS. Comment block lines 660–666; @@index on line 687. |
| Subscription model has both P0-6 fields | PASS. `lastStripeEventAt DateTime?` line 1049, `lastSyncedAt DateTime?` line 1050. |
| Contact model has createdFromLeadId index AND instagramConversations reverse relation | PASS. @@index line 530; instagramConversations line 524 (with Sprint 6 comment). |
| InstagramConversation has relatedContact Contact? @relation(...) | PASS. Line 899. |
| 08-DATABASE-DESIGN.md §8.7 FTS index has WHERE deleted_at IS NULL and phone | PASS. Lines 825–832. |
| SPRINT_4_EXECUTION_PLAN.md §3 acceptance criteria says "15 tenant tables" not "11" | PASS. Line 522. |
| SPRINT_4_EXECUTION_PLAN.md has deferred FK schedule listing tasks/notes/files.relatedDealId Sprint 5 actions | PASS. Lines 155–168. |
| SPRINT_4_EXECUTION_PLAN.md has explicit gates for events.ts (before E2) and activity-metadata.ts (before E4) | PASS. Lines 134–141 (hard gates table with blocking sprint assignments). |

---

## 5. New Defects Found

None. The remediation did not introduce any new defects and did not break any pre-existing correct content. The following observations are informational only:

**OBS-1 (Informational — not a defect):** The `08-DATABASE-DESIGN.md §tasks` table (lines 315–336) still lists `relatedDealId | UUID | FK → deals.id, NULL` without a note that the FK is deferred to Sprint 5. The authoritative `09-PRISMA-SCHEMA.md` and execution plan CRM-1.2a are correct and consistent with each other. The tasks table definition in 08 also does not carry the deferred note that the notes table definition does (line 388: `⚠ No FK in Sprint 4 — deals table is Sprint 5`). This is a minor documentation cosmetic inconsistency within 08 itself — it does not affect migration authoring because the execution plan CRM-1.2a is the authoritative deferred FK schedule and is correct. Not raised as a defect; noted for completeness.

**OBS-2 (Informational — not a defect):** The remediation record (`SPRINT_4_SCHEMA_SIGNOFF_REMEDIATION.md`) claims RC-5 added the `@@index([organizationId, createdAt(sort: Desc)])` "as the first index entry in the Activity model (before the entity-scoped indexes)". Actual position in 09-PRISMA-SCHEMA.md is line 687, which is indeed the first of the four @@index directives (lines 687–690). Claim is accurate.

---

## 6. Remaining Risks

The following risks are carried forward from `SPRINT_4_SCHEMA_FINAL_SIGNOFF.md §12` and `SPRINT_4_SCHEMA_SIGNOFF_REMEDIATION.md`. None of these were created by the remediation and none are new:

| Risk | Mitigation Status |
|---|---|
| **R-1: refresh_tokens in TENANT_TABLES without organizationId** | Pre-existing Sprint 3 concern. Sprint 4 planning documents correctly count 15 tenant tables including this one. The RLS policy for refresh_tokens must use userId scoping, not organizationId. This must be verified during E1 migration 0008 authoring. |
| **R-2: Activity custom migration vs Prisma migration conflict** | Migration author must use `--create-only` or a pure custom migration path for the activities table. The partition PK comment (RC-3) makes this explicit. Operational risk only. |
| **R-3: Actual prisma/schema.prisma still has stale Task.relatedDeal relation** | The planning doc `09-PRISMA-SCHEMA.md` is now correct. The actual file in `prisma/schema.prisma` must be updated in sync during E1. This is an implementation task, not a planning document defect. |
| **R-4: events.ts format inconsistency (dot-notation vs SCREAMING_SNAKE_CASE)** | Documented as a hard gate before E2 in the execution plan (RC-7 VERIFIED). Silent Sprint 7 failure if missed. The gate is explicit; enforcement is an E2 sprint responsibility. |
| **R-5: actual prisma/schema.prisma must not re-introduce @@unique on CustomFieldDefinition** | `09-PRISMA-SCHEMA.md` is correct. Migration author must not add @@unique when copying the schema. |
| **R-6: File storage orphan accumulation** | Accepted as Sprint 8 / pre-launch item. No action required for Sprint 4. |
| **R-7: Sprint 5 deferred FK actions** | Now documented in CRM-1.2a (RC-11 VERIFIED). Execution is Sprint 5's responsibility. |

---

## 7. Final Statement

All eleven RC items are VERIFIED. DEF-7 is VERIFIED. No RC item was found to be absent, partial, or incorrectly applied. The planning documents (`09-PRISMA-SCHEMA.md`, `08-DATABASE-DESIGN.md`, `SPRINT_4_EXECUTION_PLAN.md`) are internally consistent and correctly reflect all required changes.

**SPRINT 4 M1 APPROVED TO BEGIN.**

---

*Read-only gate review. No files modified except this approval document.*
*Source files reviewed: `SPRINT_4_SCHEMA_FINAL_SIGNOFF.md`, `SPRINT_4_SCHEMA_SIGNOFF_REMEDIATION.md`, `docs/blueprint/09-PRISMA-SCHEMA.md`, `docs/blueprint/08-DATABASE-DESIGN.md`, `docs/planning/SPRINT_4_EXECUTION_PLAN.md`.*
