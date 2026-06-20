-- Sprint 6 M1 — Instagram conversation and message tables.
--
-- Creates instagram_conversations and messages tables.
-- New Postgres enum types: ConversationStatus, MessageStatus.
-- The UNIQUE index on leads(organizationId, instagramUserId) is NOT created here —
-- it requires CREATE INDEX CONCURRENTLY which cannot run inside a transaction block.
-- See migration 0015b for the non-transactional index creation.
-- RLS: standard org-scoped policy matching all tenant tables.

-- 1. New enum types

CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "MessageStatus" AS ENUM ('SENT', 'DELIVERED', 'READ', 'FAILED');

-- 2. instagram_conversations table

CREATE TABLE "instagram_conversations" (
  "id"               UUID        NOT NULL DEFAULT uuid_generate_v4(),
  "organizationId"   UUID        NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "igConversationId" VARCHAR(100) NOT NULL,
  "igAccountId"      UUID        NOT NULL REFERENCES "instagram_accounts"("id") ON DELETE CASCADE,
  "leadId"           UUID        REFERENCES "leads"("id") ON DELETE SET NULL,
  "contactId"        UUID        REFERENCES "contacts"("id") ON DELETE SET NULL,
  "assignedToId"     UUID        REFERENCES "users"("id") ON DELETE SET NULL,
  "status"           "ConversationStatus" NOT NULL DEFAULT 'OPEN',
  "labels"           JSONB       NOT NULL DEFAULT '[]',
  "firstResponseAt"  TIMESTAMPTZ,
  "lastInboundAt"    TIMESTAMPTZ,
  "lastMessageAt"    TIMESTAMPTZ,
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "instagram_conversations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "instagram_conversations_org_ig_conv_unique" UNIQUE ("organizationId", "igConversationId")
);

CREATE INDEX "instagram_conversations_org_status_last_msg_idx"
  ON "instagram_conversations" ("organizationId", "status", "lastMessageAt" DESC);
CREATE INDEX "instagram_conversations_org_assigned_idx"
  ON "instagram_conversations" ("organizationId", "assignedToId");
CREATE INDEX "instagram_conversations_lead_idx"
  ON "instagram_conversations" ("leadId");
CREATE INDEX "instagram_conversations_ig_account_idx"
  ON "instagram_conversations" ("igAccountId");

-- 3. RLS on instagram_conversations

ALTER TABLE "instagram_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "instagram_conversations" FORCE ROW LEVEL SECURITY;

CREATE POLICY "instagram_conversations_org_isolation" ON "instagram_conversations"
  USING (
    "organizationId" = NULLIF(current_setting('app.current_organization_id', TRUE), '')::UUID
  );

-- 4. messages table
-- UNIQUE(mid) is cross-tenant by design: Meta's mid is globally unique.

CREATE TABLE "messages" (
  "id"             UUID        NOT NULL DEFAULT uuid_generate_v4(),
  "organizationId" UUID        NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "conversationId" UUID        NOT NULL REFERENCES "instagram_conversations"("id") ON DELETE CASCADE,
  "mid"            VARCHAR(200) NOT NULL,
  "direction"      "MessageDirection" NOT NULL,
  "contentType"    VARCHAR(20) NOT NULL DEFAULT 'TEXT',
  "content"        JSONB       NOT NULL,
  "status"         "MessageStatus" NOT NULL DEFAULT 'SENT',
  "sentAt"         TIMESTAMPTZ NOT NULL,
  "deliveredAt"    TIMESTAMPTZ,
  "readAt"         TIMESTAMPTZ,
  "senderId"       VARCHAR(100),
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "messages_mid_unique" UNIQUE ("mid")
);

CREATE INDEX "messages_conversation_sent_idx"
  ON "messages" ("conversationId", "sentAt" DESC);
CREATE INDEX "messages_org_direction_status_idx"
  ON "messages" ("organizationId", "direction", "status");

-- 5. RLS on messages

ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messages" FORCE ROW LEVEL SECURITY;

CREATE POLICY "messages_org_isolation" ON "messages"
  USING (
    "organizationId" = NULLIF(current_setting('app.current_organization_id', TRUE), '')::UUID
  );
