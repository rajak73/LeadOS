-- Initial migration: enable the PostgreSQL extensions LeadOS relies on, and create the
-- infrastructure-only health_check table (no domain models in Sprint 1).
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE TABLE "health_check" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "health_check_pkey" PRIMARY KEY ("id")
);
