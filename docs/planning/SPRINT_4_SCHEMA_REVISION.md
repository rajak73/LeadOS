# SPRINT_4_SCHEMA_REVISION.md

> **Sprint 4 — Schema Revision Record**
> Source of truth for all schema changes applied from `SPRINT_4_SCHEMA_REMEDIATION_PLAN.md`
> Date applied: 2026-06-19
> Files updated: `docs/blueprint/08-DATABASE-DESIGN.md`, `docs/blueprint/09-PRISMA-SCHEMA.md`, `docs/planning/SPRINT_4_EXECUTION_PLAN.md`
> Status: Planning documents updated. **No migrations written. No application code changed.**

---

## Summary of Changes

| Category | Before | After |
|---|---|---|
| Tables in migration 0006 | 6 | 10 |
| TENANT_TABLES total | 11 (5+6) | 15 (5+10) |
| check:rls expected count | 11 | 15 |
| Enums added | ActivityType (15), StorageProvider | ActivityType (19), StorageProvider, CustomFieldObjectType, CustomFieldType |
| leads.notes column | TEXT NULL | **Removed** |
| leads.pipelineStageId | FK → pipeline_stages | Plain UUID NULL (no FK) |
| leads.lastActivityAt | Missing | Added |
| leads.mergedIntoLeadId | Missing | Added |
| leads.instagramAccountId | Missing | Added |
| contacts.lastActivityAt | Missing | Added |
| notes.content type | TEXT | JSONB |
| activities table DDL | Standard CREATE TABLE | PARTITION BY RANGE(createdAt) |
| WON status path | PATCH-reachable | convert()-only |
| Source immutability | Convention | DB trigger |
| FTS index | No partial clause | WHERE deletedAt IS NULL |
| New tables | — | ai_scores, custom_field_definitions, team_invites, saved_replies |

---

## Change 1 — Remove `leads.notes TEXT NULL` (REC-6)

**Severity:** Critical
**Applied to:** `08-DATABASE-DESIGN.md` §leads table, `09-PRISMA-SCHEMA.md` Lead model, `SPRINT_4_EXECUTION_PLAN.md` CRM-1.1

**What changed:**
- `08-DATABASE-DESIGN.md`: Row `| notes | TEXT | NULL | Quick notes (not rich-text) |` removed from the leads table definition.
- `09-PRISMA-SCHEMA.md`: Field `notes String? @db.Text` removed from the `Lead` model.
- `SPRINT_4_EXECUTION_PLAN.md` CRM-1.1: `notes (TEXT)` removed from Lead key fields; note added that the column is removed and the Note model handles all note content.

**Rationale:** The `leads.notes` quick-note column and the `notes` table are two separate note-taking surfaces on the same entity. This fragments user history, splits the FTS index, and complicates workflow condition evaluation. With the dedicated `notes` table available, there is no use case for an additional scalar notes column. A "quick note at lead creation time" is handled by creating a `Note` record in the same `withTenant` transaction as the lead creation.

**Backward compatibility:** Not applicable — new tables, no production data.

---

## Change 2 — Delink `leads.pipelineStageId` FK constraint (REC-1)

**Severity:** Blocking
**Applied to:** `08-DATABASE-DESIGN.md` §leads table, `09-PRISMA-SCHEMA.md` Lead and PipelineStage models

**What changed:**
- `08-DATABASE-DESIGN.md`: Column note changed from `FK → pipeline_stages.id, NULL` to `NULL | ⚠ No FK constraint in Sprint 4 — deferred to Sprint 5`.
- `09-PRISMA-SCHEMA.md` Lead model: Removed `pipelineStage PipelineStage? @relation(fields: [pipelineStageId], references: [id])`. `pipelineStageId` remains as `String? @db.Uuid` with a code comment documenting the deferred FK.
- `09-PRISMA-SCHEMA.md` PipelineStage model: Removed `leads Lead[]` (the reverse side of the now-removed relation). Added comment: `// Lead.pipelineStageId FK is deferred to Sprint 5. No leads relation here until Sprint 5.`

**Rationale:** Migration `0006_crm_tables` cannot create a FK to `pipeline_stages.id` because `pipeline_stages` does not exist until Sprint 5. Postgres rejects the FK with `ERROR: referenced relation "pipeline_stages" does not exist`, blocking all Sprint 4 migrations from running. The field is retained as a plain UUID column; the FK constraint is added in Sprint 5's migration after `pipeline_stages` is created.

**Sprint 5 action required:** `ALTER TABLE leads ADD CONSTRAINT leads_pipelineStageId_fkey FOREIGN KEY ("pipelineStageId") REFERENCES pipeline_stages(id) ON DELETE SET NULL;`

**Backward compatibility:** Not applicable — new tables.

---

## Change 3 — Add `leads.lastActivityAt` and `contacts.lastActivityAt` (REC-5)

**Severity:** Critical
**Applied to:** `08-DATABASE-DESIGN.md` §leads and §contacts tables, `09-PRISMA-SCHEMA.md` Lead and Contact models, `SPRINT_4_EXECUTION_PLAN.md` CRM-1.1, CRM-4.1, CRM-6.1

**What changed:**
- `08-DATABASE-DESIGN.md`: Row `| lastActivityAt | TIMESTAMP | NULL | Write-through from ActivityService.append(); enables O(1) sort on lead list |` added to leads table. Same column added to contacts table.
- `09-PRISMA-SCHEMA.md`: `lastActivityAt DateTime?` field added to Lead and Contact models. Index `@@index([organizationId, lastActivityAt(sort: Desc)])` added to both models.
- `SPRINT_4_EXECUTION_PLAN.md` CRM-4.1 (ActivityService): `append()` now documents the write-through contract — after inserting the activity row, if `relatedLeadId` is set, updates `leads.lastActivityAt = now()` in the same transaction; same for `relatedContactId`.
- `SPRINT_4_EXECUTION_PLAN.md` CRM-6.1: `lastActivityAt` added to the allowed sort columns.

**Rationale:** The lead list query (E6) supports sort by "last activity." Without a denormalized column, sorting by last activity requires `GROUP BY leads.id + MAX(activities.createdAt)` — an O(n*m) aggregation on every list query that cannot use the lead index. With a write-through column, the sort is O(1) using `(organizationId, lastActivityAt DESC NULLS LAST)`. The AI scoring model also uses "days since last activity" for staleness detection without a DB round-trip.

**Backward compatibility:** Not applicable — new tables.

---

## Change 4 — Add `leads.instagramAccountId` (REC-9)

**Severity:** High
**Applied to:** `08-DATABASE-DESIGN.md` §leads table, `09-PRISMA-SCHEMA.md` Lead model

**What changed:**
- `08-DATABASE-DESIGN.md`: Row `| instagramAccountId | UUID | NULL | ⚠ No FK constraint in Sprint 4 — deferred to Sprint 6 |` added to leads table.
- `09-PRISMA-SCHEMA.md`: `instagramAccountId String? @db.Uuid` field added to Lead model with comment `// deferred FK → instagram_accounts (Sprint 6)`.

**Rationale:** `leads.instagramUserId` (the Meta IGSID) identifies the lead's Instagram identity, not which of the org's Instagram accounts the lead came from. For an agency managing multiple IG accounts, this attribution is the core value proposition. Adding `instagramAccountId` as a plain UUID now (no FK, since `instagram_accounts` is Sprint 6) ensures the column exists when Sprint 6 webhook code populates it. Adding it after Sprint 6 ships requires a migration against a table with production data.

**Sprint 6 action required:** `ALTER TABLE leads ADD CONSTRAINT leads_instagramAccountId_fkey FOREIGN KEY ("instagramAccountId") REFERENCES instagram_accounts(id) ON DELETE SET NULL;`

**Backward compatibility:** Not applicable — new tables.

---

## Change 5 — Add `leads.mergedIntoLeadId` (REC-8)

**Severity:** High
**Applied to:** `08-DATABASE-DESIGN.md` §leads table, `09-PRISMA-SCHEMA.md` Lead model

**What changed:**
- `08-DATABASE-DESIGN.md`: Row `| mergedIntoLeadId | UUID | NULL | Set on merge (loser lead points to winner); no FK constraint in Sprint 4 |` added to leads table.
- `09-PRISMA-SCHEMA.md`: `mergedIntoLeadId String? @db.Uuid` field added to Lead model with comment `// deferred self-ref FK (merge milestone)`.

**Rationale:** FR-LEAD-007 specifies lead merge (combining activity history). Sprint 4 implements dedup detection (409) but defers merge. When merge is implemented, the "loser" lead must trace to the "winner." Without this column, a soft-deleted lead from a merge is indistinguishable from a normal deletion or spam cleanup. Always NULL in Sprint 4.

**Merge milestone action required:** Add self-referencing FK constraint and implement merge service.

**Backward compatibility:** Not applicable — new tables.

---

## Change 6 — WON status: convert()-only path (REC-2)

**Severity:** Blocking (design decision affecting Zod schemas, service logic, and test acceptance criteria)
**Applied to:** `08-DATABASE-DESIGN.md` §leads table notes, `09-PRISMA-SCHEMA.md` Lead model comment, `SPRINT_4_EXECUTION_PLAN.md` CRM-2.2 and CRM-2.3

**What changed:**
- `08-DATABASE-DESIGN.md`: Status column notes updated to `WON only reachable via convert() — rejected on direct PATCH`.
- `09-PRISMA-SCHEMA.md`: Lead model comment block documents the WON invariant.
- `SPRINT_4_EXECUTION_PLAN.md` CRM-2.2: `update()` description updated — WON is explicitly rejected on direct PATCH with `400 INVALID_STATUS_TRANSITION`.
- `SPRINT_4_EXECUTION_PLAN.md` CRM-2.3: Status machine section rewritten to clearly separate "direct PATCH transitions" (excludes WON) from "convert()-only transitions" (WON). `PatchLeadInput` Zod schema documented to exclude `WON`.

**Rationale:** Without this constraint, `WON` is reachable via two paths: `convert()` (creates a contact atomically; `convertedToContactId IS NOT NULL`) and direct PATCH (does not create a contact; `convertedToContactId IS NULL`). This ambiguity means the query `WHERE status = 'WON'` cannot determine whether a customer record exists. Customer 360 construction is unreliable. Option A (convert()-only) is selected because the primary personas (agency owners, clinic owners) expect that winning a lead means creating a customer record.

**Backward compatibility:** Not applicable — new tables.

---

## Change 7 — `activities` table: partition + triggers + CHECK constraint (REC-12, REC-13)

**Severity:** High (must be day-one; cannot add partitioning after data exists without a full table rewrite)
**Applied to:** `08-DATABASE-DESIGN.md` §activities table, `09-PRISMA-SCHEMA.md` Activity model comment, `SPRINT_4_EXECUTION_PLAN.md` CRM-1.1, CRM-1.2

**What changed:**
- `08-DATABASE-DESIGN.md`: Activities table definition completely rewritten. Added: PARTITION BY RANGE(createdAt), CHECK constraint, immutability triggers, canonical 19-value ActivityType enum, partitions documentation, indexed columns documentation.
- `09-PRISMA-SCHEMA.md`: Activity model comment block documents partitioning and immutability trigger requirement. No Prisma model field changes (Prisma treats partitioned tables as regular models; the DDL is hand-authored in the custom migration).
- `SPRINT_4_EXECUTION_PLAN.md` CRM-1.1: Activity key fields updated to document PARTITION BY RANGE, CHECK constraint, triggers. CRM-1.2: Migration 0006 checklist updated to include partitioned DDL, triggers, and initial partitions.

**Rationale:** `activities` is the highest-insert table in the system — every mutation on every entity emits one or more rows. Per `FINAL_ARCHITECTURE.md §7.3` / SC-1 / DB-2, partitioned table structures must be created early for `activities` and `audit_logs`. Adding Postgres PARTITION BY RANGE to an existing non-partitioned table at scale requires recreating the table (REINDEX, FK drops, data copy, rename — a multi-hour maintenance window). The table starts empty in Sprint 4; partitioning is trivially cheap at creation time.

The CHECK constraint (`relatedLeadId IS NOT NULL OR relatedDealId IS NOT NULL OR relatedContactId IS NOT NULL`) prevents orphaned activity records that have no entity to display under.

The DB triggers (`activities_no_update`, `activities_no_delete`) enforce immutability at the database layer, independent of the ORM. Belt + suspenders: the service layer has no update/delete methods, and the DB rejects any that are accidentally added.

**Backward compatibility:** Not applicable — new tables.

---

## Change 8 — `notes.content`: TEXT → JSONB (REC-14)

**Severity:** Medium (must be decided before E5 code)
**Applied to:** `08-DATABASE-DESIGN.md` §notes table, `09-PRISMA-SCHEMA.md` Note model, `SPRINT_4_EXECUTION_PLAN.md` CRM-5.1

**What changed:**
- `08-DATABASE-DESIGN.md`: Notes table `content` column type changed from `TEXT NOT NULL | Rich text (HTML/JSON)` to `JSONB NOT NULL DEFAULT '{}' | ProseMirror/Tiptap document`.
- `09-PRISMA-SCHEMA.md`: Note model field changed from `content String @db.Text` to `content Json @default("{}")`. Comment added: "Never render content as raw HTML."
- `SPRINT_4_EXECUTION_PLAN.md` CRM-5.1: `create()` description updated to specify JSONB Tiptap format.

**Rationale:** `notes.content TEXT` described as "Rich text (HTML/JSON)" was ambiguous and risked stored XSS if raw HTML was stored and rendered without sanitization. Selecting ProseMirror/Tiptap JSON as the canonical format: (a) cannot be directly executed as XSS — it is a plain JSON document; (b) is rendered by the Tiptap editor in read mode on the frontend; (c) for workflow/email interpolation, `toPlainText(doc)` produces safe plain text; (d) for future FTS, the text nodes are extractable from the JSON structure.

**Backward compatibility:** Not applicable — new tables.

---

## Change 9 — ActivityType enum: canonicalized to 19 values (REC-7, REC-15)

**Severity:** High
**Applied to:** `08-DATABASE-DESIGN.md` §activities table, `09-PRISMA-SCHEMA.md` ActivityType enum, `SPRINT_4_EXECUTION_PLAN.md` CRM-1.1

**What changed:**
- `09-PRISMA-SCHEMA.md` ActivityType enum updated from 15 values to canonical 19:
  - **Added:** `LEAD_WON`, `LEAD_LOST`, `CONTACT_UPDATED`, `TASK_CANCELLED`, `NOTE_UPDATED`, `NOTE_DELETED`, `FILE_DELETED`, `DEAL_STAGE_MOVED`
  - **Renamed:** `DEAL_STAGE_CHANGED` → `DEAL_STAGE_MOVED`
  - **Removed:** `MESSAGE_SENT`, `MESSAGE_RECEIVED` (Inbox module — Sprint 6), `CALL_LOGGED` (not in canonical set)
- `09-PRISMA-SCHEMA.md`: Comment above enum documents the `ActivityMetadata` discriminated union contract and event name constant mandate.
- `08-DATABASE-DESIGN.md` §activities: Canonical 19-value list documented.
- `SPRINT_4_EXECUTION_PLAN.md` CRM-1.1: ActivityType values updated.

**Rationale:** The Workflow Engine (Sprint 7) evaluates conditions against activity metadata fields. If `DEAL_STAGE_CHANGED` is emitted but the workflow trigger checks for `DEAL_STAGE_MOVED`, the trigger silently never fires. Canonicalizing the enum now — before any domain code is written — ensures all domain services (Lead, Contact, Task, Note, File) emit the exact same string values that Workflow conditions will later evaluate. `MESSAGE_SENT`/`MESSAGE_RECEIVED` are deferred to Sprint 6 when the Inbox module introduces them.

The two new shared-package requirements documented in CRM-1.1:
- `packages/shared/src/types/activity-metadata.ts` — `ActivityMetadata` discriminated union (before E4 code)
- `packages/shared/src/constants/events.ts` — event name constants matching ActivityType values (before E2 code)

**Backward compatibility:** Not applicable — new tables and new enum (no migration has run yet).

---

## Change 10 — `leads.source` immutability: DB trigger (REC-16)

**Severity:** Medium
**Applied to:** `08-DATABASE-DESIGN.md` §leads table, `09-PRISMA-SCHEMA.md` Lead model comment, `SPRINT_4_EXECUTION_PLAN.md` CRM-1.2

**What changed:**
- `08-DATABASE-DESIGN.md`: Source column updated to note `**Immutable after creation** — enforced by leads_source_immutable DB trigger`. Trigger description added under table definition.
- `09-PRISMA-SCHEMA.md`: Lead model comment block documents `leads_source_immutable` trigger.
- `SPRINT_4_EXECUTION_PLAN.md` CRM-1.2: Migration 0006 checklist includes `DB trigger: leads_source_immutable`.

**Trigger SQL pattern (for migration 0006):**
```sql
CREATE FUNCTION prevent_lead_source_update() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.source IS DISTINCT FROM OLD.source THEN
    RAISE EXCEPTION 'leads.source is immutable after creation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leads_source_immutable
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION prevent_lead_source_update();
```

**Rationale:** Source attribution tells the org permanently how the lead was acquired (Instagram DM, manual entry, CSV import, etc.). Changing source after creation corrupts historical reporting. Service-layer conventions are bypassed by future direct repository calls, admin scripts, and migrations. A DB trigger cannot be accidentally bypassed and costs nothing at query time (only fires on UPDATE with a changed source column).

**Backward compatibility:** Not applicable — new tables.

---

## Change 11 — Partial FTS index: `WHERE deletedAt IS NULL` + phone added (REC-17)

**Severity:** Medium
**Applied to:** `08-DATABASE-DESIGN.md` §leads table indexes, `SPRINT_4_EXECUTION_PLAN.md` CRM-1.2

**What changed:**
- `08-DATABASE-DESIGN.md`: FTS index definition updated to: `GIN to_tsvector(...coalesce(phone,'')...) WHERE deletedAt IS NULL`. Phone added to indexed columns. Partial clause added.
- `SPRINT_4_EXECUTION_PLAN.md`: Migration 0007 checklist updated to note partial FTS index.

**Rationale:** The GIN tsvector index without a `WHERE` clause includes all soft-deleted rows. At multi-tenant scale with frequent lead deletion (spam leads, dedup merges, test data), the index grows proportionally to all rows ever created rather than just active ones. The partial index reduces index size and maintenance cost. Phone is added because FR-LEAD-005 specifies phone search, and the blueprint FTS index omitted it.

**Backward compatibility:** Not applicable — new index on a new table.

---

## Change 12 — New table: `ai_scores` (REC-3)

**Severity:** Critical
**Applied to:** `08-DATABASE-DESIGN.md` (new section), `09-PRISMA-SCHEMA.md` (new AiScore model), `SPRINT_4_EXECUTION_PLAN.md` CRM-1.1, CRM-1.2, CRM-1.3

**What changed:**
- `08-DATABASE-DESIGN.md`: New `### ai_scores` section added between `files` and `instagram_accounts`.
- `09-PRISMA-SCHEMA.md`: New `AiScore` model added in the "SPRINT 4 — NEW MODELS" section. Relation `aiScores AiScore[]` added to Lead model. Relation `aiScores AiScore[]` added to Organization model.
- `SPRINT_4_EXECUTION_PLAN.md`: `AiScore` added to CRM-1.1 model table. CRM-1.2 migration 0006 includes `ai_scores`. CRM-1.3 TENANT_TABLES count updated to include `aiScore`.

**Schema:** `id, organizationId, leadId, score, confidence, factors (Json), recommendation, triggeredBy, modelVersion, createdAt`. Immutable (no updatedAt, no deletedAt).

**Rationale:** The original plan encoded AI scoring as `leads.aiScore SMALLINT` and `leads.aiScoreUpdatedAt`. The AI layer (doc 13) outputs structured data: confidence, factors breakdown, recommendation text. FR-LEAD-004 requires "score breakdown tooltip: what drove the score" — impossible with two scalars. Historical scores are required by Opportunity Detection (score jump ≥20 points). `leads.aiScore` and `leads.aiScoreUpdatedAt` are retained as a denormalized read cache (fast list query); `ai_scores` stores the full structured output and history. Sprint 7 writes here; Sprint 4 creates the empty table.

**Backward compatibility:** Not applicable — new table.

---

## Change 13 — New table: `custom_field_definitions` (REC-4)

**Severity:** Critical
**Applied to:** `08-DATABASE-DESIGN.md` (new section), `09-PRISMA-SCHEMA.md` (new CustomFieldDefinition model + 2 new enums), `SPRINT_4_EXECUTION_PLAN.md` CRM-1.1, CRM-1.2, CRM-1.3

**What changed:**
- `08-DATABASE-DESIGN.md`: New `### custom_field_definitions` section added.
- `09-PRISMA-SCHEMA.md`: New enums `CustomFieldObjectType` (LEAD, CONTACT, DEAL) and `CustomFieldType` (TEXT, NUMBER, DATE, SELECT, MULTI_SELECT, BOOLEAN, URL) added. New `CustomFieldDefinition` model added with all fields, constraints, and indexes. Relations added to Organization and User models.
- `SPRINT_4_EXECUTION_PLAN.md`: `CustomFieldDefinition` added to CRM-1.1 model table. New enums documented. CRM-1.2 migration 0006 includes `custom_field_definitions`. CRM-1.3 updated.

**Schema:** `id, organizationId, objectType (LEAD|CONTACT|DEAL), fieldKey, displayLabel, fieldType, options (Json?), isRequired, position, createdById, deletedAt`.

**Rationale:** FR-LEAD-009 requires org admins to create custom fields with types including `SELECT` and `MULTI_SELECT`. Without a definitions table: the UI cannot render the "Custom Fields" settings section (no list of what fields exist); select/multi-select options have nowhere to live; `PLAN_LIMITS.customFieldsPerObject = 50` cannot be enforced; API cannot validate that a key in `customFields` JSONB corresponds to a defined field. The existing `customFields JSONB DEFAULT '{}'` columns on leads/contacts remain as the value store; this table provides the schema that gives those JSONB blobs meaning.

**Backward compatibility:** Not applicable — new table.

---

## Change 14 — New table: `team_invites` (REC-10)

**Severity:** High
**Applied to:** `08-DATABASE-DESIGN.md` (new section), `09-PRISMA-SCHEMA.md` (new TeamInvite model), `SPRINT_4_EXECUTION_PLAN.md` CRM-1.1, CRM-1.2, CRM-1.3

**What changed:**
- `08-DATABASE-DESIGN.md`: New `### team_invites` section added.
- `09-PRISMA-SCHEMA.md`: New `TeamInvite` model added with `tokenHash`, `invitedById`, `expiresAt`, `acceptedAt`, `revokedAt`. Relation `teamInvites TeamInvite[]` added to Organization, Role, and User models.
- `SPRINT_4_EXECUTION_PLAN.md`: `TeamInvite` added to CRM-1.1 model table. CRM-1.2, CRM-1.3 updated.

**Schema:** `id, organizationId, email, roleId, tokenHash (SHA-256), invitedById, expiresAt, acceptedAt, revokedAt, createdAt`.

**Rationale:** Team member invitations (magic link, 7-day expiry) require storing the token server-side. The `organization_members` table has `invitedBy` and `invitedAt` columns, indicating invites were planned, but no token store exists in Sprints 1–3. Without a token table, invite links cannot be issued or validated. The auth path reads `team_invites` using the admin `prisma` client (same D-M3-2 boundary as other auth-path reads — correct by design).

**Backward compatibility:** Not applicable — new table.

---

## Change 15 — New shell table: `saved_replies` (REC-11)

**Severity:** High (RLS setup must happen now to avoid mid-stream TENANT_TABLES changes in Sprint 6)
**Applied to:** `08-DATABASE-DESIGN.md` (new section), `09-PRISMA-SCHEMA.md` (new SavedReply model), `SPRINT_4_EXECUTION_PLAN.md` CRM-1.1, CRM-1.2, CRM-1.3

**What changed:**
- `08-DATABASE-DESIGN.md`: New `### saved_replies` section added with shell table note.
- `09-PRISMA-SCHEMA.md`: New `SavedReply` model added. Relations added to Organization and User models.
- `SPRINT_4_EXECUTION_PLAN.md`: `SavedReply (shell)` added to CRM-1.1 model table. CRM-1.2, CRM-1.3 updated.

**Schema:** `id, organizationId, title, content, shortcut, isGlobal, createdById, deletedAt`. No routes or service code in Sprint 4.

**Rationale:** FR-INBOX-006 specifies saved reply templates ("`/` shortcut"). This is an Inbox feature (Sprint 6), but `saved_replies` is a tenant-scoped table. If created in Sprint 6, the TENANT_TABLES count changes mid-stream, `check:rls` expected count changes, and the Sprint 4 isolation suite must re-baseline. Creating the shell now avoids all of this: the table exists with RLS from day one, Sprint 6 only adds routes and service code.

**Backward compatibility:** Not applicable — new table.

---

## Change 16 — ER Diagram updated (all changes)

**Applied to:** `08-DATABASE-DESIGN.md` §8.2

**What changed:** The conceptual ER diagram rewritten to reflect:
- Four new Sprint 4 tables (ai_scores, custom_field_definitions, saved_replies, team_invites)
- Activities marked as partitioned
- Leads showing all children (activities, tasks, notes, files, ai_scores) with deferred FK columns called out
- Contacts showing all children
- Sprint labels added for clarity (Sprint 5 = Pipeline/Deals, Sprint 6 = Instagram, Sprint 9 = WhatsApp, Sprint 7 = Workflows)
- audit_logs marked as partitioned (Sprint 3 — already exists)

---

## Change 17 — Contact model: named relations added (housekeeping)

**Applied to:** `09-PRISMA-SCHEMA.md` Contact model

**What changed:**
- Added named relations `"ContactAssignee"` and `"ContactCreator"` to `assignedTo` and `createdBy` fields in Contact model.
- Added `createdBy User @relation("ContactCreator", ...)` field (was missing from the original Contact model — Prisma requires an explicit `createdBy` relation when `createdById` is present and the User model has a reverse relation).
- Added `@@index([organizationId, assignedToId])` to Contact model (was missing; the text schema mentioned it but the Prisma model did not have it).

**Rationale:** The original Contact model was missing explicit relation names and the `createdBy` relation field, which would cause Prisma generation to fail or require implicit relation inference. These are housekeeping fixes discovered during the remediation update, kept minimal to not exceed the scope of the task.

---

## Change 18 — File model: named relations + missing indexes added (housekeeping)

**Applied to:** `09-PRISMA-SCHEMA.md` File model

**What changed:**
- `uploadedBy` relation given named relation `"FileUploader"` to match the User model's `uploadedFiles File[] @relation("FileUploader")`.
- Removed `relatedDeal Deal?` relation from File model (deals table does not exist in Sprint 4; `relatedDealId` becomes a plain UUID column with deferred FK, same pattern as other Sprint 5 FK deferrals).
- Added `@@index([organizationId, relatedLeadId])` and `@@index([organizationId, relatedContactId])` to File model.

**Rationale:** Named relations required to avoid Prisma schema ambiguity errors when multiple relations exist between the same two models.

---

## Updated TENANT_TABLES Registry

After all changes, `core/tenancy/tenant-tables.ts` must register **15 tables**:

| # | Prisma model key | Table | Sprint introduced |
|---|---|---|---|
| 1 | `organizationMember` | organization_members | Sprint 3 |
| 2 | `role` | roles | Sprint 3 |
| 3 | `subscription` | subscriptions | Sprint 3 |
| 4 | `refreshToken` | refresh_tokens | Sprint 3 |
| 5 | `auditLog` | audit_logs | Sprint 3 |
| 6 | `lead` | leads | Sprint 4 |
| 7 | `contact` | contacts | Sprint 4 |
| 8 | `task` | tasks | Sprint 4 |
| 9 | `activity` | activities | Sprint 4 |
| 10 | `note` | notes | Sprint 4 |
| 11 | `file` | files | Sprint 4 |
| 12 | `aiScore` | ai_scores | Sprint 4 |
| 13 | `customFieldDefinition` | custom_field_definitions | Sprint 4 |
| 14 | `teamInvite` | team_invites | Sprint 4 |
| 15 | `savedReply` | saved_replies | Sprint 4 |

`check:rls` expected output: `OK — 15 tenant tables enabled + forced + policied`

---

## Files Modified

| File | Sections changed | Type of change |
|---|---|---|
| `docs/blueprint/08-DATABASE-DESIGN.md` | §8.2 ER diagram; §leads; §contacts; §activities; §notes; added §ai_scores, §custom_field_definitions, §team_invites, §saved_replies | Updated + added |
| `docs/blueprint/09-PRISMA-SCHEMA.md` | ActivityType enum; new CustomFieldObjectType, CustomFieldType enums; Lead model; Contact model; PipelineStage model; Note model; File model; new AiScore, CustomFieldDefinition, TeamInvite, SavedReply models; Organization model; User model; Role model | Updated + added |
| `docs/planning/SPRINT_4_EXECUTION_PLAN.md` | CRM-1.1 model table; CRM-1.2 migrations; CRM-1.3 TENANT_TABLES; CRM-2.2 update() service; CRM-2.3 status machine; CRM-4.1 ActivityService; CRM-5.1 notes service; CRM-6.1 sorting | Updated |

---

## What Is NOT Changed

- `prisma/schema.prisma` — actual Prisma schema file (no migrations written)
- Any application source code
- Test files
- Migration files (none created)
- `FINAL_ARCHITECTURE.md` (these changes are consistent with its mandates; no contradiction)
- `packages/shared/src/constants/enums.ts` (enum values documented; not yet written — to be done before E2 code in M1)

---

*Schema planning only. No code. No migrations. No commits.*
*Next step: implement migration 0006_crm_tables per the complete table definitions above.*
