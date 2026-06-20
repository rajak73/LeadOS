-- Sprint 5 M1 — Pipeline, PipelineStage, and Deal tables.
-- Also activates the four deferred relatedDealId FK constraints left as bare columns in Sprint 4.
-- RLS is in the next migration (0011_pipeline_rls) to keep concerns separated.

-- ─── New enums ────────────────────────────────────────────────────────────────

-- DealStatus already exists from Sprint 4 (schema.prisma declared it; migration 0007 created it).
-- WebhookSource and WebhookEventStatus are new and live in 0012_webhook_events.

-- ─── pipelines ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "pipelines" (
  "id"             UUID         NOT NULL DEFAULT uuid_generate_v4(),
  "organizationId" UUID         NOT NULL,
  "name"           VARCHAR(100) NOT NULL,
  "isDefault"      BOOLEAN      NOT NULL DEFAULT false,
  "createdAt"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updatedAt"      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pipelines_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE
);

-- Exactly one default pipeline per org — enforced at DB level (R-M1-3 mitigation).
CREATE UNIQUE INDEX IF NOT EXISTS "pipelines_org_default_uidx"
  ON "pipelines" ("organizationId")
  WHERE "isDefault" = true;

CREATE INDEX IF NOT EXISTS "pipelines_organizationId_idx"
  ON "pipelines" ("organizationId");

-- ─── pipeline_stages ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "pipeline_stages" (
  "id"             UUID         NOT NULL DEFAULT uuid_generate_v4(),
  "organizationId" UUID         NOT NULL,
  "pipelineId"     UUID         NOT NULL,
  "name"           VARCHAR(100) NOT NULL,
  "order"          INTEGER      NOT NULL,
  "color"          VARCHAR(7),
  "probability"    INTEGER      CHECK ("probability" >= 0 AND "probability" <= 100),
  "isWon"          BOOLEAN      NOT NULL DEFAULT false,
  "isLost"         BOOLEAN      NOT NULL DEFAULT false,
  "createdAt"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updatedAt"      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pipeline_stages_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "pipeline_stages_pipelineId_fkey"
    FOREIGN KEY ("pipelineId") REFERENCES "pipelines"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "pipeline_stages_organizationId_pipelineId_idx"
  ON "pipeline_stages" ("organizationId", "pipelineId");

CREATE INDEX IF NOT EXISTS "pipeline_stages_pipelineId_order_idx"
  ON "pipeline_stages" ("pipelineId", "order");

-- ─── DealStatus enum ──────────────────────────────────────────────────────────
-- DealStatus was declared in schema.prisma in Sprint 4 but the table referencing it (deals)
-- was deferred. Confirm the enum exists; create if missing (idempotent via DO block).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DealStatus') THEN
    CREATE TYPE "DealStatus" AS ENUM ('OPEN', 'WON', 'LOST');
  END IF;
END$$;

-- ─── deals ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "deals" (
  "id"                UUID         NOT NULL DEFAULT uuid_generate_v4(),
  "organizationId"    UUID         NOT NULL,
  "title"             VARCHAR(200) NOT NULL,
  "value"             DECIMAL(15, 2),
  "currency"          CHAR(3)      NOT NULL DEFAULT 'INR',
  "pipelineId"        UUID         NOT NULL,
  "stageId"           UUID         NOT NULL,
  "leadId"            UUID,
  "contactId"         UUID,
  "assignedToId"      UUID,
  "createdById"       UUID         NOT NULL,
  "status"            "DealStatus" NOT NULL DEFAULT 'OPEN',
  "closedAt"          TIMESTAMPTZ,
  "lostReason"        VARCHAR(500),
  "expectedCloseDate" TIMESTAMPTZ,
  "customFields"      JSONB        NOT NULL DEFAULT '{}',
  "deletedAt"         TIMESTAMPTZ,
  "createdAt"         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updatedAt"         TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "deals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "deals_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "deals_pipelineId_fkey"
    FOREIGN KEY ("pipelineId") REFERENCES "pipelines"("id") ON DELETE RESTRICT,
  CONSTRAINT "deals_stageId_fkey"
    FOREIGN KEY ("stageId") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT,
  CONSTRAINT "deals_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL,
  CONSTRAINT "deals_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL,
  CONSTRAINT "deals_assignedToId_fkey"
    FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "deals_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "deals_organizationId_status_stageId_idx"
  ON "deals" ("organizationId", "status", "stageId");

CREATE INDEX IF NOT EXISTS "deals_organizationId_pipelineId_idx"
  ON "deals" ("organizationId", "pipelineId");

CREATE INDEX IF NOT EXISTS "deals_leadId_idx"
  ON "deals" ("leadId");

CREATE INDEX IF NOT EXISTS "deals_contactId_idx"
  ON "deals" ("contactId");

CREATE INDEX IF NOT EXISTS "deals_assignedToId_idx"
  ON "deals" ("assignedToId");

CREATE INDEX IF NOT EXISTS "deals_deletedAt_idx"
  ON "deals" ("deletedAt");

-- ─── Activate deferred relatedDealId FK constraints ───────────────────────────
-- Sprint 4 left relatedDealId as a bare UUID column on tasks, activities, notes, files.
-- The deals table now exists so the FK constraints can be applied.
-- Use IF NOT EXISTS pattern via DO block for idempotency.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'tasks_related_deal_fkey' AND table_name = 'tasks'
  ) THEN
    ALTER TABLE "tasks"
      ADD CONSTRAINT "tasks_related_deal_fkey"
      FOREIGN KEY ("relatedDealId") REFERENCES "deals"("id") ON DELETE SET NULL;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'activities_related_deal_fkey' AND table_name = 'activities'
  ) THEN
    ALTER TABLE "activities"
      ADD CONSTRAINT "activities_related_deal_fkey"
      FOREIGN KEY ("relatedDealId") REFERENCES "deals"("id") ON DELETE SET NULL;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'notes_related_deal_fkey' AND table_name = 'notes'
  ) THEN
    ALTER TABLE "notes"
      ADD CONSTRAINT "notes_related_deal_fkey"
      FOREIGN KEY ("relatedDealId") REFERENCES "deals"("id") ON DELETE SET NULL;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'files_related_deal_fkey' AND table_name = 'files'
  ) THEN
    ALTER TABLE "files"
      ADD CONSTRAINT "files_related_deal_fkey"
      FOREIGN KEY ("relatedDealId") REFERENCES "deals"("id") ON DELETE SET NULL;
  END IF;
END$$;
