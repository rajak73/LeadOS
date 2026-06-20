-- Sprint 5 M1 — RLS policies for pipelines, pipeline_stages, deals.
-- Pattern: mirrors 0009_crm_rls exactly — ENABLE + FORCE + missing-safe GUC policy.
-- Missing-safe form: current_setting('app.current_organization_id', true)::uuid
--   returns NULL when the GUC is unset → no rows returned → safe default-deny.
-- ActivityType additions (DEAL_UPDATED, PIPELINE_CREATED, PIPELINE_UPDATED) are Prisma enum
-- values managed by the ORM; no SQL DDL required for enum extension via Prisma.

-- ─── pipelines ────────────────────────────────────────────────────────────────

ALTER TABLE "pipelines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pipelines" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON "pipelines";
CREATE POLICY "tenant_isolation" ON "pipelines"
  USING ("organizationId" = current_setting('app.current_organization_id', true)::uuid);

-- ─── pipeline_stages ──────────────────────────────────────────────────────────

ALTER TABLE "pipeline_stages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pipeline_stages" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON "pipeline_stages";
CREATE POLICY "tenant_isolation" ON "pipeline_stages"
  USING ("organizationId" = current_setting('app.current_organization_id', true)::uuid);

-- ─── deals ────────────────────────────────────────────────────────────────────

ALTER TABLE "deals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "deals" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON "deals";
CREATE POLICY "tenant_isolation" ON "deals"
  USING ("organizationId" = current_setting('app.current_organization_id', true)::uuid);
