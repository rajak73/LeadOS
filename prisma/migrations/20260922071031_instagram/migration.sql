-- CreateTable
CREATE TABLE "IgAccount" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "igUserId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT,
    "profilePictureUrl" TEXT,
    "accessTokenEnc" TEXT NOT NULL,
    "tokenExpiresAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "statusMessage" TEXT,
    "lastWebhookAt" DATETIME,
    "connectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "IgConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "igsid" TEXT NOT NULL,
    "username" TEXT,
    "name" TEXT,
    "profilePictureUrl" TEXT,
    "leadId" TEXT,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "aiPausedReason" TEXT,
    "needsAttention" BOOLEAN NOT NULL DEFAULT false,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" DATETIME,
    "lastMessagePreview" TEXT,
    "lastInboundAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IgConversation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IgMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "mid" TEXT,
    "text" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "author" TEXT NOT NULL,
    "sentById" TEXT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" DATETIME,
    CONSTRAINT "IgMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "IgConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IgComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "commentId" TEXT NOT NULL,
    "parentCommentId" TEXT,
    "mediaId" TEXT NOT NULL,
    "mediaPermalink" TEXT,
    "mediaCaption" TEXT,
    "mediaThumbnail" TEXT,
    "fromIgId" TEXT NOT NULL,
    "fromUsername" TEXT,
    "text" TEXT NOT NULL,
    "leadId" TEXT,
    "replyStatus" TEXT NOT NULL DEFAULT 'NONE',
    "publicReply" TEXT,
    "privateReply" TEXT,
    "replyCommentId" TEXT,
    "privateReplySent" BOOLEAN NOT NULL DEFAULT false,
    "replyError" TEXT,
    "skipReason" TEXT,
    "repliedById" TEXT,
    "commentedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IgComment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AutoReplySettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dmEnabled" BOOLEAN NOT NULL DEFAULT false,
    "commentsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mode" TEXT NOT NULL DEFAULT 'DRAFT',
    "commentReplyMode" TEXT NOT NULL DEFAULT 'PUBLIC',
    "businessInfo" TEXT NOT NULL DEFAULT '',
    "tone" TEXT NOT NULL DEFAULT 'Friendly and professional. Short replies.',
    "handoffMessage" TEXT NOT NULL DEFAULT 'Thanks! Someone from our team will reply to you shortly.',
    "replyDelaySeconds" INTEGER NOT NULL DEFAULT 20,
    "maxRepliesPerDay" INTEGER NOT NULL DEFAULT 20,
    "createLeads" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "IgAccount_igUserId_key" ON "IgAccount"("igUserId");

-- CreateIndex
CREATE UNIQUE INDEX "IgConversation_igsid_key" ON "IgConversation"("igsid");

-- CreateIndex
CREATE INDEX "IgConversation_lastMessageAt_idx" ON "IgConversation"("lastMessageAt");

-- CreateIndex
CREATE INDEX "IgConversation_needsAttention_idx" ON "IgConversation"("needsAttention");

-- CreateIndex
CREATE UNIQUE INDEX "IgMessage_mid_key" ON "IgMessage"("mid");

-- CreateIndex
CREATE INDEX "IgMessage_conversationId_createdAt_idx" ON "IgMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "IgMessage_status_idx" ON "IgMessage"("status");

-- CreateIndex
CREATE UNIQUE INDEX "IgComment_commentId_key" ON "IgComment"("commentId");

-- CreateIndex
CREATE INDEX "IgComment_commentedAt_idx" ON "IgComment"("commentedAt");

-- CreateIndex
CREATE INDEX "IgComment_replyStatus_idx" ON "IgComment"("replyStatus");

-- CreateIndex
CREATE INDEX "IgComment_mediaId_idx" ON "IgComment"("mediaId");
