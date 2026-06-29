-- Create ImportJobStatus enum
DO $$ BEGIN
    CREATE TYPE "ImportJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Update ActivityType enum
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'CSV_IMPORT_STARTED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'CSV_IMPORT_COMPLETED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'CSV_IMPORT_FAILED';

-- Create import_history table
CREATE TABLE IF NOT EXISTS "import_history" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organizationId" UUID NOT NULL,
    "importedById" UUID NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "recordsTotal" INTEGER NOT NULL DEFAULT 0,
    "recordsImported" INTEGER NOT NULL DEFAULT 0,
    "recordsFailed" INTEGER NOT NULL DEFAULT 0,
    "recordsSkipped" INTEGER NOT NULL DEFAULT 0,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'PENDING',
    "errorSummary" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "import_history_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "import_history_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "import_history_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "import_history_organizationId_startedAt_idx" ON "import_history"("organizationId", "startedAt" DESC);
