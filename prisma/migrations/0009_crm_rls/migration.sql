-- Sprint 4 M1 / CRM-1.2 — CRM table RLS setup.
-- Mirrors the pattern established in 0003_rls_policies/migration.sql.
-- All 10 new CRM tenant tables receive ENABLE + FORCE + tenant isolation policy.
-- After this migration, check:rls must report: OK — 15 tenant tables enabled + forced + policied.

-- ============================================================
-- GRANT to application role (deny-by-default for leados_app)
-- The platform admin role (leados_platform_admin) has BYPASSRLS — no grants needed.
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON "leads"                    TO leados_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "contacts"                 TO leados_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "tasks"                    TO leados_app;
GRANT SELECT, INSERT            ON "activities"               TO leados_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "notes"                    TO leados_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "files"                    TO leados_app;
GRANT SELECT, INSERT               ON "ai_scores"             TO leados_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "custom_field_definitions" TO leados_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "team_invites"             TO leados_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "saved_replies"            TO leados_app;

-- ============================================================
-- LEADS
-- ============================================================

ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leads" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "leads"
  USING (
    "organizationId" = current_setting('app.current_organization_id', true)::uuid
  )
  WITH CHECK (
    "organizationId" = current_setting('app.current_organization_id', true)::uuid
  );

-- ============================================================
-- CONTACTS
-- ============================================================

ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contacts" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "contacts"
  USING (
    "organizationId" = current_setting('app.current_organization_id', true)::uuid
  )
  WITH CHECK (
    "organizationId" = current_setting('app.current_organization_id', true)::uuid
  );

-- ============================================================
-- TASKS
-- ============================================================

ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "tasks"
  USING (
    "organizationId" = current_setting('app.current_organization_id', true)::uuid
  )
  WITH CHECK (
    "organizationId" = current_setting('app.current_organization_id', true)::uuid
  );

-- ============================================================
-- ACTIVITIES (parent partition table)
-- RLS on the parent is inherited by all partitions in PG 12+.
-- ============================================================

ALTER TABLE "activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activities" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "activities"
  USING (
    "organizationId" = current_setting('app.current_organization_id', true)::uuid
  )
  WITH CHECK (
    "organizationId" = current_setting('app.current_organization_id', true)::uuid
  );

-- ============================================================
-- NOTES
-- ============================================================

ALTER TABLE "notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notes" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "notes"
  USING (
    "organizationId" = current_setting('app.current_organization_id', true)::uuid
  )
  WITH CHECK (
    "organizationId" = current_setting('app.current_organization_id', true)::uuid
  );

-- ============================================================
-- FILES
-- ============================================================

ALTER TABLE "files" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "files" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "files"
  USING (
    "organizationId" = current_setting('app.current_organization_id', true)::uuid
  )
  WITH CHECK (
    "organizationId" = current_setting('app.current_organization_id', true)::uuid
  );

-- ============================================================
-- AI_SCORES
-- ============================================================

ALTER TABLE "ai_scores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_scores" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "ai_scores"
  USING (
    "organizationId" = current_setting('app.current_organization_id', true)::uuid
  )
  WITH CHECK (
    "organizationId" = current_setting('app.current_organization_id', true)::uuid
  );

-- ============================================================
-- CUSTOM_FIELD_DEFINITIONS
-- ============================================================

ALTER TABLE "custom_field_definitions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "custom_field_definitions" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "custom_field_definitions"
  USING (
    "organizationId" = current_setting('app.current_organization_id', true)::uuid
  )
  WITH CHECK (
    "organizationId" = current_setting('app.current_organization_id', true)::uuid
  );

-- ============================================================
-- TEAM_INVITES
-- ============================================================

ALTER TABLE "team_invites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "team_invites" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "team_invites"
  USING (
    "organizationId" = current_setting('app.current_organization_id', true)::uuid
  )
  WITH CHECK (
    "organizationId" = current_setting('app.current_organization_id', true)::uuid
  );

-- ============================================================
-- SAVED_REPLIES
-- ============================================================

ALTER TABLE "saved_replies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "saved_replies" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "saved_replies"
  USING (
    "organizationId" = current_setting('app.current_organization_id', true)::uuid
  )
  WITH CHECK (
    "organizationId" = current_setting('app.current_organization_id', true)::uuid
  );
