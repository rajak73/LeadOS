-- Sprint 3 M1 / TEN-3.1.2 — Row Level Security on all tenant tables (FINAL_ARCHITECTURE §2.1).
--
-- For each org-scoped table (registry: apps/api/src/core/tenancy/tenant-tables.ts):
--   * ENABLE ROW LEVEL SECURITY  — turn RLS on.
--   * FORCE  ROW LEVEL SECURITY  — apply RLS even to the table owner (so the migration runner
--                                  / owner cannot accidentally bypass it).
--   * A single missing-safe policy for ALL commands:
--        USING / WITH CHECK ( "organizationId" = current_setting('app.current_organization_id', true)::uuid )
--     `current_setting(..., true)` returns NULL when the GUC is unset (missing_ok = true), and
--     `"organizationId" = NULL` is NULL → row denied. So an unset tenant context = zero rows,
--     never a leak (the "missing-safe" property). WITH CHECK additionally blocks writing a row
--     whose organizationId differs from the active tenant.
--
-- Column name is the actual Prisma column `"organizationId"` (camelCase, quoted), not the
-- illustrative `organization_id` from the architecture doc.

-- organization_members
ALTER TABLE "organization_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_members" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "organization_members"
  USING ("organizationId" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organizationId" = current_setting('app.current_organization_id', true)::uuid);

-- roles
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roles" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "roles"
  USING ("organizationId" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organizationId" = current_setting('app.current_organization_id', true)::uuid);

-- subscriptions
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "subscriptions"
  USING ("organizationId" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organizationId" = current_setting('app.current_organization_id', true)::uuid);

-- refresh_tokens
ALTER TABLE "refresh_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refresh_tokens" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "refresh_tokens"
  USING ("organizationId" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organizationId" = current_setting('app.current_organization_id', true)::uuid);
