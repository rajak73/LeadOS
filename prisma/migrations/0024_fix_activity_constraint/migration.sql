-- Relax constraint specifically for organization-level types
ALTER TABLE "activities"
  DROP CONSTRAINT IF EXISTS "activities_entity_required";

ALTER TABLE "activities"
  ADD CONSTRAINT "activities_entity_required"
  CHECK (
    "type"::text IN (
      'CSV_IMPORT_STARTED',
      'CSV_IMPORT_COMPLETED',
      'CSV_IMPORT_FAILED',
      'META_ACCOUNT_CONNECTED',
      'META_ACCOUNT_DISCONNECTED'
    )
    OR "relatedLeadId" IS NOT NULL
    OR "relatedDealId" IS NOT NULL
    OR "relatedContactId" IS NOT NULL
    OR "relatedPipelineId" IS NOT NULL
    OR "relatedPipelineStageId" IS NOT NULL
    OR "relatedConversationId" IS NOT NULL
  );
