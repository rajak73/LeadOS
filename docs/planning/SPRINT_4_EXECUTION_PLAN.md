# SPRINT_4_EXECUTION_PLAN.md

> **Sprint 4 — CRM Core — execution plan**
> Author: Engineering, LeadOS · Date: 2026-06-19
> Source of truth: `FINAL_ARCHITECTURE.md`, `MODULE_DEPENDENCY_GRAPH.md`, `SPRINT_3_M6_FINAL_SIGNOFF.md`, `DEVELOPMENT_ROADMAP.md` (Sprint 4), `docs/blueprint/08-DATABASE-DESIGN.md`, `packages/shared/src/constants/`.
> Planning only — no code, no file changes.

---

## 0. Context & Premise

Sprint 3 delivered and verified the complete L1 layer: multi-tenancy (DB roles + RLS + Prisma extension + withTenant), RBAC enforcement, audit foundations, and the three-layer cross-tenant isolation suite as a required CI gate. Sprint 3 is **FULL PASS** (commit `4235aa3`, CI `27818177294`, Isolation Suite `27818177252`).

Sprint 4 builds the first L2 domain layer — **CRM Core** — directly on top of that proven foundation. Per `MODULE_DEPENDENCY_GRAPH.md`, `Leads` is the highest-fan-in model in the system: Pipeline/Deals, Instagram Inbox, AI scoring, and the Workflow Engine all reference it. The model must be designed once, deliberately. Do not rush schema decisions.

### What Sprint 3 left for Sprint 4

| Item | Origin | Required action |
|---|---|---|
| **D-M3-2** | M3 | Auth identity reads (login, register, token refresh) connect as admin by design (§FINAL_ARCH §2.1). Must be explicitly guarded and boundary-tested before domain modules build on L1. |
| **D-INFRA-1** | M6 signoff | Deploy API Docker image build fails: Prisma cannot detect OpenSSL in Alpine container during `pnpm install`. Blocks every API deploy. Fix before domain modules land. |
| **D-M6-1** | M6 | ownOnly integration gap — no domain HTTP endpoints exercise `leads.read_own` or `*_own` variants. Resolved in M4 (SALES_EXECUTIVE own-lead access on the real leads endpoints). |
| **D-M6-2** | M6 signoff | Branch protection: `isolation / Isolation Suite` not yet a required status check. Manual GitHub admin action. |
| **D-M5-1/2** | M5 | Audit writes are best-effort / separate transaction. Accepted; unchanged. |

### Objective → Epic map

| Objective | Epic |
|---|---|
| Resolve pre-sprint blockers; lay correctness guarantees | **P0** Pre-Sprint Prerequisites |
| New domain tables, RLS, TENANT_TABLES extension, indexes | **E1** Schema & RLS Foundation |
| Lead CRUD, status machine, assignment, dedup, plan-limits | **E2** Lead Module |
| Contact CRUD, lead→contact conversion (atomic) | **E3** Contact Module & Conversion |
| Immutable activity feed, task CRUD, ownOnly integration | **E4** Activity Feed & Tasks |
| Rich-text notes, presigned file uploads, file metadata | **E5** Notes & Files |
| Lead list query, FTS/trgm, CSV import (async), export | **E6** Lead List, Search & CSV |

---

## 1. Cross-Cutting Constraints (apply to every epic)

These are NOT a checklist at the end — they must be **threaded through every task as it is built**. Retrofitting is the classic 0→1 trap.

| Constraint | Enforcement |
|---|---|
| **Tenant scoping** — every query on a tenant model goes through `withTenant` + the Prisma extension | ESLint module-boundary rule + runtime `TenantScopeError` on any direct-client use |
| **RBAC + own-only filter** — every protected endpoint calls `requirePermission`; services respect `ctx.ownOnly` | Middleware; integration tests asserting 403 without permission |
| **Plan-limit check** — every create-path reads `PLAN_LIMITS[plan]` from `packages/shared` and returns 429 on overage | Single `enforceLimit(org, resource, count)` helper; imported, not copied |
| **Activity emission** — every auditable mutation (create/update/delete on leads, contacts, tasks, notes, files) appends a row to `activities` | Activity service called by each domain service; not optional |
| **Audit logging** — all mutations go through the existing `AuditService`; PII (email, phone) masked in before/after snapshots | Existing pattern from M5; now applied to new tables |
| **Zod validation** — every request boundary validated; schemas in `packages/shared/src/schemas/` | Middleware; 422 on invalid input |
| **Module boundary** — no module directly accesses another module's Prisma models; service interfaces only | ESLint `no-restricted-imports`; CI fails on violation (R-ARCH-1) |
| **Observability** — new module routes log at entry/exit with tenant id; external calls instrumented | Winston/OTel pattern from Sprint 1; applied consistently |

---

## 2. Epics & Tasks

### P0 — Pre-Sprint Prerequisites

These must be resolved **before M1 begins**. None require new Prisma schema or domain modules.

#### P0-1: Fix D-INFRA-1 — Deploy API Docker build (Prisma + OpenSSL)

**Problem:** The `Build API image` step fails in every CI deploy run because the Prisma postinstall script cannot detect OpenSSL inside the Alpine-based container. Root cause confirmed in CI run `27818177288`: `prisma:warn Prisma failed to detect the libssl/openssl version to use` → `Error: Command failed with exit code 1: pnpm add prisma@5.22.0 -D --silent`.

**Fix path:**
1. Add explicit `binaryTargets` to `prisma/schema.prisma` (the generator block): include `"linux-musl-openssl-3.0.x"` alongside `"native"` so the Prisma binary appropriate for Alpine Linux is bundled into the image.
2. Verify the Dockerfile has `openssl` installed in the Alpine layer before `pnpm install` runs.
3. Confirm: push a commit → Deploy API `Build API image` step → success.

**Acceptance:** Deploy API workflow conclusion = `success` on the next push. All prior deploy-api failures (M4, M5, M6) had the same root cause; this fix closes them all.

#### P0-2: Resolve D-M3-2 — Auth path admin-connection boundary

**Problem:** Auth identity reads (`findUserByEmail` at login, `findUserById` in auth middleware, `findOrgById` during registration, `findRefreshToken` on token refresh) use the raw admin Prisma client. Per `FINAL_ARCHITECTURE.md §2.1`, this is **by design** — these are pre-tenant identity operations that must not use the tenant extension or `withTenant`. The risk (D-M3-2) is that if this boundary is blurred — or if a future engineer moves these reads to the tenant client — they will silently return 0 rows.

**Resolution tasks:**
1. Add an explicit JSDoc `@admin-only` marker and a short comment to each auth-path query explaining why it uses the raw `prisma` client (not `withTenant`).
2. Add a lint rule or boundary test: a fast unit test that asserts `AuthRepository.findUserByEmail` does NOT import or use `withTenant`. This fails if a future engineer accidentally ports the method.
3. Document in a `docs/planning/` note which query paths are permanently admin-only vs. those that could migrate to `withTenant` in future.

**Acceptance:** `pnpm test` stays green; a new test in `auth.repository.test.ts` asserts the admin boundary; the comment is in place.

#### P0-3: Set D-M6-2 — Branch protection (admin action)

Add `isolation / Isolation Suite (ISO-1 / ISO-2 / ISO-3)` to GitHub branch protection required status checks for `main`. This is a one-time manual action in the GitHub repository settings by the platform admin. Not a code task; tracked here so it is not forgotten before the first Sprint 4 PR lands.

---

### E1 — Schema & RLS Foundation

**Gate: nothing in E2–E6 starts until migrations are green and `check:rls` covers all new tables.**

#### CRM-1.1: Prisma schema — new domain models

Add the following models to `prisma/schema.prisma`. All carry `organizationId UUID NOT NULL` (the tenant key).

> **⚠ UPDATED per `SPRINT_4_SCHEMA_REMEDIATION_PLAN.md`.** Models below reflect all approved remediation changes. See revision document `SPRINT_4_SCHEMA_REVISION.md` for full rationale.

| Model | Key fields | Notes |
|---|---|---|
| `Lead` | id, organizationId, firstName, lastName, email, phone, source (LeadSource — **immutable, DB trigger**), status (LeadStatus — **WON only via convert()**), assignedToId, aiScore, aiScoreUpdatedAt, instagramHandle, instagramUserId, **instagramAccountId** (plain UUID — FK deferred Sprint 6), tags (String[]), customFields (Json), lostReason, convertedToContactId, **pipelineStageId** (plain UUID — FK deferred Sprint 5), **mergedIntoLeadId** (plain UUID — deferred), **lastActivityAt**, createdById, deletedAt | Root L2 object; highest fan-in in the system. **`notes TEXT` column removed** — use Note model. |
| `Contact` | id, organizationId, firstName, lastName, email, phone, company, jobTitle, avatarUrl, address (Json), tags (String[]), customFields (Json), lifeTimeValue, assignedToId, **lastActivityAt**, createdFromLeadId, createdById, deletedAt | |
| `Task` | id, organizationId, title, description, type (TaskType), priority (TaskPriority), status (TaskStatus), dueDate, completedAt, assignedToId, relatedLeadId, relatedDealId (plain UUID — FK deferred Sprint 5), relatedContactId, createdById, deletedAt | |
| `Activity` | id, organizationId, type (ActivityType), description, metadata (Json — **typed by ActivityMetadata union**), performedById, relatedLeadId, relatedDealId, relatedContactId, createdAt | **No `updatedAt`. No `deletedAt`. Immutable by design.** **PARTITION BY RANGE(createdAt)**. **CHECK: at least one entity FK non-null.** DB triggers enforce immutability. |
| `Note` | id, organizationId, content (**JSONB** — Tiptap document, **not TEXT**), relatedLeadId, relatedDealId (plain UUID — FK deferred Sprint 5), relatedContactId, createdById, deletedAt | |
| `File` | id, organizationId, name, storageKey, storageProvider (StorageProvider), mimeType, sizeBytes, url, relatedLeadId, relatedDealId (plain UUID — FK deferred Sprint 5), relatedContactId, uploadedById, deletedAt | No `updatedAt` (files are immutable after upload) |
| **`AiScore`** (NEW) | id, organizationId, leadId, score, confidence, factors (Json), recommendation, triggeredBy, modelVersion, createdAt | Structured AI output. Immutable. Sprint 7 writes here; Sprint 4 creates empty table. |
| **`CustomFieldDefinition`** (NEW) | id, organizationId, objectType (LEAD\|CONTACT\|DEAL), fieldKey, displayLabel, fieldType (TEXT\|NUMBER\|DATE\|SELECT\|MULTI_SELECT\|BOOLEAN\|URL), options (Json?), isRequired, position, createdById, deletedAt | Required for FR-LEAD-009. PLAN_LIMITS enforced on create. |
| **`TeamInvite`** (NEW) | id, organizationId, email, roleId, tokenHash, invitedById, expiresAt, acceptedAt, revokedAt, createdAt | Token store for invite links. Auth path uses admin client (D-M3-2 boundary). |
| **`SavedReply`** (NEW shell) | id, organizationId, title, content, shortcut, isGlobal, createdById, deletedAt | Shell only — no routes in Sprint 4. Routes added Sprint 6. |

**Enums to add/update in `prisma/schema.prisma` and mirror in `packages/shared/src/constants/enums.ts`:**

`ActivityType` (19 values — canonical set):
```
LEAD_CREATED, LEAD_STATUS_CHANGED, LEAD_ASSIGNED, LEAD_WON, LEAD_LOST,
CONTACT_CREATED, CONTACT_UPDATED,
TASK_CREATED, TASK_COMPLETED, TASK_CANCELLED,
NOTE_ADDED, NOTE_UPDATED, NOTE_DELETED,
FILE_UPLOADED, FILE_DELETED,
DEAL_CREATED, DEAL_STAGE_MOVED, DEAL_WON, DEAL_LOST
```

`StorageProvider` (`S3`, `CLOUDINARY`) — already in schema; verify present.

`CustomFieldObjectType` (NEW): `LEAD`, `CONTACT`, `DEAL`

`CustomFieldType` (NEW): `TEXT`, `NUMBER`, `DATE`, `SELECT`, `MULTI_SELECT`, `BOOLEAN`, `URL`

**`check:enum-parity` must remain green** after these additions (CI enforces it).

**Shared package additions — HARD GATES (block specific E-steps):**

| File | Required before | What it must contain |
|---|---|---|
| `packages/shared/src/constants/events.ts` | **E2 starts** | All 19 `ActivityType` event name constants in SCREAMING_SNAKE_CASE matching the `ActivityType` enum exactly. `DEAL_STAGE_CHANGED` must be renamed to `DEAL_STAGE_MOVED`. No inline string literals in any `eventBus.emit()` call — only constants from this file. If the format (dot-notation vs SCREAMING_SNAKE_CASE) is changed, update all existing emit sites in one PR before E2 code is reviewed. |
| `packages/shared/src/types/activity-metadata.ts` | **E4 starts** | `ActivityMetadata` discriminated union — one variant per `ActivityType` value with required entity FK and metadata shape for each. `ActivityAppendInput` uses this union for the `metadata` field. Without this, Sprint 7 Workflow Engine trigger condition evaluation will silently fail on any type not covered. |

**Warning (R-4):** The existing `events.ts` `DomainEvent` constants use dot-notation format (`'lead.created'`) inconsistent with `ActivityType` SCREAMING_SNAKE_CASE. The stale `DEAL_STAGE_CHANGED` constant in `events.ts` conflicts with the renamed `DEAL_STAGE_MOVED` in `ActivityType`. Both must be fixed before E2 code begins — a silent format mismatch means Sprint 7 workflow triggers will never fire.

#### CRM-1.2: Migrations

Three migration files (keep atomic + reversible):

| Migration | Content |
|---|---|
| `0006_crm_tables` | CREATE TABLE for **10 new tenant tables**: leads, contacts, tasks, activities (partitioned), notes, files, ai_scores, custom_field_definitions, team_invites, saved_replies. All enums (ActivityType 19 values, CustomFieldObjectType, CustomFieldType). Circular FKs resolved via ALTER TABLE after both tables created. DB triggers: `leads_source_immutable`, `activities_no_update`, `activities_no_delete`. Activities: `PARTITION BY RANGE("createdAt")` with 2026 + default partitions. CHECK constraint on activities (at least one entity FK non-null). Deferred FK columns noted in comments (`pipelineStageId`, `instagramAccountId`, `mergedIntoLeadId`, `relatedDealId` on tasks/notes/files). |
| `0007_crm_indexes` | All non-unique indexes. Partial GIN FTS index on leads `WHERE deletedAt IS NULL` (includes phone). Index `(organizationId, lastActivityAt DESC NULLS LAST)` on leads and contacts. Index `(organizationId, createdFromLeadId)` on contacts (convert idempotency check). Index `(organizationId, createdAt DESC)` on activities (org-level timeline queries). `pg_trgm` extension: `CREATE EXTENSION IF NOT EXISTS pg_trgm`. |
| `0008_crm_rls` | `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` + missing-safe USING+WITH CHECK policy on all **15 tenant tables** (5 existing + 10 new). GRANT SELECT/INSERT/UPDATE/DELETE on all new tables TO leados_app. Same pattern as migration `0003_rls_policies`. |

Migration `0008_crm_rls` must include **all 10 new tables**: leads, contacts, tasks, activities, notes, files, ai_scores, custom_field_definitions, team_invites, saved_replies.

#### CRM-1.2a: Deferred FK schedule (Sprint 5 + Sprint 6 migration actions)

The following FK constraints are intentionally absent from migration 0006. They must be added in the corresponding sprint's migration — the columns exist as plain UUID NULLs in Sprint 4.

| Column | Target Sprint | Required ALTER TABLE |
|---|---|---|
| `leads.pipelineStageId` | Sprint 5 | `ALTER TABLE leads ADD CONSTRAINT leads_pipelineStageId_fkey FOREIGN KEY ("pipelineStageId") REFERENCES pipeline_stages(id) ON DELETE SET NULL;` |
| `tasks.relatedDealId` | Sprint 5 | `ALTER TABLE tasks ADD CONSTRAINT tasks_relatedDealId_fkey FOREIGN KEY ("relatedDealId") REFERENCES deals(id) ON DELETE SET NULL;` |
| `notes.relatedDealId` | Sprint 5 | `ALTER TABLE notes ADD CONSTRAINT notes_relatedDealId_fkey FOREIGN KEY ("relatedDealId") REFERENCES deals(id) ON DELETE SET NULL;` |
| `files.relatedDealId` | Sprint 5 | `ALTER TABLE files ADD CONSTRAINT files_relatedDealId_fkey FOREIGN KEY ("relatedDealId") REFERENCES deals(id) ON DELETE SET NULL;` |
| `leads.instagramAccountId` | Sprint 6 | `ALTER TABLE leads ADD CONSTRAINT leads_instagramAccountId_fkey FOREIGN KEY ("instagramAccountId") REFERENCES instagram_accounts(id) ON DELETE SET NULL;` |
| `leads.mergedIntoLeadId` | Merge milestone | Self-referencing FK; add when merge service is implemented. |

**Sprint 5 migration author must apply all four Sprint 5 ALTER TABLE statements in a single migration after `deals` and `pipeline_stages` tables are created.**

#### CRM-1.3: TENANT_TABLES registry update

Add **10 new models** to `core/tenancy/tenant-tables.ts`: `lead`, `contact`, `task`, `activity`, `note`, `file`, `aiScore`, `customFieldDefinition`, `teamInvite`, `savedReply`. After this change `check:rls` will require **15 tenant tables** (5 existing + 10 new). Verify script passes with all 15.

**Acceptance:**
- `pnpm db:migrate` succeeds (all 3 migrations: 0006, 0007, 0008).
- `pnpm --filter @leados/api check:rls` reports: `OK — 15 tenant tables enabled + forced + policied`.
- `pnpm typecheck` green (new Prisma client generated with all new models and enums).
- Existing isolation suite still passes (54/54) — no regressions.

---

### E2 — Lead Module

**Depends on:** E1 complete. All lead ops go through `withTenant`.

#### CRM-2.1: Lead repository

`modules/leads/lead.repository.ts`

Methods (all accept the `withTenant` tx client, not the raw client):
- `create(data)` — returns created lead
- `findById(id)` — returns lead or null (soft-delete aware: `deletedAt IS NULL`)
- `findByIdOrThrow(id)` — 404 if not found or deleted
- `update(id, data)` — returns updated lead
- `softDelete(id)` — sets `deletedAt = now()`
- `count(filter)` — used for plan-limit check
- `findManyWithFilter(filter, pagination)` — paginated list (implementation detail for E6)
- `findByEmail(email)` — dedup check (returns id only)
- `findByPhone(phone)` — dedup check

No cross-module DB access. The repository does not touch contacts, tasks, or activities tables directly.

#### CRM-2.2: Lead service

`modules/leads/lead.service.ts`

**create(ctx, input):**
1. Check plan limit: `count({ deletedAt: null }) >= PLAN_LIMITS[plan].leads` → throw 429 `PLAN_LIMIT_EXCEEDED`.
2. Dedup: if `input.email` provided, call `findByEmail` — if found, return 409 with `existingLeadId`.
3. Create lead row.
4. Emit activity: `LEAD_CREATED`.
5. Emit audit log.
6. Return lead.

**update(ctx, id, input):**
- Status transition validation (see §2.3 below). **`WON` is not a valid direct PATCH status** — rejected with `400 INVALID_STATUS_TRANSITION`. WON is only set by `convert()`.
- If status changes to LOST: require `lostReason` in the input; throw `400` if absent.
- Emit `LEAD_STATUS_CHANGED` activity (metadata: `{ type: 'LEAD_STATUS_CHANGED', fromStatus, toStatus }`) if status changed. Update `lastActivityAt` in the same transaction.
- Emit `LEAD_ASSIGNED` activity (metadata: `{ type: 'LEAD_ASSIGNED', previousAssigneeId, newAssigneeId }`) if assignedToId changed. Update `lastActivityAt` in the same transaction.
- Emit audit log.

**softDelete(ctx, id):**
- Only OWNER/ADMIN (via RBAC) can delete.
- Emit `LEAD_STATUS_CHANGED`? No — deletion is its own audit type. Emit audit log.

#### CRM-2.3: Lead status machine

> **⚠ UPDATED per `SPRINT_4_SCHEMA_REMEDIATION_PLAN.md` REC-2.** `WON` is not reachable via direct PATCH. It is only set by the `convert()` operation. This enforces the data integrity invariant that `status = 'WON'` always implies `convertedToContactId IS NOT NULL`.

**Open states:** `NEW`, `CONTACTED`, `QUALIFIED`, `PROPOSAL`, `NEGOTIATION`

**Terminal states:** `WON` (convert()-only), `LOST` (direct PATCH allowed)

**Allowed direct PATCH transitions (via `PATCH /leads/:id { status }`):**
```
NEW → CONTACTED → QUALIFIED → PROPOSAL → NEGOTIATION → LOST
```
- Any open state → any earlier open state (backtracking — a lead can go QUALIFIED → CONTACTED if re-engaged).
- Any open state → LOST (give up at any point).
- `WON` is **not** in this set. Sending `{ status: "WON" }` via PATCH returns `400 INVALID_STATUS_TRANSITION`.
- LOST → any state is **not** allowed (terminal).
- WON → any state is **not** allowed (terminal).

**`WON` is only set by `convert()`:**
The `POST /leads/:id/convert` endpoint bypasses the PATCH status validation and sets `status = 'WON'` and `convertedToContactId = contact.id` atomically inside a single `withTenant` transaction.

**`PatchLeadInput` Zod schema:** `status` field typed as `z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'LOST'])` — `WON` excluded.

Enforce in the service layer, not the DB. A transition that violates these rules throws `400 INVALID_STATUS_TRANSITION`.

#### CRM-2.4: Lead endpoints

`modules/leads/lead.routes.ts`

| Method | Path | Permission | Notes |
|---|---|---|---|
| `POST` | `/api/v1/leads` | `leads.create` | 429 on plan limit |
| `GET` | `/api/v1/leads/:id` | `leads.read` or `leads.read_own` (ownOnly filter) | |
| `PATCH` | `/api/v1/leads/:id` | `leads.update` or `leads.update_own` | Status machine validated |
| `DELETE` | `/api/v1/leads/:id` | `leads.delete` | Soft delete |

Zod schemas in `packages/shared/src/schemas/lead.ts`.

**Acceptance:**
- POST /leads → 201; second POST with same email → 409.
- GET /leads/:id from org B for org A lead → 404 (tenant extension hides it).
- PATCH with invalid status transition → 400.
- POST when plan limit reached → 429.
- SALES_EXECUTIVE with `leads.read_own` → GET /leads/:other_member_lead → 404.
- All endpoints: no token → 401, wrong org token → 403.

---

### E3 — Contact Module & Lead→Contact Conversion

**Depends on:** E1, E2.

#### CRM-3.1: Contact repository + service

Same structure as Lead. Key differences:
- No status machine (contacts don't have a lifecycle enum).
- Plan limit: `PLAN_LIMITS[plan].contacts`.
- Dedup: check email + phone.
- `findByCreatedFromLeadId(leadId)` — used to check if a lead has already been converted.

#### CRM-3.2: Lead→Contact conversion (atomic)

`modules/leads/lead.service.ts → convert(ctx, leadId)`

This operation touches two models (leads + contacts) and must be **completely atomic** — it is the primary test of the P0-3 atomicity invariant in a domain module. It runs inside a single `withTenant` transaction.

Steps inside the single transaction:
1. Load lead; throw `404` if not found or already `convertedToContactId IS NOT NULL` (already converted).
2. Throw `409` if lead status is already `WON`.
3. Create contact from lead fields (firstName, lastName, email, phone, tags, customFields; `createdFromLeadId = lead.id`).
4. Update lead: `status = WON`, `convertedToContactId = contact.id`.
5. Append activity: `LEAD_WON` (performedById from ctx).
6. Append audit entry.
7. Commit. If any step throws, the entire transaction rolls back — no orphaned contacts, no leads stuck in WON.

**Acceptance:**
- Convert a lead → contact and lead both updated atomically; count of changes = 2.
- If contact create fails (e.g., unique violation) → lead.status remains unchanged.
- Converting an already-converted lead → 409.
- Both org A and org B can convert their own leads independently.

#### CRM-3.3: Contact endpoints

| Method | Path | Permission |
|---|---|---|
| `POST` | `/api/v1/contacts` | `contacts.create` |
| `GET` | `/api/v1/contacts/:id` | `contacts.read` |
| `PATCH` | `/api/v1/contacts/:id` | `contacts.update` |
| `DELETE` | `/api/v1/contacts/:id` | `contacts.delete` |
| `POST` | `/api/v1/leads/:id/convert` | `leads.update` (converts lead to contact) |

---

### E4 — Activity Feed & Tasks

**Depends on:** E1, E2 (activity service needed before M2/M3 emit activities).

> **Note on sequencing:** The Activity write path (`ActivityService.append`) should be implemented first within this epic, before Lead and Contact services start emitting. It is a dependency, not a parallel task.

#### CRM-4.1: Activity service

`core/activities/activity.service.ts` (or `modules/activities/` — one level above domain modules since activities are a cross-cutting concern)

`append(ctx, input: ActivityAppendInput)`:
- `ActivityAppendInput` is typed using the `ActivityMetadata` discriminated union from `packages/shared/src/types/activity-metadata.ts`. The `type` field and `metadata` shape are enforced at compile time.
- Validates that the required entity FK for the given `type` is present (e.g., `LEAD_STATUS_CHANGED` requires `relatedLeadId`). Throws `400` if the required FK is missing.
- Writes a row to `activities` via `withTenant`.
- **After inserting the activity row**, if `input.relatedLeadId` is set, updates `leads.lastActivityAt = now()` in the same transaction (write-through denormalization).
- If `input.relatedContactId` is set, updates `contacts.lastActivityAt = now()` in the same transaction.
- **No update method. No delete method. Append-only.**
- Called by Lead, Contact, Task, Note, File services — never called from a route handler directly.

`listForLead(ctx, leadId, pagination)` — returns paginated activities for a lead.
`listForContact(ctx, contactId, pagination)` — same for contact.

The Activity model has **no `deletedAt`** — rows are never removed (append-only history). Immutability is enforced by DB triggers (`activities_no_update`, `activities_no_delete`) in addition to the service-layer no-op (belt + suspenders).

#### CRM-4.2: Task module

`modules/tasks/task.repository.ts` + `modules/tasks/task.service.ts`

**create(ctx, input):**
- No plan limit on tasks (not enumerated in PLAN_LIMITS).
- Required: title, type, priority; optional: dueDate, assignedToId, relatedLeadId/contactId/dealId.
- Emit activity `TASK_CREATED`.
- Emit audit.

**updateStatus(ctx, id, newStatus):**
- PENDING → IN_PROGRESS → COMPLETED | CANCELLED (sequential, no skip).
- On COMPLETED: set `completedAt = now()`; emit `TASK_COMPLETED` activity.
- On CANCELLED: emit audit.

**softDelete(ctx, id):** audit only (no activity — deletion is not a timeline event).

**my-tasks query:** `findMany({ where: { assignedToId: ctx.userId, status: [PENDING, IN_PROGRESS], deletedAt: null } })` — used for the "My Tasks" view.

#### CRM-4.3: ownOnly integration (D-M6-1 resolution)

`SALES_EXECUTIVE` holds `leads.read_own` (not `leads.read`). When `ctx.ownOnly = true`:
- `GET /api/v1/leads/:id` → service calls `findById` with an additional `assignedToId = ctx.userId` guard; returns 404 if the lead exists but is not assigned to the requesting user.
- `GET /api/v1/leads` (list, E6) → adds `assignedToId = ctx.userId` to the filter automatically.
- `GET /api/v1/tasks` → adds `assignedToId = ctx.userId` to the filter automatically.

This resolves D-M6-1. After E4, ownOnly has integration-level coverage on real domain endpoints.

#### CRM-4.4: Task endpoints + activity endpoints

| Method | Path | Permission |
|---|---|---|
| `POST` | `/api/v1/tasks` | `tasks.create` |
| `GET` | `/api/v1/tasks/:id` | `tasks.read` |
| `PATCH` | `/api/v1/tasks/:id` | `tasks.update` |
| `DELETE` | `/api/v1/tasks/:id` | `tasks.delete` |
| `GET` | `/api/v1/leads/:id/activities` | `leads.read` or `leads.read_own` |
| `GET` | `/api/v1/contacts/:id/activities` | `contacts.read` |

**Acceptance:**
- Activity rows are immutable: `UPDATE activities SET ...` must be rejected (add a Postgres trigger or document the assertion in a test).
- SALES_EXECUTIVE with `leads.read_own` calling `GET /leads/:other_member_lead` → 404.
- Task completion → `TASK_COMPLETED` activity appears in `GET /leads/:id/activities` for the related lead.
- Isolation: org B tasks invisible under org A GUC.

---

### E5 — Notes & Files

**Depends on:** E1. Independent of E2/E3 (can be built in parallel with E2/E3 by a second engineer if available).

#### CRM-5.1: Notes module

`modules/notes/note.service.ts`

- `create(ctx, input)`: content (**JSONB — ProseMirror/Tiptap document**, not raw TEXT or HTML), relatedLeadId/contactId/dealId. Zod schema validates `content` is a JSON object; Sprint 6 tightens to full Tiptap document shape.
- `update(ctx, id, input)`: update content; emit `NOTE_UPDATED` activity; audit.
- `softDelete(ctx, id)`: emit `NOTE_DELETED` activity; audit.
- No plan limit on notes.

Endpoints:
| Method | Path | Permission |
|---|---|---|
| `POST` | `/api/v1/notes` | `notes.create` (or map to `leads.update`) |
| `PATCH` | `/api/v1/notes/:id` | `notes.update` |
| `DELETE` | `/api/v1/notes/:id` | `notes.delete` |
| `GET` | `/api/v1/leads/:id/notes` | `leads.read` |

#### CRM-5.2: Files module

**Upload flow (client → API → storage, NOT API → storage):**
1. Client calls `POST /api/v1/files/presigned-url` with `{ fileName, mimeType, sizeBytes, relatedLeadId? }`.
2. API validates: allowed MIME types (images, PDF, docx, xlsx — configurable); `sizeBytes ≤ 50MB`.
3. API generates a presigned PUT URL (S3 `putObject` or Cloudinary signed upload) with 15-min expiry and returns `{ presignedUrl, fileId (pre-assigned UUID), storageKey }`.
4. Client uploads directly to storage using the presigned URL (no API bandwidth consumed).
5. Client calls `POST /api/v1/files` with `{ fileId, fileName, storageKey, mimeType, sizeBytes, url, relatedLeadId? }` to record the metadata.
6. API creates the `files` row, emits `FILE_UPLOADED` activity, emits audit.

`softDelete(ctx, id)`: marks `deletedAt`; emits `FILE_DELETED`; does NOT delete from storage (S3 lifecycle policy handles physical deletion to avoid race conditions). Audit recorded.

**Infrastructure required (documented in env; credentials not committed):**
- `S3_BUCKET`, `S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` — for document/file storage.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` — for media (images).
- Storage provider routing: images → Cloudinary; documents (PDF/docx/xlsx) → S3. Determined by `mimeType`.
- Add these to `core/config/env.ts` with Zod validation (optional in dev, required in prod via `NODE_ENV=production`).

Endpoints:
| Method | Path | Permission |
|---|---|---|
| `POST` | `/api/v1/files/presigned-url` | `files.create` |
| `POST` | `/api/v1/files` | `files.create` |
| `DELETE` | `/api/v1/files/:id` | `files.delete` |
| `GET` | `/api/v1/leads/:id/files` | `leads.read` |

**Note on MVP:** In local/test environments where S3/Cloudinary credentials are absent, the presigned URL endpoint should detect `NODE_ENV=test` and return a mock presigned URL so the test suite does not require real cloud credentials.

---

### E6 — Lead List, Search & CSV

**Depends on:** E1, E2. This is the most query-intensive milestone and must include the mandatory EXPLAIN ANALYZE.

#### CRM-6.1: Lead list endpoint

`GET /api/v1/leads`

**Filters (all optional, combinable):**
- `status` — one or more `LeadStatus` values
- `source` — one or more `LeadSource` values
- `assignedToId` — UUID (or `me` shorthand)
- `tags` — overlap match (any of the given tags)
- `aiScoreMin`, `aiScoreMax` — 0–100
- `createdFrom`, `createdTo` — ISO 8601 dates
- `search` — full-text + trigram search on firstName, lastName, email, phone (see below)

**Sorting:** `createdAt|updatedAt|lastActivityAt|aiScore|firstName` × `asc|desc`. Default: `createdAt DESC`. `lastActivityAt` uses the `(organizationId, lastActivityAt DESC NULLS LAST)` index — O(1), no aggregation join required.

**Pagination:** cursor-based (preferred) or offset. Default page size 25, max 100. Return total count (or estimated count for large sets via `reltuples`).

**ownOnly:** when `ctx.ownOnly = true`, add `AND assignedToId = ctx.userId` to all queries automatically, before any other filter.

**Full-text + trigram search:**
- Use the FTS tsvector index created in migration `0007_crm_indexes`.
- For short queries (< 3 chars): prefix match via `ILIKE '%term%'` on email/phone (trgm index).
- For longer queries: `to_tsquery` with `websearch_to_tsquery` for user-friendly parsing.
- Both paths must work with `withTenant` scoping (GUC + RLS + trgm index are compatible; verify this explicitly with EXPLAIN ANALYZE).

#### CRM-6.2: EXPLAIN ANALYZE requirement

Before this milestone is considered done, run `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` on the lead-list query under representative data conditions:

- Seed 5,000 leads for one org; run the list query with a common filter (status=NEW, no search).
- Seed 5,000 leads and run with a search term (trgm path).
- Check: no sequential scans on the main leads table (index scan expected); trgm index used for search; P95 < 400ms.

Document the EXPLAIN ANALYZE output in `docs/planning/LEAD_LIST_QUERY_ANALYSIS.md` (a new artifact, similar to `TENANCY_POOLING_BENCHMARK.md` from M1).

If P95 ≥ 400ms: add a composite index, tune the query, or add result caching before shipping E6.

#### CRM-6.3: CSV import (async)

`POST /api/v1/leads/import`

- Accepts: CSV file upload (multipart), max 10,000 rows (FR-LEAD-006).
- Response: `202 Accepted` with `{ jobId }`.
- Processing in `lead-import` BullMQ queue worker:
  1. Parse CSV; validate each row against Lead Zod schema.
  2. Dedup: skip rows where email or phone already exist in the org (count as `DUPLICATE`).
  3. Plan limit: check total headroom before starting; if rows_to_import + current_count > PLAN_LIMITS[plan].leads, reject the whole import with a detailed error.
  4. Insert valid rows in batches of 100 (within `withTenant`).
  5. Emit `LEAD_CREATED` activity + audit per imported row.
  6. Store import result (counts: total, imported, duplicates, errors) in a job-result key in Redis (TTL 24h).
- `GET /api/v1/leads/import/:jobId` — polls import status (PENDING | PROCESSING | DONE | FAILED).

**Required columns in CSV:** `firstName` (required), `lastName`, `email`, `phone`, `source`, `tags` (comma-separated in a single cell).

On partial failure (some rows invalid, others valid): import the valid rows and report invalid rows with row numbers and error descriptions. Do NOT roll back valid rows (partial import is acceptable; full rollback would surprise users importing 10k records when 3 have bad data).

#### CRM-6.4: CSV export

`POST /api/v1/leads/export`

- Applies the same filter contract as the list endpoint.
- Response: `202 Accepted` with `{ jobId }`.
- Worker generates CSV for the filtered set, writes to S3 (time-limited presigned download URL, 1h TTL).
- `GET /api/v1/leads/export/:jobId` → when done, returns `{ downloadUrl }`.
- Plan limit: `PLAN_LIMITS[plan].dataExport` must be `true`; STARTER/TRIAL plan → 403.

---

## 3. Acceptance Criteria (Sprint 4 exit gates)

All of the following must hold before Sprint 4 is considered complete.

### Infrastructure & CI

| Criterion | Proof |
|---|---|
| Deploy API Docker build succeeds | CI workflow `Deploy API` conclusion = `success` on a Sprint 4 push |
| `check:rls` covers all 15 tenant tables | `pnpm --filter @leados/api check:rls` reports `OK — 15 tenant tables enabled + forced + policied` |
| Sprint 3 isolation suite unchanged and green | `pnpm --filter @leados/api test:isolation` → 54/54 no regressions |
| CI full suite green | `pnpm test:coverage` (api) ≥ 60% floor, all tests pass |
| Module boundary lint enforced | `pnpm lint` fails if any module directly imports another module's Prisma model |

### Tenancy & isolation

| Criterion | Proof |
|---|---|
| Org A leads are invisible to org B | Integration test: lead created in orgA not returned in orgB's list or by-id |
| Lead→contact conversion is atomic | Integration test: force contact-create to fail → lead.status unchanged, no contact row |
| Activity table is append-only | DB trigger or integration test: attempt UPDATE on activities → rejected |
| New tables in isolation suite | At least one ISO-1 test added covering `leads` table (app-layer isolation) |

### RBAC & plan limits

| Criterion | Proof |
|---|---|
| ownOnly integration coverage (D-M6-1 resolved) | Integration test: SALES_EXECUTIVE token `leads.read_own` → `GET /leads/:other_lead` → 404 |
| Plan limit enforced on lead create | Integration test: org at 500-lead limit (STARTER) → POST /leads → 429 |
| Plan limit enforced on CSV import | Import that would exceed the plan limit → rejected before any rows inserted |
| Export blocked on STARTER/TRIAL | POST /leads/export with STARTER token → 403 |

### Data correctness

| Criterion | Proof |
|---|---|
| Lead status machine enforced | PATCH /leads/:id with WON→NEW transition → 400 |
| Lead dedup enforced | Two creates with same email → second returns 409 with existingLeadId |
| Auth admin boundary (D-M3-2) | Unit test: `findUserByEmail` does not call `withTenant` |
| EXPLAIN ANALYZE documented | `docs/planning/LEAD_LIST_QUERY_ANALYSIS.md` exists; P95 < 400ms confirmed |
| CSV import async | POST /leads/import → 202; job eventually reaches DONE; leads created in DB |

### Test counts

Minimum **new tests added in Sprint 4:**
- ISO-1 extension: ≥ 5 tests covering leads table (append to existing isolation suite or new file)
- Lead module integration: ≥ 20 tests (CRUD, status machine, dedup, plan limit, RBAC matrix)
- Contact module integration: ≥ 10 tests (CRUD, conversion atomicity, own-only)
- Activity/task integration: ≥ 10 tests (append-only, task lifecycle, ownOnly tasks)
- Notes/files: ≥ 8 tests (CRUD, presigned URL mock, soft-delete)
- Lead list/search/CSV: ≥ 10 tests (pagination, filter, ownOnly list, import/export)

---

## 4. Dependencies

| Dependency | Required by | Status |
|---|---|---|
| Sprint 3 FULL PASS | All of Sprint 4 | ✅ (commit `4235aa3`) |
| `pg_trgm` extension enabled in dev + CI DB | E6 FTS | Handled in migration `0007_crm_indexes`; CI DB needs no extra config (standard Postgres extension) |
| S3 + Cloudinary credentials | E5 files | Dev: local mock (NODE_ENV=test path); CI: can use mock; Prod: real credentials added to env |
| `leados-lead-import` BullMQ queue defined | E6 CSV import | `core/queue/` needs new queue name registered |
| `PLAN_LIMITS` readable from `packages/shared` | E2, E3, E6 | ✅ Already exists; no change needed |
| Activity service available | E2, E3, E4 | Build first in E4 block; then available for E2/E3 calls |

---

## 5. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| **R-S4-1** | **Lead schema is the highest fan-in model in the system.** If the `leads` table schema is changed after Pipeline/Inbox/AI build on it, every downstream module requires migration. | M | H | Design the Lead model in full from blueprint `08-DATABASE-DESIGN.md §8.3` before writing any migration. No `TODO: add later` columns. Accept the schema is complete for V1 before writing a line of code. |
| **R-S4-2** | **Lead-list query performance.** The lead-list is the most frequent query in the product (R-TECH-3). Without EXPLAIN ANALYZE, trgm + RLS + GUC + ordering can produce sequential scans at 5k+ rows. | H | M | Mandatory EXPLAIN ANALYZE (E6, §2 of this plan). Do not ship E6 without it. Add a query-count assertion in the integration test. |
| **R-S4-3** | **CSV import partial-failure semantics.** Users importing 5,000 leads where 12 have bad emails will want the other 4,988 imported. Rollback-on-any-error is incorrect. Partial import must be explicitly designed. | M | M | Spec in CRM-6.3 above: valid rows imported, invalid rows returned in error report. Never silently drop rows. |
| **R-S4-4** | **File uploads in CI.** Tests that call the presigned-URL endpoint require S3/Cloudinary credentials — which are not available in CI. | M | M | `NODE_ENV=test` returns a mock presigned URL. The file metadata POST is independently testable without a real upload. Separate "contract" tests for the presigned URL shape from "functional" tests for file metadata persistence. |
| **R-S4-5** | **Module boundary erosion under deadline pressure (R-ARCH-1).** With 6 new modules being built simultaneously, the temptation to skip the service interface and import directly from another module's repository is high. One slip sets a precedent. | H | H | ESLint `no-restricted-imports` must be configured for every new module before the module ships its first endpoint. CI fails on violation. Code review must flag any `import` from `modules/X` inside `modules/Y`. |
| **R-S4-6** | **Activity append-only enforcement.** If the Activity model ever gets an `update` or `delete` called on it (even accidentally via Prisma), the immutable history guarantee is broken. | L | H | Add a Postgres trigger: `BEFORE UPDATE OR DELETE ON activities → RAISE EXCEPTION`. Verify in a migration + test. Alternatively, document and assert in a unit test that `activityRepository` has no `update` or `delete` methods. |
| **D-INFRA-1** (carry) | Deploy API Docker build failure. Blocks every API deploy until fixed. | — | H | Fixed in P0-1 before M1 begins. |
| **D-M3-2** (carry) | Auth identity reads must not use the tenant client. | — | H | Mitigated in P0-2. Not a runtime bug today (admin connection still used); risk becomes live only if a future engineer accidentally ports the reads. |

---

## 6. Recommended Implementation Order

This ordering respects dependencies, minimizes blocked time, and parallelizes independent work.

```
Week 1 (Days 1–5)
─────────────────
Day 1:  P0-1 (Dockerfile fix) — unblocks Deploy API immediately.
        P0-2 (D-M3-2 boundary test + comment).
        P0-3 (branch protection — admin action, no code).
Day 2:  E1: Prisma schema additions (all 10 new models + enums + shared package gates) — CRM-1.1.
        E1: Migration 0006_crm_tables — CRM-1.2.
Day 3:  E1: Migration 0007_crm_indexes (pg_trgm, FTS, composite indexes) — CRM-1.2.
        E1: Migration 0008_crm_rls (RLS on all 10 new tables) — CRM-1.2.
        E1: TENANT_TABLES registry update + check:rls verification — CRM-1.3.
Day 4:  E4 activity write path first (ActivityService.append) — CRM-4.1.
        E2: Lead repository + service (CRUD, dedup, plan-limit) — CRM-2.1, 2.2.
Day 5:  E2: Lead status machine — CRM-2.3.
        E2: Lead endpoints + Zod schemas — CRM-2.4.

Week 2 (Days 6–10)
──────────────────
Day 6:  E3: Contact repository + service — CRM-3.1.
        E3: Lead→contact conversion (atomic transaction) — CRM-3.2.
        E3: Contact endpoints — CRM-3.3.
Day 7:  E4: Task service + endpoints — CRM-4.2.
        E4: ownOnly integration (SALES_EXECUTIVE leads + tasks) — CRM-4.3, 4.4.
Day 8:  E5: Notes module (simple) — CRM-5.1.
        E5: Files presigned URL flow + file metadata endpoints — CRM-5.2.
Day 9:  E6: Lead list endpoint (filter, sort, pagination, ownOnly) — CRM-6.1.
        E6: EXPLAIN ANALYZE run + documentation — CRM-6.2.
Day 10: E6: CSV import async (BullMQ worker) — CRM-6.3.
        E6: CSV export async — CRM-6.4.
        Final: run full test suite, typecheck, lint, build, coverage check.
```

**Parallelization opportunities (if second engineer available):**
- E5 (Notes + Files) is independent of E2/E3 after E1 is done → assignable in parallel from Day 6.
- E6 list/search can start as soon as E2 lead repository exists.

---

## 7. What Sprint 4 Does NOT Cover

The following items are explicitly out of scope for Sprint 4 and will not be implemented:

| Out of scope | Rationale |
|---|---|
| Pipeline, pipeline stages, deals (Kanban) | Sprint 5 per roadmap |
| Instagram / WhatsApp inbox | Sprint 6 per roadmap; also gated on Meta API spike |
| AI lead scoring | Sprint 7; depends on leads model (built here) and async scoring worker |
| Billing / Stripe integration | Sprint 8 |
| Frontend (Leads List, Lead Detail, Contact views) | Backend-first; frontend scope is a separate track |
| Runtime connection switch (admin → leados_app) | Deferred until D-M3-2 is formally resolved across all auth paths |
| Super-admin path hardening (2FA, platform_audit_logs) | Scaffold in Sprint 3 (M5 AUD-3); full implementation in a dedicated hardening sprint before launch |
| Analytics on leads data | Sprint 8 / read replica; leads model built here will be the data source |
| WhatsApp-source lead creation | Lead `source = WHATSAPP` is seeded in enums, but the webhook that creates it arrives in Sprint 6 |

---

## 8. Sprint 4 Exit / Demo Criterion

Per `DEVELOPMENT_ROADMAP.md` Sprint 4:

> **M2** — full lead/contact/task/note/file lifecycle in UI, RBAC-scoped, with activity trails + audit logs, within plan limits.

Since Sprint 4 is backend-only, the exit criterion is the backend half of M2:

**Demo:** A seeded multi-org dataset where:
1. Org A creates 3 leads (manual), assigns them to different members.
2. SALES_EXECUTIVE member can only see their own leads.
3. OWNER converts lead → contact atomically; activity feed shows the conversion.
4. OWNER creates a task linked to the lead; marks it complete; activity updated.
5. OWNER adds a note; uploads a file (mock presigned URL in local/CI).
6. Lead list returns only org A leads; search by name works; org B operator gets 0 results.
7. Attempt to create lead 501 (STARTER plan) → 429.
8. CSV import of 10 rows → 202 → job DONE → 10 leads visible in list.
9. All of the above runs under `pnpm test:isolation` (leads table added) and `pnpm test:coverage` (≥ 60%) green.
10. Deploy API Docker build succeeds on push.

---

*Planning only. No code. No file changes. No commits.*
*Source of truth: `FINAL_ARCHITECTURE.md`, `SPRINT_3_M6_FINAL_SIGNOFF.md`, `MODULE_DEPENDENCY_GRAPH.md`, `DEVELOPMENT_ROADMAP.md`, `docs/blueprint/08-DATABASE-DESIGN.md`, `packages/shared/src/constants/`.*
