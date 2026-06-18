// Internal event-name registry. Module code must reference these constants instead of
// string literals (coding standard 10.3). Workflow triggers (doc 12 §12.3) are a subset.
// Sprint 1 ships only the platform/health events; domain events are added with their
// modules in later sprints (kept here as the forward contract).

export const SystemEvent = {
  HEALTH_PING: 'system.health.ping',
} as const;
export type SystemEvent = (typeof SystemEvent)[keyof typeof SystemEvent];

// Domain events (declared as the contract; emitters arrive with their modules).
export const DomainEvent = {
  LEAD_CREATED: 'lead.created',
  LEAD_STATUS_CHANGED: 'lead.status_changed',
  LEAD_ASSIGNED: 'lead.assigned',
  LEAD_SCORE_CHANGED: 'lead.score_changed',
  DEAL_STAGE_CHANGED: 'deal.stage_changed',
  DEAL_WON: 'deal.won',
  DEAL_LOST: 'deal.lost',
  INSTAGRAM_MESSAGE_RECEIVED: 'instagram.message.received',
  WHATSAPP_MESSAGE_RECEIVED: 'whatsapp.message.received',
  CONTACT_CREATED: 'contact.created',
  TASK_OVERDUE: 'task.overdue',
} as const;
export type DomainEvent = (typeof DomainEvent)[keyof typeof DomainEvent];

export const AllEvents = { ...SystemEvent, ...DomainEvent } as const;
export type EventName = SystemEvent | DomainEvent;
