// Internal event-name registry. Module code must reference these constants instead of
// string literals (coding standard 10.3 / RC-7 gate from SPRINT_4_SCHEMA_APPROVAL.md).
// All 19 ActivityType event names use SCREAMING_SNAKE_CASE, matching the ActivityType enum
// exactly so Workflow Engine trigger conditions (Sprint 7) can compare event names to type values.

export const SystemEvent = {
  HEALTH_PING: 'system.health.ping',
} as const;
export type SystemEvent = (typeof SystemEvent)[keyof typeof SystemEvent];

// Domain events — one constant per ActivityType value.
// CRITICAL: string values MUST match the ActivityType enum in prisma/schema.prisma and
// packages/shared/src/constants/enums.ts exactly. Any divergence causes Sprint 7 workflow
// triggers to silently never fire (R-4, SPRINT_4_SCHEMA_APPROVAL.md §6).
export const DomainEvent = {
  // Lead lifecycle
  LEAD_CREATED: 'LEAD_CREATED',
  LEAD_STATUS_CHANGED: 'LEAD_STATUS_CHANGED',
  LEAD_ASSIGNED: 'LEAD_ASSIGNED',
  LEAD_WON: 'LEAD_WON',
  LEAD_LOST: 'LEAD_LOST',
  // Contact lifecycle
  CONTACT_CREATED: 'CONTACT_CREATED',
  CONTACT_UPDATED: 'CONTACT_UPDATED',
  // Task lifecycle
  TASK_CREATED: 'TASK_CREATED',
  TASK_COMPLETED: 'TASK_COMPLETED',
  TASK_CANCELLED: 'TASK_CANCELLED',
  // Note lifecycle
  NOTE_ADDED: 'NOTE_ADDED',
  NOTE_UPDATED: 'NOTE_UPDATED',
  NOTE_DELETED: 'NOTE_DELETED',
  // File lifecycle
  FILE_UPLOADED: 'FILE_UPLOADED',
  FILE_DELETED: 'FILE_DELETED',
  // Deal lifecycle (Sprint 5 module; events declared here as forward contract)
  DEAL_CREATED: 'DEAL_CREATED',
  DEAL_STAGE_MOVED: 'DEAL_STAGE_MOVED',
  DEAL_WON: 'DEAL_WON',
  DEAL_LOST: 'DEAL_LOST',
  // Sprint 5 cleanup — events that were missing from this registry
  DEAL_UPDATED: 'DEAL_UPDATED',
  PIPELINE_CREATED: 'PIPELINE_CREATED',
  PIPELINE_UPDATED: 'PIPELINE_UPDATED',
  PIPELINE_DELETED: 'PIPELINE_DELETED',
  PIPELINE_STAGE_CREATED: 'PIPELINE_STAGE_CREATED',
  PIPELINE_STAGE_UPDATED: 'PIPELINE_STAGE_UPDATED',
  PIPELINE_STAGE_DELETED: 'PIPELINE_STAGE_DELETED',
  PIPELINE_STAGE_REORDERED: 'PIPELINE_STAGE_REORDERED',
  // Sprint 6 M1 — Instagram Inbox events
  MESSAGE_RECEIVED: 'MESSAGE_RECEIVED',
  MESSAGE_SENT: 'MESSAGE_SENT',
  INSTAGRAM_ACCOUNT_CONNECTED: 'INSTAGRAM_ACCOUNT_CONNECTED',
  INSTAGRAM_ACCOUNT_DISCONNECTED: 'INSTAGRAM_ACCOUNT_DISCONNECTED',
} as const;
export type DomainEvent = (typeof DomainEvent)[keyof typeof DomainEvent];

export const AllEvents = { ...SystemEvent, ...DomainEvent } as const;
export type EventName = SystemEvent | DomainEvent;
