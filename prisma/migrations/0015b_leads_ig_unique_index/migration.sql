-- Prisma Migration not running in a transaction

-- Sprint 6 M1 — Unique index on leads(organizationId, instagramUserId).
--
-- MUST NOT run inside a transaction block — PostgreSQL forbids CREATE INDEX CONCURRENTLY
-- inside transactions. This file uses the non-transactional pragma above.
--
-- Why CONCURRENTLY: the leads table is populated; a blocking lock during index creation
-- would stall all writes. CONCURRENTLY builds without a write lock.
--
-- Why partial (WHERE instagramUserId IS NOT NULL): NULL values are not indexed.
-- This avoids constraining the vast majority of leads that have no IG account.
--
-- Why IF NOT EXISTS: this migration is idempotent. If it fails partway through,
-- drop the invalid index (DROP INDEX IF EXISTS leads_org_ig_user_unique) and retry.
--
-- Prisma schema has @@unique([organizationId, instagramUserId]) for TypeScript upsert
-- API support. Prisma would auto-generate a non-CONCURRENTLY, non-partial index —
-- this file REPLACES that generated DDL with the correct version.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "leads_org_ig_user_unique"
  ON "leads" ("organizationId", "instagramUserId")
  WHERE "instagramUserId" IS NOT NULL;
