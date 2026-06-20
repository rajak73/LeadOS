-- Sprint 6 M1 — Instagram account storage.
--
-- Creates the instagram_accounts table and adds Sprint 6 ActivityType values.
-- New Postgres enum types: InstagramAccountStatus.
-- Also adds MessageDirection (mirrors enums.ts; needed by messages table in 0015).
-- RLS: standard org-scoped policy matching all tenant tables.

-- 1. New enum types

CREATE TYPE "InstagramAccountStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'DISCONNECTED');
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- 2. New ActivityType values (additive — cannot be rolled back in Postgres)
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'MESSAGE_RECEIVED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'MESSAGE_SENT';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'INSTAGRAM_ACCOUNT_CONNECTED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'INSTAGRAM_ACCOUNT_DISCONNECTED';

-- 3. instagram_accounts table

CREATE TABLE "instagram_accounts" (
  "id"                UUID        NOT NULL DEFAULT uuid_generate_v4(),
  "organizationId"    UUID        NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "igUserId"          VARCHAR(50) NOT NULL,
  "igUsername"        VARCHAR(100),
  "accessToken"       TEXT        NOT NULL,
  "tokenExpiresAt"    TIMESTAMPTZ NOT NULL,
  "tokenType"         VARCHAR(20) NOT NULL,
  "status"            "InstagramAccountStatus" NOT NULL DEFAULT 'ACTIVE',
  "webhookSubscribed" BOOLEAN     NOT NULL DEFAULT false,
  "profilePictureUrl" TEXT,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"         TIMESTAMPTZ,
  CONSTRAINT "instagram_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "instagram_accounts_org_ig_user_unique" UNIQUE ("organizationId", "igUserId")
);

CREATE INDEX "instagram_accounts_org_status_idx"
  ON "instagram_accounts" ("organizationId", "status");
CREATE INDEX "instagram_accounts_ig_user_idx"
  ON "instagram_accounts" ("igUserId");

-- 4. RLS

ALTER TABLE "instagram_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "instagram_accounts" FORCE ROW LEVEL SECURITY;

CREATE POLICY "instagram_accounts_org_isolation" ON "instagram_accounts"
  USING (
    "organizationId" = NULLIF(current_setting('app.current_organization_id', TRUE), '')::UUID
  );

-- VALIDATE CONSTRAINT for the NOT VALID FK on leads is in migration 0016.
