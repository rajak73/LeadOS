-- Sprint 7 M2 — Add LEAD_SCORED to NotificationType enum.
--
-- Required for AI scoring worker to create notifications for assignees
-- when a lead score shifts significantly (>= 10 points delta).

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'LEAD_SCORED';
