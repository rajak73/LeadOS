-- Migration 0022: WhatsApp Integration (Sprint 9)
-- Adds WhatsApp Business account management, template caching, conversation threads,
-- and individual message storage with 24-hour window tracking.

-- ─── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE "WhatsAppAccountStatus" AS ENUM ('ACTIVE', 'DISCONNECTED', 'EXPIRED');
CREATE TYPE "WhatsAppTemplateStatus" AS ENUM ('APPROVED', 'PENDING', 'REJECTED');
CREATE TYPE "WhatsAppTemplateCategory" AS ENUM ('MARKETING', 'UTILITY', 'AUTHENTICATION');

-- ─── whatsapp_accounts ────────────────────────────────────────────────────────
-- Stores WABA credentials per organization. accessToken is AES-256-GCM encrypted.

CREATE TABLE "whatsapp_accounts" (
  "id"              UUID         NOT NULL DEFAULT uuid_generate_v4(),
  "organizationId"  UUID         NOT NULL,
  "wabaId"          VARCHAR(100) NOT NULL,
  "phoneNumberId"   VARCHAR(100) NOT NULL,
  "displayName"     VARCHAR(255) NOT NULL,
  "phoneNumber"     VARCHAR(30)  NOT NULL,
  "accessToken"     TEXT         NOT NULL,
  "tokenExpiresAt"  TIMESTAMPTZ,
  "status"          "WhatsAppAccountStatus" NOT NULL DEFAULT 'ACTIVE',
  "webhookVerified" BOOLEAN      NOT NULL DEFAULT false,
  "deletedAt"       TIMESTAMPTZ,
  "createdAt"       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updatedAt"       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "whatsapp_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "whatsapp_accounts_org_phone_unique" UNIQUE ("organizationId", "phoneNumberId"),
  CONSTRAINT "whatsapp_accounts_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE
);

CREATE INDEX "whatsapp_accounts_organizationId_status_idx"
  ON "whatsapp_accounts" ("organizationId", "status");

-- Enable RLS
ALTER TABLE "whatsapp_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_accounts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "whatsapp_accounts"
  USING ("organizationId" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organizationId" = current_setting('app.current_organization_id', true)::uuid);

-- ─── whatsapp_templates ───────────────────────────────────────────────────────
-- Caches Meta-approved message templates per WABA account.

CREATE TABLE "whatsapp_templates" (
  "id"             UUID         NOT NULL DEFAULT uuid_generate_v4(),
  "organizationId" UUID         NOT NULL,
  "accountId"      UUID         NOT NULL,
  "templateId"     VARCHAR(100) NOT NULL,
  "name"           VARCHAR(255) NOT NULL,
  "language"       VARCHAR(20)  NOT NULL,
  "category"       "WhatsAppTemplateCategory" NOT NULL,
  "status"         "WhatsAppTemplateStatus" NOT NULL DEFAULT 'PENDING',
  "components"     JSONB        NOT NULL DEFAULT '[]',
  "createdAt"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updatedAt"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "whatsapp_templates_org_account_template_unique"
    UNIQUE ("organizationId", "accountId", "templateId"),
  CONSTRAINT "whatsapp_templates_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "whatsapp_templates_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "whatsapp_accounts"("id") ON DELETE CASCADE
);

CREATE INDEX "whatsapp_templates_organizationId_accountId_idx"
  ON "whatsapp_templates" ("organizationId", "accountId");
CREATE INDEX "whatsapp_templates_organizationId_status_idx"
  ON "whatsapp_templates" ("organizationId", "status");

-- Enable RLS
ALTER TABLE "whatsapp_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_templates" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "whatsapp_templates"
  USING ("organizationId" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organizationId" = current_setting('app.current_organization_id', true)::uuid);

-- ─── whatsapp_conversations ───────────────────────────────────────────────────
-- One conversation thread per (WABA account, customer phone number) pair.
-- windowExpiresAt: set to +24h on each inbound message; null = window closed.

CREATE TABLE "whatsapp_conversations" (
  "id"                 UUID               NOT NULL DEFAULT uuid_generate_v4(),
  "organizationId"     UUID               NOT NULL,
  "wabaConversationId" VARCHAR(200)       NOT NULL,
  "accountId"          UUID               NOT NULL,
  "customerPhone"      VARCHAR(30)        NOT NULL,
  "leadId"             UUID,
  "contactId"          UUID,
  "assignedToId"       UUID,
  "status"             "ConversationStatus" NOT NULL DEFAULT 'OPEN',
  "windowExpiresAt"    TIMESTAMPTZ,
  "lastInboundAt"      TIMESTAMPTZ,
  "lastMessageAt"      TIMESTAMPTZ,
  "createdAt"          TIMESTAMPTZ        NOT NULL DEFAULT now(),
  "updatedAt"          TIMESTAMPTZ        NOT NULL DEFAULT now(),
  CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "whatsapp_conversations_org_waba_unique"
    UNIQUE ("organizationId", "wabaConversationId"),
  CONSTRAINT "whatsapp_conversations_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "whatsapp_conversations_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "whatsapp_accounts"("id") ON DELETE CASCADE,
  CONSTRAINT "whatsapp_conversations_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL,
  CONSTRAINT "whatsapp_conversations_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL,
  CONSTRAINT "whatsapp_conversations_assignedToId_fkey"
    FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX "whatsapp_conversations_org_status_lastMsg_idx"
  ON "whatsapp_conversations" ("organizationId", "status", "lastMessageAt" DESC);
CREATE INDEX "whatsapp_conversations_org_accountId_idx"
  ON "whatsapp_conversations" ("organizationId", "accountId");
CREATE INDEX "whatsapp_conversations_org_assignedToId_idx"
  ON "whatsapp_conversations" ("organizationId", "assignedToId");
CREATE INDEX "whatsapp_conversations_leadId_idx"
  ON "whatsapp_conversations" ("leadId");

-- Enable RLS
ALTER TABLE "whatsapp_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_conversations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "whatsapp_conversations"
  USING ("organizationId" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organizationId" = current_setting('app.current_organization_id', true)::uuid);

-- ─── whatsapp_messages ────────────────────────────────────────────────────────
-- Individual WhatsApp messages within a conversation.
-- waMessageId is Meta's globally unique message ID (idempotency key).

CREATE TABLE "whatsapp_messages" (
  "id"             UUID              NOT NULL DEFAULT uuid_generate_v4(),
  "organizationId" UUID              NOT NULL,
  "conversationId" UUID              NOT NULL,
  "waMessageId"    VARCHAR(200)      NOT NULL,
  "direction"      "MessageDirection" NOT NULL,
  "contentType"    VARCHAR(20)       NOT NULL DEFAULT 'TEXT',
  "content"        JSONB             NOT NULL,
  "templateName"   VARCHAR(255),
  "status"         "MessageStatus"   NOT NULL DEFAULT 'SENT',
  "sentAt"         TIMESTAMPTZ       NOT NULL,
  "deliveredAt"    TIMESTAMPTZ,
  "readAt"         TIMESTAMPTZ,
  "errorCode"      VARCHAR(50),
  "createdAt"      TIMESTAMPTZ       NOT NULL DEFAULT now(),
  "updatedAt"      TIMESTAMPTZ       NOT NULL DEFAULT now(),
  CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "whatsapp_messages_waMessageId_unique" UNIQUE ("waMessageId"),
  CONSTRAINT "whatsapp_messages_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "whatsapp_messages_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE
);

CREATE INDEX "whatsapp_messages_conversationId_sentAt_idx"
  ON "whatsapp_messages" ("conversationId", "sentAt" DESC);
CREATE INDEX "whatsapp_messages_org_direction_status_idx"
  ON "whatsapp_messages" ("organizationId", "direction", "status");

-- Enable RLS
ALTER TABLE "whatsapp_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_messages" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "whatsapp_messages"
  USING ("organizationId" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organizationId" = current_setting('app.current_organization_id', true)::uuid);

-- ─── import_history ───────────────────────────────────────────────────────────

CREATE TYPE "ImportJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'CSV_IMPORT_STARTED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'CSV_IMPORT_COMPLETED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'CSV_IMPORT_FAILED';

CREATE TABLE "import_history" (
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

CREATE INDEX "import_history_organizationId_startedAt_idx" ON "import_history"("organizationId", "startedAt" DESC);

-- RLS patch for Sprint 8
ALTER TABLE "import_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "import_history" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "import_history"
  USING ("organizationId" = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK ("organizationId" = current_setting('app.current_organization_id', true)::uuid);
