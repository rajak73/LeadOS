// ActivityMetadata discriminated union — RC-8 gate (SPRINT_4_SCHEMA_APPROVAL.md).
// Every ActivityType value has exactly one variant here. The `type` field is the discriminant.
// ActivityService.append() accepts ActivityAppendInput; the metadata shape is enforced at
// compile time so Sprint 7 Workflow Engine trigger conditions can evaluate known fields.
//
// Required entity FKs per type:
//   Lead events       → relatedLeadId required
//   Contact events    → relatedContactId required
//   Task events       → relatedLeadId or relatedContactId required (at least one)
//   Note events       → relatedLeadId or relatedContactId required
//   File events       → relatedLeadId or relatedContactId required
//   Deal events       → relatedDealId required
//   Pipeline events   → relatedPipelineId required
//   Stage events      → relatedPipelineId + relatedPipelineStageId required

import type { ActivityType } from '../constants/enums.js';

// ─── Shared sub-types ────────────────────────────────────────────────────────

export interface LeadStatusChangeMetadata {
  from: string;
  to: string;
}

export interface AssignmentMetadata {
  assignedToUserId: string | null;
  previousUserId: string | null;
}

// ─── Per-type metadata shapes ─────────────────────────────────────────────────

export interface LeadCreatedMetadata {
  type: typeof ActivityType.LEAD_CREATED;
  source: string;
}

export interface LeadStatusChangedMetadata {
  type: typeof ActivityType.LEAD_STATUS_CHANGED;
  from: string;
  to: string;
}

export interface LeadAssignedMetadata {
  type: typeof ActivityType.LEAD_ASSIGNED;
  assignedToUserId: string | null;
  previousUserId: string | null;
}

export interface LeadWonMetadata {
  type: typeof ActivityType.LEAD_WON;
  convertedToContactId: string;
}

export interface LeadLostMetadata {
  type: typeof ActivityType.LEAD_LOST;
  lostReason?: string;
}

export interface ContactCreatedMetadata {
  type: typeof ActivityType.CONTACT_CREATED;
  createdFromLeadId?: string;
}

export interface ContactUpdatedMetadata {
  type: typeof ActivityType.CONTACT_UPDATED;
  fields: string[]; // field names that changed
}

export interface TaskCreatedMetadata {
  type: typeof ActivityType.TASK_CREATED;
  taskId: string;
  taskTitle: string;
}

export interface TaskCompletedMetadata {
  type: typeof ActivityType.TASK_COMPLETED;
  taskId: string;
}

export interface TaskCancelledMetadata {
  type: typeof ActivityType.TASK_CANCELLED;
  taskId: string;
}

export interface NoteAddedMetadata {
  type: typeof ActivityType.NOTE_ADDED;
  noteId: string;
}

export interface NoteUpdatedMetadata {
  type: typeof ActivityType.NOTE_UPDATED;
  noteId: string;
}

export interface NoteDeletedMetadata {
  type: typeof ActivityType.NOTE_DELETED;
  noteId: string;
}

export interface FileUploadedMetadata {
  type: typeof ActivityType.FILE_UPLOADED;
  fileId: string;
  fileName: string;
  mimeType: string;
}

export interface FileDeletedMetadata {
  type: typeof ActivityType.FILE_DELETED;
  fileId: string;
  fileName: string;
}

// Deal events — Sprint 5.
export interface DealCreatedMetadata {
  type: typeof ActivityType.DEAL_CREATED;
  dealId: string;
  dealTitle: string;
  pipelineId: string;
  stageId: string;
  value?: string;
}

export interface DealStageMovedMetadata {
  type: typeof ActivityType.DEAL_STAGE_MOVED;
  dealId: string;
  fromStageId: string;
  toStageId: string;
}

export interface DealWonMetadata {
  type: typeof ActivityType.DEAL_WON;
  dealId: string;
}

export interface DealLostMetadata {
  type: typeof ActivityType.DEAL_LOST;
  dealId: string;
  lostReason?: string;
}

export interface DealUpdatedMetadata {
  type: typeof ActivityType.DEAL_UPDATED;
  dealId: string;
  fields: string[];
}

// Pipeline events — Sprint 5.
export interface PipelineCreatedMetadata {
  type: typeof ActivityType.PIPELINE_CREATED;
  pipelineId: string;
  name: string;
}

export interface PipelineUpdatedMetadata {
  type: typeof ActivityType.PIPELINE_UPDATED;
  pipelineId: string;
  fields: string[];
}

export interface PipelineDeletedMetadata {
  type: typeof ActivityType.PIPELINE_DELETED;
  pipelineId: string;
  name: string;
}

export interface PipelineStageCreatedMetadata {
  type: typeof ActivityType.PIPELINE_STAGE_CREATED;
  pipelineId: string;
  stageId: string;
  name: string;
}

export interface PipelineStageUpdatedMetadata {
  type: typeof ActivityType.PIPELINE_STAGE_UPDATED;
  pipelineId: string;
  stageId: string;
  fields: string[];
}

export interface PipelineStageDeletedMetadata {
  type: typeof ActivityType.PIPELINE_STAGE_DELETED;
  pipelineId: string;
  stageId: string;
  name: string;
}

export interface PipelineStageReorderedMetadata {
  type: typeof ActivityType.PIPELINE_STAGE_REORDERED;
  pipelineId: string;
  stageIds: string[];
}

// Instagram messaging events — Sprint 6 M1.
export interface MessageReceivedMetadata {
  type: typeof ActivityType.MESSAGE_RECEIVED;
  conversationId: string;
  messageId: string;
  igHandle?: string; // sender's IG handle, if enriched
}

export interface MessageSentMetadata {
  type: typeof ActivityType.MESSAGE_SENT;
  conversationId: string;
  messageId: string;
}

export interface InstagramAccountConnectedMetadata {
  type: typeof ActivityType.INSTAGRAM_ACCOUNT_CONNECTED;
  igAccountId: string;
  igUsername: string;
}

export interface InstagramAccountDisconnectedMetadata {
  type: typeof ActivityType.INSTAGRAM_ACCOUNT_DISCONNECTED;
  igAccountId: string;
  igUsername: string;
}

// Notification engine — Sprint 7 M1 (emitted now).
export interface NotificationSentMetadata {
  type: typeof ActivityType.NOTIFICATION_SENT;
  notificationId: string;
  notificationType: string; // NotificationType enum value
  recipientUserId: string;
  channel: string; // NotificationChannel enum value
}

// Scaffolds for later milestones — present now so enum parity and the exhaustive
// discriminated union compile once (R-PARITY-1). Shapes are finalized in M2/M3/M4.
export interface LeadScoredMetadata {
  type: typeof ActivityType.LEAD_SCORED;
  leadId: string;
  score: number;
  previousScore?: number;
}

export interface WorkflowTriggeredMetadata {
  type: typeof ActivityType.WORKFLOW_TRIGGERED;
  workflowId: string;
  workflowRunId: string;
  triggerEvent: string;
}

export interface WorkflowActionExecutedMetadata {
  type: typeof ActivityType.WORKFLOW_ACTION_EXECUTED;
  workflowId: string;
  workflowRunId: string;
  action: string;
}

export interface FollowUpCreatedMetadata {
  type: typeof ActivityType.FOLLOW_UP_CREATED;
  taskId: string;
  reason: string;
}

// ─── Union ────────────────────────────────────────────────────────────────────

export type ActivityMetadata =
  | LeadCreatedMetadata
  | LeadStatusChangedMetadata
  | LeadAssignedMetadata
  | LeadWonMetadata
  | LeadLostMetadata
  | ContactCreatedMetadata
  | ContactUpdatedMetadata
  | TaskCreatedMetadata
  | TaskCompletedMetadata
  | TaskCancelledMetadata
  | NoteAddedMetadata
  | NoteUpdatedMetadata
  | NoteDeletedMetadata
  | FileUploadedMetadata
  | FileDeletedMetadata
  | DealCreatedMetadata
  | DealStageMovedMetadata
  | DealWonMetadata
  | DealLostMetadata
  | DealUpdatedMetadata
  | PipelineCreatedMetadata
  | PipelineUpdatedMetadata
  | PipelineDeletedMetadata
  | PipelineStageCreatedMetadata
  | PipelineStageUpdatedMetadata
  | PipelineStageDeletedMetadata
  | PipelineStageReorderedMetadata
  | MessageReceivedMetadata
  | MessageSentMetadata
  | InstagramAccountConnectedMetadata
  | InstagramAccountDisconnectedMetadata
  | NotificationSentMetadata
  | LeadScoredMetadata
  | WorkflowTriggeredMetadata
  | WorkflowActionExecutedMetadata
  | FollowUpCreatedMetadata;

// ─── Input type for ActivityService.append() ─────────────────────────────────

export interface ActivityAppendInput {
  organizationId: string;
  type: ActivityType;
  description: string;
  metadata: ActivityMetadata;
  /** null = system-initiated activity (no human performer, e.g. AI scoring worker) */
  performedById?: string | null;
  relatedLeadId?: string;
  relatedContactId?: string;
  relatedDealId?: string;
  relatedPipelineId?: string;
  relatedPipelineStageId?: string;
  relatedConversationId?: string; // Sprint 7 M1 — §5.1 deferral closed
}
