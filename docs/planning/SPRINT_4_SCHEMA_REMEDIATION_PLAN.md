# SPRINT_4_SCHEMA_REMEDIATION_PLAN.md

> **Sprint 4 — CRM Schema Remediation Plan**
> Source of truth: `SPRINT_4_EXECUTION_PLAN.md`, `SPRINT_4_ARCHITECTURE_AUDIT.md`, `FINAL_ARCHITECTURE.md`, `docs/blueprint/08-DATABASE-DESIGN.md`
> Date: 2026-06-19
> Status: **PLANNING — no code, no schema, no migrations modified**

---

## Purpose

The architecture audit identified 20 findings across the Sprint 4 CRM data model. This document converts each finding into a discrete, implementable remediation, establishes the must-fix-before-M1 gate list, and produces:

1. Final remediated CRM schema (all tables, columns, constraints)
2. Updated TENANT_TABLES inventory (5 existing → 15 total)
3. Updated relationship diagram (text format)
4. Exact pre-migration-0006 change list

---

## Part 1 — Remediation Registry

### REC-1 — `pipelineStageId` FK cannot be created in Sprint 4

| | |
|---|---|
| **Severity** | BLOCKING |
| **Must fix before M1** | Yes |
| **Root cause** | `leads.pipelineStageId UUID FK → pipeline_stages.id` in migration `0006_crm_tables`, but `pipeline_stages` is a Sprint 5 table and does not exist when 0006 runs. Postgres will reject the FK with: `ERROR: referenced relation "pipeline_stages" does not exist`. This blocks all Sprint 4 migrations from running. |
| **Proposed schema change** | In `0006_crm_tables`: declare `pipelineStageId UUID NULL` as a **plain column with no FK constraint**. Add a migration comment: `-- FK to pipeline_stages.id deferred to Sprint 5 migration 0009_pipeline_fk`. |
| **Sprint 5 action** | Migration `0009_pipeline_tables` (or equivalent) creates `pipelines` and `pipeline_stages`, then issues `ALTER TABLE leads ADD CONSTRAINT leads_pipelineStageId_fkey FOREIGN KEY ("pipelineStageId") REFERENCES pipeline_stages(id) ON DELETE SET NULL`. |
| **Migration impact** | 0006 succeeds. `pipelineStageId` is a valid column but has no referential integrity in Sprint 4. Service layer must not write a `pipelineStageId` value in Sprint 4 (no pipeline stages exist to reference). The column stays null until Sprint 5. |
| **Backward compatibility** | Not applicable — this is a new column on a new table. No existing data. |
| **Implementation effort** | Trivial — remove one FK clause from the Prisma relation and add a comment. 15 minutes. |

---

### REC-2 — Lead `WON` status: invariant decision

| | |
|---|---|
| **Severity** | BLOCKING |
| **Must fix before M1** | Yes (affects the Prisma schema enum, Zod schema, and status machine logic — all referenced before M1 acceptance tests are written) |
| **Root cause** | `WON` is currently reachable via two distinct paths: (a) `convert()` — creates a contact atomically; (b) direct `PATCH /leads/:id { status: "WON" }` — updates status without creating a contact. These produce different data states: after path (a) `convertedToContactId IS NOT NULL`; after path (b) `convertedToContactId IS NULL`. Any query that reads `WHERE status = 'WON'` cannot determine whether a contact exists. Customer 360 construction is unreliable. |
| **Decision** | **Option A selected: `WON` is only reachable via `convert()`.** Direct PATCH to `WON` is rejected with `400 INVALID_STATUS_TRANSITION`. The terminal states reachable via direct PATCH are: `LOST` only. `WON` is a side-effect of the `convert()` operation, not a direct user selection from a status dropdown. |
| **Proposed schema change** | No schema change — the `LeadStatus` enum retains `WON`. The change is in the status machine validation logic and the Zod schema for `PATCH /leads/:id`. |
| **Status machine update** | Allowed direct PATCH transitions: `NEW → CONTACTED → QUALIFIED → PROPOSAL → NEGOTIATION → LOST`. Any open state → any earlier open state. `WON` is not in the set of PATCH-reachable states. The service throws `400 INVALID_STATUS_TRANSITION` if `input.status === 'WON'`. The `convert()` method sets `status = 'WON'` directly (bypasses PATCH validation). |
| **Zod schema update** | `PatchLeadInput.status` is typed as `z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'LOST'])` — `WON` is excluded from this schema. |
| **Migration impact** | None. The `LeadStatus` Prisma enum keeps `WON`. |
| **Backward compatibility** | No prior data. Design decision only. |
| **Implementation effort** | Small. Status machine test matrix update + Zod schema update. ~1 hour. |

---

### REC-3 — `ai_scores` table absent

| | |
|---|---|
| **Severity** | Critical |
| **Must fix before M1** | Yes — the table is created in migration 0006. If not included, adding it post-launch requires an online migration on a high-insert table while Sprint 7 is trying to write to it. |
| **Root cause** | The plan encodes AI scoring as two scalar columns on `leads`: `aiScore SMALLINT` and `aiScoreUpdatedAt TIMESTAMP`. The AI layer (doc 13 §13.2) outputs structured data including confidence, scoring factors breakdown, and recommendation text. FR-LEAD-004 requires "score breakdown tooltip: what drove the score." Historical scores are required by the Opportunity Detection feature (score jump ≥20 points). Two scalars cannot hold any of this. |
| **Proposed schema change** | Create `ai_scores` table in migration `0006_crm_tables`. Keep `leads.aiScore` and `leads.aiScoreUpdatedAt` as a **denormalized read-optimized cache** updated every time a new `ai_scores` row is inserted. The leads list query reads from the column; the lead detail view reads from `ai_scores` for the breakdown. |

**`ai_scores` table definition:**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK, default uuid_generate_v4() | |
| organizationId | UUID | FK → organizations.id, NOT NULL | Tenant key |
| leadId | UUID | FK → leads.id, NOT NULL | |
| score | SMALLINT | NOT NULL | 0–100 |
| confidence | DECIMAL(3,2) | NULL | 0.00–1.00 |
| factors | JSONB | NULL | `Array<{factor: string, impact: "positive"|"negative"|"neutral", weight: "high"|"medium"|"low"}>` |
| recommendation | TEXT | NULL | AI-generated recommendation text |
| triggeredBy | VARCHAR(50) | NULL | `LEAD_CREATED \| STATUS_CHANGED \| MESSAGE_RECEIVED \| WEEKLY_REFRESH` |
| modelVersion | VARCHAR(50) | NULL | e.g. `gpt-4o-mini-2025-03` |
| createdAt | TIMESTAMP | NOT NULL | No `updatedAt` — immutable records |

**Indexes:** `(organizationId, leadId, createdAt DESC)`, `(organizationId, score)`
**Note:** No `deletedAt`, no `updatedAt`. Records are immutable (same pattern as `activities`).

| | |
|---|---|
| **Migration impact** | One additional `CREATE TABLE` in 0006. One additional RLS policy in 0008. Added to TENANT_TABLES registry. `check:rls` expected count goes from 11 to 12. |
| **Backward compatibility** | Not applicable — new table. |
| **Implementation effort** | Low. Table definition is clear. No service code in Sprint 4 — the AI scoring service (Sprint 7) writes to it. In Sprint 4, `ai_scores` exists but is empty. |

---

### REC-4 — `custom_field_definitions` table absent

| | |
|---|---|
| **Severity** | Critical |
| **Must fix before M1** | Yes. |
| **Root cause** | FR-LEAD-009: "Org admins can create custom fields. Field types: text, number, date, select, multi-select, boolean, URL. Up to 50 per object type." The current design stores `customFields JSONB DEFAULT '{}'` on leads, contacts, and deals. Without a `custom_field_definitions` table: (a) there is no list of what fields exist for an org, so the UI cannot render the "Custom Fields" section; (b) `select`/`multi-select` fields have no `options` list stored server-side; (c) the PLAN_LIMITS `customFieldsPerObject: 50` cannot be enforced; (d) the API cannot validate that a key in `customFields` corresponds to a defined field. |
| **Proposed schema change** | Create `custom_field_definitions` table in migration `0006_crm_tables`. |

**`custom_field_definitions` table definition:**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK, default uuid_generate_v4() | |
| organizationId | UUID | FK → organizations.id, NOT NULL | Tenant key |
| objectType | ENUM | NOT NULL | `LEAD \| CONTACT \| DEAL` |
| fieldKey | VARCHAR(100) | NOT NULL | Machine key used as key in `customFields` JSONB (snake_case) |
| displayLabel | VARCHAR(100) | NOT NULL | Human-readable label shown in UI |
| fieldType | ENUM | NOT NULL | `TEXT \| NUMBER \| DATE \| SELECT \| MULTI_SELECT \| BOOLEAN \| URL` |
| options | JSONB | NULL | `Array<string>` — required for SELECT / MULTI_SELECT; null for all other types |
| isRequired | BOOLEAN | NOT NULL DEFAULT false | Whether the field is required on create |
| position | SMALLINT | NOT NULL | Display order within object type (1-indexed) |
| createdById | UUID | FK → users.id, NOT NULL | |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |
| deletedAt | TIMESTAMP | NULL | Soft delete |

**Constraints:**
- `UNIQUE (organizationId, objectType, fieldKey)` — per org, per object type, key is unique
- `CHECK (fieldType NOT IN ('SELECT', 'MULTI_SELECT') OR options IS NOT NULL)` — options is required for select types

**Enums to add to Prisma schema:**
```
CustomFieldObjectType: LEAD, CONTACT, DEAL
CustomFieldType: TEXT, NUMBER, DATE, SELECT, MULTI_SELECT, BOOLEAN, URL
```

**Indexes:** `(organizationId, objectType, deletedAt)` — used for the plan-limit count query and the settings list query.

| | |
|---|---|
| **Migration impact** | One additional `CREATE TABLE` in 0006. Two new enums. One additional RLS policy in 0008. Added to TENANT_TABLES. |
| **PLAN_LIMITS enforcement** | On `POST /custom-field-definitions`: `count({ where: { organizationId, objectType, deletedAt: null } }) >= PLAN_LIMITS[plan].customFieldsPerObject` → 429. Currently `PLAN_LIMITS.customFieldsPerObject = 50`. |
| **Sprint 4 scope** | Build the `custom_field_definitions` CRUD endpoints in E2 or as a separate sub-task within E1. Sprint 4 domain services validate that keys in `customFields` match defined field keys for the org. Type validation (e.g., value for a `NUMBER` field is numeric) is service-layer, not DB-layer. |
| **Backward compatibility** | Not applicable — new table. |
| **Implementation effort** | Medium. Table + service + CRUD endpoints + plan-limit check + validation integration into lead/contact create/update. Estimate 0.5 days. |

---

### REC-5 — `lastActivityAt` missing from `leads`

| | |
|---|---|
| **Severity** | Critical |
| **Must fix before M1** | Yes. The column must exist in the `leads` schema (migration 0006) before E4 (ActivityService) is built. The write-through update goes into `ActivityService.append()`. |
| **Root cause** | The lead list endpoint (E6) supports sort by "last activity." Without a denormalized column, this sort requires: `SELECT leads.*, MAX(a.createdAt) AS lastActivityAt FROM leads LEFT JOIN activities a ON a.relatedLeadId = leads.id GROUP BY leads.id ORDER BY MAX(a.createdAt) DESC`. On a 5,000-lead org with 10+ activities each (50,000+ activity rows), this aggregation cannot use the lead-list index and will miss the P95 < 400ms requirement. The AI scoring model also uses "days since last activity" as a staleness signal for Opportunity Detection. |
| **Proposed schema change** | Add `lastActivityAt TIMESTAMP NULL` to the `leads` table in migration `0006`. |
| **Write-through contract** | In `ActivityService.append(ctx, input)`, if `input.relatedLeadId` is set, after inserting the activity row, immediately issue an update inside the same `withTenant` transaction: `db.lead.update({ where: { id: input.relatedLeadId }, data: { lastActivityAt: new Date() } })`. This keeps the field current with O(1) cost per append. |
| **Query usage** | `ORDER BY "lastActivityAt" DESC NULLS LAST` in the lead list query. Index: `(organizationId, lastActivityAt DESC NULLS LAST)` added in migration `0007_crm_indexes`. |
| **Contacts parity** | Add `lastActivityAt TIMESTAMP NULL` to `contacts` as well (same write-through contract when `relatedContactId` is set). |
| **Migration impact** | Two additional columns (leads, contacts). One additional index in 0007. One write in ActivityService. |
| **Backward compatibility** | Not applicable — new tables. |
| **Implementation effort** | Trivial for the column and index. Write-through is 2 lines in ActivityService. |

---

### REC-6 — Remove `leads.notes TEXT NULL` (quick-note column)

| | |
|---|---|
| **Severity** | Critical |
| **Must fix before M1** | Yes — removing a column after domain code is written requires a coordinated service + migration change. Remove before any Lead module code is written. |
| **Root cause** | The `leads` table has `notes TEXT NULL` (quick notes) AND there is a `notes` table (rich-text, per-entity). Two separate note-taking surfaces on the same lead: (a) the FTS index on `leads` includes `leads.notes` but not the `notes` table; (b) the workflow engine condition evaluator would need to handle both; (c) the UI "where do I write notes?" ambiguity will confuse users and fragment their note history. The `leads.notes` column predates the dedicated notes module and serves no purpose once the `notes` table exists. |
| **Proposed schema change** | Remove `notes TEXT NULL` from the `leads` table definition in migration `0006`. The column is not created. |
| **Use case coverage** | "Quick note at lead creation time" is covered by the existing creation flow: `POST /leads` body can include an optional `note?: string`, and the service creates a `Note` record in the same `withTenant` transaction (before the commit, in the same unit of work). The lead body does not store the note. |
| **FTS impact** | The FTS index on `leads` currently indexes `firstName || ' ' || lastName || ' ' || coalesce(email, '')`. With `notes` removed from the lead, the FTS index definition is unchanged (it did not include `leads.notes`). The notes table content is not FTS-indexed in Sprint 4 — a sprint 6+ item. |
| **Migration impact** | Simpler leads table. One fewer column. |
| **Backward compatibility** | Not applicable — new table. |
| **Implementation effort** | Trivial — remove one line from the Prisma model definition. |

---

### REC-7 — `ActivityMetadata` discriminated union — untyped contract

| | |
|---|---|
| **Severity** | High |
| **Must fix before M1** | No — must be done before E4 code starts (ActivityService implementation). |
| **Root cause** | `activities.metadata JSONB` is the contract between the ActivityService (writer) and the Workflow Engine (reader, Sprint 7). If the shape is inconsistent between implementations (e.g., `fromStatus` vs `from_status` in `LEAD_STATUS_CHANGED`), Workflow conditions silently never match. Without a typed contract, this class of bug is nearly undetectable until Sprint 7 tries to evaluate conditions against actual activity records. |
| **Proposed schema change** | No schema change. Add a new file to `packages/shared` before E4 code begins: `packages/shared/src/types/activity-metadata.ts`. |

**ActivityMetadata discriminated union (all types defined before E4):**

```typescript
export type ActivityMetadata =
  | { type: 'LEAD_CREATED'; source: LeadSource }
  | { type: 'LEAD_STATUS_CHANGED'; fromStatus: LeadStatus; toStatus: LeadStatus }
  | { type: 'LEAD_ASSIGNED'; previousAssigneeId: string | null; newAssigneeId: string }
  | { type: 'LEAD_WON'; contactId: string }
  | { type: 'LEAD_LOST'; lostReason: string | null }
  | { type: 'CONTACT_CREATED'; createdFromLeadId: string | null }
  | { type: 'CONTACT_UPDATED'; changedFields: string[] }
  | { type: 'TASK_CREATED'; taskId: string; taskTitle: string; taskType: TaskType }
  | { type: 'TASK_COMPLETED'; taskId: string; taskTitle: string }
  | { type: 'TASK_CANCELLED'; taskId: string; taskTitle: string }
  | { type: 'NOTE_ADDED'; noteId: string }
  | { type: 'NOTE_UPDATED'; noteId: string }
  | { type: 'NOTE_DELETED'; noteId: string }
  | { type: 'FILE_UPLOADED'; fileId: string; fileName: string; mimeType: string; sizeBytes: number }
  | { type: 'FILE_DELETED'; fileId: string; fileName: string }
  | { type: 'DEAL_CREATED'; dealId: string; dealTitle: string }
  | { type: 'DEAL_STAGE_MOVED'; dealId: string; fromStageId: string; toStageId: string }
  | { type: 'DEAL_WON'; dealId: string }
  | { type: 'DEAL_LOST'; dealId: string; lostReason: string | null }
```

The `ActivityService.append()` method signature accepts `ActivityMetadata` as the `metadata` parameter. TypeScript enforces the shape at the call site — any new activity type requires adding a union member here first.

| | |
|---|---|
| **Migration impact** | None. Package change only. |
| **Backward compatibility** | None — new package export. |
| **Implementation effort** | Small — one file, one union type. ~30 minutes. |

---

### REC-8 — `mergedIntoLeadId` missing from `leads`

| | |
|---|---|
| **Severity** | High |
| **Must fix before M1** | Yes — must be in migration 0006. Adding it after production leads exist requires a migration on a live table. |
| **Root cause** | FR-LEAD-007 specifies lead merge (combining activity history). The Sprint 4 plan implements dedup detection (409 with `existingLeadId`) but defers merge. When merge is eventually implemented, the "loser" lead's identity needs to be traced to the "winner." Without `mergedIntoLeadId`, a soft-deleted lead with `deletedAt IS NOT NULL` cannot be distinguished from a normally-deleted lead or a spam deletion. Merge traces are needed for: support ("where did this lead's history go?"), analytics (dedup rates), and the activity feed on the winner lead. |
| **Proposed schema change** | Add `mergedIntoLeadId UUID NULL` to the `leads` table in migration `0006`. No FK constraint in Sprint 4 (self-referencing FK can be added later when merge is implemented). |
| **Sprint 4 usage** | Column is declared, always `NULL` in Sprint 4. No service logic reads or writes it. |
| **Future usage** | On merge, the loser lead: `{ deletedAt: now(), mergedIntoLeadId: winner.id }`. Queries that want "all historical leads merged into this one": `WHERE mergedIntoLeadId = $1`. |
| **Migration impact** | One additional column. No FK constraint added. |
| **Backward compatibility** | Not applicable — new table. |
| **Implementation effort** | Trivial — one column declaration. |

---

### REC-9 — `instagramAccountId` missing from `leads`

| | |
|---|---|
| **Severity** | High |
| **Must fix before M1** | Yes — must be in migration 0006. Adding after Sprint 6 ships means migrating a table already containing production leads. |
| **Root cause** | `leads.instagramUserId` is the Meta IGSID (scoped user ID) that identifies the *lead's* Instagram identity. It does not identify *which* of the org's Instagram accounts the lead came from. For an agency managing 10 client IG accounts, this attribution is the core value proposition ("which account is generating qualified leads?"). The AI scoring model (`orgAvgWinRate`, `orgAvgSalesCycle`) should eventually compute per-account baselines, not per-org. Without `instagramAccountId`, this signal is permanently lost. |
| **Proposed schema change** | Add `instagramAccountId UUID NULL` to the `leads` table in migration `0006`. **No FK constraint in Sprint 4** — `instagram_accounts` is created in Sprint 6. A migration comment documents the deferred FK. |
| **Sprint 4 usage** | Column is declared, always `NULL` in Sprint 4 (no IG accounts, no webhooks). |
| **Sprint 6 action** | Migration adds `ALTER TABLE leads ADD CONSTRAINT leads_instagramAccountId_fkey FOREIGN KEY ("instagramAccountId") REFERENCES instagram_accounts(id) ON DELETE SET NULL`. When a lead is created from an IG webhook, `instagramAccountId` is set to the receiving account's id. |
| **Migration impact** | One additional column. One deferred FK. |
| **Backward compatibility** | Not applicable — new table. |
| **Implementation effort** | Trivial. |

---

### REC-10 — `team_invites` table absent

| | |
|---|---|
| **Severity** | High |
| **Must fix before M1** | Yes — team growth is blocked without this. The auth module's invite flow must be able to store and validate invite tokens before any team member can be invited. |
| **Root cause** | FR specifies: "sends invite email from Team Settings; magic link; 7-day expiry." The magic link must contain a token that is validated server-side when clicked. There is no table in any Sprint 1–4 plan to store this token. The `organization_members` table has `invitedBy` and `invitedAt` columns, indicating invites were planned, but the token itself has no home. Without a token table, invite links cannot be issued or validated. |
| **Proposed schema change** | Create `team_invites` table in migration `0006_crm_tables`. |

**`team_invites` table definition:**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK, default uuid_generate_v4() | |
| organizationId | UUID | FK → organizations.id, NOT NULL | Tenant key |
| email | VARCHAR(255) | NOT NULL | Invitee email |
| roleId | UUID | FK → roles.id, NOT NULL | Role to assign on accept |
| tokenHash | VARCHAR(255) | NOT NULL UNIQUE | SHA-256 of the raw token (raw token only in the email link) |
| invitedById | UUID | FK → users.id, NOT NULL | |
| expiresAt | TIMESTAMP | NOT NULL | `createdAt + 7 days` |
| acceptedAt | TIMESTAMP | NULL | NULL = pending; set on accept |
| revokedAt | TIMESTAMP | NULL | NULL = active |
| createdAt | TIMESTAMP | NOT NULL | |

**Constraint:** `UNIQUE (organizationId, email, acceptedAt)` where `acceptedAt IS NULL` — prevents duplicate pending invites to the same email in one org (partial unique index on `WHERE acceptedAt IS NULL AND revokedAt IS NULL`).
**Index:** `(organizationId, email)`, `tokenHash` (unique — used for lookup on link click).

**Auth path note:** The invite validation on link-click reads `team_invites` using the raw `prisma` admin client (same pattern as other auth identity reads — D-M3-2 boundary). After acceptance, the `organization_members` insert uses `withTenant`. This is intentional and correct.

| | |
|---|---|
| **Migration impact** | One additional `CREATE TABLE` in 0006. One additional RLS policy in 0008. Added to TENANT_TABLES. |
| **Backward compatibility** | Not applicable — new table. |
| **Implementation effort** | Low. Table is simple. The invite flow (email send + token validation + member creation) is a Sprint 4 E2/E3 adjacent task — or can be its own sub-task. ~4 hours total for table + invite endpoint + accept endpoint. |

---

### REC-11 — `saved_replies` shell table absent

| | |
|---|---|
| **Severity** | High |
| **Must fix before M1** | Yes — creating tables with RLS after the Sprint 4 tenant extension is wired means updating the TENANT_TABLES registry mid-stream. Better to create the shell in Sprint 4 and add routes in Sprint 6. |
| **Root cause** | FR-INBOX-006 specifies saved reply templates ("org-level and personal templates, accessible via `/` shortcut"). This is an Inbox feature (Sprint 6), but `saved_replies` is a tenant-scoped table that must be in the RLS migration from day one. Adding it in Sprint 6 means: (a) TENANT_TABLES count goes up mid-stream, (b) `check:rls` expected count changes, (c) Sprint 4's isolation suite must re-baseline. Simpler to create it now as a shell (no routes, no service). |
| **Proposed schema change** | Create `saved_replies` table in migration `0006_crm_tables` (shell — no routes in Sprint 4). |

**`saved_replies` table definition:**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK, default uuid_generate_v4() | |
| organizationId | UUID | FK → organizations.id, NOT NULL | Tenant key |
| title | VARCHAR(255) | NOT NULL | Display name |
| content | TEXT | NOT NULL | Reply body (plain text for V1; rich text in V2) |
| shortcut | VARCHAR(50) | NULL | Trigger string (e.g. `/thanks`) |
| isGlobal | BOOLEAN | NOT NULL DEFAULT true | `true` = org-level; `false` = personal (visible only to `createdById`) |
| createdById | UUID | FK → users.id, NOT NULL | |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |
| deletedAt | TIMESTAMP | NULL | |

**Index:** `(organizationId, createdById, deletedAt)` — for "my replies + org replies" combined query in Sprint 6.

| | |
|---|---|
| **Migration impact** | One additional `CREATE TABLE` in 0006. One additional RLS policy in 0008. Added to TENANT_TABLES. |
| **Backward compatibility** | Not applicable. |
| **Implementation effort** | Trivial — shell table, no service code in Sprint 4. |

---

### REC-12 — `activities` table should be range-partitioned from creation

| | |
|---|---|
| **Severity** | High |
| **Must fix before M1** | Yes. Adding Postgres table partitioning to an existing non-partitioned table at scale requires recreating the table (REINDEX, foreign-key drops, data copy, rename — a multi-hour maintenance window). `FINAL_ARCHITECTURE.md §7.3` / SC-1 / DB-2 mandate that `activities` and `audit_logs` be created as partitioned tables from day one. |
| **Root cause** | `activities` is the highest-insert table in the system — every mutation on every entity emits one or more rows. Across 1,000 orgs with 1,000 leads each and 10+ events per lead, the table reaches 10M+ rows in the first year. Unpartitioned, sequential scans, vacuum, and time-range queries all degrade proportionally. Partitioning from creation is cheap (the table starts empty); adding it post-launch is expensive. |
| **Proposed schema change** | Create `activities` as `PARTITION BY RANGE ("createdAt")` in migration `0006_crm_tables`. Create an initial current-year partition plus a `DEFAULT` partition to catch all inserts until explicit partitions are added. |

**Migration SQL pattern (for reference — not final code):**
```sql
CREATE TABLE activities (
  id              UUID NOT NULL DEFAULT uuid_generate_v4(),
  "organizationId" UUID NOT NULL REFERENCES organizations(id),
  type            "ActivityType" NOT NULL,
  description     TEXT NOT NULL,
  metadata        JSONB NOT NULL DEFAULT '{}',
  "performedById" UUID REFERENCES users(id),
  "relatedLeadId" UUID,
  "relatedDealId" UUID,
  "relatedContactId" UUID,
  "createdAt"     TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT activities_must_have_entity
    CHECK (
      "relatedLeadId" IS NOT NULL OR
      "relatedDealId" IS NOT NULL OR
      "relatedContactId" IS NOT NULL
    )
) PARTITION BY RANGE ("createdAt");

-- Initial partitions (one per year; cron or manual task adds next year's partition in December)
CREATE TABLE activities_2026 PARTITION OF activities
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

CREATE TABLE activities_default PARTITION OF activities DEFAULT;
```

**Immutability triggers** (in migration 0006, after table creation):
```sql
CREATE FUNCTION prevent_activity_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'activities are immutable — UPDATE and DELETE are not permitted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER activities_no_update
  BEFORE UPDATE ON activities
  FOR EACH ROW EXECUTE FUNCTION prevent_activity_mutation();

CREATE TRIGGER activities_no_delete
  BEFORE DELETE ON activities
  FOR EACH ROW EXECUTE FUNCTION prevent_activity_mutation();
```

**Prisma note:** Prisma 5 does not natively model partitioned tables but generates the correct SQL if the `CREATE TABLE ... PARTITION BY` is in a custom migration. The generated Prisma client treats it as a regular model. The immutability trigger catches any accidental `db.activity.update()` call at the DB layer regardless of what the ORM does.

| | |
|---|---|
| **Migration impact** | The `CREATE TABLE activities` SQL is slightly different (must be written in the custom migration directly, not purely via Prisma schema push). The Prisma model definition is the same. |
| **Backward compatibility** | Not applicable — new table. |
| **Implementation effort** | Low — the SQL above is the entirety of the change. The complexity is in setting up annual partition creation (a cron task for Sprint 8 / ops runbook). |

---

### REC-13 — `activities` CHECK constraint: at least one entity FK must be non-null

| | |
|---|---|
| **Severity** | High |
| **Must fix before M1** | Yes — included in REC-12's migration SQL (see above). |
| **Root cause** | The `activities` table has three nullable FKs: `relatedLeadId`, `relatedDealId`, `relatedContactId`. An activity with all three null is a phantom record — it has no entity to display under and wastes space. The check constraint costs nothing and prevents this class of data error permanently. |
| **Proposed schema change** | Already included in REC-12. The CHECK constraint is part of the `CREATE TABLE activities` definition. |

---

### REC-14 — Notes content format is unspecified

| | |
|---|---|
| **Severity** | Medium |
| **Must fix before M1** | No — must be decided before E5 code starts (Notes module implementation). |
| **Root cause** | `notes.content TEXT NOT NULL` described as "Rich text (HTML/JSON)." The format is undecided. This matters because: (a) raw HTML stored and rendered without sanitization is a stored XSS attack surface; (b) if the format is Tiptap/ProseMirror JSON and a workflow action interpolates `{{note.content}}`, the email body contains a raw JSON object; (c) the FTS approach (searching note content) depends on whether the content is plain text, HTML, or structured JSON. |
| **Decision** | **Selected: ProseMirror/Tiptap JSON.** Stored as JSONB (not TEXT). This format: (a) cannot be directly executed as XSS; (b) can be rendered by the Tiptap editor in read mode on the frontend; (c) for workflow/email interpolation, a `toPlainText(doc)` serializer produces safe text; (d) for FTS, strip JSON keys and index the text content of leaf nodes. |
| **Schema change** | Change `notes.content TEXT NOT NULL` to `notes.content JSONB NOT NULL` in the Prisma model and migration 0006. Default: `{}` (empty document). |
| **Zod schema** | `NoteInput.content` is typed as `z.object({})` + `.passthrough()` in Sprint 4 (permissive on structure). Before Sprint 6, the schema is tightened to a Tiptap document shape. |
| **FTS note** | Sprint 4 does not index note content. A future migration adds a generated column or trigger that extracts plain text from the JSONB for GIN indexing. |
| **Migration impact** | One column type change in 0006. No other impact. |
| **Backward compatibility** | Not applicable — new table. |
| **Implementation effort** | Trivial for the column type. Moderate for the Tiptap integration in the frontend (Sprint 6 scope). |

---

### REC-15 — Event name constants mandate

| | |
|---|---|
| **Severity** | Medium |
| **Must fix before M1** | No — must be in place before E2 code starts. |
| **Root cause** | The Workflow Engine (Sprint 7) evaluates conditions against activity records using string-keyed field names like `activity.metadata.fromStatus`. If the string constant used in `eventBus.emit('LEAD_STATUS_CHANGED', ...)` differs from the JSONB trigger config `{ type: 'LEAD_STATUS_CHANGED' }` or from the `ActivityType.LEAD_STATUS_CHANGED` enum value, workflows silently never fire. This divergence is impossible to detect with static analysis unless the strings are defined in one place. |
| **Proposed change** | Mandate (via ESLint and code review) that all `eventBus.emit(eventName, ...)` call sites use a string constant imported from `packages/shared/src/constants/events.ts`. If an event name is not in that file, add it first. No inline string literals for event names anywhere in domain services. |
| **Migration impact** | None — code convention enforced by import rules. |
| **Implementation effort** | Trivial — verify `packages/shared/src/constants/events.ts` exists and add the event name constants for all `ActivityType` values (as a parallel `EVENTS` export). |

---

### REC-16 — `leads.source` immutability not DB-enforced

| | |
|---|---|
| **Severity** | Medium |
| **Must fix before M1** | No — include in migration 0006 or 0008. |
| **Root cause** | The plan documents "source tracking: immutable after creation" as a service-layer convention. Service-layer conventions are bypassed by direct repository access, admin scripts, and future engineers who don't read the comment. The immutability is a business invariant (source tells you the attribution channel permanently; changing it retrospectively corrupts reporting). |
| **Proposed schema change** | Add a Postgres trigger on `leads` that rejects any UPDATE that changes the `source` column. |

```sql
CREATE FUNCTION prevent_lead_source_update() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.source IS DISTINCT FROM OLD.source THEN
    RAISE EXCEPTION 'leads.source is immutable after creation (source attribution must not change)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leads_source_immutable
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION prevent_lead_source_update();
```

Include in migration `0006_crm_tables` (alongside the table creation).

| | |
|---|---|
| **Migration impact** | One trigger function + one trigger. |
| **Backward compatibility** | Not applicable. |
| **Implementation effort** | Trivial. |

---

### REC-17 — FTS index not filtered to exclude soft-deleted rows

| | |
|---|---|
| **Severity** | Medium |
| **Must fix before M1** | No — included in migration `0007_crm_indexes`. |
| **Root cause** | The plan creates a GIN tsvector index on `leads(firstName, lastName, email)` without a `WHERE` clause. This includes soft-deleted rows in the index. At multi-tenant scale, the GIN index grows proportionally to all rows ever created (not just active ones). Soft-deleted rows are never returned (RLS + service filter), but they inflate the index and slow searches. |
| **Proposed schema change** | Add `WHERE "deletedAt" IS NULL` to the FTS index in migration `0007_crm_indexes`. |

```sql
CREATE INDEX CONCURRENTLY leads_fts_idx
  ON leads
  USING GIN(to_tsvector('english',
    coalesce("firstName",'') || ' ' ||
    coalesce("lastName",'') || ' ' ||
    coalesce(email,'') || ' ' ||
    coalesce(phone,'')
  ))
  WHERE "deletedAt" IS NULL;
```

Note: `phone` is added to the FTS index (the audit found the blueprint index omitted it, but FR-LEAD-005 mentions phone search). Verify the EXPLAIN ANALYZE at E6 completion per the existing gate requirement.

| | |
|---|---|
| **Scale note** | At per-org row counts < 50K, Postgres will filter by `organizationId` first (from RLS and the WHERE clause in the query) and then apply the tsvector match. The GIN index is used as a secondary filter. At > 100K rows per org, evaluate switching to a dedicated search service (Typesense / Meilisearch). Document this threshold in `LEAD_LIST_QUERY_ANALYSIS.md`. |
| **Migration impact** | Index definition change in 0007. Negligible. |
| **Implementation effort** | Trivial. |

---

### REC-18 — `ActivityType`-to-entity documentation

| | |
|---|---|
| **Severity** | Medium |
| **Must fix before M1** | No — documentation task, before E4 code. |
| **Root cause** | Every `ActivityType` value implies a specific combination of nullable FKs being non-null. `LEAD_CREATED` → `relatedLeadId IS NOT NULL`. `DEAL_WON` → `relatedDealId IS NOT NULL`. If a domain service accidentally appends a `LEAD_STATUS_CHANGED` with only `relatedContactId` set (and `relatedLeadId` null), the activity is stored (the CHECK constraint only requires one of them to be non-null) but will not appear in the lead timeline. This is a hard-to-debug data quality issue. |
| **Proposed change** | Add a comment block above the `ActivityType` enum in `packages/shared/src/constants/enums.ts` that documents the required entity FK for each type. Additionally, the `ActivityService.append()` method validates at the service layer that the required FK is provided for the given `type`. |
| **Migration impact** | None. |
| **Implementation effort** | Trivial. |

---

### REC-19 — Document deferred FK columns in migration comments

| | |
|---|---|
| **Severity** | Low |
| **Must fix before M1** | No — documentation within migrations. |
| **Root cause** | `pipelineStageId` and `instagramAccountId` on `leads` are intentionally plain UUID columns with no FK constraint in Sprint 4. A future engineer reading the migration must not assume they forgot to add the FK. |
| **Proposed change** | Migration `0006_crm_tables` includes a comment above each deferred FK column: `-- FK to pipeline_stages.id deferred to Sprint 5 migration` and `-- FK to instagram_accounts.id deferred to Sprint 6 migration`. |
| **Migration impact** | None functional. |
| **Implementation effort** | Trivial. |

---

### REC-20 — Nightly file cleanup worker for storage orphan accumulation

| | |
|---|---|
| **Severity** | Low |
| **Must fix before M1** | No — Sprint 8 / pre-launch operational item. |
| **Root cause** | Soft-deleted files remain in S3/Cloudinary indefinitely. No cleanup job is planned. For Sprint 4 (no real user data) this is a non-issue. Before launch, orphaned storage costs money and potentially violates GDPR "right to erasure" timelines. |
| **Proposed change** | Add to Sprint 8 / pre-launch backlog: a nightly BullMQ job that finds `files WHERE "deletedAt" < NOW() - INTERVAL '30 days'`, deletes each from S3/Cloudinary (StorageService.delete), then hard-deletes the record. The 30-day window allows accidental-delete recovery. |
| **Migration impact** | None in Sprint 4. |
| **Implementation effort** | Low. One BullMQ worker, one StorageService.delete method. |

---

## Part 2 — Final Recommended CRM Schema

The remediated schema for Sprint 4 migration `0006_crm_tables`. This supersedes the schema in `docs/blueprint/08-DATABASE-DESIGN.md` and `SPRINT_4_EXECUTION_PLAN.md` for Sprint 4 purposes.

---

### leads *(remediated)*

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK DEFAULT uuid_generate_v4() | |
| organizationId | UUID | FK → organizations.id, NOT NULL | Tenant key |
| firstName | VARCHAR(100) | NOT NULL | |
| lastName | VARCHAR(100) | NULL | |
| email | VARCHAR(255) | NULL | Plaintext, indexed (P0-7) |
| phone | VARCHAR(20) | NULL | Plaintext, indexed |
| source | ENUM LeadSource | NOT NULL | **Immutable after creation** — enforced by DB trigger (REC-16) |
| status | ENUM LeadStatus | NOT NULL DEFAULT 'NEW' | `WON` only reachable via `convert()` (REC-2) |
| assignedToId | UUID | FK → users.id, NULL | |
| aiScore | SMALLINT | NULL | 0–100; denormalized from latest ai_scores row |
| aiScoreUpdatedAt | TIMESTAMP | NULL | Timestamp of the latest ai_scores row for this lead |
| instagramHandle | VARCHAR(100) | NULL | |
| instagramUserId | VARCHAR(50) | NULL | Meta IGSID for webhook lookup |
| instagramAccountId | UUID | NULL | *(no FK in Sprint 4 — deferred to Sprint 6; REC-9)* |
| tags | TEXT[] | DEFAULT '{}' | Tag strings — see note on future color-label migration |
| customFields | JSONB | DEFAULT '{}' | Keys must match custom_field_definitions.fieldKey for org |
| lostReason | TEXT | NULL | Required when status transitions to LOST |
| convertedToContactId | UUID | FK → contacts.id, NULL | Set by convert() only |
| pipelineStageId | UUID | NULL | *(no FK in Sprint 4 — deferred to Sprint 5; REC-1)* |
| mergedIntoLeadId | UUID | NULL | *(no FK in Sprint 4 — deferred to merge milestone; REC-8)* |
| lastActivityAt | TIMESTAMP | NULL | Write-through from ActivityService.append() (REC-5) |
| createdById | UUID | FK → users.id, NOT NULL | |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |
| deletedAt | TIMESTAMP | NULL | |

**Removed vs blueprint:** `notes TEXT NULL` (REC-6)
**Added vs blueprint:** `instagramAccountId`, `mergedIntoLeadId`, `lastActivityAt`
**Unconstrained vs blueprint:** `pipelineStageId` (plain UUID), `instagramAccountId` (plain UUID)

**Triggers:** `leads_source_immutable` (BEFORE UPDATE, prevents source change)

**Indexes (in migration 0007):**
- `(organizationId)` non-unique
- `(organizationId, status)`
- `(organizationId, assignedToId)`
- `(organizationId, source)`
- `(organizationId, aiScore)`
- `(organizationId, lastActivityAt DESC NULLS LAST)` *(new — REC-5)*
- `email` (for dedup)
- `phone` (for dedup)
- `instagramUserId` (for webhook lookup)
- `GIN to_tsvector(firstName || lastName || coalesce(email,'') || coalesce(phone,'')) WHERE deletedAt IS NULL` *(partial — REC-17)*

---

### contacts *(minor remediation)*

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK, NOT NULL | |
| firstName | VARCHAR(100) | NOT NULL | |
| lastName | VARCHAR(100) | NULL | |
| email | VARCHAR(255) | NULL | |
| phone | VARCHAR(20) | NULL | |
| company | VARCHAR(255) | NULL | |
| jobTitle | VARCHAR(100) | NULL | |
| avatarUrl | TEXT | NULL | |
| address | JSONB | NULL | `{street, city, state, country, zip}` |
| tags | TEXT[] | DEFAULT '{}' | |
| customFields | JSONB | DEFAULT '{}' | |
| lifeTimeValue | DECIMAL(15,2) | DEFAULT 0 | |
| assignedToId | UUID | FK → users.id, NULL | |
| lastActivityAt | TIMESTAMP | NULL | Write-through from ActivityService (REC-5) |
| createdFromLeadId | UUID | FK → leads.id, NULL | Set by convert() |
| createdById | UUID | FK → users.id, NOT NULL | |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |
| deletedAt | TIMESTAMP | NULL | |

**Added vs blueprint:** `lastActivityAt` (REC-5)

---

### tasks *(unchanged from blueprint)*

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| organizationId | UUID | FK, NOT NULL |
| title | VARCHAR(255) | NOT NULL |
| description | TEXT | NULL |
| type | ENUM TaskType | NOT NULL |
| priority | ENUM TaskPriority | NOT NULL |
| status | ENUM TaskStatus | NOT NULL |
| dueDate | TIMESTAMP | NULL |
| completedAt | TIMESTAMP | NULL |
| assignedToId | UUID | FK → users.id, NULL |
| relatedLeadId | UUID | FK → leads.id, NULL |
| relatedDealId | UUID | FK → deals.id, NULL *(no FK constraint in Sprint 4 — deals table is Sprint 5)* |
| relatedContactId | UUID | FK → contacts.id, NULL |
| createdById | UUID | FK → users.id, NOT NULL |
| createdAt | TIMESTAMP | NOT NULL |
| updatedAt | TIMESTAMP | NOT NULL |
| deletedAt | TIMESTAMP | NULL |

**Note:** `relatedDealId` is declared as a plain UUID NULL in Sprint 4 (deals table doesn't exist). FK constraint added in Sprint 5.

---

### activities *(remediated — partitioned + CHECK constraint)*

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | NOT NULL DEFAULT uuid_generate_v4() | Part of partition key |
| organizationId | UUID | FK → organizations.id, NOT NULL | |
| type | ENUM ActivityType | NOT NULL | |
| description | TEXT | NOT NULL | Human-readable description |
| metadata | JSONB | NOT NULL DEFAULT '{}' | Shape defined by ActivityMetadata discriminated union (REC-7) |
| performedById | UUID | FK → users.id, NULL | NULL = system action |
| relatedLeadId | UUID | NULL | At least one of these three must be non-null (CHECK) |
| relatedDealId | UUID | NULL | |
| relatedContactId | UUID | NULL | |
| createdAt | TIMESTAMP | NOT NULL DEFAULT now() | Partition key |

**Table DDL:** `PARTITION BY RANGE ("createdAt")` (REC-12)
**Triggers:** `activities_no_update`, `activities_no_delete` (immutability enforcement — REC-12)
**CHECK constraint:** `CHECK ("relatedLeadId" IS NOT NULL OR "relatedDealId" IS NOT NULL OR "relatedContactId" IS NOT NULL)` (REC-13)
**No updatedAt. No deletedAt.** Immutable by design.

**Initial partitions:**
- `activities_2026`: `FOR VALUES FROM ('2026-01-01') TO ('2027-01-01')`
- `activities_default`: DEFAULT (catches everything outside explicit ranges)

---

### notes *(remediated — content type change)*

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK, NOT NULL | |
| content | JSONB | NOT NULL DEFAULT '{}' | ProseMirror/Tiptap JSON document (REC-14) |
| relatedLeadId | UUID | FK → leads.id, NULL | At least one of these three must be non-null |
| relatedDealId | UUID | NULL | *(no FK constraint in Sprint 4)* |
| relatedContactId | UUID | FK → contacts.id, NULL | |
| createdById | UUID | FK → users.id, NOT NULL | |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |
| deletedAt | TIMESTAMP | NULL | |

**Changed vs blueprint:** `content TEXT` → `content JSONB` (REC-14)

---

### files *(unchanged from blueprint)*

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| organizationId | UUID | FK, NOT NULL |
| name | VARCHAR(255) | NOT NULL |
| storageKey | TEXT | NOT NULL |
| storageProvider | ENUM StorageProvider | NOT NULL |
| mimeType | VARCHAR(100) | NOT NULL |
| sizeBytes | BIGINT | NOT NULL |
| url | TEXT | NOT NULL |
| relatedLeadId | UUID | FK → leads.id, NULL |
| relatedDealId | UUID | NULL *(no FK in Sprint 4)* |
| relatedContactId | UUID | FK → contacts.id, NULL |
| uploadedById | UUID | FK → users.id, NOT NULL |
| createdAt | TIMESTAMP | NOT NULL |
| deletedAt | TIMESTAMP | NULL |

---

### ai_scores *(NEW — REC-3)*

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK DEFAULT uuid_generate_v4() | |
| organizationId | UUID | FK → organizations.id, NOT NULL | Tenant key |
| leadId | UUID | FK → leads.id, NOT NULL | |
| score | SMALLINT | NOT NULL | 0–100 |
| confidence | DECIMAL(3,2) | NULL | 0.00–1.00 |
| factors | JSONB | NULL | `Array<{factor, impact, weight}>` |
| recommendation | TEXT | NULL | AI-generated text |
| triggeredBy | VARCHAR(50) | NULL | Event that triggered scoring |
| modelVersion | VARCHAR(50) | NULL | AI model used |
| createdAt | TIMESTAMP | NOT NULL | Immutable — no updatedAt |

**Indexes:** `(organizationId, leadId, createdAt DESC)`, `(organizationId, score)`

---

### custom_field_definitions *(NEW — REC-4)*

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK DEFAULT uuid_generate_v4() | |
| organizationId | UUID | FK → organizations.id, NOT NULL | |
| objectType | ENUM CustomFieldObjectType | NOT NULL | LEAD \| CONTACT \| DEAL |
| fieldKey | VARCHAR(100) | NOT NULL | snake_case; used as JSONB key |
| displayLabel | VARCHAR(100) | NOT NULL | |
| fieldType | ENUM CustomFieldType | NOT NULL | TEXT \| NUMBER \| DATE \| SELECT \| MULTI_SELECT \| BOOLEAN \| URL |
| options | JSONB | NULL | Required for SELECT/MULTI_SELECT |
| isRequired | BOOLEAN | NOT NULL DEFAULT false | |
| position | SMALLINT | NOT NULL | Display order |
| createdById | UUID | FK → users.id, NOT NULL | |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |
| deletedAt | TIMESTAMP | NULL | |

**Constraints:** `UNIQUE (organizationId, objectType, fieldKey)` (partial: WHERE deletedAt IS NULL), `CHECK (fieldType NOT IN ('SELECT', 'MULTI_SELECT') OR options IS NOT NULL)`

---

### team_invites *(NEW — REC-10)*

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK DEFAULT uuid_generate_v4() | |
| organizationId | UUID | FK → organizations.id, NOT NULL | |
| email | VARCHAR(255) | NOT NULL | |
| roleId | UUID | FK → roles.id, NOT NULL | |
| tokenHash | VARCHAR(255) | NOT NULL UNIQUE | SHA-256(rawToken) |
| invitedById | UUID | FK → users.id, NOT NULL | |
| expiresAt | TIMESTAMP | NOT NULL | |
| acceptedAt | TIMESTAMP | NULL | |
| revokedAt | TIMESTAMP | NULL | |
| createdAt | TIMESTAMP | NOT NULL | |

**Partial unique index:** `(organizationId, email) WHERE acceptedAt IS NULL AND revokedAt IS NULL`
**Auth path:** Token validation uses admin `prisma` client (same D-M3-2 boundary as other auth reads).

---

### saved_replies *(NEW shell — REC-11)*

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK DEFAULT uuid_generate_v4() | |
| organizationId | UUID | FK → organizations.id, NOT NULL | |
| title | VARCHAR(255) | NOT NULL | |
| content | TEXT | NOT NULL | Plain text in V1 |
| shortcut | VARCHAR(50) | NULL | e.g. `/thanks` |
| isGlobal | BOOLEAN | NOT NULL DEFAULT true | org-level vs personal |
| createdById | UUID | FK → users.id, NOT NULL | |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |
| deletedAt | TIMESTAMP | NULL | |

**Note:** Shell table only — no routes or service code in Sprint 4. Routes added in Sprint 6.

---

## Part 3 — Updated TENANT_TABLES Inventory

**Existing (Sprint 3, 5 tables):**

| # | Prisma model | DB table | Sprint |
|---|---|---|---|
| 1 | OrganizationMember | organization_members | Sprint 3 |
| 2 | Role | roles | Sprint 3 |
| 3 | Subscription | subscriptions | Sprint 3 |
| 4 | RefreshToken | refresh_tokens | Sprint 3 |
| 5 | AuditLog | audit_logs | Sprint 3 |

**New (Sprint 4, 10 tables):**

| # | Prisma model | DB table | Source |
|---|---|---|---|
| 6 | Lead | leads | Blueprint |
| 7 | Contact | contacts | Blueprint |
| 8 | Task | tasks | Blueprint |
| 9 | Activity | activities | Blueprint |
| 10 | Note | notes | Blueprint |
| 11 | File | files | Blueprint |
| 12 | AiScore | ai_scores | REC-3 |
| 13 | CustomFieldDefinition | custom_field_definitions | REC-4 |
| 14 | TeamInvite | team_invites | REC-10 |
| 15 | SavedReply | saved_replies | REC-11 |

**Total after Sprint 4: 15 tenant tables**

`check:rls` expected output after 0008_crm_rls: `OK — 15 tenant tables enabled + forced + policied`

All 15 tables must have:
- `ENABLE ROW LEVEL SECURITY`
- `FORCE ROW LEVEL SECURITY`
- USING policy: `("organizationId" = current_setting('app.current_organization_id', true)::uuid)`
- WITH CHECK policy (same condition): covers INSERT and UPDATE
- `leados_app` granted SELECT, INSERT, UPDATE, DELETE

The `check:rls` script must also verify `leados_platform_admin` has BYPASSRLS (unchanged from Sprint 3).

**New enums to add to Prisma schema:**

| Enum | Values |
|---|---|
| ActivityType | LEAD_CREATED, LEAD_STATUS_CHANGED, LEAD_ASSIGNED, LEAD_WON, LEAD_LOST, CONTACT_CREATED, CONTACT_UPDATED, TASK_CREATED, TASK_COMPLETED, TASK_CANCELLED, NOTE_ADDED, NOTE_UPDATED, NOTE_DELETED, FILE_UPLOADED, FILE_DELETED, DEAL_CREATED, DEAL_STAGE_MOVED, DEAL_WON, DEAL_LOST |
| StorageProvider | S3, CLOUDINARY |
| CustomFieldObjectType | LEAD, CONTACT, DEAL |
| CustomFieldType | TEXT, NUMBER, DATE, SELECT, MULTI_SELECT, BOOLEAN, URL |

---

## Part 4 — Updated Relationship Diagram (text format)

```
ORGANIZATIONS
    │
    ├──< ORGANIZATION_MEMBERS >── USERS
    │         │
    │         └── ROLES >── PERMISSIONS
    │
    ├──< TEAM_INVITES                           [NEW — Sprint 4, REC-10]
    │         └── roleId → ROLES
    │
    ├──< CUSTOM_FIELD_DEFINITIONS               [NEW — Sprint 4, REC-4]
    │         objectType: LEAD | CONTACT | DEAL
    │
    ├──< SAVED_REPLIES                          [NEW shell — Sprint 4, REC-11]
    │
    ├──< LEADS
    │         ├──< AI_SCORES                    [NEW — Sprint 4, REC-3]
    │         ├──< ACTIVITIES                   [partitioned RANGE(createdAt), REC-12]
    │         │         └── CHECK: at least one FK non-null (REC-13)
    │         ├──< TASKS
    │         ├──< NOTES                        [content JSONB — REC-14]
    │         ├──< FILES
    │         │
    │         ├── convertedToContactId ──> CONTACTS   [FK enforced]
    │         ├── pipelineStageId (UUID NULL)          [deferred FK → Sprint 5]
    │         ├── instagramAccountId (UUID NULL)        [deferred FK → Sprint 6]
    │         └── mergedIntoLeadId (UUID NULL)          [deferred FK → merge milestone]
    │
    ├──< CONTACTS
    │         ├──< ACTIVITIES
    │         ├──< TASKS
    │         ├──< NOTES
    │         ├──< FILES
    │         └── createdFromLeadId ──> LEADS         [FK enforced]
    │
    │         ── [Sprint 5] ──────────────────────────────────────
    │
    ├──< PIPELINES
    │         └──< PIPELINE_STAGES
    │                   └──< DEALS
    │                         ├── contactId ──> CONTACTS
    │                         ├── leadId ──> LEADS
    │                         ├──< ACTIVITIES
    │                         ├──< TASKS
    │                         ├──< NOTES
    │                         └──< FILES
    │
    │         ── [Sprint 6] ──────────────────────────────────────
    │
    ├──< INSTAGRAM_ACCOUNTS
    │         └──< INSTAGRAM_CONVERSATIONS
    │                   ├── relatedLeadId ──> LEADS
    │                   ├── relatedContactId ──> CONTACTS
    │                   └──< MESSAGES (polymorphic)
    │
    ├──< WHATSAPP_ACCOUNTS
    │         └──< WHATSAPP_CONVERSATIONS
    │                   └──< MESSAGES (polymorphic)
    │
    │         ── [Sprint 7+] ─────────────────────────────────────
    │
    ├──< WORKFLOWS
    │         └──< WORKFLOW_EXECUTIONS
    │
    ├──< NOTIFICATIONS
    ├──< WEBHOOK_EVENTS
    │
    ├── SUBSCRIPTIONS
    │         └──< INVOICES
    │                   └──< PAYMENTS
    │
    ├──< AUDIT_LOGS              [partitioned RANGE(createdAt) — existing Sprint 3]
    └──< REFRESH_TOKENS
```

**Legend:**
- `──<` one-to-many
- `>──` many-to-one (FK from the left table)
- `(UUID NULL)` plain column, FK deferred to named sprint
- `[NEW]` table not in original Sprint 4 plan, added by this remediation
- `[partitioned]` Postgres PARTITION BY RANGE table — must be created as such from migration 0006

---

## Part 5 — Exact Pre-Migration-0006 Change List

This is the complete, ordered list of changes that must be made **before migration 0006 is written**. Items are ordered by dependency. No code implementation — these are schema/convention/decision items that gate implementation.

---

### Decision items (must be documented before any model or service code is written)

**D-1: Lead WON status path** *(REC-2)*
> Decision: `WON` is only reachable via `POST /leads/:id/convert`. Direct `PATCH /leads/:id { status: "WON" }` returns `400 INVALID_STATUS_TRANSITION`. The `PatchLeadInput` Zod schema excludes `WON` from the status enum. The `convert()` method writes `status = 'WON'` directly (bypasses PATCH validation).

**D-2: Notes content format** *(REC-14)*
> Decision: `notes.content` is `JSONB` (ProseMirror/Tiptap JSON document). Plain text is never stored directly. Workflow interpolation uses a `toPlainText(doc)` serializer. Frontend uses Tiptap editor in read/write mode.

**D-3: Event name authority** *(REC-15)*
> Decision: All `eventBus.emit(eventName, ...)` call sites must use a string constant imported from `packages/shared/src/constants/events.ts`. No inline string literals for event names in domain services. The `events.ts` file is extended with all `ActivityType` values before E2 code begins.

**D-4: ActivityMetadata contract** *(REC-7)*
> Decision: `packages/shared/src/types/activity-metadata.ts` must be created with the `ActivityMetadata` discriminated union before the `ActivityService` is written (E4). The union is the authoritative contract between domain services (writers) and the Workflow Engine (reader, Sprint 7).

---

### Schema changes to `leads` table (apply to the Prisma model definition)

**S-1: Remove `notes TEXT NULL`** *(REC-6)*
> Remove the `notes` field from the Prisma `Lead` model entirely. The field is not created in migration 0006.

**S-2: Unlink `pipelineStageId` FK** *(REC-1)*
> Change `pipelineStageId` from a Prisma `@relation` field pointing to `PipelineStage` to a plain `pipelineStageId String? @db.Uuid` with no `@relation`. Add migration comment: `-- FK to pipeline_stages.id deferred to Sprint 5`.

**S-3: Add `lastActivityAt`** *(REC-5)*
> Add `lastActivityAt DateTime?` to the Prisma `Lead` model.

**S-4: Add `mergedIntoLeadId`** *(REC-8)*
> Add `mergedIntoLeadId String? @db.Uuid` (plain UUID, no Prisma relation) to the `Lead` model. Add migration comment: `-- self-reference FK deferred to merge milestone`.

**S-5: Add `instagramAccountId`** *(REC-9)*
> Add `instagramAccountId String? @db.Uuid` (plain UUID, no Prisma relation) to the `Lead` model. Add migration comment: `-- FK to instagram_accounts.id deferred to Sprint 6`.

---

### Schema changes to `contacts` table

**S-6: Add `lastActivityAt`** *(REC-5)*
> Add `lastActivityAt DateTime?` to the Prisma `Contact` model.

---

### Schema changes to `notes` table

**S-7: Change `content` from `String` to `Json`** *(REC-14)*
> Change `content String` to `content Json` in the Prisma `Note` model. The migration creates the column as `JSONB NOT NULL DEFAULT '{}'`.

---

### Schema changes to `activities` table

**S-8: Partition by range** *(REC-12)*
> The `activities` table must be created with `PARTITION BY RANGE ("createdAt")`. This requires a custom migration SQL file, not purely a Prisma schema push. The Prisma model definition is unchanged, but the migration SQL is hand-authored.

**S-9: CHECK constraint** *(REC-13)*
> The `activities` table migration must include: `CONSTRAINT activities_must_have_entity CHECK ("relatedLeadId" IS NOT NULL OR "relatedDealId" IS NOT NULL OR "relatedContactId" IS NOT NULL)`. This is added to the custom migration SQL.

---

### New tables to add to Prisma schema and migration 0006

**T-1: `ai_scores`** *(REC-3)*
> Add Prisma model `AiScore` with all fields from the schema above. Add `@relation` from `Lead` to `AiScore[]`. The `Lead` model keeps the existing `aiScore` and `aiScoreUpdatedAt` scalar columns as a denormalized cache.

**T-2: `custom_field_definitions`** *(REC-4)*
> Add Prisma model `CustomFieldDefinition` with enums `CustomFieldObjectType` and `CustomFieldType`. Add to schema.

**T-3: `team_invites`** *(REC-10)*
> Add Prisma model `TeamInvite`. No `@relation` to `OrganizationMember` — the invite is independent until accepted.

**T-4: `saved_replies`** *(REC-11)*
> Add Prisma model `SavedReply`. Shell — no routes or service in Sprint 4.

---

### New enums to add to Prisma schema

**E-1: `ActivityType`** — 19 values (see TENANT_TABLES section)
**E-2: `StorageProvider`** — `S3`, `CLOUDINARY`
**E-3: `CustomFieldObjectType`** — `LEAD`, `CONTACT`, `DEAL`
**E-4: `CustomFieldType`** — `TEXT`, `NUMBER`, `DATE`, `SELECT`, `MULTI_SELECT`, `BOOLEAN`, `URL`

---

### Migration content checklist (what 0006, 0007, 0008 must include)

**Migration 0006_crm_tables:**
- [ ] New enums: ActivityType, StorageProvider, CustomFieldObjectType, CustomFieldType
- [ ] CREATE TABLE leads (remediated schema, no notes column, deferred FKs documented in comments)
- [ ] CREATE TABLE contacts (with lastActivityAt)
- [ ] CREATE TABLE tasks (relatedDealId as plain UUID)
- [ ] CREATE TABLE activities PARTITION BY RANGE ("createdAt") with CHECK constraint and immutability triggers
- [ ] CREATE TABLE activities_2026 partition + activities_default partition
- [ ] CREATE TABLE notes (content JSONB)
- [ ] CREATE TABLE files
- [ ] CREATE TABLE ai_scores
- [ ] CREATE TABLE custom_field_definitions (with constraints)
- [ ] CREATE TABLE team_invites (with partial unique index)
- [ ] CREATE TABLE saved_replies
- [ ] DB trigger: leads_source_immutable (BEFORE UPDATE on leads)
- [ ] DB triggers: activities_no_update, activities_no_delete (BEFORE UPDATE/DELETE on activities)
- [ ] Circular FK resolution: leads.convertedToContactId → contacts and contacts.createdFromLeadId → leads (both via ALTER TABLE after both tables are created, or using DEFERRABLE constraints)

**Migration 0007_crm_indexes:**
- [ ] All composite indexes on leads (with partial FTS index WHERE deletedAt IS NULL)
- [ ] All composite indexes on contacts
- [ ] Indexes on tasks: (organizationId, assignedToId, status), (organizationId, dueDate, status)
- [ ] Indexes on activities: (organizationId, relatedLeadId, createdAt DESC), (organizationId, relatedContactId, createdAt DESC), (organizationId, createdAt DESC)
- [ ] Indexes on ai_scores: (organizationId, leadId, createdAt DESC), (organizationId, score)
- [ ] Indexes on custom_field_definitions: partial unique on (organizationId, objectType, fieldKey) WHERE deletedAt IS NULL
- [ ] Indexes on team_invites: tokenHash (unique), partial unique on (organizationId, email) WHERE acceptedAt IS NULL AND revokedAt IS NULL
- [ ] pg_trgm extension: `CREATE EXTENSION IF NOT EXISTS pg_trgm`

**Migration 0008_crm_rls:**
- [ ] For all 15 tenant tables (5 existing + 10 new): ENABLE, FORCE, USING + WITH CHECK policy
- [ ] GRANT SELECT, INSERT, UPDATE, DELETE ON each new table TO leados_app
- [ ] Verify leados_platform_admin BYPASSRLS still holds (no-op — unchanged from Sprint 3)

---

### TENANT_TABLES registry update

Add to `core/tenancy/tenant-tables.ts` (before migration 0006 is run):
```
'lead', 'contact', 'task', 'activity', 'note', 'file',
'aiScore', 'customFieldDefinition', 'teamInvite', 'savedReply'
```

Update `check:rls` expected count from 11 to **15**.

---

### packages/shared additions (required before domain code, not before migration)

- [ ] `packages/shared/src/types/activity-metadata.ts` — ActivityMetadata discriminated union (before E4 code)
- [ ] `packages/shared/src/constants/events.ts` — event name constants matching ActivityType values (before E2 code)
- [ ] Update `packages/shared/src/constants/enums.ts` — add ActivityType, StorageProvider, CustomFieldObjectType, CustomFieldType
- [ ] Zod schema: `PatchLeadInput.status` excludes `WON` from the allowed values

---

## Part 6 — Summary: What Changes vs Original Sprint 4 Plan

| Category | Original Plan | After Remediation | Why |
|---|---|---|---|
| leads.notes column | TEXT NULL present | **Removed** | Conflicts with notes table (REC-6) |
| leads.pipelineStageId | FK → pipeline_stages | **Plain UUID NULL** (no FK) | Referenced table doesn't exist in Sprint 4 (REC-1) |
| leads.lastActivityAt | Missing | **Added** | Required for list sort; avoids expensive aggregation (REC-5) |
| leads.mergedIntoLeadId | Missing | **Added** | Required for future merge trace (REC-8) |
| leads.instagramAccountId | Missing | **Added** | Attribution of IG account (REC-9) |
| WON status path | PATCH-reachable | **convert()-only** | Data integrity invariant (REC-2) |
| activities table | Standard CREATE TABLE | **PARTITION BY RANGE + triggers + CHECK** | DB-2/SC-1 mandate; immutability enforcement (REC-12/13) |
| notes.content | TEXT | **JSONB** (Tiptap) | XSS safety; workflow interpolation (REC-14) |
| ai_scores table | Not planned | **New table** | AI layer structured output + history (REC-3) |
| custom_field_definitions | Not planned | **New table** | FR-LEAD-009 is unimplementable without it (REC-4) |
| team_invites table | Not planned | **New table** | Team growth blocked without token store (REC-10) |
| saved_replies table | Not planned | **New shell table** | Sprint 6 RLS setup; avoids mid-stream migration (REC-11) |
| TENANT_TABLES count | 11 (5+6) | **15 (5+10)** | Four new tables added |
| check:rls expected | 11 | **15** | |
| leads.source immutability | Convention only | **DB trigger** | Immutability enforced at DB layer (REC-16) |
| FTS index | No WHERE clause | **WHERE deletedAt IS NULL** | Excludes soft-deleted rows from index (REC-17) |
| ActivityMetadata | Untyped JSONB | **Typed discriminated union** in packages/shared | Workflow Engine contract (REC-7) |

---

*Planning only. No code changes. No schema modifications. No commits.*
*All schema changes described here are implemented when migration 0006 is authored during Sprint 4 M1.*
