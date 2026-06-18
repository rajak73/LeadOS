# 09 — Prisma Schema

---

> **Production-Ready Prisma Schema for LeadOS**
> This schema is authoritative. All tables defined in the Database Design document are implemented here.
> Do not modify without updating the Database Design document.

> **⚠ UPDATED per `docs/planning/P0_FIXES.md`.** Apply these field changes when the schema is implemented (they mirror doc 08):
> - `Subscription`: add `lastStripeEventAt DateTime?` and `lastSyncedAt DateTime?` (P0-6 ordering/reconciliation).
> - `InstagramAccount`: token field(s) (`accessToken` type/lifetime, expiry semantics, page-vs-IG-account id) are finalized by the Meta validation spike (doc 14 §14.0) before migration (P0-5); store the encrypted token with a key-version prefix.
> - `Lead`/`Contact`: `email`/`phone` remain plain `String?` indexable columns — NOT application-encrypted (P0-7).
> - Tenant isolation is enforced via RLS + a per-unit-of-work transaction setting `app.current_organization_id` (doc 07 §7.3 corrected), not via the original per-query `$transaction` extension.
> Consolidated architecture: `docs/planning/FINAL_ARCHITECTURE.md`.

```prisma
// ============================================================
// prisma/schema.prisma
// LeadOS Production Schema
// ============================================================

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions", "fullTextSearch", "fullTextIndex"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [uuidOssp(map: "uuid-ossp"), pgcrypto]
}

// ============================================================
// ENUMS
// ============================================================

enum UserStatus {
  ACTIVE
  SUSPENDED
  DELETED
}

enum OrgStatus {
  ACTIVE
  SUSPENDED
  DELETED
}

enum MemberStatus {
  ACTIVE
  INVITED
  SUSPENDED
}

enum LeadStatus {
  NEW
  CONTACTED
  QUALIFIED
  PROPOSAL
  NEGOTIATION
  WON
  LOST
}

enum LeadSource {
  INSTAGRAM_DM
  INSTAGRAM_COMMENT
  WHATSAPP
  MANUAL
  IMPORT
  REFERRAL
  WEB_FORM
  OTHER
}

enum DealStatus {
  OPEN
  WON
  LOST
}

enum TaskType {
  CALL
  EMAIL
  MEETING
  FOLLOW_UP
  DEMO
  OTHER
}

enum TaskPriority {
  LOW
  MEDIUM
  HIGH
  URGENT
}

enum TaskStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
  CANCELLED
}

enum ActivityType {
  LEAD_CREATED
  LEAD_STATUS_CHANGED
  LEAD_ASSIGNED
  DEAL_CREATED
  DEAL_STAGE_CHANGED
  DEAL_WON
  DEAL_LOST
  MESSAGE_SENT
  MESSAGE_RECEIVED
  TASK_CREATED
  TASK_COMPLETED
  NOTE_ADDED
  FILE_UPLOADED
  CALL_LOGGED
  CONTACT_CREATED
}

enum MessageDirection {
  INBOUND
  OUTBOUND
}

enum MessageType {
  TEXT
  IMAGE
  VIDEO
  AUDIO
  DOCUMENT
  REACTION
  STICKER
  STORY_MENTION
  UNSUPPORTED
}

enum MessageStatus {
  SENT
  DELIVERED
  READ
  FAILED
}

enum ConversationType {
  INSTAGRAM
  WHATSAPP
}

enum ConversationStatus {
  OPEN
  CLOSED
  PENDING
}

enum SocialAccountStatus {
  CONNECTED
  EXPIRED
  DISCONNECTED
}

enum WorkflowStatus {
  ACTIVE
  INACTIVE
  DRAFT
}

enum ExecutionStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
  SKIPPED
}

enum SubscriptionPlan {
  TRIAL
  STARTER
  GROWTH
  SCALE
}

enum SubscriptionStatus {
  TRIALING
  ACTIVE
  PAST_DUE
  CANCELLED
  PAUSED
}

enum InvoiceStatus {
  DRAFT
  OPEN
  PAID
  VOID
  UNCOLLECTIBLE
}

enum PaymentStatus {
  PENDING
  SUCCEEDED
  FAILED
  REFUNDED
}

enum NotificationType {
  LEAD_ASSIGNED
  MESSAGE_RECEIVED
  TASK_OVERDUE
  DEAL_WON
  WORKFLOW_FAILED
  TRIAL_EXPIRING
  PAYMENT_FAILED
  TEAM_INVITE
}

enum StorageProvider {
  S3
  CLOUDINARY
}

enum WebhookSource {
  INSTAGRAM
  WHATSAPP
  STRIPE
}

enum WebhookStatus {
  PENDING
  PROCESSING
  PROCESSED
  FAILED
}

// ============================================================
// USERS & AUTH
// ============================================================

model User {
  id              String    @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  email           String    @unique @db.VarChar(255)
  passwordHash    String    @db.VarChar(255)
  firstName       String    @db.VarChar(100)
  lastName        String    @db.VarChar(100)
  avatarUrl       String?   @db.Text
  emailVerifiedAt DateTime?
  lastLoginAt     DateTime?
  isSuperAdmin    Boolean   @default(false)
  status          UserStatus @default(ACTIVE)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  deletedAt       DateTime?

  // Relations
  organizationMemberships OrganizationMember[]
  refreshTokens           RefreshToken[]
  assignedLeads           Lead[]               @relation("LeadAssignee")
  createdLeads            Lead[]               @relation("LeadCreator")
  assignedDeals           Deal[]               @relation("DealAssignee")
  createdDeals            Deal[]               @relation("DealCreator")
  assignedTasks           Task[]               @relation("TaskAssignee")
  createdTasks            Task[]               @relation("TaskCreator")
  notes                   Note[]
  files                   File[]
  notifications           Notification[]
  activities              Activity[]           @relation("ActivityPerformer")
  assignedConversations   InstagramConversation[] @relation("ConversationAssignee")

  @@map("users")
  @@index([status])
  @@index([deletedAt])
}

model RefreshToken {
  id          String    @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  userId      String    @db.Uuid
  tokenHash   String    @db.VarChar(255)
  family      String    @db.Uuid
  deviceInfo  String?   @db.VarChar(255)
  ipAddress   String?   @db.VarChar(45)
  expiresAt   DateTime
  usedAt      DateTime?
  revokedAt   DateTime?
  createdAt   DateTime  @default(now())

  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("refresh_tokens")
  @@index([tokenHash])
  @@index([userId, family])
  @@index([expiresAt])
}

// ============================================================
// ORGANIZATIONS & MEMBERSHIPS
// ============================================================

model Organization {
  id            String    @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  name          String    @db.VarChar(255)
  slug          String    @unique @db.VarChar(100)
  industry      String?   @db.VarChar(100)
  logoUrl       String?   @db.Text
  timezone      String    @default("Asia/Kolkata") @db.VarChar(100)
  currency      String    @default("INR") @db.VarChar(3)
  language      String    @default("en") @db.VarChar(10)
  businessHours Json?
  status        OrgStatus @default(ACTIVE)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?

  // Relations
  members              OrganizationMember[]
  roles                Role[]
  leads                Lead[]
  contacts             Contact[]
  pipelines            Pipeline[]
  deals                Deal[]
  tasks                Task[]
  activities           Activity[]
  notes                Note[]
  files                File[]
  instagramAccounts    InstagramAccount[]
  whatsappAccounts     WhatsAppAccount[]
  workflows            Workflow[]
  subscription         Subscription?
  notifications        Notification[]
  auditLogs            AuditLog[]
  webhookEvents        WebhookEvent[]

  @@map("organizations")
  @@index([status])
  @@index([deletedAt])
}

model OrganizationMember {
  id             String       @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  organizationId String       @db.Uuid
  userId         String       @db.Uuid
  roleId         String       @db.Uuid
  status         MemberStatus @default(INVITED)
  invitedById    String?      @db.Uuid
  invitedAt      DateTime?
  joinedAt       DateTime?
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  role           Role         @relation(fields: [roleId], references: [id])

  @@unique([organizationId, userId])
  @@map("organization_members")
  @@index([organizationId, status])
  @@index([userId])
}

model Role {
  id             String     @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  organizationId String     @db.Uuid
  name           String     @db.VarChar(50)
  isSystem       Boolean    @default(true)
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt

  organization   Organization       @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  permissions    Permission[]
  members        OrganizationMember[]

  @@unique([organizationId, name])
  @@map("roles")
}

model Permission {
  id        String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  roleId    String   @db.Uuid
  resource  String   @db.VarChar(100)
  action    String   @db.VarChar(50)
  createdAt DateTime @default(now())

  role      Role     @relation(fields: [roleId], references: [id], onDelete: Cascade)

  @@unique([roleId, resource, action])
  @@map("permissions")
}

// ============================================================
// CRM — LEADS & CONTACTS
// ============================================================

model Lead {
  id                    String     @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  organizationId        String     @db.Uuid
  firstName             String     @db.VarChar(100)
  lastName              String?    @db.VarChar(100)
  email                 String?    @db.VarChar(255)
  phone                 String?    @db.VarChar(20)
  source                LeadSource @default(MANUAL)
  status                LeadStatus @default(NEW)
  assignedToId          String?    @db.Uuid
  aiScore               Int?       @db.SmallInt
  aiScoreUpdatedAt      DateTime?
  instagramHandle       String?    @db.VarChar(100)
  instagramUserId       String?    @db.VarChar(50)
  tags                  String[]   @default([])
  customFields          Json       @default("{}")
  notes                 String?    @db.Text
  lostReason            String?    @db.Text
  convertedToContactId  String?    @db.Uuid
  pipelineStageId       String?    @db.Uuid
  createdById           String     @db.Uuid
  createdAt             DateTime   @default(now())
  updatedAt             DateTime   @updatedAt
  deletedAt             DateTime?

  organization          Organization        @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  assignedTo            User?               @relation("LeadAssignee", fields: [assignedToId], references: [id])
  createdBy             User                @relation("LeadCreator", fields: [createdById], references: [id])
  convertedToContact    Contact?            @relation("LeadConversion", fields: [convertedToContactId], references: [id])
  pipelineStage         PipelineStage?      @relation(fields: [pipelineStageId], references: [id])
  activities            Activity[]
  tasks                 Task[]
  notesList             Note[]
  files                 File[]
  deals                 Deal[]
  instagramConversations InstagramConversation[]

  @@map("leads")
  @@index([organizationId, status])
  @@index([organizationId, assignedToId])
  @@index([organizationId, source])
  @@index([organizationId, aiScore(sort: Desc)])
  @@index([email])
  @@index([phone])
  @@index([instagramUserId])
  @@index([deletedAt])
}

model Contact {
  id               String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  organizationId   String   @db.Uuid
  firstName        String   @db.VarChar(100)
  lastName         String?  @db.VarChar(100)
  email            String?  @db.VarChar(255)
  phone            String?  @db.VarChar(20)
  company          String?  @db.VarChar(255)
  jobTitle         String?  @db.VarChar(100)
  avatarUrl        String?  @db.Text
  address          Json?
  tags             String[] @default([])
  customFields     Json     @default("{}")
  lifeTimeValue    Decimal  @default(0) @db.Decimal(15, 2)
  assignedToId     String?  @db.Uuid
  createdFromLeadId String? @db.Uuid
  createdById      String   @db.Uuid
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  deletedAt        DateTime?

  organization     Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  assignedTo       User?        @relation(fields: [assignedToId], references: [id])
  createdFromLead  Lead?        @relation("LeadConversion", fields: [createdFromLeadId], references: [id])
  leads            Lead[]
  deals            Deal[]
  activities       Activity[]
  tasks            Task[]
  notesList        Note[]
  files            File[]

  @@map("contacts")
  @@index([organizationId, email])
  @@index([organizationId, phone])
  @@index([deletedAt])
}

// ============================================================
// PIPELINE & DEALS
// ============================================================

model Pipeline {
  id             String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  organizationId String   @db.Uuid
  name           String   @db.VarChar(100)
  description    String?  @db.Text
  currency       String   @default("INR") @db.VarChar(3)
  isDefault      Boolean  @default(false)
  createdById    String   @db.Uuid
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  deletedAt      DateTime?

  organization   Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  stages         PipelineStage[]
  deals          Deal[]

  @@map("pipelines")
  @@index([organizationId])
}

model PipelineStage {
  id             String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  organizationId String   @db.Uuid
  pipelineId     String   @db.Uuid
  name           String   @db.VarChar(100)
  position       Int      @db.SmallInt
  color          String   @default("#6366f1") @db.VarChar(7)
  probability    Int      @default(20) @db.SmallInt
  isWon          Boolean  @default(false)
  isLost         Boolean  @default(false)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  pipeline       Pipeline @relation(fields: [pipelineId], references: [id], onDelete: Cascade)
  deals          Deal[]
  leads          Lead[]

  @@map("pipeline_stages")
  @@index([pipelineId, position])
}

model Deal {
  id                 String     @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  organizationId     String     @db.Uuid
  title              String     @db.VarChar(255)
  pipelineId         String     @db.Uuid
  stageId            String     @db.Uuid
  contactId          String?    @db.Uuid
  leadId             String?    @db.Uuid
  assignedToId       String?    @db.Uuid
  value              Decimal    @default(0) @db.Decimal(15, 2)
  currency           String     @default("INR") @db.VarChar(3)
  probability        Int?       @db.SmallInt
  expectedCloseDate  DateTime?  @db.Date
  actualCloseDate    DateTime?  @db.Date
  status             DealStatus @default(OPEN)
  lostReason         String?    @db.Text
  tags               String[]   @default([])
  customFields       Json       @default("{}")
  aiScore            Int?       @db.SmallInt
  createdById        String     @db.Uuid
  createdAt          DateTime   @default(now())
  updatedAt          DateTime   @updatedAt
  deletedAt          DateTime?

  organization       Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  pipeline           Pipeline      @relation(fields: [pipelineId], references: [id])
  stage              PipelineStage @relation(fields: [stageId], references: [id])
  contact            Contact?      @relation(fields: [contactId], references: [id])
  lead               Lead?         @relation(fields: [leadId], references: [id])
  assignedTo         User?         @relation("DealAssignee", fields: [assignedToId], references: [id])
  createdBy          User          @relation("DealCreator", fields: [createdById], references: [id])
  activities         Activity[]
  tasks              Task[]
  notesList          Note[]
  files              File[]

  @@map("deals")
  @@index([organizationId, status])
  @@index([organizationId, stageId])
  @@index([organizationId, assignedToId])
  @@index([deletedAt])
}

// ============================================================
// TASKS & ACTIVITIES
// ============================================================

model Task {
  id               String       @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  organizationId   String       @db.Uuid
  title            String       @db.VarChar(255)
  description      String?      @db.Text
  type             TaskType     @default(OTHER)
  priority         TaskPriority @default(MEDIUM)
  status           TaskStatus   @default(PENDING)
  dueDate          DateTime?
  completedAt      DateTime?
  assignedToId     String?      @db.Uuid
  relatedLeadId    String?      @db.Uuid
  relatedDealId    String?      @db.Uuid
  relatedContactId String?      @db.Uuid
  createdById      String       @db.Uuid
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt
  deletedAt        DateTime?

  organization     Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  assignedTo       User?        @relation("TaskAssignee", fields: [assignedToId], references: [id])
  createdBy        User         @relation("TaskCreator", fields: [createdById], references: [id])
  relatedLead      Lead?        @relation(fields: [relatedLeadId], references: [id])
  relatedDeal      Deal?        @relation(fields: [relatedDealId], references: [id])
  relatedContact   Contact?     @relation(fields: [relatedContactId], references: [id])

  @@map("tasks")
  @@index([organizationId, assignedToId, status])
  @@index([organizationId, dueDate, status])
}

model Activity {
  id               String       @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  organizationId   String       @db.Uuid
  type             ActivityType
  description      String       @db.Text
  metadata         Json         @default("{}")
  performedById    String?      @db.Uuid
  relatedLeadId    String?      @db.Uuid
  relatedDealId    String?      @db.Uuid
  relatedContactId String?      @db.Uuid
  createdAt        DateTime     @default(now())

  organization     Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  performedBy      User?        @relation("ActivityPerformer", fields: [performedById], references: [id])
  relatedLead      Lead?        @relation(fields: [relatedLeadId], references: [id])
  relatedDeal      Deal?        @relation(fields: [relatedDealId], references: [id])
  relatedContact   Contact?     @relation(fields: [relatedContactId], references: [id])

  // NO updatedAt - activities are immutable
  @@map("activities")
  @@index([organizationId, relatedLeadId, createdAt(sort: Desc)])
  @@index([organizationId, relatedDealId, createdAt(sort: Desc)])
  @@index([organizationId, relatedContactId, createdAt(sort: Desc)])
}

model Note {
  id               String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  organizationId   String   @db.Uuid
  content          String   @db.Text
  relatedLeadId    String?  @db.Uuid
  relatedDealId    String?  @db.Uuid
  relatedContactId String?  @db.Uuid
  createdById      String   @db.Uuid
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  deletedAt        DateTime?

  organization     Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  createdBy        User         @relation(fields: [createdById], references: [id])
  relatedLead      Lead?        @relation(fields: [relatedLeadId], references: [id])
  relatedDeal      Deal?        @relation(fields: [relatedDealId], references: [id])
  relatedContact   Contact?     @relation(fields: [relatedContactId], references: [id])

  @@map("notes")
  @@index([organizationId, relatedLeadId])
}

model File {
  id               String          @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  organizationId   String          @db.Uuid
  name             String          @db.VarChar(255)
  storageKey       String          @db.Text
  storageProvider  StorageProvider
  mimeType         String          @db.VarChar(100)
  sizeBytes        BigInt
  url              String          @db.Text
  relatedLeadId    String?         @db.Uuid
  relatedDealId    String?         @db.Uuid
  relatedContactId String?         @db.Uuid
  uploadedById     String          @db.Uuid
  createdAt        DateTime        @default(now())
  deletedAt        DateTime?

  organization     Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  uploadedBy       User         @relation(fields: [uploadedById], references: [id])
  relatedLead      Lead?        @relation(fields: [relatedLeadId], references: [id])
  relatedDeal      Deal?        @relation(fields: [relatedDealId], references: [id])
  relatedContact   Contact?     @relation(fields: [relatedContactId], references: [id])

  @@map("files")
}

// ============================================================
// INSTAGRAM INTEGRATION
// ============================================================

model InstagramAccount {
  id                    String              @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  organizationId        String              @db.Uuid
  instagramUserId       String              @db.VarChar(50)
  username              String              @db.VarChar(100)
  name                  String?             @db.VarChar(255)
  profilePictureUrl     String?             @db.Text
  accessToken           String              @db.Text // Encrypted
  accessTokenExpiresAt  DateTime
  pageId                String?             @db.VarChar(50)
  webhookSubscribed     Boolean             @default(false)
  status                SocialAccountStatus @default(CONNECTED)
  createdAt             DateTime            @default(now())
  updatedAt             DateTime            @updatedAt

  organization          Organization            @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  conversations         InstagramConversation[]

  @@unique([organizationId, instagramUserId])
  @@map("instagram_accounts")
}

model InstagramConversation {
  id                       String             @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  organizationId           String             @db.Uuid
  instagramAccountId       String             @db.Uuid
  instagramScopedUserId    String             @db.VarChar(50)
  externalUsername         String?            @db.VarChar(100)
  externalProfilePicUrl    String?            @db.Text
  status                   ConversationStatus @default(OPEN)
  assignedToId             String?            @db.Uuid
  relatedLeadId            String?            @db.Uuid
  relatedContactId         String?            @db.Uuid
  lastMessageAt            DateTime?
  firstResponseAt          DateTime?
  createdAt                DateTime           @default(now())
  updatedAt                DateTime           @updatedAt

  organization             Organization      @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  instagramAccount         InstagramAccount  @relation(fields: [instagramAccountId], references: [id])
  assignedTo               User?             @relation("ConversationAssignee", fields: [assignedToId], references: [id])
  relatedLead              Lead?             @relation(fields: [relatedLeadId], references: [id])
  messages                 Message[]

  @@unique([organizationId, instagramAccountId, instagramScopedUserId])
  @@map("instagram_conversations")
  @@index([organizationId, lastMessageAt(sort: Desc)])
  @@index([organizationId, assignedToId, status])
}

model WhatsAppAccount {
  id                 String              @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  organizationId     String              @db.Uuid
  phoneNumberId      String              @db.VarChar(50)
  businessAccountId  String              @db.VarChar(50)
  displayPhoneNumber String              @db.VarChar(20)
  verifiedName       String              @db.VarChar(255)
  accessToken        String              @db.Text // Encrypted
  qualityRating      String?             @db.VarChar(10)
  messagingLimit     Int?
  webhookSubscribed  Boolean             @default(false)
  status             SocialAccountStatus @default(CONNECTED)
  createdAt          DateTime            @default(now())
  updatedAt          DateTime            @updatedAt

  organization       Organization              @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  conversations      WhatsAppConversation[]

  @@unique([organizationId, phoneNumberId])
  @@map("whatsapp_accounts")
}

model WhatsAppConversation {
  id                    String             @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  organizationId        String             @db.Uuid
  whatsappAccountId     String             @db.Uuid
  externalPhone         String             @db.VarChar(20)
  externalName          String?            @db.VarChar(255)
  status                ConversationStatus @default(OPEN)
  assignedToId          String?            @db.Uuid
  relatedLeadId         String?            @db.Uuid
  windowExpiresAt       DateTime?          // 24h window expiry
  lastMessageAt         DateTime?
  createdAt             DateTime           @default(now())
  updatedAt             DateTime           @updatedAt

  organization          Organization      @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  whatsappAccount       WhatsAppAccount   @relation(fields: [whatsappAccountId], references: [id])
  messages              Message[]

  @@unique([organizationId, whatsappAccountId, externalPhone])
  @@map("whatsapp_conversations")
}

model Message {
  id                     String           @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  organizationId         String           @db.Uuid
  instagramConversationId String?         @db.Uuid
  whatsappConversationId  String?         @db.Uuid
  conversationType        ConversationType
  externalMessageId       String?         @db.VarChar(255)
  direction               MessageDirection
  type                    MessageType     @default(TEXT)
  content                 String?         @db.Text
  mediaUrl                String?         @db.Text
  mediaType               String?         @db.VarChar(50)
  status                  MessageStatus   @default(SENT)
  sentById                String?         @db.Uuid
  failureReason           String?         @db.Text
  rawPayload              Json?
  sentAt                  DateTime        @default(now())
  deliveredAt             DateTime?
  readAt                  DateTime?
  createdAt               DateTime        @default(now())

  organization            Organization          @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  instagramConversation   InstagramConversation? @relation(fields: [instagramConversationId], references: [id])
  whatsappConversation    WhatsAppConversation?  @relation(fields: [whatsappConversationId], references: [id])

  @@map("messages")
  @@index([organizationId, instagramConversationId, sentAt(sort: Desc)])
  @@index([organizationId, whatsappConversationId, sentAt(sort: Desc)])
  @@index([externalMessageId])
}

// ============================================================
// WORKFLOW ENGINE
// ============================================================

model Workflow {
  id             String         @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  organizationId String         @db.Uuid
  name           String         @db.VarChar(255)
  description    String?        @db.Text
  status         WorkflowStatus @default(DRAFT)
  trigger        Json           // { type, config }
  conditions     Json           // Array of condition objects
  actions        Json           // Array of action objects
  executionCount Int            @default(0)
  lastExecutedAt DateTime?
  createdById    String         @db.Uuid
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt
  deletedAt      DateTime?

  organization   Organization         @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  executions     WorkflowExecution[]

  @@map("workflows")
  @@index([organizationId, status])
}

model WorkflowExecution {
  id               String          @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  organizationId   String          @db.Uuid
  workflowId       String          @db.Uuid
  triggeredBy      Json            // { type, entityId, entityType }
  status           ExecutionStatus @default(PENDING)
  conditionResult  Boolean?
  actionsExecuted  Json            @default("[]")
  error            String?         @db.Text
  startedAt        DateTime        @default(now())
  completedAt      DateTime?
  createdAt        DateTime        @default(now())

  workflow         Workflow        @relation(fields: [workflowId], references: [id], onDelete: Cascade)

  @@map("workflow_executions")
  @@index([organizationId, workflowId])
  @@index([organizationId, status])
  @@index([createdAt])
}

// ============================================================
// BILLING
// ============================================================

model Subscription {
  id                     String             @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  organizationId         String             @unique @db.Uuid
  plan                   SubscriptionPlan   @default(TRIAL)
  status                 SubscriptionStatus @default(TRIALING)
  stripeSubscriptionId   String?            @db.VarChar(255)
  stripeCustomerId       String?            @db.VarChar(255)
  stripePriceId          String?            @db.VarChar(255)
  currentPeriodStart     DateTime?
  currentPeriodEnd       DateTime?
  cancelAtPeriodEnd      Boolean            @default(false)
  trialEndsAt            DateTime?
  seatCount              Int                @default(1) @db.SmallInt
  createdAt              DateTime           @default(now())
  updatedAt              DateTime           @updatedAt

  organization           Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  invoices               Invoice[]

  @@map("subscriptions")
  @@index([stripeCustomerId])
}

model Invoice {
  id              String        @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  organizationId  String        @db.Uuid
  subscriptionId  String        @db.Uuid
  stripeInvoiceId String        @unique @db.VarChar(255)
  number          String?       @unique @db.VarChar(50)
  status          InvoiceStatus @default(DRAFT)
  amountDue       Decimal       @db.Decimal(10, 2)
  amountPaid      Decimal       @default(0) @db.Decimal(10, 2)
  currency        String        @db.VarChar(3)
  dueDate         DateTime?     @db.Date
  paidAt          DateTime?
  invoicePdfUrl   String?       @db.Text
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  organization    Organization @relation(fields: [organizationId], references: [id])
  subscription    Subscription @relation(fields: [subscriptionId], references: [id])
  payments        Payment[]

  @@map("invoices")
  @@index([organizationId])
}

model Payment {
  id                    String        @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  organizationId        String        @db.Uuid
  invoiceId             String        @db.Uuid
  stripePaymentIntentId String?       @unique @db.VarChar(255)
  amount                Decimal       @db.Decimal(10, 2)
  currency              String        @db.VarChar(3)
  status                PaymentStatus @default(PENDING)
  paymentMethod         String?       @db.VarChar(50)
  failureCode           String?       @db.VarChar(100)
  failureMessage        String?       @db.Text
  refundedAt            DateTime?
  createdAt             DateTime      @default(now())

  organization          Organization @relation(fields: [organizationId], references: [id])
  invoice               Invoice      @relation(fields: [invoiceId], references: [id])

  @@map("payments")
  @@index([organizationId])
}

// ============================================================
// NOTIFICATIONS
// ============================================================

model Notification {
  id                String           @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  organizationId    String           @db.Uuid
  userId            String           @db.Uuid
  type              NotificationType
  title             String           @db.VarChar(255)
  body              String?          @db.Text
  actionUrl         String?          @db.Text
  isRead            Boolean          @default(false)
  readAt            DateTime?
  relatedEntityId   String?          @db.Uuid
  relatedEntityType String?          @db.VarChar(50)
  createdAt         DateTime         @default(now())

  organization      Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user              User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("notifications")
  @@index([userId, isRead, createdAt(sort: Desc)])
  @@index([organizationId])
}

// ============================================================
// AUDIT & WEBHOOKS
// ============================================================

model AuditLog {
  id             String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  organizationId String?  @db.Uuid
  userId         String?  @db.Uuid
  action         String   @db.VarChar(100)
  resource       String   @db.VarChar(50)
  resourceId     String   @db.Uuid
  before         Json?
  after          Json?
  ipAddress      String?  @db.VarChar(45)
  userAgent      String?  @db.Text
  createdAt      DateTime @default(now())

  organization   Organization? @relation(fields: [organizationId], references: [id])

  @@map("audit_logs")
  @@index([organizationId, createdAt(sort: Desc)])
  @@index([userId])
  @@index([resource, resourceId])
}

model WebhookEvent {
  id              String        @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  organizationId  String?       @db.Uuid
  source          WebhookSource
  eventType       String        @db.VarChar(100)
  externalEventId String?       @db.VarChar(255)
  payload         Json
  status          WebhookStatus @default(PENDING)
  processedAt     DateTime?
  error           String?       @db.Text
  attempts        Int           @default(0) @db.SmallInt
  createdAt       DateTime      @default(now())

  organization    Organization? @relation(fields: [organizationId], references: [id])

  @@unique([source, externalEventId])
  @@map("webhook_events")
  @@index([status, createdAt])
}
```
