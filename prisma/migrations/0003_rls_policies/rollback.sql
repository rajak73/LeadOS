-- Tested rollback for 0003_rls_policies (TD-S2-7: no destructive migration without a tested
-- rollback). Drops the policies and disables RLS on every tenant table, returning the schema
-- to its pre-0003 state. Verified locally by: apply 0003 → apply this → re-apply 0003.
--
-- Roles from 0002 are intentionally NOT dropped here (dropping a LOGIN role with dependent
-- grants is a separate, higher-risk operation); a role rollback, if ever needed, is handled
-- out-of-band.

ALTER TABLE "organization_members" NO FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "organization_members";
ALTER TABLE "organization_members" DISABLE ROW LEVEL SECURITY;

ALTER TABLE "roles" NO FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "roles";
ALTER TABLE "roles" DISABLE ROW LEVEL SECURITY;

ALTER TABLE "subscriptions" NO FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "subscriptions";
ALTER TABLE "subscriptions" DISABLE ROW LEVEL SECURITY;

ALTER TABLE "refresh_tokens" NO FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "refresh_tokens";
ALTER TABLE "refresh_tokens" DISABLE ROW LEVEL SECURITY;
