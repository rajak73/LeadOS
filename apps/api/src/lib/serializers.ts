// Maps database rows to the response types in packages/shared/src/types.ts.
// Only these functions shape API output, so secrets (passwordHash, tokenHash) can never leak.

import type { Prisma } from '@prisma/client';
import type {
  Activity,
  ActivityType,
  AiScore,
  Contact,
  Deal,
  DealStatus,
  DealSummary,
  Lead,
  LeadSource,
  LeadStatus,
  Note,
  Notification,
  NotificationType,
  ScoringFactor,
  Task,
  TaskPriority,
  TaskStatus,
  TaskType,
  User,
  UserRef,
  UserRole,
  UserStatus,
  Workflow,
  WorkflowActionLog,
  WorkflowDefinition,
  WorkflowRun,
  WorkflowRunStatus,
  WorkflowTrigger,
} from '@leados/shared';
import { fullName } from './labels.js';

const iso = (d: Date) => d.toISOString();
const isoOrNull = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function asTags(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((t): t is string => typeof t === 'string') : [];
}

export const userRefSelect = { id: true, firstName: true, lastName: true, email: true } as const;
type UserRefRow = Prisma.UserGetPayload<{ select: typeof userRefSelect }>;

export const toUserRef = (u: UserRefRow): UserRef => ({
  id: u.id,
  firstName: u.firstName,
  lastName: u.lastName,
  email: u.email,
});
const toUserRefOrNull = (u: UserRefRow | null) => (u ? toUserRef(u) : null);

export function toUser(u: Prisma.UserGetPayload<object>): User {
  return {
    ...toUserRef(u),
    role: u.role as UserRole,
    status: u.status as UserStatus,
    lastLoginAt: isoOrNull(u.lastLoginAt),
    createdAt: iso(u.createdAt),
  };
}

// ─── Leads & contacts ────────────────────────────────────────────────────────

export const leadInclude = {
  assignedTo: { select: userRefSelect },
  createdBy: { select: userRefSelect },
} as const satisfies Prisma.LeadInclude;
export type LeadRow = Prisma.LeadGetPayload<{ include: typeof leadInclude }>;

export function toLead(l: LeadRow): Lead {
  return {
    id: l.id,
    firstName: l.firstName,
    lastName: l.lastName,
    email: l.email,
    phone: l.phone,
    company: l.company,
    source: l.source as LeadSource,
    status: l.status as LeadStatus,
    tags: asTags(l.tags),
    lostReason: l.lostReason,
    aiScore: l.aiScore,
    aiScoreUpdatedAt: isoOrNull(l.aiScoreUpdatedAt),
    assignedTo: toUserRefOrNull(l.assignedTo),
    createdBy: toUserRef(l.createdBy),
    convertedToContactId: l.convertedToContactId,
    lastActivityAt: isoOrNull(l.lastActivityAt),
    createdAt: iso(l.createdAt),
    updatedAt: iso(l.updatedAt),
  };
}

export const contactInclude = leadInclude satisfies Prisma.ContactInclude;
export type ContactRow = Prisma.ContactGetPayload<{ include: typeof contactInclude }>;

export function toContact(c: ContactRow): Contact {
  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    company: c.company,
    jobTitle: c.jobTitle,
    tags: asTags(c.tags),
    assignedTo: toUserRefOrNull(c.assignedTo),
    createdBy: toUserRef(c.createdBy),
    lastActivityAt: isoOrNull(c.lastActivityAt),
    createdAt: iso(c.createdAt),
    updatedAt: iso(c.updatedAt),
  };
}

// ─── Deals ───────────────────────────────────────────────────────────────────

export const dealInclude = {
  stage: { select: { id: true, name: true, color: true } },
  lead: { select: { id: true, firstName: true, lastName: true } },
  contact: { select: { id: true, firstName: true, lastName: true, company: true } },
  assignedTo: { select: userRefSelect },
  createdBy: { select: userRefSelect },
} as const satisfies Prisma.DealInclude;
export type DealRow = Prisma.DealGetPayload<{ include: typeof dealInclude }>;

export function toDeal(d: DealRow): Deal {
  return {
    id: d.id,
    title: d.title,
    value: d.value,
    currency: d.currency,
    status: d.status as DealStatus,
    pipelineId: d.pipelineId,
    stage: d.stage,
    lead: d.lead,
    contact: d.contact,
    assignedTo: toUserRefOrNull(d.assignedTo),
    createdBy: toUserRef(d.createdBy),
    expectedCloseDate: isoOrNull(d.expectedCloseDate),
    closedAt: isoOrNull(d.closedAt),
    lostReason: d.lostReason,
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
  };
}

export const dealSummaryInclude = { stage: { select: { name: true } } } as const;
export function toDealSummary(
  d: Prisma.DealGetPayload<{ include: typeof dealSummaryInclude }>,
): DealSummary {
  return {
    id: d.id,
    title: d.title,
    value: d.value,
    currency: d.currency,
    status: d.status as DealStatus,
    stageId: d.stageId,
    stageName: d.stage.name,
  };
}

// ─── Tasks, notes, activities, notifications ─────────────────────────────────

export const taskInclude = {
  assignedTo: { select: userRefSelect },
  createdBy: { select: userRefSelect },
  relatedLead: { select: { id: true, firstName: true, lastName: true } },
  relatedContact: { select: { id: true, firstName: true, lastName: true } },
  relatedDeal: { select: { id: true, title: true } },
} as const satisfies Prisma.TaskInclude;
export type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

export const isTaskDone = (status: string) => status === 'COMPLETED' || status === 'CANCELLED';

export function toTask(t: TaskRow, now = new Date()): Task {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    type: t.type as TaskType,
    priority: t.priority as TaskPriority,
    status: t.status as TaskStatus,
    dueDate: isoOrNull(t.dueDate),
    completedAt: isoOrNull(t.completedAt),
    isOverdue: !!t.dueDate && t.dueDate < now && !isTaskDone(t.status),
    assignedTo: toUserRefOrNull(t.assignedTo),
    createdBy: toUserRef(t.createdBy),
    relatedLead: t.relatedLead ? { id: t.relatedLead.id, name: fullName(t.relatedLead) } : null,
    relatedContact: t.relatedContact
      ? { id: t.relatedContact.id, name: fullName(t.relatedContact) }
      : null,
    relatedDeal: t.relatedDeal,
    createdAt: iso(t.createdAt),
  };
}

export const noteInclude = {
  createdBy: { select: userRefSelect },
} as const satisfies Prisma.NoteInclude;
export function toNote(n: Prisma.NoteGetPayload<{ include: typeof noteInclude }>): Note {
  return {
    id: n.id,
    content: n.content,
    createdBy: toUserRef(n.createdBy),
    relatedLeadId: n.relatedLeadId,
    relatedContactId: n.relatedContactId,
    relatedDealId: n.relatedDealId,
    createdAt: iso(n.createdAt),
    updatedAt: iso(n.updatedAt),
  };
}

export const activityInclude = {
  performedBy: { select: userRefSelect },
} as const satisfies Prisma.ActivityInclude;
export function toActivity(
  a: Prisma.ActivityGetPayload<{ include: typeof activityInclude }>,
): Activity {
  return {
    id: a.id,
    type: a.type as ActivityType,
    description: a.description,
    metadata:
      a.metadata && typeof a.metadata === 'object' && !Array.isArray(a.metadata)
        ? (a.metadata as Record<string, unknown>)
        : {},
    performedBy: toUserRefOrNull(a.performedBy),
    relatedLeadId: a.relatedLeadId,
    relatedContactId: a.relatedContactId,
    relatedDealId: a.relatedDealId,
    createdAt: iso(a.createdAt),
  };
}

export function toNotification(n: Prisma.NotificationGetPayload<object>): Notification {
  return {
    id: n.id,
    type: n.type as NotificationType,
    title: n.title,
    body: n.body,
    entityType: (n.entityType as Notification['entityType']) ?? null,
    entityId: n.entityId,
    readAt: isoOrNull(n.readAt),
    createdAt: iso(n.createdAt),
  };
}

// ─── AI & workflows ──────────────────────────────────────────────────────────

export function toAiScore(s: Prisma.AiScoreGetPayload<object>): AiScore {
  const factors = Array.isArray(s.factors) ? (s.factors as unknown as ScoringFactor[]) : [];
  return {
    id: s.id,
    leadId: s.leadId,
    score: s.score,
    factors,
    recommendation: s.recommendation,
    modelVersion: s.modelVersion,
    triggeredBy: s.triggeredBy as AiScore['triggeredBy'],
    createdAt: iso(s.createdAt),
  };
}

export const workflowInclude = {
  createdBy: { select: userRefSelect },
} as const satisfies Prisma.WorkflowInclude;
export function toWorkflow(
  w: Prisma.WorkflowGetPayload<{ include: typeof workflowInclude }>,
  stats: { lastRunAt: Date | null; runCount: number },
): Workflow {
  return {
    id: w.id,
    name: w.name,
    description: w.description,
    triggerType: w.triggerType as WorkflowTrigger,
    definition: w.definition as unknown as WorkflowDefinition,
    isActive: w.isActive,
    createdBy: toUserRef(w.createdBy),
    lastRunAt: isoOrNull(stats.lastRunAt),
    runCount: stats.runCount,
    createdAt: iso(w.createdAt),
    updatedAt: iso(w.updatedAt),
  };
}

export function toWorkflowRun(r: Prisma.WorkflowRunGetPayload<object>): WorkflowRun {
  const trigger = (r.triggerEvent ?? {}) as { type?: WorkflowTrigger; entityId?: string };
  return {
    id: r.id,
    workflowId: r.workflowId,
    status: r.status as WorkflowRunStatus,
    triggerEvent: { type: trigger.type as WorkflowTrigger, entityId: trigger.entityId ?? '' },
    actionLogs: Array.isArray(r.actionLogs) ? (r.actionLogs as unknown as WorkflowActionLog[]) : [],
    error: r.error,
    startedAt: iso(r.startedAt),
    finishedAt: isoOrNull(r.finishedAt),
  };
}
