// Canonical enums — the single source of truth shared by frontend and backend.
// These mirror prisma/schema.prisma (doc 09). The `check:enum-parity` CI gate asserts
// that any enum present in BOTH this file and the Prisma schema has identical members.
// In Sprint 1 the Prisma schema declares no domain enums yet, so parity is trivially
// satisfied; it becomes enforcing when domain models land (S2+).

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  DELETED: 'DELETED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const OrgStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  DELETED: 'DELETED',
} as const;
export type OrgStatus = (typeof OrgStatus)[keyof typeof OrgStatus];

export const MemberStatus = {
  ACTIVE: 'ACTIVE',
  INVITED: 'INVITED',
  SUSPENDED: 'SUSPENDED',
} as const;
export type MemberStatus = (typeof MemberStatus)[keyof typeof MemberStatus];

export const LeadStatus = {
  NEW: 'NEW',
  CONTACTED: 'CONTACTED',
  QUALIFIED: 'QUALIFIED',
  PROPOSAL: 'PROPOSAL',
  NEGOTIATION: 'NEGOTIATION',
  WON: 'WON',
  LOST: 'LOST',
} as const;
export type LeadStatus = (typeof LeadStatus)[keyof typeof LeadStatus];

export const LeadSource = {
  INSTAGRAM_DM: 'INSTAGRAM_DM',
  INSTAGRAM_COMMENT: 'INSTAGRAM_COMMENT',
  WHATSAPP: 'WHATSAPP',
  MANUAL: 'MANUAL',
  IMPORT: 'IMPORT',
  REFERRAL: 'REFERRAL',
  WEB_FORM: 'WEB_FORM',
  OTHER: 'OTHER',
} as const;
export type LeadSource = (typeof LeadSource)[keyof typeof LeadSource];

export const DealStatus = {
  OPEN: 'OPEN',
  WON: 'WON',
  LOST: 'LOST',
} as const;
export type DealStatus = (typeof DealStatus)[keyof typeof DealStatus];

// Sprint 5 M1 — Webhook subsystem enums (parity-checked against prisma/schema.prisma)
export const WebhookSource = {
  STRIPE: 'STRIPE',
  INSTAGRAM: 'INSTAGRAM',
  WHATSAPP: 'WHATSAPP',
  SYSTEM: 'SYSTEM',
} as const;
export type WebhookSource = (typeof WebhookSource)[keyof typeof WebhookSource];

export const WebhookEventStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  DONE: 'DONE',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
} as const;
export type WebhookEventStatus = (typeof WebhookEventStatus)[keyof typeof WebhookEventStatus];

export const TaskType = {
  CALL: 'CALL',
  EMAIL: 'EMAIL',
  MEETING: 'MEETING',
  FOLLOW_UP: 'FOLLOW_UP',
  DEMO: 'DEMO',
  OTHER: 'OTHER',
} as const;
export type TaskType = (typeof TaskType)[keyof typeof TaskType];

export const TaskPriority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const;
export type TaskPriority = (typeof TaskPriority)[keyof typeof TaskPriority];

export const TaskStatus = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const MessageDirection = {
  INBOUND: 'INBOUND',
  OUTBOUND: 'OUTBOUND',
} as const;
export type MessageDirection = (typeof MessageDirection)[keyof typeof MessageDirection];

export const SubscriptionPlan = {
  TRIAL: 'TRIAL',
  STARTER: 'STARTER',
  GROWTH: 'GROWTH',
  SCALE: 'SCALE',
} as const;
export type SubscriptionPlan = (typeof SubscriptionPlan)[keyof typeof SubscriptionPlan];

export const SubscriptionStatus = {
  TRIALING: 'TRIALING',
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  CANCELLED: 'CANCELLED',
  PAUSED: 'PAUSED',
} as const;
export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

// Sprint 4 — CRM domain enums (parity-checked against prisma/schema.prisma)

export const ActivityType = {
  LEAD_CREATED: 'LEAD_CREATED',
  LEAD_STATUS_CHANGED: 'LEAD_STATUS_CHANGED',
  LEAD_ASSIGNED: 'LEAD_ASSIGNED',
  LEAD_WON: 'LEAD_WON',
  LEAD_LOST: 'LEAD_LOST',
  CONTACT_CREATED: 'CONTACT_CREATED',
  CONTACT_UPDATED: 'CONTACT_UPDATED',
  TASK_CREATED: 'TASK_CREATED',
  TASK_COMPLETED: 'TASK_COMPLETED',
  TASK_CANCELLED: 'TASK_CANCELLED',
  NOTE_ADDED: 'NOTE_ADDED',
  NOTE_UPDATED: 'NOTE_UPDATED',
  NOTE_DELETED: 'NOTE_DELETED',
  FILE_UPLOADED: 'FILE_UPLOADED',
  FILE_DELETED: 'FILE_DELETED',
  DEAL_CREATED: 'DEAL_CREATED',
  DEAL_STAGE_MOVED: 'DEAL_STAGE_MOVED',
  DEAL_WON: 'DEAL_WON',
  DEAL_LOST: 'DEAL_LOST',
  // Sprint 5 M1 additions
  DEAL_UPDATED: 'DEAL_UPDATED',
  PIPELINE_CREATED: 'PIPELINE_CREATED',
  PIPELINE_UPDATED: 'PIPELINE_UPDATED',
  PIPELINE_DELETED: 'PIPELINE_DELETED',
  PIPELINE_STAGE_CREATED: 'PIPELINE_STAGE_CREATED',
  PIPELINE_STAGE_UPDATED: 'PIPELINE_STAGE_UPDATED',
  PIPELINE_STAGE_DELETED: 'PIPELINE_STAGE_DELETED',
  PIPELINE_STAGE_REORDERED: 'PIPELINE_STAGE_REORDERED',
} as const;
export type ActivityType = (typeof ActivityType)[keyof typeof ActivityType];

export const CustomFieldObjectType = {
  LEAD: 'LEAD',
  CONTACT: 'CONTACT',
  DEAL: 'DEAL',
} as const;
export type CustomFieldObjectType = (typeof CustomFieldObjectType)[keyof typeof CustomFieldObjectType];

export const CustomFieldType = {
  TEXT: 'TEXT',
  NUMBER: 'NUMBER',
  DATE: 'DATE',
  SELECT: 'SELECT',
  MULTI_SELECT: 'MULTI_SELECT',
  BOOLEAN: 'BOOLEAN',
  URL: 'URL',
} as const;
export type CustomFieldType = (typeof CustomFieldType)[keyof typeof CustomFieldType];

export const StorageProvider = {
  S3: 'S3',
  CLOUDINARY: 'CLOUDINARY',
} as const;
export type StorageProvider = (typeof StorageProvider)[keyof typeof StorageProvider];
