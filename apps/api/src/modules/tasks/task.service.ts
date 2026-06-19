// CRM-4.2 — Task service.
//
// Status machine (enforced here, not in the schema or repository):
//   PENDING    → IN_PROGRESS  ✅
//   PENDING    → CANCELLED    ✅
//   IN_PROGRESS→ COMPLETED    ✅  (server sets completedAt = now(), emits TASK_COMPLETED)
//   IN_PROGRESS→ CANCELLED    ✅  (emits TASK_CANCELLED)
//   PENDING    → COMPLETED    ❌  no-skip, 422 INVALID_STATUS_TRANSITION
//   COMPLETED  → *            ❌  terminal
//   CANCELLED  → *            ❌  terminal
//
// Activity emission guard: the activities table has a DB CHECK constraint requiring at least
// one of (relatedLeadId, relatedContactId, relatedDealId) to be non-null. Tasks can be
// created without a related entity, so we skip activity emission rather than fail.
//
// exactOptionalPropertyTypes: conditional spreads produce `string | undefined` in the
// inferred type, which is not assignable to ActivityAppendInput's `relatedLeadId?: string`.
// The `as Omit<ActivityAppendInput, 'organizationId'>` cast is safe because:
//   (a) we are inside the `hasEntityFk` guard, so at least one FK is non-null, and
//   (b) the conditional spread guarantees only defined keys are included.

import type { Task } from '@prisma/client';
import { withTenant } from '../../core/tenancy/with-tenant.js';
import { requireTenantContext } from '../../core/tenancy/context.js';
import { AppError } from '../../core/errors/app-error.js';
import { ErrorCode, ActivityType } from '@leados/shared';
import type { CreateTaskInput, PatchTaskInput, ActivityAppendInput } from '@leados/shared';
import type { AuditRecorder } from '../../core/audit/audit-recorder.js';
import { ActivityService } from '../../core/activities/activity.service.js';
import { PrismaTaskRepository, type TaskUpdateData } from './task.repository.js';

type AppendInput = Omit<ActivityAppendInput, 'organizationId'>;

// Allowed next states per current state — terminal states map to empty arrays.
const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  PENDING: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

function assertValidTaskTransition(current: string, next: string): void {
  const allowed = ALLOWED_TRANSITIONS[current] ?? [];
  if (!(allowed as string[]).includes(next)) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `Cannot transition task from ${current} to ${next}`,
      { code: 'INVALID_STATUS_TRANSITION', from: current, to: next },
    );
  }
}

export class TaskService {
  private readonly activityService = new ActivityService();

  constructor(private readonly audit: AuditRecorder) {}

  // ── CRM-4.2: create ────────────────────────────────────────────────────────

  async create(input: CreateTaskInput): Promise<Task> {
    const ctx = requireTenantContext();

    const task = await withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaTaskRepository(db);
      const created = await repo.create({ ...input, createdById: ctx.userId });

      const hasEntityFk = created.relatedLeadId !== null || created.relatedContactId !== null;
      if (hasEntityFk) {
        await this.activityService.append(db, ctx, {
          type: ActivityType.TASK_CREATED,
          description: `Task created: ${created.title}`,
          metadata: { type: ActivityType.TASK_CREATED, taskId: created.id, taskTitle: created.title },
          ...(created.relatedLeadId !== null ? { relatedLeadId: created.relatedLeadId } : {}),
          ...(created.relatedContactId !== null ? { relatedContactId: created.relatedContactId } : {}),
        } as AppendInput);
      }

      return created;
    });

    await this.audit.record({
      action: 'created',
      resource: 'task',
      resourceId: task.id,
      after: task,
    });

    return task;
  }

  // ── CRM-4.2: getById ───────────────────────────────────────────────────────
  // No ownOnly for reads: SALES_EXECUTIVE has tasks.read (not tasks.read_own).

  async getById(id: string): Promise<Task> {
    const ctx = requireTenantContext();

    return withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaTaskRepository(db);
      return repo.findByIdOrThrow(id);
    });
  }

  // ── CRM-4.2 + CRM-4.3: update (status machine) ────────────────────────────

  async update(id: string, input: PatchTaskInput): Promise<Task> {
    const ctx = requireTenantContext();
    // ownOnly: SALES_EXECUTIVE holds tasks.update_own; only their assigned tasks are visible
    const ownedByUserId = ctx.ownOnly === true ? ctx.userId : undefined;

    const task = await withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaTaskRepository(db);
      const existing = await repo.findByIdOrThrow(id, ownedByUserId);

      if (input.status !== undefined && input.status !== existing.status) {
        assertValidTaskTransition(existing.status, input.status);
      }

      // Server sets completedAt when transitioning INTO COMPLETED; clears it otherwise.
      const completedAt: Date | null | undefined =
        input.status === 'COMPLETED' ? new Date()
        : input.status !== undefined ? null
        : undefined;

      // Cast is safe: PatchTaskInput values are Zod-validated, and TaskUpdateData is a
      // superset with the same optional field shapes plus completedAt.
      const updated = await repo.update(id, { ...input, completedAt } as TaskUpdateData);

      const hasEntityFk = updated.relatedLeadId !== null || updated.relatedContactId !== null;
      if (input.status === 'COMPLETED' && hasEntityFk) {
        await this.activityService.append(db, ctx, {
          type: ActivityType.TASK_COMPLETED,
          description: `Task completed: ${updated.title}`,
          metadata: { type: ActivityType.TASK_COMPLETED, taskId: updated.id },
          ...(updated.relatedLeadId !== null ? { relatedLeadId: updated.relatedLeadId } : {}),
          ...(updated.relatedContactId !== null ? { relatedContactId: updated.relatedContactId } : {}),
        } as AppendInput);
      } else if (input.status === 'CANCELLED' && hasEntityFk) {
        await this.activityService.append(db, ctx, {
          type: ActivityType.TASK_CANCELLED,
          description: `Task cancelled: ${updated.title}`,
          metadata: { type: ActivityType.TASK_CANCELLED, taskId: updated.id },
          ...(updated.relatedLeadId !== null ? { relatedLeadId: updated.relatedLeadId } : {}),
          ...(updated.relatedContactId !== null ? { relatedContactId: updated.relatedContactId } : {}),
        } as AppendInput);
      }

      return updated;
    });

    await this.audit.record({
      action: 'updated',
      resource: 'task',
      resourceId: id,
      after: task,
    });

    return task;
  }

  // ── CRM-4.2: softDelete ────────────────────────────────────────────────────

  async softDelete(id: string): Promise<void> {
    const ctx = requireTenantContext();

    await withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaTaskRepository(db);
      await repo.findByIdOrThrow(id);
      await repo.softDelete(id);
    });

    await this.audit.record({
      action: 'deleted',
      resource: 'task',
      resourceId: id,
    });
  }
}
