-- Sprint 7 M1 — Notification engine tables.
--
-- Creates notifications and notification_preferences tables.
-- New Postgres enum types: NotificationType, NotificationChannel.
-- RLS: standard org-scoped policy matching all tenant tables.

-- 1. New enum types

CREATE TYPE "NotificationType" AS ENUM ('INBOX_MESSAGE', 'CONVERSATION_ASSIGNED');
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL');

-- 2. ActivityType additions (Sprint 7 M1 — NOTIFICATION_SENT emitted now;
--    the rest are scaffolds for M2/M3/M4 so enum parity lands once).

ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'NOTIFICATION_SENT';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'LEAD_SCORED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'WORKFLOW_TRIGGERED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'WORKFLOW_ACTION_EXECUTED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'FOLLOW_UP_CREATED';

-- 3. notifications table

CREATE TABLE "notifications" (
  "id"             UUID         NOT NULL DEFAULT uuid_generate_v4(),
  "organizationId" UUID         NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "userId"         UUID         NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type"           "NotificationType" NOT NULL,
  "title"          VARCHAR(200) NOT NULL,
  "body"           TEXT         NOT NULL,
  "entityType"     VARCHAR(40),
  "entityId"       UUID,
  "channel"        "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
  "readAt"         TIMESTAMPTZ,
  "createdAt"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notifications_org_user_read_created_idx"
  ON "notifications" ("organizationId", "userId", "readAt", "createdAt" DESC);

-- 4. RLS on notifications

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;

CREATE POLICY "notifications_org_isolation" ON "notifications"
  USING (
    "organizationId" = NULLIF(current_setting('app.current_organization_id', TRUE), '')::UUID
  );

-- 5. notification_preferences table

CREATE TABLE "notification_preferences" (
  "id"             UUID         NOT NULL DEFAULT uuid_generate_v4(),
  "organizationId" UUID         NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "userId"         UUID         NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type"           "NotificationType" NOT NULL,
  "inApp"          BOOLEAN      NOT NULL DEFAULT TRUE,
  "email"          BOOLEAN      NOT NULL DEFAULT FALSE,
  "createdAt"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_preferences_org_user_type_unique" UNIQUE ("organizationId", "userId", "type")
);

-- 6. RLS on notification_preferences

ALTER TABLE "notification_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_preferences" FORCE ROW LEVEL SECURITY;

CREATE POLICY "notification_preferences_org_isolation" ON "notification_preferences"
  USING (
    "organizationId" = NULLIF(current_setting('app.current_organization_id', TRUE), '')::UUID
  );
