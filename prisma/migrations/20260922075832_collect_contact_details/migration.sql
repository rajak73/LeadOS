-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AutoReplySettings" (
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
    "collectContactDetails" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AutoReplySettings" ("businessInfo", "commentReplyMode", "commentsEnabled", "createLeads", "dmEnabled", "handoffMessage", "id", "maxRepliesPerDay", "mode", "replyDelaySeconds", "tone", "updatedAt") SELECT "businessInfo", "commentReplyMode", "commentsEnabled", "createLeads", "dmEnabled", "handoffMessage", "id", "maxRepliesPerDay", "mode", "replyDelaySeconds", "tone", "updatedAt" FROM "AutoReplySettings";
DROP TABLE "AutoReplySettings";
ALTER TABLE "new_AutoReplySettings" RENAME TO "AutoReplySettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
