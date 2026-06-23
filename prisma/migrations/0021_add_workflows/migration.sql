-- Create WorkflowRunStatus enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WorkflowRunStatus') THEN
        CREATE TYPE "WorkflowRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'SKIPPED', 'FAILED');
    END IF;
END
$$;

-- CreateTable workflows
CREATE TABLE IF NOT EXISTS "workflows" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organizationId" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "triggerType" VARCHAR(100) NOT NULL,
    "definition" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable workflow_runs
CREATE TABLE IF NOT EXISTS "workflow_runs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organizationId" UUID NOT NULL,
    "workflowId" UUID NOT NULL,
    "triggerEvent" JSONB NOT NULL,
    "status" "WorkflowRunStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "actionLogs" JSONB NOT NULL DEFAULT '[]',
    "depth" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "workflows_organizationId_isActive_idx" ON "workflows"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "workflow_runs_organizationId_idx" ON "workflow_runs"("organizationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "workflow_runs_workflowId_idx" ON "workflow_runs"("workflowId");

-- AddForeignKey
ALTER TABLE "workflows" DROP CONSTRAINT IF EXISTS "workflows_organizationId_fkey";
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_runs" DROP CONSTRAINT IF EXISTS "workflow_runs_organizationId_fkey";
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_runs" DROP CONSTRAINT IF EXISTS "workflow_runs_workflowId_fkey";
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enable RLS
ALTER TABLE "workflows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workflows" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON "workflows";
CREATE POLICY "tenant_isolation" ON "workflows"
  USING ("organizationId" = current_setting('app.current_organization_id', true)::uuid);

ALTER TABLE "workflow_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workflow_runs" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON "workflow_runs";
CREATE POLICY "tenant_isolation" ON "workflow_runs"
  USING ("organizationId" = current_setting('app.current_organization_id', true)::uuid);
