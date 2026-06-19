# SPRINT_4_ARCHITECTURE_AUDIT.md

> **Sprint 4 CRM Data Model — Architecture Audit**
> Perspective: CTO / product architect review
> Date: 2026-06-19
> Scope: Review of `SPRINT_4_EXECUTION_PLAN.md` schema and architecture against `FINAL_ARCHITECTURE.md`, `docs/blueprint/08-DATABASE-DESIGN.md`, `docs/blueprint/03-FUNCTIONAL-REQUIREMENTS.md`, `docs/blueprint/11-RBAC-DESIGN.md`, `docs/blueprint/12-WORKFLOW-ENGINE.md`, `docs/blueprint/13-AI-LAYER.md`, `docs/blueprint/14-INSTAGRAM-INTEGRATION.md`.
> Audit only — no code changes, no schema modifications.

---

## 1. Executive Summary

The Sprint 4 execution plan is well-structured and the six-milestone sequencing is sound. The tenancy foundation from Sprint 3 gives a solid correctness floor for domain modules. However, **the data model as currently specified has 12 issues that range from minor clarifications to one blocking schema dependency error and three "expensive to fix later" omissions** that will create painful migrations in Sprints 5–8 if not addressed now.

**Critical (fix before any migration is written):**
1. `pipelineStageId` FK cannot be created in Sprint 4 — the referenced table does not exist yet.
2. `ai_scores` table is absent — the plan encodes AI output as a scalar; the AI layer's full structured output has nowhere to land.
3. `custom_field_definitions` table is absent — JSONB `customFields` without a definitions table is unenforceable and unrenderable.

**High (address before Sprint 4 ships):**
4. `lastActivityAt` is missing from `leads` — the most-queried list sort requires a join to `activities` without it.
5. `ActivityType`-to-metadata mapping is undocumented — workflow conditions that reference activity metadata fields are fragile without a typed contract.
6. `leads.notes` (quick-note column) conflicts with the `notes` table — two note surfaces will confuse users and fragment search.
7. Lead WON state is settable both via `convert()` and directly via PATCH status — the intended invariant is ambiguous.

**Medium (document now, fix before dependent sprint ships):**
8. No `instagramAccountId` on leads — attribution of which IG account originated the lead is lost.
9. `team_invites` table is absent — team growth is blocked without a token store for invite links.
10. `saved_replies` table absent — required for Inbox (Sprint 6); should be in Sprint 4's RLS migration.
11. FTS index is not tenant-partitioned — search at multi-tenant scale will degrade without a composite index strategy.
12. Notes format (HTML vs JSON vs markdown) is unspecified — XSS surface and workflow interpolation depend on this decision.

---

## 2. Strengths

### 2.1 Foundation is correct

The decision to build CRM Core on the Sprint 3 tenant extension + RLS + `withTenant` is architecturally sound. Every Sprint 4 model inherits isolation for free by being in the TENANT_TABLES registry. The Sprint 3 isolation suite continuing to run in CI means any new table that is accidentally omitted from the registry will be caught immediately.

### 2.2 Activity as immutable append-only log

Using `activities` as an append-only table with no `updatedAt` and no soft-delete is the correct design for a CRM entity timeline. It produces a trusted audit trail per entity, supports time-travel queries, and maps cleanly to what workflow triggers consume (`LEAD_STATUS_CHANGED`, `TASK_COMPLETED`). The plan's enforcement note (Postgres trigger or assertion test) is essential and must be implemented.

### 2.3 Atomic lead→contact conversion

Running the conversion inside a single `withTenant` transaction (P0-3 atomicity invariant) is correct. The fact that this is now proven at the domain level — not just the Sprint 3 test fixtures — gives the team confidence that multi-step mutations are safe. The failure case (contact create fails → lead status unchanged) is the right behavior.

### 2.4 Presigned upload architecture

Keeping file uploads off the API request path via presigned URLs is the right trade-off for a small team. It eliminates API bandwidth as a bottleneck, removes the need for streaming/multipart handling in Express, and delegates storage auth to S3/Cloudinary natively. The `NODE_ENV=test` mock path for CI is pragmatic.

### 2.5 Async CSV import

`POST /leads/import → 202 → BullMQ worker → GET /import/:jobId` is the right pattern. Synchronous import blocks the request thread and times out at row counts > ~500. The plan's partial-import semantics (import valid rows, report invalid rows by row number) are user-friendly for large imports.

### 2.6 EXPLAIN ANALYZE as a gate

Making EXPLAIN ANALYZE on the lead-list query a mandatory sprint exit criterion (not optional documentation) is the right call. `leads` is the most-queried table in the system; shipping without a verified query plan is how you get a 2am P1 after the first 5,000-lead org signs up.

### 2.7 PLAN_LIMITS already in packages/shared

The `PLAN_LIMITS` constant is already defined with `leads`, `contacts`, `seats`, `customFieldsPerObject` etc. Sprint 4 modules can import it directly without any shared-package changes. No hardcoded constants in domain services.

### 2.8 Module boundary enforcement from day one

Enforcing ESLint `no-restricted-imports` for cross-module DB access on each new module before it ships its first endpoint is the correct order. Every shortcut here costs exponentially more when the V2 extraction happens.

---

## 3. Schema Gaps & Missing Entities

### 3.1 BLOCKING: `pipelineStageId` FK cannot exist in Sprint 4

**Problem:** The `leads` model includes `pipelineStageId UUID FK → pipeline_stages.id NULL`. Migration `0006_crm_tables` cannot create this FK because `pipeline_stages` does not exist — it is created in Sprint 5. Postgres will reject the migration with a foreign key violation on the referenced table.

**Impact:** Blocks all Sprint 4 migrations from running if this FK is included.

**Resolution:** Two options:
- **Option A (recommended):** Omit the FK constraint in migration `0006`. Store `pipelineStageId` as a plain `UUID NULL` column. The Sprint 5 migration adds `ALTER TABLE leads ADD CONSTRAINT leads_pipelineStageId_fkey FOREIGN KEY ...` after `pipeline_stages` is created.
- **Option B:** Create `pipelines` and `pipeline_stages` as empty shell tables in migration `0006_crm_tables` and add the FK. Sprint 5 adds columns and data. This works but creates tables before their module is built, which can be confusing.

Option A is cleaner. Document the column as "FK to be enforced in Sprint 5" in the migration comment.

---

### 3.2 CRITICAL: `ai_scores` table is absent

**Problem:** The plan encodes AI scoring output as two scalar columns on `leads`: `aiScore SMALLINT` and `aiScoreUpdatedAt TIMESTAMP`. The AI Layer design (doc 13 §13.2) outputs a structured object:

```json
{
  "score": 78,
  "confidence": 0.84,
  "factors": [
    { "factor": "Quick response pattern", "impact": "positive", "weight": "high" }
  ],
  "recommendation": "Call within 24h — high purchase intent signal."
}
```

FR-LEAD-004 requires "score breakdown tooltip: what drove the score." This breakdown requires the `factors` array to be stored somewhere queryable. Two scalars cannot hold this.

Additionally, AI scoring runs multiple times per lead (on status change, on new message, on task completion, every 7 days). The current schema loses all historical scoring. Historical scores are inputs to the AI Opportunity Detection feature (doc 13 §13.4: "score jump ≥20 points").

**Impact on downstream sprints:**
- Sprint 7 (AI): the AI worker will have no table to write full structured output to. It will either (a) drop the confidence/factors/recommendation or (b) require a Sprint 7 migration that migrates data from scalar `aiScore` columns to an `ai_scores` table — a harder migration on a high-insert table.
- Analytics (Sprint 8): score trend analysis requires time-series score records.

**Resolution:** Create `ai_scores` table in Sprint 4 migration `0006` (alongside leads):

```
ai_scores
  id              UUID PK
  organizationId  UUID FK NOT NULL            — tenant key
  leadId          UUID FK → leads.id NOT NULL
  score           SMALLINT NOT NULL
  confidence      DECIMAL(3,2) NULL
  factors         JSONB NULL                  — Array<{factor, impact, weight}>
  recommendation  TEXT NULL
  triggeredBy     VARCHAR(50) NULL            — LEAD_CREATED | STATUS_CHANGED | MESSAGE_RECEIVED | WEEKLY_REFRESH
  modelVersion    VARCHAR(50) NULL            — e.g. "gpt-4o-mini-2025-03"
  createdAt       TIMESTAMP NOT NULL
  — no updatedAt (immutable records)
```

Keep `leads.aiScore` and `leads.aiScoreUpdatedAt` as a **denormalized read-optimized copy** of the latest score — set to the most recent `ai_scores.score` whenever a new score is inserted. The list query reads from the column; the detail view reads from `ai_scores` for the breakdown. This is correct denormalization with a clear update contract.

Add `ai_scores` to the TENANT_TABLES registry. Add the RLS policy in migration `0008_crm_rls`.

---

### 3.3 CRITICAL: `custom_field_definitions` table is absent

**Problem:** The plan stores `customFields JSONB DEFAULT '{}'` on leads, contacts, and deals. This is a common and convenient shortcut, but it does not support FR-LEAD-009:

> *"Org admins can create custom fields per object type. Field types: text, number, date, select, **multi-select**, boolean, URL. Up to 50 custom fields per object type."*

Without a `custom_field_definitions` table:
- There is no schema enforcement for `customFields` values — an API client can write `{ "budget": "purple" }` against a field defined as `number` and the DB will accept it.
- There is no way to render the "Custom Fields" section in the UI — the frontend has no list of what fields exist, their types, their display labels, or their order.
- `select` and `multi-select` fields require an `options` list (allowed values) that must be stored server-side, not in JSONB on the record itself.
- The PLAN_LIMITS `customFieldsPerObject: 50` enforcement cannot be checked without counting definitions.
- Workflow conditions that reference custom fields (`lead.customFields.budget > 500000`) have no type information to validate against.

**Resolution:** Create `custom_field_definitions` table in Sprint 4 migration `0006`:

```
custom_field_definitions
  id              UUID PK
  organizationId  UUID FK NOT NULL
  objectType      ENUM NOT NULL            — LEAD | CONTACT | DEAL
  fieldKey        VARCHAR(100) NOT NULL    — machine key used in JSONB (snake_case)
  displayLabel    VARCHAR(100) NOT NULL
  fieldType       ENUM NOT NULL            — TEXT | NUMBER | DATE | SELECT | MULTI_SELECT | BOOLEAN | URL
  options         JSONB NULL               — Array<string>, for SELECT / MULTI_SELECT only
  isRequired      BOOLEAN DEFAULT false
  position        SMALLINT NOT NULL        — display order
  createdById     UUID FK → users.id NOT NULL
  createdAt       TIMESTAMP NOT NULL
  updatedAt       TIMESTAMP NOT NULL
  deletedAt       TIMESTAMP NULL

UNIQUE: (organizationId, objectType, fieldKey)
```

Add to TENANT_TABLES registry; add RLS policy. The PLAN_LIMITS check on `create` counts `WHERE organizationId = $1 AND objectType = $2 AND deletedAt IS NULL`.

For Sprint 4, the validation at create/update time against definitions can be a service-layer check (not a DB constraint) since Postgres JSON Schema validation requires `pg_jsonschema` extension not guaranteed to be available on Neon.

---

### 3.4 HIGH: `lastActivityAt` is missing from `leads`

**Problem:** The lead list endpoint (E6) supports sorting by "last activity." Without a denormalized `lastActivityAt` on the `leads` table, this sort requires a correlated subquery or JOIN to the `activities` table:

```sql
SELECT leads.*, MAX(a.createdAt) AS lastActivityAt
FROM leads
LEFT JOIN activities a ON a.relatedLeadId = leads.id
GROUP BY leads.id
ORDER BY MAX(a.createdAt) DESC
```

On a 5,000-lead org with 10+ activities per lead (50,000+ activity rows), this aggregation query is expensive. It cannot use the lead-list index. The EXPLAIN ANALYZE will almost certainly show a sequential scan or hash aggregate that breaks the P95 < 400ms requirement.

The AI scoring model (doc 13 §13.2) also uses `daysOld` (from `createdAt`) and would benefit from `lastActivityAt` to compute "days since last activity" without a DB round-trip.

**Resolution:** Add `lastActivityAt TIMESTAMP NULL` to the `leads` table. In the `ActivityService.append()` method, after inserting the activity row, issue a `withTenant` update:
```
leads.update({ where: { id: input.relatedLeadId }, data: { lastActivityAt: new Date() } })
```
This is a write-through denormalization. The field is updated on every activity append for the lead, keeping it current with O(1) reads at query time.

Similarly consider `lastContactedAt TIMESTAMP NULL` — set when a message is sent/received (Sprint 6). The AI scoring prompt uses `lastMessageDaysAgo`; deriving this from a JOIN at scoring time is feasible but adds latency.

---

### 3.5 HIGH: `ActivityType`-to-metadata mapping is untyped

**Problem:** The `activities.metadata JSONB` field holds type-specific data. The plan lists the enum values (`LEAD_STATUS_CHANGED`, `TASK_COMPLETED`, etc.) but does not define what `metadata` looks like for each type.

The Workflow Engine (Sprint 7) evaluates conditions against activity metadata:
```json
{ "field": "activity.metadata.fromStatus", "operator": "EQUALS", "value": "NEW" }
```
If `metadata.fromStatus` is sometimes `"fromStatus"` and sometimes `"from_status"` (a simple naming inconsistency during implementation), workflow conditions silently never match. This is a class of bug that is nearly impossible to debug post-launch.

**Resolution:** Define a TypeScript discriminated union in `packages/shared/src/constants/activity-metadata.ts` (new file) before any ActivityService code is written:

```typescript
type ActivityMetadata =
  | { type: 'LEAD_STATUS_CHANGED'; fromStatus: LeadStatus; toStatus: LeadStatus }
  | { type: 'LEAD_ASSIGNED'; previousAssigneeId: string | null; newAssigneeId: string }
  | { type: 'LEAD_WON'; contactId: string }
  | { type: 'TASK_COMPLETED'; taskId: string; taskTitle: string }
  | { type: 'NOTE_ADDED'; noteId: string }
  | { type: 'FILE_UPLOADED'; fileId: string; fileName: string; mimeType: string }
  // ...
```

This type is the contract between the ActivityService (writer) and the Workflow Engine (reader). Any mismatch becomes a TypeScript compile error, not a silent runtime failure.

---

### 3.6 HIGH: `leads.notes` vs the `notes` table — two note surfaces

**Problem:** The `leads` schema includes `notes TEXT NULL` (described as "Quick notes — not rich-text"). Sprint 4 also builds a dedicated `notes` table (rich-text, per-entity). This creates two separate places to write notes on a lead.

The consequences:
- Users will be confused about which notes field to use.
- FTS search on leads (the tsvector index on `firstName || lastName || email`) includes `leads.notes`, but rich-text notes from the `notes` table are not in the lead-level index. Search results are inconsistent.
- The workflow engine condition evaluator will have `lead.notes` (the quick-note field) and separate notes-table entries — two different data paths, both needing surfacing.
- Mobile/compact views will show both, fragmenting the UX.

**Recommendation:** Remove `leads.notes TEXT NULL` from the Sprint 4 schema. The `notes` table is the single surface for notes on any entity. If a "quick note at creation time" use case is needed (common in CRM data entry flows), implement it as: POST /leads (with optional `note` in the body) creates a `Note` record in the same transaction. Do not store notes as a column on the lead.

If `leads.notes` is kept for any reason (e.g., legacy migration of existing lead notes from another system), document it explicitly as deprecated and not shown in the UI, to be dropped in a future migration.

---

### 3.7 HIGH: Lead `WON` status is reachable via two paths — invariant is ambiguous

**Problem:** The Sprint 4 status machine allows `NEGOTIATION → WON` via `PATCH /leads/:id` (direct status update). The `convert()` operation also transitions to `WON` (and creates a contact atomically). These two paths produce different data states:

- `PATCH → WON`: `leads.convertedToContactId = null`, no contact row created.
- `convert() → WON`: `leads.convertedToContactId = contact.id`, contact row exists.

This ambiguity means you cannot query `WHERE status = 'WON'` and know whether a contact record exists. The Customer 360 profile (a contact record with full history) cannot be reliably constructed. Analytics that count "won leads with a linked contact" will be wrong.

**Decision required (one of two options):**

- **Option A:** `WON` is only reachable via `convert()`. Remove `WON` from the allowed direct PATCH status transitions. The status machine becomes: open states → `LOST` (direct), open states → `WON` only via `POST /leads/:id/convert`. A 400 is returned if a client tries to PATCH status to `WON` directly.

- **Option B:** `WON` is reachable via direct PATCH (for simple "close without creating a contact" use cases). In this case, the convert operation sets an additional flag or a separate status value (e.g., `CONVERTED`) distinct from `WON`. The two terminal states are different: `WON` (manual close) vs `CONVERTED` (full lead→contact lifecycle).

**Recommendation: Option A.** It enforces data integrity, produces a clean Customer 360, and simplifies the analytics query. Agencies and clinic owners — the primary personas — expect that winning a lead means creating a customer record. The CONVERTED path without a contact is a data quality problem in the making.

---

## 4. Relationship Modeling Issues

### 4.1 No `instagramAccountId` on leads — attribution is lost

**Problem:** The `leads` table has `instagramHandle VARCHAR(100)` and `instagramUserId VARCHAR(50)`. These identify the *lead's* Instagram identity but not *which* of the org's Instagram accounts the lead came from.

For an agency owner managing 10 client IG accounts, this distinction is the entire point. "Which of Client A's, Client B's, or Client C's accounts did this lead DM?" is an unanswerable question without this FK.

For the AI scoring model, the `orgAvgWinRate` and `orgAvgSalesCycle` context signals should ideally be per-account, not per-org — a property management firm's IG account for rentals has different win rates than their sales account.

**Resolution:** Add `instagramAccountId UUID NULL FK → instagram_accounts.id` to `leads`. NULL for manually-created leads. Set to the source account when created via webhook in Sprint 6. This FK is to a table that does not exist in Sprint 4 — defer enforcement the same way as `pipelineStageId` (add as a plain UUID column in 0006, add FK constraint in Sprint 6's migration).

Also add `whatsappAccountId UUID NULL FK → whatsapp_accounts.id` for the same reason in V2.

### 4.2 Activity FK constraint — at least one related entity must be non-null

**Problem:** The `activities` table has three nullable FKs: `relatedLeadId`, `relatedDealId`, `relatedContactId`. An activity with all three null is a phantom record — it exists but has no entity to display under. There is no DB-level guard preventing this.

**Resolution:** Add a CHECK constraint to the `activities` migration:
```sql
CONSTRAINT activities_must_have_entity
  CHECK (
    relatedLeadId IS NOT NULL OR
    relatedDealId IS NOT NULL OR
    relatedContactId IS NOT NULL
  )
```
This is enforced at the DB level, not the service layer — it cannot be accidentally bypassed by future code.

### 4.3 Lead dedup — merge operation is planned but unspecified

**Problem:** FR-LEAD-007 specifies: "System flags leads with matching email or phone; User prompted to merge or ignore; **Merge combines activity history**."

The Sprint 4 plan implements dedup detection (409 on create with `existingLeadId`) but does not specify or implement the merge operation. This is partially acceptable for Sprint 4 — the user can manually handle duplicates. However, the merge operation's data contract needs to be decided before Sprint 4 ships because it has schema implications:

When leads are merged (winner + loser):
- All `activities` with `relatedLeadId = loser.id` must be reassociated (UPDATE) or left pointing to `loser.id` (which becomes soft-deleted).
- All `tasks`, `notes`, `files` with `relatedLeadId = loser.id` face the same choice.
- The `loser` lead needs a `mergedIntoLeadId UUID NULL FK → leads.id` field to record the merge event.

If `mergedIntoLeadId` is not in the schema from the start, the Sprint 5/6 migration that adds merge functionality cannot trace which lead "won."

**Resolution:** Add `mergedIntoLeadId UUID NULL` to `leads` in migration `0006`. Leave it null for now. The merge operation (deferred to a future milestone) will set this. The FK to `leads.id` creates a self-referencing FK — Postgres allows this. Document that the field is a planned extension, not an active feature in Sprint 4.

---

## 5. Index & Performance Risks

### 5.1 FTS index is not tenant-scoped — multi-tenant search degradation

**Problem:** The plan creates a GIN tsvector index on `leads(firstName, lastName, email)`. This index is global across all tenants. A search for "Rahul" on a 100-tenant platform where each tenant has 1,000 leads scans the GIN index against all 100,000 rows, then RLS filters to the requesting org's 1,000. At 1M total rows, the search touches 1M index entries to return 10 results.

There is no way to create a truly tenant-scoped GIN index in Postgres (partial indexes can filter by a scalar but not by a RLS-scoped context variable). The mitigation is:

**Resolution (two-pronged):**
1. Add a partial index that at least excludes soft-deleted rows: `CREATE INDEX CONCURRENTLY leads_fts_idx ON leads USING GIN(to_tsvector('english', ...)) WHERE deletedAt IS NULL`. This eliminates deleted rows from the scan.
2. For the query: use `WHERE "organizationId" = $1 AND to_tsvector(...) @@ query` with the organizationId literal in the query (not just via RLS). The planner will use the B-tree index on `organizationId` first (or the composite index `(organizationId, status)`) to filter down to the org's rows, then apply the tsvector match. At per-org row counts < 50,000, this will be fast. At scale (> 100K per org), a dedicated search solution (Postgres full-text with per-org partitioning, or a search service like Typesense) should replace this.

Document the scale threshold in `LEAD_LIST_QUERY_ANALYSIS.md` when it is written.

### 5.2 Missing composite index for the "my tasks" view

The plan mentions a "my tasks" query: `WHERE assignedToId = ctx.userId AND status IN ('PENDING', 'IN_PROGRESS') AND deletedAt IS NULL`. The blueprint's task index is `(organizationId, assignedToId, status)`. Within RLS (GUC = orgId), this index is sufficient. Verify in EXPLAIN ANALYZE.

The case to check: a manager viewing "all team tasks" (no `assignedToId` filter) with a status filter — this should use `(organizationId, status)` as a composite. If this index is missing, add it to migration `0007_crm_indexes`.

### 5.3 Activities table will be the largest table — no partition plan

The `activities` table grows on every mutation of every entity (leads, contacts, tasks, notes, files). For an org with 1,000 leads × 10 state changes + 5 tasks each × 2 status changes + notes/files events = potentially 20,000+ activity rows per mid-sized org. Across 5,000 orgs, this reaches 100M+ rows before V2.

The blueprint's DB design (§8.4) flags `audit_logs` and `activities` for range partitioning by `createdAt`. The Sprint 4 plan does not mention creating the partitioned table structure early.

**Resolution:** Create `activities` as a range-partitioned table in migration `0006` from day one (even with one initial partition covering all dates), consistent with `FINAL_ARCHITECTURE.md §7.3` ("partitioned table structures created early for `activities`/`audit_logs` — SC-1/DB-2"). Adding partitioning after 100M rows on a live system is an operational emergency.

---

## 6. Future Migration Risks

### 6.1 What will hurt in Sprint 5 (Pipeline/Deals)

The `leads` table has `pipelineStageId` (FK issue noted in §3.1) and `convertedToContactId`. When deals are built in Sprint 5, `deals` will have `leadId FK → leads.id NULL` and `contactId FK → contacts.id NULL`. This creates a three-way relationship: `Lead → Contact → Deal`. The data model correctly uses nullable FKs, so this will work. No schema change required to `leads` in Sprint 5 beyond the `pipelineStageId` FK constraint.

However: the `leads.status` machine currently has no `IN_DEAL` or `IN_PIPELINE` state. Once a lead has an associated deal, should its status automatically reflect the deal stage? Or are lead status and deal stage independent? This business rule needs to be documented now, because it affects how the Lead Detail page is designed and whether `LEAD_STATUS_CHANGED` activities are emitted when deals move.

### 6.2 What will hurt in Sprint 6 (Instagram Inbox)

The `instagram_conversations` table has `relatedLeadId FK → leads.id NULL`. The assumption is one-to-one: one conversation per lead from a given IG account. But a returning lead (who DMs again months later) may create a second conversation. The `instagramScopedUserId` (IGSID) is the dedup key for the conversation upsert, so the second conversation just reopens the existing one. This is fine.

What is NOT fine: the lead created from an Instagram DM in Sprint 6 will need `instagramAccountId` set (§4.1). If this column is not added in Sprint 4, Sprint 6 will require a migration against a live table that may already have production data. Add it now as a plain UUID column.

### 6.3 What will hurt in Sprint 7 (AI layer)

The AI scoring worker in Sprint 7 will need to:
1. Read the lead (within `withTenant`).
2. Read the lead's activities (within `withTenant`, counting by type).
3. Write the `ai_scores` row.
4. Update `leads.aiScore` and `leads.aiScoreUpdatedAt`.

If `ai_scores` does not exist (§3.2), the Sprint 7 team will need to create a migration against a table that is already in production, populate it from the scalar columns, and update the `leados_app` RLS grants. Do it now.

Additionally, the AI follow-up recommendation feature (doc 13 §13.5) reads "last 5 activities" and "last 10 messages." Without `lastActivityAt` on leads (§3.4), finding "which leads have had no activity in 30 days" requires a GROUP BY aggregation on `activities` — expensive at scale.

### 6.4 What will hurt in Sprint 8 (Analytics)

Analytics will need:
- Lead count by status, source, assignee (requires composite indexes already planned).
- Time-in-status analysis: "how long was this lead in CONTACTED before moving to QUALIFIED?" This requires the `activities` table `LEAD_STATUS_CHANGED` records with their timestamps. The metadata shape (§3.5) must be consistent for this to work.
- Score trend analysis: requires the `ai_scores` time series (§3.2).
- Custom field analytics: "which custom fields have the highest lead counts?" — requires `custom_field_definitions` to know what fields exist (§3.3).

### 6.5 File storage orphan accumulation

Soft-deleted files remain in S3/Cloudinary indefinitely. No cleanup job is planned. For Sprint 4 this is a cost concern, not a correctness concern. Before launch, a nightly cleanup worker should be on the roadmap: `WHERE deletedAt < NOW() - INTERVAL '30 days'` → delete from storage → hard delete record.

---

## 7. Data Integrity Gaps

### 7.1 `team_invites` table is absent from the entire model

Team growth — inviting new members via email link — is a core V1 workflow (FR: "sends invite email from Team Settings; magic link; 7-day expiry"). The invite token must be stored server-side to validate when clicked.

There is no `team_invites` (or equivalent) table in Sprint 2, Sprint 3, or Sprint 4 planning documents. The auth module presumably handles registration but the invite-link-to-new-user flow requires a token table.

**Resolution:** Add `team_invites` to Sprint 4 migration `0006`:

```
team_invites
  id              UUID PK
  organizationId  UUID FK NOT NULL    — tenant key
  email           VARCHAR(255) NOT NULL
  roleId          UUID FK → roles.id NOT NULL
  tokenHash       VARCHAR(255) NOT NULL UNIQUE  — SHA-256 of the raw token
  invitedById     UUID FK → users.id NOT NULL
  expiresAt       TIMESTAMP NOT NULL
  acceptedAt      TIMESTAMP NULL
  createdAt       TIMESTAMP NOT NULL
```

Add to TENANT_TABLES registry. Add RLS policy. The auth module's invite flow reads this table to validate the token on click — the auth path uses the admin connection for this (same as other auth identity reads, which is correct).

### 7.2 `saved_replies` table is absent — Sprint 6 will need a mid-flight migration

FR-INBOX-006 specifies saved reply templates: "org-level and personal templates," accessible via `/` shortcut. This is an inbox-level feature (Sprint 6), but `saved_replies` is a tenant-scoped table that should be created, RLS-enabled, and registered now. Creating it in Sprint 6's migration means Sprint 6 must add it to the TENANT_TABLES registry, update `check:rls` expected count, and run the new RLS migration — all while the Sprint 4 isolation suite tests are running against the existing table count. This is manageable but adds friction.

**Resolution:** Add `saved_replies` as a shell table in Sprint 4 migration `0006`. The table can be empty and without service layer in Sprint 4. Sprint 6 adds the routes and service. The schema:

```
saved_replies
  id              UUID PK
  organizationId  UUID FK NOT NULL
  title           VARCHAR(255) NOT NULL
  content         TEXT NOT NULL
  shortcut        VARCHAR(50) NULL
  isGlobal        BOOLEAN DEFAULT true    — org-level vs personal
  createdById     UUID FK → users.id NOT NULL
  createdAt       TIMESTAMP NOT NULL
  updatedAt       TIMESTAMP NOT NULL
  deletedAt       TIMESTAMP NULL
```

### 7.3 Notes format — XSS surface and workflow interpolation risk

**Problem:** The `notes` table stores `content TEXT NOT NULL` described as "rich text (HTML/JSON)." The format is unspecified. This matters for two reasons:

1. **XSS:** If content is stored as raw HTML and rendered in the frontend without sanitization, any note containing `<script>` or an event attribute is a stored XSS attack. CRM notes entered by sales reps are typically not sanitized by an attacker, but whitelisted HTML from a rich-text editor needs sanitization before storage or before render.

2. **Workflow interpolation:** The workflow action `SEND_EMAIL` can reference `{{note.content}}` (doc 12 §12.2). If content is Tiptap/ProseMirror JSON (e.g., `{"type":"doc","content":[...]}`) and the workflow interpolates it as-is, the email body contains raw JSON. If content is HTML, the email contains raw HTML which may or may not render correctly depending on the email client.

**Decision required:**
- **Option A (Recommended for V1):** Store as **ProseMirror/Tiptap JSON** (a serializable document structure). Render in the frontend via the same Tiptap editor in read mode. For workflow/email interpolation, produce a plain-text rendering of the JSON at interpolation time. This is the safest option — JSON cannot be directly executed as XSS.
- **Option B:** Store as **Markdown**. Simple, portable, renderable. Loses drag-and-drop images and complex formatting.
- **Option C:** Store as **sanitized HTML** (DOMPurify-processed before storage). Simplest for email body interpolation but requires a trust boundary at every write path.

Whichever option is chosen, document it in the sprint plan before implementation, and ensure the shared Zod schema for `NoteInput` validates against the chosen format.

---

## 8. Cross-Cutting Architecture Observations

### 8.1 Event names are not yet the authoritative bus contract

`packages/shared/src/constants/events.ts` exists but was not reviewed in detail. The activity types (added to `enums.ts`) and the workflow trigger types (JSONB in the `workflows` table) and the `eventBus.emit()` call sites in domain services must all use the same string keys. If `ActivityType.LEAD_STATUS_CHANGED` in the enum is emitted as `'lead.status_changed'` on the event bus and the workflow trigger config says `{ "type": "LEAD_STATUS_CHANGED" }`, workflows will never fire.

**Mandate:** All `eventBus.emit(eventName, payload)` calls in Sprint 4 domain services must use string constants imported from `packages/shared/src/constants/events.ts`. If an event name is not in that file, add it there first. No inline string literals for event names anywhere in the codebase.

### 8.2 The `notes` vs `activities` boundary needs documentation

Activities are auto-generated by the system on mutations (LEAD_CREATED, STATUS_CHANGED, etc.). Notes are user-authored, intentional records. Both appear in the entity timeline.

The Lead Detail "Activity Timeline" (FR-PIPELINE-006, implied for leads too) will show both. When rendering the timeline, the query must union:
- `SELECT * FROM activities WHERE relatedLeadId = $1`
- `SELECT * FROM notes WHERE relatedLeadId = $1`
- `SELECT * FROM tasks WHERE relatedLeadId = $1`

This union must be performed in the service layer (not in a raw SQL UNION — that crosses module boundaries). The `activities` module should expose a `getTimeline(leadId)` method that composes this. This architectural boundary should be decided now, before each module independently builds its own "get for lead" query.

### 8.3 AI scoring input requires data that doesn't exist until Sprint 6+

The AI scoring input (doc 13 §13.2) includes:
- `messageCount` — requires `messages` table (Sprint 6)
- `lastMessageDaysAgo` — requires `messages` (Sprint 6)
- `pipelineStageName` / `stageProbability` — requires Pipeline/Deals (Sprint 5)

When AI scoring runs in Sprint 7 against leads created in Sprint 4, these fields will be null or zero. The scoring prompt must handle null gracefully ("no messages yet" → treat as cold lead). The AI scoring service should be designed with explicit null-handling for each field, not assuming they are populated.

Document this in the Sprint 7 plan: the scoring model's first few months of output will be based on partial signals. Accuracy will improve as more data flows in from Sprints 5 and 6.

### 8.4 The `source` field must be immutable at the DB level, not just by convention

The plan states "source tracking: immutable after creation." But immutability enforced only in the service layer (validation) can be bypassed by a future engineer who accesses the repository directly, by a migration script, or by an admin API shortcut.

**Resolution:** Add a Postgres trigger on `leads` that raises an exception if `source` is updated after creation:
```sql
CREATE FUNCTION prevent_source_update() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.source <> OLD.source THEN
    RAISE EXCEPTION 'lead.source is immutable after creation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leads_source_immutable
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION prevent_source_update();
```
This makes immutability a data contract, not a convention.

### 8.5 Round-robin assignment needs state — not just a stub

The plan mentions "round-robin auto-assignment option per pipeline" as a stub. Round-robin requires state: which member was last assigned? Without a counter or timestamp, round-robin cannot be implemented without a full-table scan of recent assignments.

This state needs a home. Options:
- A `round_robin_state` column on `pipelines` (a counter, incremented on each assignment, modulo member count).
- A Redis key per org per pipeline (simpler, but Redis is tier-1 correctness infra per the architecture — do not use it as a source of truth for assignment state that must survive Redis restarts).

**Recommendation:** Add `assignmentCursor SMALLINT DEFAULT 0` to the `pipelines` table (created in Sprint 5). In Sprint 4, the "round-robin stub" documents this future field. Do NOT implement a Redis-only round-robin that loses its state on restart.

---

## 9. Recommended Changes Before Implementation

Prioritized in implementation order. Items marked **[BLOCKING]** must be resolved before migration `0006` is written.

| # | Priority | Change | When |
|---|---|---|---|
| **REC-1** | **BLOCKING** | Remove `pipelineStageId` FK constraint from migration `0006`. Store as plain `UUID NULL`. Add FK in Sprint 5. | Before 0006 |
| **REC-2** | **BLOCKING** | Decide `WON` status access: Option A (convert-only) or Option B (new `CONVERTED` status). Update status machine spec accordingly. | Before 0006 |
| **REC-3** | Critical | Add `ai_scores` table to migration `0006`. Keep `leads.aiScore` / `aiScoreUpdatedAt` as denormalized cache. Add to TENANT_TABLES + RLS. | Before 0006 |
| **REC-4** | Critical | Add `custom_field_definitions` table to migration `0006`. Add to TENANT_TABLES + RLS. Update PLAN_LIMITS check for `customFieldsPerObject`. | Before 0006 |
| **REC-5** | Critical | Add `lastActivityAt TIMESTAMP NULL` to `leads`. Update `ActivityService.append()` to write through on `relatedLeadId`. | Before 0006 |
| **REC-6** | Critical | Remove `leads.notes TEXT NULL` column. Quick notes at lead creation go to the `notes` table via the same transaction. | Before 0006 |
| **REC-7** | High | Define `ActivityMetadata` discriminated union in `packages/shared` before ActivityService is written. | Before E4 code |
| **REC-8** | High | Add `mergedIntoLeadId UUID NULL` to `leads` in migration `0006` (no FK in Sprint 4; add in the merge milestone). | Before 0006 |
| **REC-9** | High | Add `instagramAccountId UUID NULL` (no FK in Sprint 4; FK added in Sprint 6 migration). | Before 0006 |
| **REC-10** | High | Add `team_invites` table to migration `0006`. Add to TENANT_TABLES + RLS. | Before 0006 |
| **REC-11** | High | Add `saved_replies` table to migration `0006` as a shell. Add to TENANT_TABLES + RLS. | Before 0006 |
| **REC-12** | High | Add `activities` table as range-partitioned on `createdAt` from creation, per SC-1/DB-2 directive. | In 0006 |
| **REC-13** | High | Add CHECK constraint on `activities`: at least one of `relatedLeadId`, `relatedDealId`, `relatedContactId` must be non-null. | In 0006 |
| **REC-14** | Medium | Decide note content format (Tiptap JSON / Markdown / sanitized HTML). Document in shared Zod schema for `NoteInput`. | Before E5 code |
| **REC-15** | Medium | Mandate event name constants: all `eventBus.emit()` calls use string constants from `packages/shared/src/constants/events.ts`. | Before E2 code |
| **REC-16** | Medium | Add Postgres trigger: `leads.source` immutable after creation. Add to migration `0008` (or `0006` directly). | In 0008 or 0006 |
| **REC-17** | Medium | Add partial index on FTS: `WHERE "deletedAt" IS NULL`. Document scale threshold for FTS strategy review. | In 0007 |
| **REC-18** | Medium | Document "at least one null FK path per activity type" in the `ActivityType` enum comments in `packages/shared`. | Before E4 code |
| **REC-19** | Low | Note `leads.pipelineStageId` is unconstrained in Sprint 4 in migration comment. Ditto `instagramAccountId`. | In 0006 |
| **REC-20** | Low | Backlog: nightly file cleanup worker for `deletedAt < NOW() - 30 days` entries in S3/Cloudinary. | Sprint 8 / pre-launch |

---

## 10. Summary Verdict

The Sprint 4 execution plan is architecturally sound in its approach and correctly sequences the six epics. The tenancy, RBAC, and audit foundations from Sprint 3 mean the new domain modules inherit correctness guarantees without extra work.

**The data model has three omissions that will require disruptive migrations if not fixed before Sprint 4 implementation begins:** the `ai_scores` table, the `custom_field_definitions` table, and the `pipelineStageId` FK ordering error. These are not "clean up later" items — they are schema decisions that every subsequent sprint (5 through 8) builds on top of. Adding a table after 5,000 organizations have leads in it requires a coordinated migration with downtime windows or online migration tooling that the team does not currently have.

The recommendation is clear: **spend one day revising migration `0006` to include REC-1 through REC-13 before any domain code is written.** The migrations are cheap to change now. They are expensive to change after Sprint 5 ships.

---

*Audit only. No code changes. No schema modifications. No commits.*
*Source of truth: `FINAL_ARCHITECTURE.md`, `MODULE_DEPENDENCY_GRAPH.md`, `docs/blueprint/08-DATABASE-DESIGN.md`, `docs/blueprint/03-FUNCTIONAL-REQUIREMENTS.md`, `docs/blueprint/11-RBAC-DESIGN.md`, `docs/blueprint/12-WORKFLOW-ENGINE.md`, `docs/blueprint/13-AI-LAYER.md`, `docs/blueprint/14-INSTAGRAM-INTEGRATION.md`.*
