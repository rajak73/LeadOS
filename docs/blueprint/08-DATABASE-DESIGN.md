# 08 — Database Design

> **⚠ UPDATED per `docs/planning/P0_FIXES.md` (P0-6, P0-7, P0-5).** `subscriptions` gains reconciliation/ordering columns (P0-6); email/phone remain indexable plaintext (storage-encrypted, not app-encrypted — P0-7); `instagram_accounts` token fields are subject to the Meta spike (P0-5). RLS policies use the missing-safe `current_setting(..., true)` form (doc 07). Consolidated architecture: `docs/planning/FINAL_ARCHITECTURE.md`.

---

## 8.1 Design Principles

1. **UUID v4** as primary keys (not sequential integers — prevents enumeration attacks)
2. **Soft delete**: All core records use `deletedAt` timestamp; hard-deleted only after 30 days
3. **Tenant scoping**: Every tenant-owned table has `organizationId` as a non-nullable foreign key
4. **Audit trail**: Mutations to critical tables replicated to `audit_logs`
5. **JSONB for flexibility**: Custom fields, workflow definitions, and AI metadata stored as JSONB
6. **Created/Updated timestamps**: All tables include `createdAt`, `updatedAt` managed by Prisma
7. **Normalized but not over-normalized**: Avoid excessive joins on hot paths; use JSONB where schema is variable

---

## 8.2 ER Diagram (Conceptual)

```
ORGANIZATIONS
    │
    ├──< ORGANIZATION_MEMBERS >──── USERS
    │         │
    │         └── ROLES >──── PERMISSIONS
    │
    ├──< LEADS
    │         ├── AI_SCORES
    │         └── ACTIVITIES
    │
    ├──< CONTACTS
    │         └── ACTIVITIES
    │
    ├──< PIPELINES
    │         └──< PIPELINE_STAGES
    │                   └──< DEALS >── CONTACTS | LEADS
    │                         └── ACTIVITIES
    │
    ├──< INSTAGRAM_ACCOUNTS
    │         └──< INSTAGRAM_CONVERSATIONS
    │                   └──< MESSAGES
    │
    ├──< WHATSAPP_ACCOUNTS
    │         └──< WHATSAPP_CONVERSATIONS
    │                   └──< MESSAGES
    │
    ├──< TASKS
    ├──< NOTES
    ├──< FILES
    ├──< WORKFLOWS
    │         └──< WORKFLOW_EXECUTIONS
    │
    ├──< NOTIFICATIONS
    ├──< WEBHOOK_EVENTS
    ├──< AUDIT_LOGS
    │
    ├── SUBSCRIPTIONS
    │         └──< INVOICES
    │                   └──< PAYMENTS
    │
    └──< REFRESH_TOKENS
```

---

## 8.3 Complete Table Definitions

### users
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK, default uuid_generate_v4() | |
| email | VARCHAR(255) | UNIQUE, NOT NULL | Indexed |
| passwordHash | VARCHAR(255) | NOT NULL | bcrypt hash |
| firstName | VARCHAR(100) | NOT NULL | |
| lastName | VARCHAR(100) | NOT NULL | |
| avatarUrl | TEXT | NULL | Cloudinary URL |
| emailVerifiedAt | TIMESTAMP | NULL | NULL = not verified |
| lastLoginAt | TIMESTAMP | NULL | |
| isSuperAdmin | BOOLEAN | DEFAULT false | Platform admin flag |
| status | ENUM | NOT NULL | ACTIVE, SUSPENDED, DELETED |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |
| deletedAt | TIMESTAMP | NULL | Soft delete |

**Indexes:** `email` (unique), `status`, `deletedAt`

---

### organizations
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| name | VARCHAR(255) | NOT NULL | |
| slug | VARCHAR(100) | UNIQUE, NOT NULL | URL-safe identifier |
| industry | VARCHAR(100) | NULL | Agency, Real Estate, etc. |
| logoUrl | TEXT | NULL | |
| timezone | VARCHAR(100) | DEFAULT 'Asia/Kolkata' | |
| currency | VARCHAR(3) | DEFAULT 'INR' | ISO 4217 |
| language | VARCHAR(10) | DEFAULT 'en' | |
| businessHours | JSONB | NULL | `{ mon: { open: "09:00", close: "18:00" } }` |
| status | ENUM | NOT NULL | ACTIVE, SUSPENDED, DELETED |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |
| deletedAt | TIMESTAMP | NULL | |

**Indexes:** `slug` (unique), `status`

---

### organization_members
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK → organizations.id, NOT NULL | |
| userId | UUID | FK → users.id, NOT NULL | |
| roleId | UUID | FK → roles.id, NOT NULL | |
| status | ENUM | NOT NULL | ACTIVE, INVITED, SUSPENDED |
| invitedBy | UUID | FK → users.id, NULL | |
| invitedAt | TIMESTAMP | NULL | |
| joinedAt | TIMESTAMP | NULL | |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |

**Indexes:** `(organizationId, userId)` UNIQUE, `organizationId`, `userId`, `status`
**Constraint:** One user can only have one active membership per org

---

### roles
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK → organizations.id, NOT NULL | |
| name | VARCHAR(50) | NOT NULL | OWNER, ADMIN, MANAGER, SALES_EXECUTIVE |
| isSystem | BOOLEAN | DEFAULT true | System roles cannot be deleted |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |

**Indexes:** `(organizationId, name)` UNIQUE

---

### permissions
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| roleId | UUID | FK → roles.id, NOT NULL | |
| resource | VARCHAR(100) | NOT NULL | leads, contacts, deals, etc. |
| action | VARCHAR(50) | NOT NULL | create, read, update, delete, assign |
| createdAt | TIMESTAMP | NOT NULL | |

**Indexes:** `(roleId, resource, action)` UNIQUE

---

### leads
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK, NOT NULL | Tenant key |
| firstName | VARCHAR(100) | NOT NULL | |
| lastName | VARCHAR(100) | NULL | |
| email | VARCHAR(255) | NULL | |
| phone | VARCHAR(20) | NULL | |
| source | ENUM | NOT NULL | INSTAGRAM_DM, WHATSAPP, MANUAL, IMPORT, REFERRAL, WEB_FORM, OTHER |
| status | ENUM | NOT NULL | NEW, CONTACTED, QUALIFIED, PROPOSAL, NEGOTIATION, WON, LOST |
| assignedToId | UUID | FK → users.id, NULL | |
| aiScore | SMALLINT | NULL | 0–100 |
| aiScoreUpdatedAt | TIMESTAMP | NULL | |
| instagramHandle | VARCHAR(100) | NULL | |
| instagramUserId | VARCHAR(50) | NULL | For linking to IG account |
| tags | TEXT[] | DEFAULT '{}' | Array of tag strings |
| customFields | JSONB | DEFAULT '{}' | `{ fieldKey: value }` |
| notes | TEXT | NULL | Quick notes (not rich-text) |
| lostReason | TEXT | NULL | Populated when status = LOST |
| convertedToContactId | UUID | FK → contacts.id, NULL | Set when won |
| pipelineStageId | UUID | FK → pipeline_stages.id, NULL | |
| createdById | UUID | FK → users.id, NOT NULL | |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |
| deletedAt | TIMESTAMP | NULL | |

**Indexes:**
- `organizationId` (non-unique, partitioning key)
- `(organizationId, status)`
- `(organizationId, assignedToId)`
- `(organizationId, source)`
- `(organizationId, aiScore)`
- `email` (for dedup)
- `phone` (for dedup)
- `instagramUserId` (for webhook lookup)
- Full-text: `to_tsvector('english', firstName || ' ' || lastName || ' ' || coalesce(email,''))`

> **P0-7:** `email`/`phone` are stored as **plaintext, indexable columns** (these dedup and full-text indexes depend on it) and are protected by storage-layer encryption (Neon AES-256), NOT application-level field encryption. They are masked in logs and in audit before/after snapshots (§8.6).

---

### contacts
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK, NOT NULL | |
| firstName | VARCHAR(100) | NOT NULL | |
| lastName | VARCHAR(100) | NULL | |
| email | VARCHAR(255) | NULL | |
| phone | VARCHAR(20) | NULL | |
| company | VARCHAR(255) | NULL | |
| jobTitle | VARCHAR(100) | NULL | |
| avatarUrl | TEXT | NULL | |
| address | JSONB | NULL | `{ street, city, state, country, zip }` |
| tags | TEXT[] | DEFAULT '{}' | |
| customFields | JSONB | DEFAULT '{}' | |
| lifeTimeValue | DECIMAL(15,2) | DEFAULT 0 | Calculated field |
| assignedToId | UUID | FK → users.id, NULL | |
| createdFromLeadId | UUID | FK → leads.id, NULL | |
| createdById | UUID | FK → users.id, NOT NULL | |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |
| deletedAt | TIMESTAMP | NULL | |

**Indexes:** Similar to leads; `(organizationId, email)`, `(organizationId, phone)`

---

### pipelines
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK, NOT NULL | |
| name | VARCHAR(100) | NOT NULL | |
| description | TEXT | NULL | |
| currency | VARCHAR(3) | DEFAULT 'INR' | |
| isDefault | BOOLEAN | DEFAULT false | |
| createdById | UUID | FK → users.id, NOT NULL | |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |
| deletedAt | TIMESTAMP | NULL | |

---

### pipeline_stages
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK, NOT NULL | |
| pipelineId | UUID | FK → pipelines.id, NOT NULL | |
| name | VARCHAR(100) | NOT NULL | |
| position | SMALLINT | NOT NULL | For ordering (1, 2, 3...) |
| color | VARCHAR(7) | DEFAULT '#6366f1' | Hex color |
| probability | SMALLINT | DEFAULT 20 | 0–100% win probability |
| isWon | BOOLEAN | DEFAULT false | |
| isLost | BOOLEAN | DEFAULT false | |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |

**Constraint:** `CHECK (NOT (isWon AND isLost))`

---

### deals
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK, NOT NULL | |
| title | VARCHAR(255) | NOT NULL | |
| pipelineId | UUID | FK → pipelines.id, NOT NULL | |
| stageId | UUID | FK → pipeline_stages.id, NOT NULL | |
| contactId | UUID | FK → contacts.id, NULL | |
| leadId | UUID | FK → leads.id, NULL | |
| assignedToId | UUID | FK → users.id, NULL | |
| value | DECIMAL(15,2) | DEFAULT 0 | |
| currency | VARCHAR(3) | DEFAULT 'INR' | |
| probability | SMALLINT | NULL | Override stage probability |
| expectedCloseDate | DATE | NULL | |
| actualCloseDate | DATE | NULL | |
| status | ENUM | NOT NULL | OPEN, WON, LOST |
| lostReason | TEXT | NULL | |
| tags | TEXT[] | DEFAULT '{}' | |
| customFields | JSONB | DEFAULT '{}' | |
| aiScore | SMALLINT | NULL | |
| createdById | UUID | FK → users.id, NOT NULL | |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |
| deletedAt | TIMESTAMP | NULL | |

---

### tasks
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK, NOT NULL | |
| title | VARCHAR(255) | NOT NULL | |
| description | TEXT | NULL | |
| type | ENUM | NOT NULL | CALL, EMAIL, MEETING, FOLLOW_UP, DEMO, OTHER |
| priority | ENUM | NOT NULL | LOW, MEDIUM, HIGH, URGENT |
| status | ENUM | NOT NULL | PENDING, IN_PROGRESS, COMPLETED, CANCELLED |
| dueDate | TIMESTAMP | NULL | |
| completedAt | TIMESTAMP | NULL | |
| assignedToId | UUID | FK → users.id, NULL | |
| relatedLeadId | UUID | FK → leads.id, NULL | |
| relatedDealId | UUID | FK → deals.id, NULL | |
| relatedContactId | UUID | FK → contacts.id, NULL | |
| createdById | UUID | FK → users.id, NOT NULL | |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |
| deletedAt | TIMESTAMP | NULL | |

**Indexes:** `(organizationId, assignedToId, status)`, `(organizationId, dueDate, status)`

---

### activities
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK, NOT NULL | |
| type | ENUM | NOT NULL | LEAD_CREATED, STATUS_CHANGED, DEAL_MOVED, MESSAGE_SENT, MESSAGE_RECEIVED, TASK_CREATED, TASK_COMPLETED, NOTE_ADDED, FILE_UPLOADED, CALL_LOGGED, DEAL_WON, DEAL_LOST |
| description | TEXT | NOT NULL | Human-readable description |
| metadata | JSONB | DEFAULT '{}' | Type-specific extra data |
| performedById | UUID | FK → users.id, NULL | NULL = system action |
| relatedLeadId | UUID | FK → leads.id, NULL | |
| relatedDealId | UUID | FK → deals.id, NULL | |
| relatedContactId | UUID | FK → contacts.id, NULL | |
| createdAt | TIMESTAMP | NOT NULL | Immutable — no updatedAt |

**Constraint:** Activities are IMMUTABLE — no UPDATE, no soft delete
**Index:** `(organizationId, relatedLeadId)`, `(organizationId, relatedDealId)`, `(organizationId, relatedContactId)`, `(organizationId, createdAt DESC)`

---

### notes
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK, NOT NULL | |
| content | TEXT | NOT NULL | Rich text (HTML/JSON) |
| relatedLeadId | UUID | FK → leads.id, NULL | |
| relatedDealId | UUID | FK → deals.id, NULL | |
| relatedContactId | UUID | FK → contacts.id, NULL | |
| createdById | UUID | FK → users.id, NOT NULL | |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |
| deletedAt | TIMESTAMP | NULL | |

---

### files
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK, NOT NULL | |
| name | VARCHAR(255) | NOT NULL | Original filename |
| storageKey | TEXT | NOT NULL | S3 key or Cloudinary public_id |
| storageProvider | ENUM | NOT NULL | S3, CLOUDINARY |
| mimeType | VARCHAR(100) | NOT NULL | |
| sizeBytes | BIGINT | NOT NULL | |
| url | TEXT | NOT NULL | CDN URL |
| relatedLeadId | UUID | NULL | |
| relatedDealId | UUID | NULL | |
| relatedContactId | UUID | NULL | |
| uploadedById | UUID | FK → users.id, NOT NULL | |
| createdAt | TIMESTAMP | NOT NULL | |
| deletedAt | TIMESTAMP | NULL | |

---

### instagram_accounts
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK, NOT NULL | |
| instagramUserId | VARCHAR(50) | NOT NULL | Meta user ID |
| username | VARCHAR(100) | NOT NULL | |
| name | VARCHAR(255) | NULL | |
| profilePictureUrl | TEXT | NULL | |
| accessToken | TEXT | NOT NULL | Encrypted AES-256 |
| accessTokenExpiresAt | TIMESTAMP | NOT NULL | |
| pageId | VARCHAR(50) | NULL | Linked Facebook Page ID |
| webhookSubscribed | BOOLEAN | DEFAULT false | |
| status | ENUM | NOT NULL | CONNECTED, EXPIRED, DISCONNECTED |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |

**Security:** `accessToken` encrypted at application level (AES-256-GCM) before storage, with a key-version prefix so the encryption key and token format can change without a big-bang re-encrypt.
**P0-5:** the exact token field(s) (`accessToken` type/lifetime, `pageId` vs IG-account-id optionality, `accessTokenExpiresAt` semantics) are finalized by the Meta validation spike (doc 14 §14.0) before this table is migrated.

---

### instagram_conversations
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK, NOT NULL | |
| instagramAccountId | UUID | FK → instagram_accounts.id, NOT NULL | |
| instagramScopedUserId | VARCHAR(50) | NOT NULL | External user's IGSID |
| externalUsername | VARCHAR(100) | NULL | |
| externalProfilePicUrl | TEXT | NULL | |
| status | ENUM | NOT NULL | OPEN, CLOSED, PENDING |
| assignedToId | UUID | FK → users.id, NULL | |
| relatedLeadId | UUID | FK → leads.id, NULL | |
| relatedContactId | UUID | FK → contacts.id, NULL | |
| lastMessageAt | TIMESTAMP | NULL | |
| firstResponseAt | TIMESTAMP | NULL | For SLA tracking |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |

**Indexes:** `(organizationId, instagramScopedUserId)` UNIQUE per account, `(organizationId, lastMessageAt DESC)`

---

### messages
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK, NOT NULL | |
| conversationId | UUID | NOT NULL | FK → instagram_conversations or whatsapp_conversations |
| conversationType | ENUM | NOT NULL | INSTAGRAM, WHATSAPP |
| externalMessageId | VARCHAR(255) | NULL | Platform message ID |
| direction | ENUM | NOT NULL | INBOUND, OUTBOUND |
| type | ENUM | NOT NULL | TEXT, IMAGE, VIDEO, AUDIO, DOCUMENT, REACTION, STICKER, UNSUPPORTED |
| content | TEXT | NULL | Text content |
| mediaUrl | TEXT | NULL | Media attachment URL |
| mediaType | VARCHAR(50) | NULL | |
| status | ENUM | NOT NULL | SENT, DELIVERED, READ, FAILED |
| sentById | UUID | FK → users.id, NULL | NULL = incoming |
| failureReason | TEXT | NULL | |
| rawPayload | JSONB | NULL | Full webhook payload for debugging |
| sentAt | TIMESTAMP | NOT NULL | |
| deliveredAt | TIMESTAMP | NULL | |
| readAt | TIMESTAMP | NULL | |
| createdAt | TIMESTAMP | NOT NULL | |

**Partitioning:** Partition by `organizationId` hash at scale (>100M rows)

---

### whatsapp_accounts
Similar structure to instagram_accounts with WhatsApp-specific fields:
- `phoneNumberId`, `businessAccountId`, `displayPhoneNumber`
- `verifiedName`, `qualityRating`, `messagingLimit`

---

### workflows
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK, NOT NULL | |
| name | VARCHAR(255) | NOT NULL | |
| description | TEXT | NULL | |
| status | ENUM | NOT NULL | ACTIVE, INACTIVE, DRAFT |
| trigger | JSONB | NOT NULL | `{ type: 'LEAD_CREATED', config: {} }` |
| conditions | JSONB | NOT NULL | Array of condition objects |
| actions | JSONB | NOT NULL | Array of action objects |
| executionCount | INTEGER | DEFAULT 0 | |
| lastExecutedAt | TIMESTAMP | NULL | |
| createdById | UUID | FK → users.id, NOT NULL | |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |
| deletedAt | TIMESTAMP | NULL | |

---

### workflow_executions
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK, NOT NULL | |
| workflowId | UUID | FK → workflows.id, NOT NULL | |
| triggeredBy | JSONB | NOT NULL | What triggered this: `{ type, entityId, entityType }` |
| status | ENUM | NOT NULL | PENDING, RUNNING, COMPLETED, FAILED, SKIPPED |
| conditionResult | BOOLEAN | NULL | Did conditions pass? |
| actionsExecuted | JSONB | DEFAULT '[]' | Log of each action result |
| error | TEXT | NULL | Error message on failure |
| startedAt | TIMESTAMP | NOT NULL | |
| completedAt | TIMESTAMP | NULL | |
| createdAt | TIMESTAMP | NOT NULL | |

**Retention:** Auto-delete executions > 90 days via cron job

---

### subscriptions
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK, UNIQUE, NOT NULL | One sub per org |
| plan | ENUM | NOT NULL | TRIAL, STARTER, GROWTH, SCALE |
| status | ENUM | NOT NULL | TRIALING, ACTIVE, PAST_DUE, CANCELLED, PAUSED |
| stripeSubscriptionId | VARCHAR(255) | NULL | Stripe sub ID |
| stripeCustomerId | VARCHAR(255) | NULL | |
| stripePriceId | VARCHAR(255) | NULL | |
| currentPeriodStart | TIMESTAMP | NULL | |
| currentPeriodEnd | TIMESTAMP | NULL | |
| cancelAtPeriodEnd | BOOLEAN | DEFAULT false | |
| trialEndsAt | TIMESTAMP | NULL | |
| seatCount | SMALLINT | DEFAULT 1 | |
| lastStripeEventAt | TIMESTAMP | NULL | Timestamp of the most recently APPLIED Stripe event — used to reject out-of-order/replayed webhooks (P0-6) |
| lastSyncedAt | TIMESTAMP | NULL | Last successful Stripe→mirror reconciliation; staleness triggers fail-open access (P0-6) |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |

**Access decisions** read a derived `effectiveAccessLevel` (FULL/READ_ONLY/SUSPENDED), never the raw `status` — see doc 16 §16.4.

---

### invoices
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK, NOT NULL | |
| subscriptionId | UUID | FK → subscriptions.id, NOT NULL | |
| stripeInvoiceId | VARCHAR(255) | UNIQUE, NOT NULL | |
| number | VARCHAR(50) | UNIQUE | Human-readable invoice number |
| status | ENUM | NOT NULL | DRAFT, OPEN, PAID, VOID, UNCOLLECTIBLE |
| amountDue | DECIMAL(10,2) | NOT NULL | |
| amountPaid | DECIMAL(10,2) | DEFAULT 0 | |
| currency | VARCHAR(3) | NOT NULL | |
| dueDate | DATE | NULL | |
| paidAt | TIMESTAMP | NULL | |
| invoicePdfUrl | TEXT | NULL | Stripe-generated PDF |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |

---

### payments
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK, NOT NULL | |
| invoiceId | UUID | FK → invoices.id, NOT NULL | |
| stripePaymentIntentId | VARCHAR(255) | UNIQUE | |
| amount | DECIMAL(10,2) | NOT NULL | |
| currency | VARCHAR(3) | NOT NULL | |
| status | ENUM | NOT NULL | PENDING, SUCCEEDED, FAILED, REFUNDED |
| paymentMethod | VARCHAR(50) | NULL | card, upi, netbanking |
| failureCode | VARCHAR(100) | NULL | |
| failureMessage | TEXT | NULL | |
| refundedAt | TIMESTAMP | NULL | |
| createdAt | TIMESTAMP | NOT NULL | |

---

### notifications
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | FK, NOT NULL | |
| userId | UUID | FK → users.id, NOT NULL | Recipient |
| type | ENUM | NOT NULL | LEAD_ASSIGNED, MESSAGE_RECEIVED, TASK_OVERDUE, DEAL_WON, WORKFLOW_FAILED, TRIAL_EXPIRING, PAYMENT_FAILED |
| title | VARCHAR(255) | NOT NULL | |
| body | TEXT | NULL | |
| actionUrl | TEXT | NULL | Deep link URL |
| isRead | BOOLEAN | DEFAULT false | |
| readAt | TIMESTAMP | NULL | |
| relatedEntityId | UUID | NULL | |
| relatedEntityType | VARCHAR(50) | NULL | |
| createdAt | TIMESTAMP | NOT NULL | |

**Index:** `(userId, isRead, createdAt DESC)` for inbox badge count

---

### audit_logs
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | NULL | NULL for platform-level actions |
| userId | UUID | FK → users.id, NULL | NULL for system actions |
| action | VARCHAR(100) | NOT NULL | CREATE_LEAD, DELETE_CONTACT, etc. |
| resource | VARCHAR(50) | NOT NULL | lead, contact, deal, etc. |
| resourceId | UUID | NOT NULL | ID of affected record |
| before | JSONB | NULL | State before change |
| after | JSONB | NULL | State after change |
| ipAddress | VARCHAR(45) | NULL | |
| userAgent | TEXT | NULL | |
| createdAt | TIMESTAMP | NOT NULL | Immutable |

**Retention:** 5 years, never soft deleted
**Partitioning:** Range partition by `createdAt` (monthly partitions) at scale

---

### webhook_events
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organizationId | UUID | NULL | Resolved after processing |
| source | ENUM | NOT NULL | INSTAGRAM, WHATSAPP, STRIPE |
| eventType | VARCHAR(100) | NOT NULL | e.g., messages, payment_intent.succeeded |
| externalEventId | VARCHAR(255) | NULL | UNIQUE per source to prevent duplicate processing |
| payload | JSONB | NOT NULL | Full raw webhook payload |
| status | ENUM | NOT NULL | PENDING, PROCESSING, PROCESSED, FAILED |
| processedAt | TIMESTAMP | NULL | |
| error | TEXT | NULL | |
| attempts | SMALLINT | DEFAULT 0 | |
| createdAt | TIMESTAMP | NOT NULL | |

**Index:** `(source, externalEventId)` UNIQUE (idempotency key)

---

### refresh_tokens
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | Token family ID |
| userId | UUID | FK → users.id, NOT NULL | |
| tokenHash | VARCHAR(255) | NOT NULL | SHA-256 hash of actual token |
| family | UUID | NOT NULL | Token family for rotation detection |
| deviceInfo | VARCHAR(255) | NULL | User-agent truncated |
| ipAddress | VARCHAR(45) | NULL | |
| expiresAt | TIMESTAMP | NOT NULL | |
| usedAt | TIMESTAMP | NULL | Null = not yet used |
| revokedAt | TIMESTAMP | NULL | Null = valid |
| createdAt | TIMESTAMP | NOT NULL | |

**Index:** `tokenHash` (lookup on request), `(userId, family)`, `expiresAt`

---

## 8.4 Partitioning Strategy

| Table | Strategy | Trigger |
|---|---|---|
| leads | Hash by organizationId (8 partitions) | > 5M rows |
| messages | Hash by organizationId (16 partitions) | > 20M rows |
| activities | Range by createdAt (monthly) | > 10M rows |
| audit_logs | Range by createdAt (monthly) | > 5M rows |
| workflow_executions | Range by createdAt (monthly) | > 10M rows |
| notifications | Range by createdAt (monthly) | > 10M rows |

---

## 8.5 Soft Delete Strategy

All core tables implement soft delete:
1. `deletedAt TIMESTAMP NULL` — set on "delete"
2. All Prisma queries automatically filter `WHERE deletedAt IS NULL` via Prisma Extension
3. Soft-deleted records visible to: admin in Settings → Trash
4. Hard delete via cron job 30 days after `deletedAt`
5. Some tables are NEVER soft-deleted: `activities`, `audit_logs`, `webhook_events` (immutable)

---

## 8.6 Audit Strategy

### Automatic Audit Logging
Via Prisma Middleware, all mutations to auditable models generate an `audit_logs` entry:
- Auditable models: Lead, Contact, Deal, Pipeline, Workflow, User, OrganizationMember, Subscription
- Before/after JSONB snapshots (PII fields masked: phone, email)
- Attributed to userId from request context

### Manual Audit Logging
For operations not captured by Prisma middleware (e.g., bulk operations, imports):
- Call `auditService.log(...)` explicitly in service layer

---

## 8.7 Indexes Summary

Critical composite indexes (beyond individual column indexes):
```sql
-- Lead list view query (most common query in the system)
CREATE INDEX idx_leads_org_status_score ON leads(organization_id, status, ai_score DESC)
  WHERE deleted_at IS NULL;

-- Inbox conversation list
CREATE INDEX idx_ig_conversations_org_last ON instagram_conversations(organization_id, last_message_at DESC)
  WHERE status != 'CLOSED';

-- Task due date view
CREATE INDEX idx_tasks_assignee_due ON tasks(organization_id, assigned_to_id, due_date)
  WHERE status = 'PENDING' AND deleted_at IS NULL;

-- Notification unread count
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);

-- Webhook idempotency
CREATE UNIQUE INDEX idx_webhook_events_dedup ON webhook_events(source, external_event_id);

-- Full text search on leads
CREATE INDEX idx_leads_search ON leads USING gin(
  to_tsvector('english', first_name || ' ' || coalesce(last_name, '') || ' ' || coalesce(email, ''))
);
```
