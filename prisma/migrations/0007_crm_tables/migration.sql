-- Sprint 4 M1 / CRM-1.2 — CRM tables foundation.
-- Hand-authored migration; DO NOT regenerate with prisma migrate dev.
-- The activities table uses PARTITION BY RANGE and a composite PK (id, createdAt)
-- which Prisma cannot generate. All other tables are standard; the DDL matches
-- the approved Prisma schema (09-PRISMA-SCHEMA.md / SPRINT_4_SCHEMA_APPROVAL.md).

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE "LeadStatus" AS ENUM (
  'NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'
);

CREATE TYPE "LeadSource" AS ENUM (
  'INSTAGRAM_DM', 'INSTAGRAM_COMMENT', 'WHATSAPP', 'MANUAL', 'IMPORT', 'REFERRAL', 'WEB_FORM', 'OTHER'
);

CREATE TYPE "DealStatus" AS ENUM ('OPEN', 'WON', 'LOST');

CREATE TYPE "TaskType" AS ENUM ('CALL', 'EMAIL', 'MEETING', 'FOLLOW_UP', 'DEMO', 'OTHER');

CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

CREATE TYPE "ActivityType" AS ENUM (
  'LEAD_CREATED', 'LEAD_STATUS_CHANGED', 'LEAD_ASSIGNED', 'LEAD_WON', 'LEAD_LOST',
  'CONTACT_CREATED', 'CONTACT_UPDATED',
  'TASK_CREATED', 'TASK_COMPLETED', 'TASK_CANCELLED',
  'NOTE_ADDED', 'NOTE_UPDATED', 'NOTE_DELETED',
  'FILE_UPLOADED', 'FILE_DELETED',
  'DEAL_CREATED', 'DEAL_STAGE_MOVED', 'DEAL_WON', 'DEAL_LOST'
);

CREATE TYPE "CustomFieldObjectType" AS ENUM ('LEAD', 'CONTACT', 'DEAL');

CREATE TYPE "CustomFieldType" AS ENUM (
  'TEXT', 'NUMBER', 'DATE', 'SELECT', 'MULTI_SELECT', 'BOOLEAN', 'URL'
);

CREATE TYPE "StorageProvider" AS ENUM ('S3', 'CLOUDINARY');

-- ============================================================
-- LEADS
-- Note: convertedToContactId FK is added AFTER contacts table
-- via ALTER TABLE below (circular reference resolution).
-- Deferred columns: pipelineStageId (Sprint 5), instagramAccountId (Sprint 6),
--                   mergedIntoLeadId (merge milestone).
-- ============================================================

CREATE TABLE "leads" (
  "id"                   UUID        NOT NULL DEFAULT uuid_generate_v4(),
  "organizationId"       UUID        NOT NULL,
  "firstName"            VARCHAR(100) NOT NULL,
  "lastName"             VARCHAR(100),
  "email"                VARCHAR(255),
  "phone"                VARCHAR(20),
  "source"               "LeadSource" NOT NULL DEFAULT 'MANUAL',
  "status"               "LeadStatus" NOT NULL DEFAULT 'NEW',
  "assignedToId"         UUID,
  "aiScore"              SMALLINT,
  "aiScoreUpdatedAt"     TIMESTAMP WITH TIME ZONE,
  "instagramHandle"      VARCHAR(100),
  "instagramUserId"      VARCHAR(50),
  "instagramAccountId"   UUID,                    -- deferred FK → instagram_accounts (Sprint 6)
  "tags"                 TEXT[]      NOT NULL DEFAULT '{}',
  "customFields"         JSONB       NOT NULL DEFAULT '{}',
  "lostReason"           TEXT,
  "convertedToContactId" UUID,                    -- FK added after contacts table (below)
  "pipelineStageId"      UUID,                    -- deferred FK → pipeline_stages (Sprint 5)
  "mergedIntoLeadId"     UUID,                    -- deferred self-ref FK (merge milestone)
  "lastActivityAt"       TIMESTAMP WITH TIME ZONE,
  "createdById"          UUID        NOT NULL,
  "createdAt"            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"            TIMESTAMP WITH TIME ZONE,
  CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "leads"
  ADD CONSTRAINT "leads_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "leads"
  ADD CONSTRAINT "leads_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "leads"
  ADD CONSTRAINT "leads_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id");

-- ============================================================
-- CONTACTS
-- Note: createdFromLeadId FK is added AFTER this table
-- (circular reference with leads).
-- ============================================================

CREATE TABLE "contacts" (
  "id"                UUID        NOT NULL DEFAULT uuid_generate_v4(),
  "organizationId"    UUID        NOT NULL,
  "firstName"         VARCHAR(100) NOT NULL,
  "lastName"          VARCHAR(100),
  "email"             VARCHAR(255),
  "phone"             VARCHAR(20),
  "company"           VARCHAR(255),
  "jobTitle"          VARCHAR(100),
  "avatarUrl"         TEXT,
  "address"           JSONB,
  "tags"              TEXT[]      NOT NULL DEFAULT '{}',
  "customFields"      JSONB       NOT NULL DEFAULT '{}',
  "lifeTimeValue"     DECIMAL(15,2) NOT NULL DEFAULT 0,
  "assignedToId"      UUID,
  "lastActivityAt"    TIMESTAMP WITH TIME ZONE,
  "createdFromLeadId" UUID,                    -- FK added below after both tables exist
  "createdById"       UUID        NOT NULL,
  "createdAt"         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"         TIMESTAMP WITH TIME ZONE,
  CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "contacts"
  ADD CONSTRAINT "contacts_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "contacts"
  ADD CONSTRAINT "contacts_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "contacts"
  ADD CONSTRAINT "contacts_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id");

-- ── Circular FK resolution ── both tables now exist ──────────────────────────

ALTER TABLE "leads"
  ADD CONSTRAINT "leads_convertedToContactId_fkey"
  FOREIGN KEY ("convertedToContactId") REFERENCES "contacts"("id") ON DELETE SET NULL;

ALTER TABLE "contacts"
  ADD CONSTRAINT "contacts_createdFromLeadId_fkey"
  FOREIGN KEY ("createdFromLeadId") REFERENCES "leads"("id") ON DELETE SET NULL;

-- ============================================================
-- TASKS
-- relatedDealId is plain UUID — no FK (deals table is Sprint 5).
-- Sprint 5 migration action: ALTER TABLE tasks ADD CONSTRAINT
--   tasks_relatedDealId_fkey FOREIGN KEY ("relatedDealId") REFERENCES deals(id) ON DELETE SET NULL;
-- ============================================================

CREATE TABLE "tasks" (
  "id"               UUID        NOT NULL DEFAULT uuid_generate_v4(),
  "organizationId"   UUID        NOT NULL,
  "title"            VARCHAR(255) NOT NULL,
  "description"      TEXT,
  "type"             "TaskType"  NOT NULL DEFAULT 'OTHER',
  "priority"         "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
  "status"           "TaskStatus" NOT NULL DEFAULT 'PENDING',
  "dueDate"          TIMESTAMP WITH TIME ZONE,
  "completedAt"      TIMESTAMP WITH TIME ZONE,
  "assignedToId"     UUID,
  "relatedLeadId"    UUID,
  "relatedDealId"    UUID,        -- no FK in Sprint 4 — deals table is Sprint 5
  "relatedContactId" UUID,
  "createdById"      UUID        NOT NULL,
  "createdAt"        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"        TIMESTAMP WITH TIME ZONE,
  CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id");

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_relatedLeadId_fkey"
  FOREIGN KEY ("relatedLeadId") REFERENCES "leads"("id") ON DELETE SET NULL;

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_relatedContactId_fkey"
  FOREIGN KEY ("relatedContactId") REFERENCES "contacts"("id") ON DELETE SET NULL;

-- ============================================================
-- ACTIVITIES — partitioned, append-only, immutable.
-- PARTITION BY RANGE("createdAt") with composite PK (id, createdAt).
-- Prisma @id is on `id` only (for TypeScript types); the actual DB PK is composite.
-- DB triggers enforce immutability (activities_no_update, activities_no_delete).
-- CHECK constraint ensures every activity is linked to at least one entity.
-- relatedDealId is plain UUID — no FK (deals table is Sprint 5).
-- ============================================================

CREATE TABLE "activities" (
  "id"               UUID             NOT NULL DEFAULT uuid_generate_v4(),
  "organizationId"   UUID             NOT NULL,
  "type"             "ActivityType"   NOT NULL,
  "description"      TEXT             NOT NULL,
  "metadata"         JSONB            NOT NULL DEFAULT '{}',
  "performedById"    UUID,
  "relatedLeadId"    UUID,
  "relatedDealId"    UUID,            -- no FK in Sprint 4 — deals table is Sprint 5
  "relatedContactId" UUID,
  "createdAt"        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "activities_pkey" PRIMARY KEY ("id", "createdAt"),
  CONSTRAINT "activities_entity_required"
    CHECK (
      "relatedLeadId" IS NOT NULL
      OR "relatedDealId" IS NOT NULL
      OR "relatedContactId" IS NOT NULL
    )
) PARTITION BY RANGE ("createdAt");

-- Initial partitions
CREATE TABLE "activities_2026" PARTITION OF "activities"
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

CREATE TABLE "activities_default" PARTITION OF "activities" DEFAULT;

-- FKs on the parent table (inherited by partitions in PG 12+)
ALTER TABLE "activities"
  ADD CONSTRAINT "activities_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "activities"
  ADD CONSTRAINT "activities_performedById_fkey"
  FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "activities"
  ADD CONSTRAINT "activities_relatedLeadId_fkey"
  FOREIGN KEY ("relatedLeadId") REFERENCES "leads"("id") ON DELETE SET NULL;

ALTER TABLE "activities"
  ADD CONSTRAINT "activities_relatedContactId_fkey"
  FOREIGN KEY ("relatedContactId") REFERENCES "contacts"("id") ON DELETE SET NULL;

-- Immutability triggers
CREATE FUNCTION activities_prevent_update() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'activities are immutable — UPDATE is not allowed';
END;
$$;

CREATE FUNCTION activities_prevent_delete() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'activities are immutable — DELETE is not allowed';
END;
$$;

CREATE TRIGGER activities_no_update
  BEFORE UPDATE ON "activities"
  FOR EACH ROW EXECUTE FUNCTION activities_prevent_update();

CREATE TRIGGER activities_no_delete
  BEFORE DELETE ON "activities"
  FOR EACH ROW EXECUTE FUNCTION activities_prevent_delete();

-- ============================================================
-- NOTES
-- content is JSONB (ProseMirror/Tiptap document — not raw HTML).
-- relatedDealId is plain UUID — no FK (deals table is Sprint 5).
-- Sprint 5 migration: ADD CONSTRAINT notes_relatedDealId_fkey FK → deals(id).
-- ============================================================

CREATE TABLE "notes" (
  "id"               UUID     NOT NULL DEFAULT uuid_generate_v4(),
  "organizationId"   UUID     NOT NULL,
  "content"          JSONB    NOT NULL DEFAULT '{}',
  "relatedLeadId"    UUID,
  "relatedDealId"    UUID,    -- no FK in Sprint 4 — deals table is Sprint 5
  "relatedContactId" UUID,
  "createdById"      UUID     NOT NULL,
  "createdAt"        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"        TIMESTAMP WITH TIME ZONE,
  CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "notes"
  ADD CONSTRAINT "notes_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "notes"
  ADD CONSTRAINT "notes_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id");

ALTER TABLE "notes"
  ADD CONSTRAINT "notes_relatedLeadId_fkey"
  FOREIGN KEY ("relatedLeadId") REFERENCES "leads"("id") ON DELETE SET NULL;

ALTER TABLE "notes"
  ADD CONSTRAINT "notes_relatedContactId_fkey"
  FOREIGN KEY ("relatedContactId") REFERENCES "contacts"("id") ON DELETE SET NULL;

-- ============================================================
-- FILES
-- relatedDealId is plain UUID — no FK (deals table is Sprint 5).
-- Sprint 5 migration: ADD CONSTRAINT files_relatedDealId_fkey FK → deals(id).
-- ============================================================

CREATE TABLE "files" (
  "id"               UUID              NOT NULL DEFAULT uuid_generate_v4(),
  "organizationId"   UUID              NOT NULL,
  "name"             VARCHAR(255)      NOT NULL,
  "storageKey"       TEXT              NOT NULL,
  "storageProvider"  "StorageProvider" NOT NULL,
  "mimeType"         VARCHAR(100)      NOT NULL,
  "sizeBytes"        BIGINT            NOT NULL,
  "url"              TEXT              NOT NULL,
  "relatedLeadId"    UUID,
  "relatedDealId"    UUID,             -- no FK in Sprint 4 — deals table is Sprint 5
  "relatedContactId" UUID,
  "uploadedById"     UUID              NOT NULL,
  "createdAt"        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"        TIMESTAMP WITH TIME ZONE,
  CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "files"
  ADD CONSTRAINT "files_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "files"
  ADD CONSTRAINT "files_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "users"("id");

ALTER TABLE "files"
  ADD CONSTRAINT "files_relatedLeadId_fkey"
  FOREIGN KEY ("relatedLeadId") REFERENCES "leads"("id") ON DELETE SET NULL;

ALTER TABLE "files"
  ADD CONSTRAINT "files_relatedContactId_fkey"
  FOREIGN KEY ("relatedContactId") REFERENCES "contacts"("id") ON DELETE SET NULL;

-- ============================================================
-- AI_SCORES — immutable structured AI output (no updatedAt, no deletedAt).
-- leads.aiScore + leads.aiScoreUpdatedAt are the denormalized read cache.
-- This table stores full history, confidence, factors, and recommendation.
-- Sprint 7 AI service writes here; table is empty in Sprint 4.
-- ============================================================

CREATE TABLE "ai_scores" (
  "id"             UUID         NOT NULL DEFAULT uuid_generate_v4(),
  "organizationId" UUID         NOT NULL,
  "leadId"         UUID         NOT NULL,
  "score"          SMALLINT     NOT NULL,
  "confidence"     DECIMAL(3,2),
  "factors"        JSONB,
  "recommendation" TEXT,
  "triggeredBy"    VARCHAR(50),
  "modelVersion"   VARCHAR(50),
  "createdAt"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_scores_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ai_scores"
  ADD CONSTRAINT "ai_scores_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "ai_scores"
  ADD CONSTRAINT "ai_scores_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE;

-- ============================================================
-- CUSTOM_FIELD_DEFINITIONS — schema table for org-defined custom fields (FR-LEAD-009).
-- Uniqueness is enforced via a PARTIAL unique index (WHERE deletedAt IS NULL)
-- so soft-deleted field keys can be reused. Prisma @@unique is intentionally absent.
-- ============================================================

CREATE TABLE "custom_field_definitions" (
  "id"             UUID                    NOT NULL DEFAULT uuid_generate_v4(),
  "organizationId" UUID                    NOT NULL,
  "objectType"     "CustomFieldObjectType" NOT NULL,
  "fieldKey"       VARCHAR(100)            NOT NULL,
  "displayLabel"   VARCHAR(100)            NOT NULL,
  "fieldType"      "CustomFieldType"       NOT NULL,
  "options"        JSONB,
  "isRequired"     BOOLEAN                 NOT NULL DEFAULT false,
  "position"       SMALLINT                NOT NULL,
  "createdById"    UUID                    NOT NULL,
  "createdAt"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"      TIMESTAMP WITH TIME ZONE,
  CONSTRAINT "custom_field_definitions_pkey" PRIMARY KEY ("id"),
  -- SELECT / MULTI_SELECT types require options to be non-null
  CONSTRAINT "custom_field_definitions_options_required"
    CHECK (
      "fieldType" NOT IN ('SELECT', 'MULTI_SELECT')
      OR "options" IS NOT NULL
    )
);

ALTER TABLE "custom_field_definitions"
  ADD CONSTRAINT "custom_field_definitions_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "custom_field_definitions"
  ADD CONSTRAINT "custom_field_definitions_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id");

-- Partial unique index — enforces uniqueness only on active (non-deleted) definitions
-- so that a soft-deleted field key can be reused by the same org.
CREATE UNIQUE INDEX "custom_field_definitions_org_type_key_key"
  ON "custom_field_definitions" ("organizationId", "objectType", "fieldKey")
  WHERE "deletedAt" IS NULL;

-- ============================================================
-- TEAM_INVITES — token store for magic link invites.
-- Token lookup (on link click) uses admin client (D-M3-2 boundary).
-- ============================================================

CREATE TABLE "team_invites" (
  "id"             UUID         NOT NULL DEFAULT uuid_generate_v4(),
  "organizationId" UUID         NOT NULL,
  "email"          VARCHAR(255) NOT NULL,
  "roleId"         UUID         NOT NULL,
  "tokenHash"      VARCHAR(255) NOT NULL,
  "invitedById"    UUID         NOT NULL,
  "expiresAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
  "acceptedAt"     TIMESTAMP WITH TIME ZONE,
  "revokedAt"      TIMESTAMP WITH TIME ZONE,
  "createdAt"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "team_invites_pkey"       PRIMARY KEY ("id"),
  CONSTRAINT "team_invites_tokenHash_key" UNIQUE ("tokenHash")
);

ALTER TABLE "team_invites"
  ADD CONSTRAINT "team_invites_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "team_invites"
  ADD CONSTRAINT "team_invites_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "roles"("id");

ALTER TABLE "team_invites"
  ADD CONSTRAINT "team_invites_invitedById_fkey"
  FOREIGN KEY ("invitedById") REFERENCES "users"("id");

-- ============================================================
-- SAVED_REPLIES — shell table for Sprint 6 inbox (FR-INBOX-006).
-- No routes or service code in Sprint 4; added now so RLS is established
-- and TENANT_TABLES count does not change when Sprint 6 ships.
-- ============================================================

CREATE TABLE "saved_replies" (
  "id"             UUID         NOT NULL DEFAULT uuid_generate_v4(),
  "organizationId" UUID         NOT NULL,
  "title"          VARCHAR(255) NOT NULL,
  "content"        TEXT         NOT NULL,
  "shortcut"       VARCHAR(50),
  "isGlobal"       BOOLEAN      NOT NULL DEFAULT true,
  "createdById"    UUID         NOT NULL,
  "createdAt"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"      TIMESTAMP WITH TIME ZONE,
  CONSTRAINT "saved_replies_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "saved_replies"
  ADD CONSTRAINT "saved_replies_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "saved_replies"
  ADD CONSTRAINT "saved_replies_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id");

-- ============================================================
-- DB TRIGGERS
-- ============================================================

-- leads_source_immutable: source cannot change after creation (SPRINT_4_SCHEMA_REVISION §change-10).
CREATE FUNCTION leads_prevent_source_update() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."source" IS DISTINCT FROM OLD."source" THEN
    RAISE EXCEPTION 'leads.source is immutable after creation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER leads_source_immutable
  BEFORE UPDATE ON "leads"
  FOR EACH ROW EXECUTE FUNCTION leads_prevent_source_update();
