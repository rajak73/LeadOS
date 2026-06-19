-- Tested rollback for 0006_audit (TD-S2-7). Drops both audit tables (and, with them, the
-- audit_logs RLS policy + FK). Verified by: apply 0006 → apply this → re-apply 0006.

DROP TABLE IF EXISTS "audit_logs";
DROP TABLE IF EXISTS "platform_audit_logs";
