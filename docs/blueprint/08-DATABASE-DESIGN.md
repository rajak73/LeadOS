# 08 — Database Design

> **⚠ UPDATED per `docs/planning/P0_FIXES.md` (P0-6, P0-7, P0-5).** `subscriptions` gains reconciliation/ordering columns (P0-6); email/phone remain indexable plaintext (storage-encrypted, not app-encrypted — P0-7); `instagram_accounts` token fields are subject to the Meta spike (P0-5). RLS policies use the missing-safe `current_setting(..., true)` form (doc 07). Consolidated architecture: `docs/planning/FINAL_ARCHITECTURE.md`.

---

## 8.1 Design Principles

1. **UUID v4** as primary keys (not sequential integers — prevents enumeration attacks)
2. **Soft delete**: All core records use `deletedAt` timestamp; hard-deleted only after 30 days
3. **Tenant scoping**: Every tenant-owned table has `organizationId` as a non-nullable foreign key
4. **Audit trail**: Mutations to critical tables replicated to `audit_logs`
5. **JSONB for flexibility**: Custom fields, workflow definitions, and AI metadata stored as JSONB
6. **Created/Updated timestamps**: All tables include `createdAt`, `updatedAt` managed by Prisma
7. **Normalized but not over-normalized**: Avoid excessive joins on hot paths; use JSONB where schema is variable

---

## 8.2 ER Diagram (Conceptual)

```
ORGANIZATIONS
    │
    ├──< ORGANIZATION_MEMBERS >──── USERS
    │         │
    │         └── ROLES >──── PERMISSIONS
    │
    ├──< TEAM_INVITES                          [Sprint 4 — new]
    │
    ├──< CUSTOM_FIELD_DEFINITIONS              [Sprint 4 — new; objectType: LEAD|CONTACT|DEAL]
    │
    ├──< SAVED_REPLIES                         [Sprint 4 shell — routes in Sprint 6]
    │
    ├──< LEADS
    │         ├──< AI_SCORES                   [Sprint 4 — new]
    │         ├──< ACTIVITIES (partitioned)    [Sprint 4 — PARTITION BY RANGE(createdAt)]
    │         ├──< TASKS
    │         ├──< NOTES
    │         ├──< FILES
    │         ├── convertedToContactId ──> CONTACTS  [FK enforced]
    │         ├── pipelineStageId (UUID NULL)          [deferred FK → Sprint 5]
    │         └── instagramAccountId (UUID NULL)        [deferred FK → Sprint 6]
    │
    ├──< CONTACTS
    │         ├──< ACTIVITIES
    │         ├──< TASKS
    │         ├──< NOTES
    │         └──< FILES
    │
    ├──< PIPELINES                             [Sprint 5]
    │         └──< PIPELINE_STAGES
    │                   └──< DEALS >── CONTACTS | LEADS
    │                         └── ACTIVITIES
    │
    ├──< INSTAGRAM_ACCOUNTS                    [Sprint 6]
    │         └──< INSTAGRAM_CONVERSATIONS
    │                   └──< MESSAGES
    │
    ├──< WHATSAPP_ACCOUNTS                     [Sprint 9]
    │         └──< WHATSAPP_CONVERSATIONS
    │                   └──< MESSAGES
    │
    ├──< WORKFLOWS                             [Sprint 7]
    │         └──< WORKFLOW_EXECUTIONS
    │
    ├──< NOTIFICATIONS
    ├──< WEBHOOK_EVENTS
    ├──< AUDIT_LOGS (partitioned)              [Sprint 3 — PARTITION BY RANGE(createdAt)]
    │
    ├── SUBSCRIPTIONS
    │         └──< INVOICES
    │                   └──< PAYMENTS
    │
    └──< REFRESH_TOKENS
```

---

## 8.3 Complete Table Definitions

### users
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK, default uuid_generate_v4() | |
| email | VARCHAR(255) | UNIQUE, NOT NULL | Indexed |
| passwordHash | VARCHAR(255) | NOT NULL | bcrypt hash |
| firstName | VARCHAR(100) | NOT NULL | |
| lastName | VARCHAR(100) | NOT NULL | |
| avatarUrl | TEXT | NULL | Cloudinary URL |
| emailVerifiedAt | TIMESTAMP | NULL | NULL = not verified |
| lastLoginAt | TIMESTAMP | NULL | |
| isSuperAdmin | BOOLEAN | DEFAULT false | Platform admin flag |
| status | ENUM | NOT NULL | ACTIVE, SUSPENDED, DELETED |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |
| deletedAt | TIMESTAMP | NULL | Soft delete |

**Indexes:** `email` (unique), `status`, `deletedAt`

---

### organizations
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| name | VARCHAR(255) | NOT NULL | |
| slug | VARCHAR(100) | UNIQUE, NOT NULL | URL-safe identifier |
| industry | VARCHAR(100) | NULL | Agency, Real Estate, etc. |
| logoUrl | TEXT | NULL | |
| timezone | VARCHAR(100) | DEFAULT 'Asia/Kolkata' | |
| currency | VARCHAR(3) | DEFAULT 'INR' | ISO 4217 |
| language | VARCHAR(10) | DEFAULT 'en' | |
| businessHours | JSONB | NULL | `{ mon: { open: "09:00", close: "18:00" } }` |
| status | ENUM | NOT NULL | ACTIVE, SUSPENDED, DELETED |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |
| deletedAt | TIMESTAMP | NULL | |

**Indexes:** `slug` (unique), `status`

---

### organization_members
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK → organizations.id, NOT NULL | |
| userId | UUID | FK → users.id, NOT NULL | |
| roleId | UUID | FK → roles.id, NOT NULL | |
| status | ENUM | NOT NULL | ACTIVE, INVITED, SUSPENDED |
| invitedBy | UUID | FK → users.id, NULL | |
| invitedAt | TIMESTAMP | NULL | |
| joinedAt | TIMESTAMP | NULL | |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |

**Indexes:** `(organizationId, userId)` UNIQUE, `organizationId`, `userId`, `status`
**Constraint:** One user can only have one active membership per org

---

### roles
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK → organizations.id, NOT NULL | |
| name | VARCHAR(50) | NOT NULL | OWNER, ADMIN, MANAGER, SALES_EXECUTIVE |
| isSystem | BOOLEAN | DEFAULT true | System roles cannot be deleted |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |

**Indexes:** `(organizationId, name)` UNIQUE

---

### permissions
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| roleId | UUID | FK → roles.id, NOT NULL | |
| resource | VARCHAR(100) | NOT NULL | leads, contacts, deals, etc. |
| action | VARCHAR(50) | NOT NULL | create, read, update, delete, assign |
| createdAt | TIMESTAMP | NOT NULL | |

**Indexes:** `(roleId, resource, action)` UNIQUE

---

### leads

> **⚠ UPDATED per `SPRINT_4_SCHEMA_REMEDIATION_PLAN.md`.** Columns `notes` (quick-note field) removed; `pipelineStageId` FK constraint deferred to Sprint 5; `instagramAccountId`, `mergedIntoLeadId`, `lastActivityAt` added. WON status only reachable via `convert()` — not via direct PATCH. Source is immutable after creation (enforced by DB trigger). See remediation plan for rationale.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK, default uuid_generate_v4() | |
| organizationId | UUID | FK → organizations.id, NOT NULL | Tenant key |
| firstName | VARCHAR(100) | NOT NULL | |
| lastName | VARCHAR(100) | NULL | |
| email | VARCHAR(255) | NULL | Plaintext, indexed (P0-7) |
| phone | VARCHAR(20) | NULL | Plaintext, indexed (P0-7) |
| source | ENUM LeadSource | NOT NULL | **Immutable after creation** — enforced by `leads_source_immutable` DB trigger |
| status | ENUM LeadStatus | NOT NULL DEFAULT 'NEW' | `WON` only reachable via `convert()` — rejected on direct PATCH |
| assignedToId | UUID | FK → users.id, NULL | |
| aiScore | SMALLINT | NULL | 0–100; denormalized cache of latest ai_scores row |
| aiScoreUpdatedAt | TIMESTAMP | NULL | Timestamp of the latest ai_scores row for this lead |
| instagramHandle | VARCHAR(100) | NULL | |
| instagramUserId | VARCHAR(50) | NULL | Meta IGSID — for webhook→lead lookup |
| instagramAccountId | UUID | NULL | ⚠ No FK in Sprint 4 — deferred to Sprint 6 (instagram_accounts table not yet created) |
| tags | TEXT[] | DEFAULT '{}' | Tag strings |
| customFields | JSONB | DEFAULT '{}' | Keys must match custom_field_definitions.fieldKey for this org |
| lostReason | TEXT | NULL | Required when status transitions to LOST |
| convertedToContactId | UUID | FK → contacts.id, NULL | Set by convert() only |
| pipelineStageId | UUID | NULL | ⚠ No FK in Sprint 4 — deferred to Sprint 5 (pipeline_stages table not yet created) |
| mergedIntoLeadId | UUID | NULL | Set on merge (loser lead points to winner); no FK in Sprint 4 |
| lastActivityAt | TIMESTAMP | NULL | Write-through from ActivityService.append(); enables O(1) sort on lead list |
| createdById | UUID | FK → users.id, NOT NULL | |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |
| deletedAt | TIMESTAMP | NULL | |

**Removed vs prior schema:** `notes TEXT NULL` — conflicts with the notes table; use notes table for all note content.

**DB trigger:** `leads_source_immutable` (BEFORE UPDATE) — raises exception if `source` column is changed after creation.

**Indexes (migration 0007_crm_indexes):**
- `(organizationId)` non-unique
- `(organizationId, status)`
- `(organizationId, assignedToId)`
- `(organizationId, source)`
- `(organizationId, aiScore DESC)`
- `(organizationId, lastActivityAt DESC NULLS LAST)` ← new; enables O(1) list sort
- `email` (for dedup)
- `phone` (for dedup)
- `instagramUserId` (for webhook lookup)
- GIN full-text: `to_tsvector('english', coalesce(firstName,'') || ' ' || coalesce(lastName,'') || ' ' || coalesce(email,'') || ' ' || coalesce(phone,'')) WHERE deletedAt IS NULL` ← partial index; excludes soft-deleted rows; phone added

> **P0-7:** `email`/`phone` are stored as **plaintext, indexable columns** (these dedup and full-text indexes depend on it) and are protected by storage-layer encryption (Neon AES-256), NOT application-level field encryption. They are masked in logs and in audit before/after snapshots (§8.6).

---

### contacts

> **⚠ UPDATED per `SPRINT_4_SCHEMA_REMEDIATION_PLAN.md`.** `lastActivityAt` added (write-through from ActivityService; same pattern as leads).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK, default uuid_generate_v4() | |
| organizationId | UUID | FK → organizations.id, NOT NULL | |
| firstName | VARCHAR(100) | NOT NULL | |
| lastName | VARCHAR(100) | NULL | |
| email | VARCHAR(255) | NULL | |
| phone | VARCHAR(20) | NULL | |
| company | VARCHAR(255) | NULL | |
| jobTitle | VARCHAR(100) | NULL | |
| avatarUrl | TEXT | NULL | |
| address | JSONB | NULL | `{ street, city, state, country, zip }` |
| tags | TEXT[] | DEFAULT '{}' | |
| customFields | JSONB | DEFAULT '{}' | Keys must match custom_field_definitions.fieldKey for this org |
| lifeTimeValue | DECIMAL(15,2) | DEFAULT 0 | Calculated from deals |
| assignedToId | UUID | FK → users.id, NULL | |
| lastActivityAt | TIMESTAMP | NULL | Write-through from ActivityService.append() |
| createdFromLeadId | UUID | FK → leads.id, NULL | Set by convert() |
| createdById | UUID | FK → users.id, NOT NULL | |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |
| deletedAt | TIMESTAMP | NULL | |

**Indexes (migration 0007_crm_indexes):** `(organizationId, email)`, `(organizationId, phone)`, `(organizationId, assignedToId)`, `(organizationId, createdFromLeadId)` ← required for `POST /leads/:id/convert` idempotency check, `(organizationId, lastActivityAt DESC NULLS LAST)`, `deletedAt`

---

### pipelines
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK, NOT NULL | |
| name | VARCHAR(100) | NOT NULL | |
| description | TEXT | NULL | |
| currency | VARCHAR(3) | DEFAULT 'INR' | |
| isDefault | BOOLEAN | DEFAULT false | |
| createdById | UUID | FK → users.id, NOT NULL | |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |
| deletedAt | TIMESTAMP | NULL | |

---

### pipeline_stages
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK, NOT NULL | |
| pipelineId | UUID | FK → pipelines.id, NOT NULL | |
| name | VARCHAR(100) | NOT NULL | |
| position | SMALLINT | NOT NULL | For ordering (1, 2, 3...) |
| color | VARCHAR(7) | DEFAULT '#6366f1' | Hex color |
| probability | SMALLINT | DEFAULT 20 | 0–100% win probability |
| isWon | BOOLEAN | DEFAULT false | |
| isLost | BOOLEAN | DEFAULT false | |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |

**Constraint:** `CHECK (NOT (isWon AND isLost))`

---

### deals
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK, NOT NULL | |
| title | VARCHAR(255) | NOT NULL | |
| pipelineId | UUID | FK → pipelines.id, NOT NULL | |
| stageId | UUID | FK → pipeline_stages.id, NOT NULL | |
| contactId | UUID | FK → contacts.id, NULL | |
| leadId | UUID | FK → leads.id, NULL | |
| assignedToId | UUID | FK → users.id, NULL | |
| value | DECIMAL(15,2) | DEFAULT 0 | |
| currency | VARCHAR(3) | DEFAULT 'INR' | |
| probability | SMALLINT | NULL | Override stage probability |
| expectedCloseDate | DATE | NULL | |
| actualCloseDate | DATE | NULL | |
| status | ENUM | NOT NULL | OPEN, WON, LOST |
| lostReason | TEXT | NULL | |
| tags | TEXT[] | DEFAULT '{}' | |
| customFields | JSONB | DEFAULT '{}' | |
| aiScore | SMALLINT | NULL | |
| createdById | UUID | FK → users.id, NOT NULL | |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |
| deletedAt | TIMESTAMP | NULL | |

---

### tasks
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK, NOT NULL | |
| title | VARCHAR(255) | NOT NULL | |
| description | TEXT | NULL | |
| type | ENUM | NOT NULL | CALL, EMAIL, MEETING, FOLLOW_UP, DEMO, OTHER |
| priority | ENUM | NOT NULL | LOW, MEDIUM, HIGH, URGENT |
| status | ENUM | NOT NULL | PENDING, IN_PROGRESS, COMPLETED, CANCELLED |
| dueDate | TIMESTAMP | NULL | |
| completedAt | TIMESTAMP | NULL | |
| assignedToId | UUID | FK → users.id, NULL | |
| relatedLeadId | UUID | FK → leads.id, NULL | |
| relatedDealId | UUID | FK → deals.id, NULL | |
| relatedContactId | UUID | FK → contacts.id, NULL | |
| createdById | UUID | FK → users.id, NOT NULL | |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |
| deletedAt | TIMESTAMP | NULL | |

**Indexes:** `(organizationId, assignedToId, status)`, `(organizationId, dueDate, status)`

---

### activities

> **⚠ UPDATED per `SPRINT_4_SCHEMA_REMEDIATION_PLAN.md`.** Table is created as `PARTITION BY RANGE ("createdAt")` from day one (SC-1/DB-2). ActivityType enum canonicalized to 19 values. CHECK constraint enforces at least one entity FK is non-null. Immutability enforced by DB triggers (not just convention). `metadata` shape is governed by the `ActivityMetadata` discriminated union in `packages/shared/src/types/activity-metadata.ts`.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | NOT NULL DEFAULT uuid_generate_v4() | Part of partition key |
| organizationId | UUID | FK → organizations.id, NOT NULL | Tenant key |
| type | ENUM ActivityType | NOT NULL | See canonical 19-value enum below |
| description | TEXT | NOT NULL | Human-readable description |
| metadata | JSONB | NOT NULL DEFAULT '{}' | Shape governed by ActivityMetadata discriminated union |
| performedById | UUID | FK → users.id, NULL | NULL = system-generated action |
| relatedLeadId | UUID | NULL | At least one of these three must be non-null (CHECK) |
| relatedDealId | UUID | NULL | |
| relatedContactId | UUID | NULL | |
| createdAt | TIMESTAMP | NOT NULL DEFAULT now() | Partition key — no updatedAt |

**Canonical ActivityType values (19):**
`LEAD_CREATED, LEAD_STATUS_CHANGED, LEAD_ASSIGNED, LEAD_WON, LEAD_LOST, CONTACT_CREATED, CONTACT_UPDATED, TASK_CREATED, TASK_COMPLETED, TASK_CANCELLED, NOTE_ADDED, NOTE_UPDATED, NOTE_DELETED, FILE_UPLOADED, FILE_DELETED, DEAL_CREATED, DEAL_STAGE_MOVED, DEAL_WON, DEAL_LOST`

**Table DDL:** `PARTITION BY RANGE ("createdAt")`. Initial partitions: `activities_2026` (2026-01-01 → 2027-01-01) + `activities_default` (DEFAULT). Annual partitions added by ops runbook each December.

**Constraints:**
- `CHECK ("relatedLeadId" IS NOT NULL OR "relatedDealId" IS NOT NULL OR "relatedContactId" IS NOT NULL)` — orphaned activities are impossible
- No `updatedAt`. No `deletedAt`. Rows are immutable and never removed.

**DB triggers (in migration 0006, after table creation):**
- `activities_no_update` (BEFORE UPDATE) — raises exception unconditionally
- `activities_no_delete` (BEFORE DELETE) — raises exception unconditionally

**Indexes (migration 0007_crm_indexes):**
- `(organizationId, relatedLeadId, createdAt DESC)`
- `(organizationId, relatedDealId, createdAt DESC)`
- `(organizationId, relatedContactId, createdAt DESC)`
- `(organizationId, createdAt DESC)`

---

### notes

> **⚠ UPDATED per `SPRINT_4_SCHEMA_REMEDIATION_PLAN.md`.** `content` type changed from `TEXT` to `JSONB` (ProseMirror/Tiptap document format). Raw HTML storage was an XSS risk; structured JSON is rendered by the Tiptap editor and serialized to plain text for workflow interpolation.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK, default uuid_generate_v4() | |
| organizationId | UUID | FK → organizations.id, NOT NULL | |
| content | JSONB | NOT NULL DEFAULT '{}' | ProseMirror/Tiptap document. Rendered by Tiptap in read mode; `toPlainText(doc)` for workflow interpolation |
| relatedLeadId | UUID | FK → leads.id, NULL | |
| relatedDealId | UUID | NULL | ⚠ No FK in Sprint 4 — deals table is Sprint 5 |
| relatedContactId | UUID | FK → contacts.id, NULL | |
| createdById | UUID | FK → users.id, NOT NULL | |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |
| deletedAt | TIMESTAMP | NULL | |

---

### files
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK, NOT NULL | |
| name | VARCHAR(255) | NOT NULL | Original filename |
| storageKey | TEXT | NOT NULL | S3 key or Cloudinary public_id |
| storageProvider | ENUM | NOT NULL | S3, CLOUDINARY |
| mimeType | VARCHAR(100) | NOT NULL | |
| sizeBytes | BIGINT | NOT NULL | |
| url | TEXT | NOT NULL | CDN URL |
| relatedLeadId | UUID | NULL | |
| relatedDealId | UUID | NULL | |
| relatedContactId | UUID | NULL | |
| uploadedById | UUID | FK → users.id, NOT NULL | |
| createdAt | TIMESTAMP | NOT NULL | |
| deletedAt | TIMESTAMP | NULL | |

---

### ai_scores *(NEW — Sprint 4)*

> Stores structured AI scoring output for leads. `leads.aiScore` and `leads.aiScoreUpdatedAt` are a denormalized read cache; this table holds full history, confidence, factors breakdown, and recommendation text. Sprint 7 writes here; Sprint 4 creates the table (empty).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK, default uuid_generate_v4() | |
| organizationId | UUID | FK → organizations.id, NOT NULL | Tenant key |
| leadId | UUID | FK → leads.id, NOT NULL | |
| score | SMALLINT | NOT NULL | 0–100 |
| confidence | DECIMAL(3,2) | NULL | 0.00–1.00 |
| factors | JSONB | NULL | `Array<{factor: string, impact: "positive"\|"negative"\|"neutral", weight: "high"\|"medium"\|"low"}>` |
| recommendation | TEXT | NULL | AI-generated next-action text |
| triggeredBy | VARCHAR(50) | NULL | `LEAD_CREATED \| STATUS_CHANGED \| MESSAGE_RECEIVED \| WEEKLY_REFRESH` |
| modelVersion | VARCHAR(50) | NULL | e.g. `gpt-4o-mini-2025-03` |
| createdAt | TIMESTAMP | NOT NULL DEFAULT now() | Immutable — no updatedAt |

**Immutability:** No `updatedAt`. No `deletedAt`. Records are append-only (same pattern as activities).
**Indexes (migration 0007):** `(organizationId, leadId, createdAt DESC)`, `(organizationId, score)`

---

### custom_field_definitions *(NEW — Sprint 4)*

> Schema table for org-defined custom fields on LEAD, CONTACT, and DEAL objects. Required for FR-LEAD-009: typed definitions (text, number, date, select, multi-select, boolean, URL). Without this table the UI cannot render the "Custom Fields" section and select/multi-select options have nowhere to live.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK, default uuid_generate_v4() | |
| organizationId | UUID | FK → organizations.id, NOT NULL | Tenant key |
| objectType | ENUM CustomFieldObjectType | NOT NULL | `LEAD \| CONTACT \| DEAL` |
| fieldKey | VARCHAR(100) | NOT NULL | snake_case machine key used in customFields JSONB |
| displayLabel | VARCHAR(100) | NOT NULL | Human-readable UI label |
| fieldType | ENUM CustomFieldType | NOT NULL | `TEXT \| NUMBER \| DATE \| SELECT \| MULTI_SELECT \| BOOLEAN \| URL` |
| options | JSONB | NULL | `Array<string>` — required for SELECT and MULTI_SELECT; null otherwise |
| isRequired | BOOLEAN | NOT NULL DEFAULT false | |
| position | SMALLINT | NOT NULL | Display order within objectType (1-indexed) |
| createdById | UUID | FK → users.id, NOT NULL | |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |
| deletedAt | TIMESTAMP | NULL | |

**Constraints:**
- `UNIQUE (organizationId, objectType, fieldKey) WHERE deletedAt IS NULL` (partial unique index)
- `CHECK (fieldType NOT IN ('SELECT', 'MULTI_SELECT') OR options IS NOT NULL)` — options required for select types

**Plan limit enforcement:** On create, count `WHERE organizationId = $1 AND objectType = $2 AND deletedAt IS NULL`; if ≥ `PLAN_LIMITS[plan].customFieldsPerObject` → 429.
**Indexes:** `(organizationId, objectType, deletedAt)`

---

### team_invites *(NEW — Sprint 4)*

> Token store for email invite links. Required for "invite team member" user flow (magic link, 7-day expiry). Token validation uses the admin `prisma` client (same D-M3-2 boundary as other auth-path reads). After acceptance, `organization_members` INSERT uses `withTenant`.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK, default uuid_generate_v4() | |
| organizationId | UUID | FK → organizations.id, NOT NULL | Tenant key |
| email | VARCHAR(255) | NOT NULL | Invitee email address |
| roleId | UUID | FK → roles.id, NOT NULL | Role to assign on acceptance |
| tokenHash | VARCHAR(255) | NOT NULL UNIQUE | SHA-256(rawToken) — raw token only in the email link |
| invitedById | UUID | FK → users.id, NOT NULL | |
| expiresAt | TIMESTAMP | NOT NULL | `createdAt + 7 days` |
| acceptedAt | TIMESTAMP | NULL | NULL = pending; set on link click |
| revokedAt | TIMESTAMP | NULL | NULL = active |
| createdAt | TIMESTAMP | NOT NULL | |

**Indexes:** `tokenHash` (unique — used for lookup on link click); partial unique `(organizationId, email) WHERE acceptedAt IS NULL AND revokedAt IS NULL` — prevents duplicate pending invites to the same address.

---

### saved_replies *(NEW shell — Sprint 4; routes in Sprint 6)*

> Template library for inbox replies (FR-INBOX-006). Shell table created in Sprint 4 to establish RLS and TENANT_TABLES registration before Inbox lands. No routes or service code in Sprint 4.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK, default uuid_generate_v4() | |
| organizationId | UUID | FK → organizations.id, NOT NULL | Tenant key |
| title | VARCHAR(255) | NOT NULL | Display name |
| content | TEXT | NOT NULL | Reply body (plain text V1; rich text V2) |
| shortcut | VARCHAR(50) | NULL | e.g. `/thanks` |
| isGlobal | BOOLEAN | NOT NULL DEFAULT true | true = org-level; false = personal (createdById only) |
| createdById | UUID | FK → users.id, NOT NULL | |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |
| deletedAt | TIMESTAMP | NULL | |

**Indexes:** `(organizationId, createdById, deletedAt)`

---

### instagram_accounts
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK, NOT NULL | |
| instagramUserId | VARCHAR(50) | NOT NULL | Meta user ID |
| username | VARCHAR(100) | NOT NULL | |
| name | VARCHAR(255) | NULL | |
| profilePictureUrl | TEXT | NULL | |
| accessToken | TEXT | NOT NULL | Encrypted AES-256 |
| accessTokenExpiresAt | TIMESTAMP | NOT NULL | |
| pageId | VARCHAR(50) | NULL | Linked Facebook Page ID |
| webhookSubscribed | BOOLEAN | DEFAULT false | |
| status | ENUM | NOT NULL | CONNECTED, EXPIRED, DISCONNECTED |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |

**Security:** `accessToken` encrypted at application level (AES-256-GCM) before storage, with a key-version prefix so the encryption key and token format can change without a big-bang re-encrypt.
**P0-5:** the exact token field(s) (`accessToken` type/lifetime, `pageId` vs IG-account-id optionality, `accessTokenExpiresAt` semantics) are finalized by the Meta validation spike (doc 14 §14.0) before this table is migrated.

---

### instagram_conversations
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK, NOT NULL | |
| instagramAccountId | UUID | FK → instagram_accounts.id, NOT NULL | |
| instagramScopedUserId | VARCHAR(50) | NOT NULL | External user's IGSID |
| externalUsername | VARCHAR(100) | NULL | |
| externalProfilePicUrl | TEXT | NULL | |
| status | ENUM | NOT NULL | OPEN, CLOSED, PENDING |
| assignedToId | UUID | FK → users.id, NULL | |
| relatedLeadId | UUID | FK → leads.id, NULL | |
| relatedContactId | UUID | FK → contacts.id, NULL | |
| lastMessageAt | TIMESTAMP | NULL | |
| firstResponseAt | TIMESTAMP | NULL | For SLA tracking |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |

**Indexes:** `(organizationId, instagramScopedUserId)` UNIQUE per account, `(organizationId, lastMessageAt DESC)`

---

### messages
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK, NOT NULL | |
| conversationId | UUID | NOT NULL | FK → instagram_conversations or whatsapp_conversations |
| conversationType | ENUM | NOT NULL | INSTAGRAM, WHATSAPP |
| externalMessageId | VARCHAR(255) | NULL | Platform message ID |
| direction | ENUM | NOT NULL | INBOUND, OUTBOUND |
| type | ENUM | NOT NULL | TEXT, IMAGE, VIDEO, AUDIO, DOCUMENT, REACTION, STICKER, UNSUPPORTED |
| content | TEXT | NULL | Text content |
| mediaUrl | TEXT | NULL | Media attachment URL |
| mediaType | VARCHAR(50) | NULL | |
| status | ENUM | NOT NULL | SENT, DELIVERED, READ, FAILED |
| sentById | UUID | FK → users.id, NULL | NULL = incoming |
| failureReason | TEXT | NULL | |
| rawPayload | JSONB | NULL | Full webhook payload for debugging |
| sentAt | TIMESTAMP | NOT NULL | |
| deliveredAt | TIMESTAMP | NULL | |
| readAt | TIMESTAMP | NULL | |
| createdAt | TIMESTAMP | NOT NULL | |

**Partitioning:** Partition by `organizationId` hash at scale (>100M rows)

---

### whatsapp_accounts
Similar structure to instagram_accounts with WhatsApp-specific fields:
- `phoneNumberId`, `businessAccountId`, `displayPhoneNumber`
- `verifiedName`, `qualityRating`, `messagingLimit`

---

### workflows
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK, NOT NULL | |
| name | VARCHAR(255) | NOT NULL | |
| description | TEXT | NULL | |
| status | ENUM | NOT NULL | ACTIVE, INACTIVE, DRAFT |
| trigger | JSONB | NOT NULL | `{ type: 'LEAD_CREATED', config: {} }` |
| conditions | JSONB | NOT NULL | Array of condition objects |
| actions | JSONB | NOT NULL | Array of action objects |
| executionCount | INTEGER | DEFAULT 0 | |
| lastExecutedAt | TIMESTAMP | NULL | |
| createdById | UUID | FK → users.id, NOT NULL | |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |
| deletedAt | TIMESTAMP | NULL | |

---

### workflow_executions
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK, NOT NULL | |
| workflowId | UUID | FK → workflows.id, NOT NULL | |
| triggeredBy | JSONB | NOT NULL | What triggered this: `{ type, entityId, entityType }` |
| status | ENUM | NOT NULL | PENDING, RUNNING, COMPLETED, FAILED, SKIPPED |
| conditionResult | BOOLEAN | NULL | Did conditions pass? |
| actionsExecuted | JSONB | DEFAULT '[]' | Log of each action result |
| error | TEXT | NULL | Error message on failure |
| startedAt | TIMESTAMP | NOT NULL | |
| completedAt | TIMESTAMP | NULL | |
| createdAt | TIMESTAMP | NOT NULL | |

**Retention:** Auto-delete executions > 90 days via cron job

---

### subscriptions
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK, UNIQUE, NOT NULL | One sub per org |
| plan | ENUM | NOT NULL | TRIAL, STARTER, GROWTH, SCALE |
| status | ENUM | NOT NULL | TRIALING, ACTIVE, PAST_DUE, CANCELLED, PAUSED |
| stripeSubscriptionId | VARCHAR(255) | NULL | Stripe sub ID |
| stripeCustomerId | VARCHAR(255) | NULL | |
| stripePriceId | VARCHAR(255) | NULL | |
| currentPeriodStart | TIMESTAMP | NULL | |
| currentPeriodEnd | TIMESTAMP | NULL | |
| cancelAtPeriodEnd | BOOLEAN | DEFAULT false | |
| trialEndsAt | TIMESTAMP | NULL | |
| seatCount | SMALLINT | DEFAULT 1 | |
| lastStripeEventAt | TIMESTAMP | NULL | Timestamp of the most recently APPLIED Stripe event — used to reject out-of-order/replayed webhooks (P0-6) |
| lastSyncedAt | TIMESTAMP | NULL | Last successful Stripe→mirror reconciliation; staleness triggers fail-open access (P0-6) |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |

**Access decisions** read a derived `effectiveAccessLevel` (FULL/READ_ONLY/SUSPENDED), never the raw `status` — see doc 16 §16.4.

---

### invoices
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK, NOT NULL | |
| subscriptionId | UUID | FK → subscriptions.id, NOT NULL | |
| stripeInvoiceId | VARCHAR(255) | UNIQUE, NOT NULL | |
| number | VARCHAR(50) | UNIQUE | Human-readable invoice number |
| status | ENUM | NOT NULL | DRAFT, OPEN, PAID, VOID, UNCOLLECTIBLE |
| amountDue | DECIMAL(10,2) | NOT NULL | |
| amountPaid | DECIMAL(10,2) | DEFAULT 0 | |
| currency | VARCHAR(3) | NOT NULL | |
| dueDate | DATE | NULL | |
| paidAt | TIMESTAMP | NULL | |
| invoicePdfUrl | TEXT | NULL | Stripe-generated PDF |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |

---

### payments
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK, NOT NULL | |
| invoiceId | UUID | FK → invoices.id, NOT NULL | |
| stripePaymentIntentId | VARCHAR(255) | UNIQUE | |
| amount | DECIMAL(10,2) | NOT NULL | |
| currency | VARCHAR(3) | NOT NULL | |
| status | ENUM | NOT NULL | PENDING, SUCCEEDED, FAILED, REFUNDED |
| paymentMethod | VARCHAR(50) | NULL | card, upi, netbanking |
| failureCode | VARCHAR(100) | NULL | |
| failureMessage | TEXT | NULL | |
| refundedAt | TIMESTAMP | NULL | |
| createdAt | TIMESTAMP | NOT NULL | |

---

### notifications
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK, NOT NULL | |
| userId | UUID | FK → users.id, NOT NULL | Recipient |
| type | ENUM | NOT NULL | LEAD_ASSIGNED, MESSAGE_RECEIVED, TASK_OVERDUE, DEAL_WON, WORKFLOW_FAILED, TRIAL_EXPIRING, PAYMENT_FAILED |
| title | VARCHAR(255) | NOT NULL | |
| body | TEXT | NULL | |
| actionUrl | TEXT | NULL | Deep link URL |
| isRead | BOOLEAN | DEFAULT false | |
| readAt | TIMESTAMP | NULL | |
| relatedEntityId | UUID | NULL | |
| relatedEntityType | VARCHAR(50) | NULL | |
| createdAt | TIMESTAMP | NOT NULL | |

**Index:** `(userId, isRead, createdAt DESC)` for inbox badge count

---

### audit_logs
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | NULL | NULL for platform-level actions |
| userId | UUID | FK → users.id, NULL | NULL for system actions |
| action | VARCHAR(100) | NOT NULL | CREATE_LEAD, DELETE_CONTACT, etc. |
| resource | VARCHAR(50) | NOT NULL | lead, contact, deal, etc. |
| resourceId | UUID | NOT NULL | ID of affected record |
| before | JSONB | NULL | State before change |
| after | JSONB | NULL | State after change |
| ipAddress | VARCHAR(45) | NULL | |
| userAgent | TEXT | NULL | |
| createdAt | TIMESTAMP | NOT NULL | Immutable |

**Retention:** 5 years, never soft deleted
**Partitioning:** Range partition by `createdAt` (monthly partitions) at scale

---

### webhook_events
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | NULL | Resolved after processing |
| source | ENUM | NOT NULL | INSTAGRAM, WHATSAPP, STRIPE |
| eventType | VARCHAR(100) | NOT NULL | e.g., messages, payment_intent.succeeded |
| externalEventId | VARCHAR(255) | NULL | UNIQUE per source to prevent duplicate processing |
| payload | JSONB | NOT NULL | Full raw webhook payload |
| status | ENUM | NOT NULL | PENDING, PROCESSING, PROCESSED, FAILED |
| processedAt | TIMESTAMP | NULL | |
| error | TEXT | NULL | |
| attempts | SMALLINT | DEFAULT 0 | |
| createdAt | TIMESTAMP | NOT NULL | |

**Index:** `(source, externalEventId)` UNIQUE (idempotency key)

---

### refresh_tokens
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | Token family ID |
| userId | UUID | FK → users.id, NOT NULL | |
| tokenHash | VARCHAR(255) | NOT NULL | SHA-256 hash of actual token |
| family | UUID | NOT NULL | Token family for rotation detection |
| deviceInfo | VARCHAR(255) | NULL | User-agent truncated |
| ipAddress | VARCHAR(45) | NULL | |
| expiresAt | TIMESTAMP | NOT NULL | |
| usedAt | TIMESTAMP | NULL | Null = not yet used |
| revokedAt | TIMESTAMP | NULL | Null = valid |
| createdAt | TIMESTAMP | NOT NULL | |

**Index:** `tokenHash` (lookup on request), `(userId, family)`, `expiresAt`

---

## 8.4 Partitioning Strategy

| Table | Strategy | Trigger |
|---|---|---|
| leads | Hash by organizationId (8 partitions) | > 5M rows |
| messages | Hash by organizationId (16 partitions) | > 20M rows |
| activities | Range by createdAt (monthly) | > 10M rows |
| audit_logs | Range by createdAt (monthly) | > 5M rows |
| workflow_executions | Range by createdAt (monthly) | > 10M rows |
| notifications | Range by createdAt (monthly) | > 10M rows |

---

## 8.5 Soft Delete Strategy

All core tables implement soft delete:
1. `deletedAt TIMESTAMP NULL` — set on "delete"
2. All Prisma queries automatically filter `WHERE deletedAt IS NULL` via Prisma Extension
3. Soft-deleted records visible to: admin in Settings → Trash
4. Hard delete via cron job 30 days after `deletedAt`
5. Some tables are NEVER soft-deleted: `activities`, `audit_logs`, `webhook_events` (immutable)

---

## 8.6 Audit Strategy

### Automatic Audit Logging
Via Prisma Middleware, all mutations to auditable models generate an `audit_logs` entry:
- Auditable models: Lead, Contact, Deal, Pipeline, Workflow, User, OrganizationMember, Subscription
- Before/after JSONB snapshots (PII fields masked: phone, email)
- Attributed to userId from request context

### Manual Audit Logging
For operations not captured by Prisma middleware (e.g., bulk operations, imports):
- Call `auditService.log(...)` explicitly in service layer

---

## 8.7 Indexes Summary

Critical composite indexes (beyond individual column indexes):
```sql
-- Lead list view query (most common query in the system)
CREATE INDEX idx_leads_org_status_score ON leads(organization_id, status, ai_score DESC)
  WHERE deleted_at IS NULL;

-- Inbox conversation list
CREATE INDEX idx_ig_conversations_org_last ON instagram_conversations(organization_id, last_message_at DESC)
  WHERE status != 'CLOSED';

-- Task due date view
CREATE INDEX idx_tasks_assignee_due ON tasks(organization_id, assigned_to_id, due_date)
  WHERE status = 'PENDING' AND deleted_at IS NULL;

-- Notification unread count
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);

-- Webhook idempotency
CREATE UNIQUE INDEX idx_webhook_events_dedup ON webhook_events(source, external_event_id);

-- Full text search on leads (partial — excludes soft-deleted rows; includes phone per FR-LEAD-005)
CREATE INDEX idx_leads_search ON leads USING gin(
  to_tsvector('english',
    coalesce(first_name, '') || ' ' ||
    coalesce(last_name, '') || ' ' ||
    coalesce(email, '') || ' ' ||
    coalesce(phone, ''))
) WHERE deleted_at IS NULL;
```
