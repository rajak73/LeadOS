-- Sprint 5 M1 — WebhookEvent table with dual-mode RLS.
-- ARCHITECTURE: persist-then-200 (FINAL_ARCHITECTURE.md §5.3).
-- organizationId is nullable — Stripe events arrive before org resolution.
-- The worker back-fills organizationId before marking DONE.
-- Two RLS policies:
--   webhook_insert: permissive INSERT (allows NULL organizationId for pre-org-resolution rows).
--   webhook_select: enforces tenant isolation on SELECT/UPDATE/DELETE.

-- ─── New enums ────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WebhookSource') THEN
    CREATE TYPE "WebhookSource" AS ENUM ('STRIPE', 'INSTAGRAM', 'WHATSAPP', 'SYSTEM');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WebhookEventStatus') THEN
    CREATE TYPE "WebhookEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED', 'SKIPPED');
  END IF;
END$$;

-- ─── ActivityType enum extension ──────────────────────────────────────────────
-- Add Sprint 5 activity types to the existing Postgres enum.
-- ALTER TYPE ADD VALUE is idempotent-safe via IF NOT EXISTS (Postgres 9.6+).

ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'DEAL_UPDATED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'PIPELINE_CREATED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'PIPELINE_UPDATED';

-- ─── webhook_events ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "webhook_events" (
  "id"              UUID                 NOT NULL DEFAULT uuid_generate_v4(),
  "organizationId"  UUID,                -- nullable: Stripe events land before org resolution
  "source"          "WebhookSource"      NOT NULL,
  "externalEventId" TEXT                 NOT NULL,
  "payload"         JSONB                NOT NULL,
  "rawHeaders"      JSONB                NOT NULL DEFAULT '{}',
  "status"          "WebhookEventStatus" NOT NULL DEFAULT 'PENDING',
  "attempts"        INTEGER              NOT NULL DEFAULT 0,
  "lastAttemptAt"   TIMESTAMPTZ,
  "processedAt"     TIMESTAMPTZ,
  "errorMessage"    TEXT,
  "createdAt"       TIMESTAMPTZ          NOT NULL DEFAULT now(),
  "updatedAt"       TIMESTAMPTZ          NOT NULL DEFAULT now(),

  CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "webhook_events_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE
);

-- Idempotency key: (source, externalEventId) must be unique.
-- Duplicate delivery → check this constraint → return 200 with status = SKIPPED.
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_events_source_externalEventId_uidx"
  ON "webhook_events" ("source", "externalEventId");

-- Startup re-enqueue scan: WHERE status = 'PENDING' AND createdAt < now() - interval '5 minutes'.
CREATE INDEX IF NOT EXISTS "webhook_events_status_createdAt_idx"
  ON "webhook_events" ("status", "createdAt");

-- ─── Dual-mode RLS ────────────────────────────────────────────────────────────

ALTER TABLE "webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_events" FORCE ROW LEVEL SECURITY;

-- INSERT: permissive — allows the webhook receiver to write with NULL organizationId.
DROP POLICY IF EXISTS "webhook_insert" ON "webhook_events";
CREATE POLICY "webhook_insert" ON "webhook_events"
  FOR INSERT
  WITH CHECK (true);

-- SELECT / UPDATE / DELETE: enforces tenant isolation.
-- organizationId IS NULL clause covers the PENDING window before the worker back-fills.
DROP POLICY IF EXISTS "webhook_select" ON "webhook_events";
CREATE POLICY "webhook_select" ON "webhook_events"
  FOR SELECT
  USING (
    "organizationId" IS NULL
    OR "organizationId" = current_setting('app.current_organization_id', true)::uuid
  );

-- UPDATE: only the worker (which knows the eventId) should update; use same GUC guard.
DROP POLICY IF EXISTS "webhook_update" ON "webhook_events";
CREATE POLICY "webhook_update" ON "webhook_events"
  FOR UPDATE
  USING (
    "organizationId" IS NULL
    OR "organizationId" = current_setting('app.current_organization_id', true)::uuid
  );
