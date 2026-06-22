-- Sprint 7 M1 — extend activities_entity_required to accept conversation links.
--
-- Migration 0018 added activities."relatedConversationId" (closing §5.1). The existing
-- check constraint (migration 0013) still required one of lead/deal/contact/pipeline/stage,
-- so a conversation-only activity (e.g. NOTIFICATION_SENT for an inbox event) was rejected.
-- This extends the constraint to treat relatedConversationId as a valid entity link, exactly
-- mirroring how 0013 extended it for pipeline/stage links.

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
    OR "relatedConversationId" IS NOT NULL
  );
