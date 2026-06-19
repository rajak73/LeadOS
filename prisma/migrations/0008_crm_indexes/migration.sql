-- Sprint 4 M1 / CRM-1.2 — CRM performance indexes.
-- All high-cardinality lookups and sort paths that the API will exercise.
-- Separated from 0007 so index tuning can iterate without touching DDL.

-- ============================================================
-- pg_trgm extension — required for ILIKE / fuzzy search on leads and contacts
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- LEADS
-- ============================================================

-- Primary tenant-scoped list: org + soft-delete filter + default sort
CREATE INDEX "leads_organizationId_deletedAt_createdAt_idx"
  ON "leads" ("organizationId", "deletedAt", "createdAt" DESC);

-- Status funnel view (kanban / pipeline counts)
CREATE INDEX "leads_organizationId_status_deletedAt_idx"
  ON "leads" ("organizationId", "status", "deletedAt");

-- Assignment inbox
CREATE INDEX "leads_assignedToId_organizationId_idx"
  ON "leads" ("assignedToId", "organizationId");

-- Source breakdown reports
CREATE INDEX "leads_organizationId_source_idx"
  ON "leads" ("organizationId", "source");

-- lastActivityAt sort (active leads feed, most recently active first)
CREATE INDEX "leads_organizationId_lastActivityAt_idx"
  ON "leads" ("organizationId", "lastActivityAt" DESC NULLS LAST);

-- Partial full-text search index (name + email + phone); excludes deleted rows.
-- phone is included per SPRINT_4_SCHEMA_REVISION §change-8.
CREATE INDEX "leads_fts_idx"
  ON "leads"
  USING GIN (
    to_tsvector(
      'english',
      coalesce("firstName", '') || ' ' ||
      coalesce("lastName", '') || ' ' ||
      coalesce("email", '') || ' ' ||
      coalesce("phone", '')
    )
  )
  WHERE "deletedAt" IS NULL;

-- trigram indexes for ILIKE / partial-match UI search
CREATE INDEX "leads_firstName_trgm_idx"  ON "leads" USING GIN ("firstName" gin_trgm_ops);
CREATE INDEX "leads_lastName_trgm_idx"   ON "leads" USING GIN ("lastName"  gin_trgm_ops);
CREATE INDEX "leads_email_trgm_idx"      ON "leads" USING GIN ("email"     gin_trgm_ops);

-- ============================================================
-- CONTACTS
-- ============================================================

CREATE INDEX "contacts_organizationId_deletedAt_createdAt_idx"
  ON "contacts" ("organizationId", "deletedAt", "createdAt" DESC);

CREATE INDEX "contacts_organizationId_createdFromLeadId_idx"
  ON "contacts" ("organizationId", "createdFromLeadId");

CREATE INDEX "contacts_assignedToId_organizationId_idx"
  ON "contacts" ("assignedToId", "organizationId");

CREATE INDEX "contacts_organizationId_lastActivityAt_idx"
  ON "contacts" ("organizationId", "lastActivityAt" DESC NULLS LAST);

-- Full-text search on name + email + phone + company
CREATE INDEX "contacts_fts_idx"
  ON "contacts"
  USING GIN (
    to_tsvector(
      'english',
      coalesce("firstName", '') || ' ' ||
      coalesce("lastName", '') || ' ' ||
      coalesce("email", '') || ' ' ||
      coalesce("phone", '') || ' ' ||
      coalesce("company", '')
    )
  )
  WHERE "deletedAt" IS NULL;

CREATE INDEX "contacts_firstName_trgm_idx" ON "contacts" USING GIN ("firstName" gin_trgm_ops);
CREATE INDEX "contacts_lastName_trgm_idx"  ON "contacts" USING GIN ("lastName"  gin_trgm_ops);
CREATE INDEX "contacts_email_trgm_idx"     ON "contacts" USING GIN ("email"     gin_trgm_ops);

-- ============================================================
-- TASKS
-- ============================================================

-- Assignment queue (my tasks, sorted by dueDate)
CREATE INDEX "tasks_assignedToId_organizationId_status_idx"
  ON "tasks" ("assignedToId", "organizationId", "status");

-- Due-date overdue query (background job and dashboard widget)
CREATE INDEX "tasks_organizationId_dueDate_status_idx"
  ON "tasks" ("organizationId", "dueDate", "status");

-- Related lead task list
CREATE INDEX "tasks_relatedLeadId_organizationId_idx"
  ON "tasks" ("relatedLeadId", "organizationId");

-- Related contact task list
CREATE INDEX "tasks_relatedContactId_organizationId_idx"
  ON "tasks" ("relatedContactId", "organizationId");

CREATE INDEX "tasks_organizationId_deletedAt_createdAt_idx"
  ON "tasks" ("organizationId", "deletedAt", "createdAt" DESC);

-- ============================================================
-- ACTIVITIES (parent table — partition-aware in PG 12+)
-- ============================================================

-- Org-level timeline (most recent activities across the org)
CREATE INDEX "activities_organizationId_createdAt_idx"
  ON "activities" ("organizationId", "createdAt" DESC);

-- Per-lead activity feed
CREATE INDEX "activities_relatedLeadId_createdAt_idx"
  ON "activities" ("relatedLeadId", "createdAt" DESC);

-- Per-contact activity feed
CREATE INDEX "activities_relatedContactId_createdAt_idx"
  ON "activities" ("relatedContactId", "createdAt" DESC);

-- Type filter on org timeline (e.g. "show only LEAD_STATUS_CHANGED events")
CREATE INDEX "activities_organizationId_type_createdAt_idx"
  ON "activities" ("organizationId", "type", "createdAt" DESC);

-- ============================================================
-- NOTES
-- ============================================================

CREATE INDEX "notes_relatedLeadId_organizationId_idx"
  ON "notes" ("relatedLeadId", "organizationId");

CREATE INDEX "notes_relatedContactId_organizationId_idx"
  ON "notes" ("relatedContactId", "organizationId");

CREATE INDEX "notes_organizationId_createdAt_idx"
  ON "notes" ("organizationId", "createdAt" DESC);

-- ============================================================
-- FILES
-- ============================================================

CREATE INDEX "files_relatedLeadId_organizationId_idx"
  ON "files" ("relatedLeadId", "organizationId");

CREATE INDEX "files_relatedContactId_organizationId_idx"
  ON "files" ("relatedContactId", "organizationId");

CREATE INDEX "files_organizationId_createdAt_idx"
  ON "files" ("organizationId", "createdAt" DESC);

-- ============================================================
-- AI_SCORES
-- ============================================================

-- Most recent score per lead (AI service write-through / read cache lookup)
CREATE INDEX "ai_scores_leadId_createdAt_idx"
  ON "ai_scores" ("leadId", "createdAt" DESC);

CREATE INDEX "ai_scores_organizationId_createdAt_idx"
  ON "ai_scores" ("organizationId", "createdAt" DESC);

-- ============================================================
-- CUSTOM_FIELD_DEFINITIONS
-- ============================================================

-- Definition lookup by org + object type (for field rendering and validation)
CREATE INDEX "custom_field_definitions_organizationId_objectType_idx"
  ON "custom_field_definitions" ("organizationId", "objectType");

-- ============================================================
-- TEAM_INVITES
-- ============================================================

-- Accept-link lookup: tokenHash lookup uses unique constraint (already indexed).
-- Pending invites per org
CREATE INDEX "team_invites_organizationId_acceptedAt_revokedAt_idx"
  ON "team_invites" ("organizationId", "acceptedAt", "revokedAt");

-- Pending invite check by email per org (prevent duplicate invites)
CREATE INDEX "team_invites_organizationId_email_idx"
  ON "team_invites" ("organizationId", "email");

-- ============================================================
-- SAVED_REPLIES
-- ============================================================

CREATE INDEX "saved_replies_organizationId_deletedAt_idx"
  ON "saved_replies" ("organizationId", "deletedAt");
