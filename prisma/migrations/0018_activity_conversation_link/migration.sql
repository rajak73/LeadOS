-- Sprint 7 M1 — Activity → conversation link.
--
-- Closes the SPRINT_6_FINAL_ARCHITECTURE_SIGNOFF §5.1 deferral: lets an activity row
-- reference the Instagram conversation it relates to (scalar-only FK column, mirroring
-- relatedPipelineId / relatedPipelineStageId — no Prisma relation, no back-relation).
-- Additive + nullable + no backfill → safe to run in a standard transactional migration.

ALTER TABLE "activities"
  ADD COLUMN IF NOT EXISTS "relatedConversationId" UUID;

CREATE INDEX IF NOT EXISTS "activities_org_conversation_created_idx"
  ON "activities" ("organizationId", "relatedConversationId", "createdAt" DESC);
