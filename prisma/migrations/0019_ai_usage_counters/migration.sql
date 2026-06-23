-- Sprint 7 M2 — AI usage counters table.
--
-- Creates the ai_usage_counters table, enabling and forcing RLS,
-- and setting the standard tenant isolation policy.

-- 1. Create table
CREATE TABLE "ai_usage_counters" (
  "id"             UUID         NOT NULL DEFAULT uuid_generate_v4(),
  "organizationId" UUID         NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "periodMonth"    VARCHAR(7)   NOT NULL,
  "callCount"      INTEGER      NOT NULL DEFAULT 0,
  "tokenCount"     INTEGER      NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT "ai_usage_counters_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_usage_counters_org_month_unique" UNIQUE ("organizationId", "periodMonth")
);

-- 2. RLS on ai_usage_counters
ALTER TABLE "ai_usage_counters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_usage_counters" FORCE ROW LEVEL SECURITY;

CREATE POLICY "ai_usage_counters_org_isolation" ON "ai_usage_counters"
  USING (
    "organizationId" = NULLIF(current_setting('app.current_organization_id', TRUE), '')::UUID
  );
