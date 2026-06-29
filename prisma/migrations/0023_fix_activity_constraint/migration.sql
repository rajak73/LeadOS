-- Sprint 10 Review: Fix activities_entity_required constraint to allow organization-level activities
--
-- Migration 0019 required one of lead/deal/contact/pipeline/stage/conversation.
-- However, Phase 6 introduced CSV_IMPORT_STARTED, CSV_IMPORT_COMPLETED, CSV_IMPORT_FAILED,
-- META_ACCOUNT_CONNECTED, and META_ACCOUNT_DISCONNECTED which are organization-level activities
-- and do not have a related entity. This relaxes the constraint specifically for those types.

ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'META_ACCOUNT_CONNECTED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'META_ACCOUNT_DISCONNECTED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'FACEBOOK_PAGE_CONNECTED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'FACEBOOK_PAGE_DISCONNECTED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'COMMENT_RECEIVED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'COMMENT_REPLIED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'DM_RECEIVED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'DM_SENT';

ALTER TABLE "activities"
  DROP CONSTRAINT IF EXISTS "activities_entity_required";

ALTER TABLE "activities"
  ADD CONSTRAINT "activities_entity_required"
  CHECK (
    "type" IN (
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
