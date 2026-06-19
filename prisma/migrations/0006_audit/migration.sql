-- Sprint 3 M5 (AUD-1 + AUD-3) — audit foundations.

-- AUD-1 — tenant-scoped, append-only audit trail. RLS-enabled + forced like any tenant table.
CREATE TABLE "audit_logs" (
    "id"             UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organizationId" UUID NOT NULL,
    "actorUserId"    UUID,
    "action"         TEXT NOT NULL,
    "resource"       TEXT NOT NULL,
    "resourceId"     TEXT,
    "before"         JSONB,
    "after"          JSONB,
    "ipAddress"      VARCHAR(64),
    "createdAt"      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_logs_organizationId_createdAt_idx" ON "audit_logs" ("organizationId", "createdAt");
CREATE INDEX "audit_logs_resource_resourceId_idx" ON "audit_logs" ("resource", "resourceId");
ALTER TABLE "audit_logs"
    ADD CONSTRAINT "audit_logs_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "audit_logs"
  USING ("organizationId" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organizationId" = current_setting('app.current_organization_id', true)::uuid);

-- AUD-3 — platform/super-admin audit SCAFFOLD. NOT tenant-scoped; no RLS (written only on the
-- BYPASSRLS platform path). Hardening (restricting grants to leados_platform_admin) is a future op.
CREATE TABLE "platform_audit_logs" (
    "id"                   UUID NOT NULL DEFAULT uuid_generate_v4(),
    "actorUserId"          UUID,
    "action"               TEXT NOT NULL,
    "targetOrganizationId" UUID,
    "targetResource"       TEXT,
    "detail"               JSONB,
    "ipAddress"            VARCHAR(64),
    "createdAt"            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "platform_audit_logs_createdAt_idx" ON "platform_audit_logs" ("createdAt");
