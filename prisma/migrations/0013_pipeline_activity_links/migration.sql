-- Sprint 5 M2 remediation — pipeline/stage activity links.
--
-- Pipeline and stage mutations are auditable Sprint 5 M2 events, but the original
-- activities table only allowed lead/contact/deal links. These scalar UUID links keep
-- activity history for deleted pipelines/stages without FK-driven NULL updates erasing
-- the event's entity reference.

ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'PIPELINE_DELETED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'PIPELINE_STAGE_CREATED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'PIPELINE_STAGE_UPDATED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'PIPELINE_STAGE_DELETED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'PIPELINE_STAGE_REORDERED';

ALTER TABLE "activities"
  ADD COLUMN IF NOT EXISTS "relatedPipelineId" UUID,
  ADD COLUMN IF NOT EXISTS "relatedPipelineStageId" UUID;

ALTER TABLE "activities"
  DROP CONSTRAINT IF EXISTS "activities_entity_required";

ALTER TABLE "activities"
  ADD CONSTRAINT "activities_entity_required"
  CHECK (
    "relatedLeadId" IS NOT NULL
    OR "relatedDealId" IS NOT NULL
    OR "relatedContactId" IS NOT NULL
    OR "relatedPipelineId" IS NOT NULL
    OR "relatedPipelineStageId" IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS "activities_org_pipeline_created_idx"
  ON "activities" ("organizationId", "relatedPipelineId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "activities_org_pipeline_stage_created_idx"
  ON "activities" ("organizationId", "relatedPipelineStageId", "createdAt" DESC);
