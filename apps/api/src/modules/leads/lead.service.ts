// CRM-2.2 + CRM-2.3 — Lead service (CRUD + status machine).
//
// Every mutation that touches tenant data runs inside a single withTenant() transaction.
// The ActivityService.append() is called within the SAME transaction (atomicity) so an
// activity row is never orphaned if the parent mutation fails.
// The AuditRecorder runs AFTER the transaction (best-effort separate write — existing pattern).

import type { Lead } from '@prisma/client';
import { withTenant } from '../../core/tenancy/with-tenant.js';
import { requireTenantContext, type TenantContext } from '../../core/tenancy/context.js';
import { AppError } from '../../core/errors/app-error.js';
import { ErrorCode, PLAN_LIMITS, ActivityType } from '@leados/shared';
import type { CreateLeadInput, PatchLeadInput } from '@leados/shared';
import type { AuditRecorder } from '../../core/audit/audit-recorder.js';
import { ActivityService } from '../../core/activities/activity.service.js';
import { PrismaLeadRepository } from './lead.repository.js';

// ─── Status machine ─────────────────────────────────────────────────────────

function assertValidStatusTransition(current: string, next: string): void {
  // WON is only set by convert() — never via direct PATCH
  if (next === 'WON') {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Status WON requires the convert() operation', {
      code: 'INVALID_STATUS_TRANSITION',
      from: current,
      to: next,
    });
  }
  // Terminal states cannot transition
  if (current === 'WON' || current === 'LOST') {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `Cannot transition from terminal status ${current}`,
      { code: 'INVALID_STATUS_TRANSITION', from: current, to: next },
    );
  }
  // Any open state → any open state (forward or backtrack) is allowed
  // Any open state → LOST is allowed
  // These are already covered by exclusions above; nothing more to check.
}

// ─── Service ────────────────────────────────────────────────────────────────

export class LeadService {
  private readonly activityService = new ActivityService();

  constructor(private readonly audit: AuditRecorder) {}

  // ── CRM-2.2: create ────────────────────────────────────────────────────────

  async create(input: CreateLeadInput): Promise<Lead> {
    const ctx = requireTenantContext();

    const lead = await withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaLeadRepository(db);

      // Plan limit check
      const sub = await db.subscription.findFirst({ select: { plan: true } });
      const plan = (sub?.plan ?? 'TRIAL') as keyof typeof PLAN_LIMITS;
      const limit = PLAN_LIMITS[plan].leads;
      const count = await repo.count();
      if (count >= limit) {
        throw new AppError(
          ErrorCode.PLAN_LIMIT_EXCEEDED,
          `Lead limit of ${limit} reached for ${plan} plan`,
          { plan, limit, current: count },
        );
      }

      // Email dedup
      if (input.email) {
        const existing = await repo.findByEmail(input.email);
        if (existing !== null) {
          throw new AppError(ErrorCode.CONFLICT, 'A lead with this email already exists', {
            existingLeadId: existing.id,
          });
        }
      }

      // Create
      const created = await repo.create({ ...input, createdById: ctx.userId });

      // Activity — same transaction
      await this.activityService.append(db, ctx, {
        type: ActivityType.LEAD_CREATED,
        description: `Lead created: ${created.firstName}${created.lastName ? ` ${created.lastName}` : ''}`,
        metadata: { type: ActivityType.LEAD_CREATED, source: created.source },
        relatedLeadId: created.id,
      });

      return created;
    });

    // Audit — best-effort separate transaction
    await this.audit.record({
      action: 'created',
      resource: 'lead',
      resourceId: lead.id,
      after: sanitizeLead(lead),
    });

    return lead;
  }

  // ── CRM-2.2: getById ───────────────────────────────────────────────────────

  async getById(id: string): Promise<Lead> {
    const ctx = requireTenantContext();
    const ownedByUserId = ctx.ownOnly === true ? ctx.userId : undefined;

    return withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaLeadRepository(db);
      return repo.findByIdOrThrow(id, ownedByUserId);
    });
  }

  // ── CRM-2.2 + CRM-2.3: update ─────────────────────────────────────────────

  async update(id: string, input: PatchLeadInput): Promise<Lead> {
    const ctx = requireTenantContext();
    const ownedByUserId = ctx.ownOnly === true ? ctx.userId : undefined;

    const lead = await withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaLeadRepository(db);
      const existing = await repo.findByIdOrThrow(id, ownedByUserId);

      // Status machine validation
      if (input.status !== undefined && input.status !== existing.status) {
        assertValidStatusTransition(existing.status, input.status);

        // LOST requires lostReason
        if (input.status === 'LOST' && !input.lostReason && !existing.lostReason) {
          throw new AppError(ErrorCode.VALIDATION_ERROR, 'lostReason is required when status is LOST', {
            field: 'lostReason',
          });
        }
      }

      const updated = await repo.update(id, input);

      // Activity: status change
      if (input.status !== undefined && input.status !== existing.status) {
        await this.activityService.append(db, ctx, {
          type: ActivityType.LEAD_STATUS_CHANGED,
          description: `Status changed from ${existing.status} to ${input.status}`,
          metadata: {
            type: ActivityType.LEAD_STATUS_CHANGED,
            from: existing.status,
            to: input.status,
          },
          relatedLeadId: id,
        });
      }

      // Activity: assignment change
      if (
        input.assignedToId !== undefined &&
        input.assignedToId !== existing.assignedToId
      ) {
        await this.activityService.append(db, ctx, {
          type: ActivityType.LEAD_ASSIGNED,
          description: `Lead ${input.assignedToId ? 'assigned' : 'unassigned'}`,
          metadata: {
            type: ActivityType.LEAD_ASSIGNED,
            assignedToUserId: input.assignedToId ?? null,
            previousUserId: existing.assignedToId ?? null,
          },
          relatedLeadId: id,
        });
      }

      return updated;
    });

    await this.audit.record({
      action: 'updated',
      resource: 'lead',
      resourceId: id,
      after: sanitizeLead(lead),
    });

    return lead;
  }

  // ── CRM-2.2: softDelete ────────────────────────────────────────────────────

  async softDelete(id: string): Promise<void> {
    const ctx = requireTenantContext();

    await withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaLeadRepository(db);
      await repo.findByIdOrThrow(id); // 404 if not found
      await repo.softDelete(id);
    });

    await this.audit.record({
      action: 'deleted',
      resource: 'lead',
      resourceId: id,
    });
  }
}

// Strip fields that should not appear in audit snapshots
function sanitizeLead(lead: Lead): Partial<Lead> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { customFields, ...rest } = lead;
  return rest;
}

// Re-export TenantContext so callers can use it without an extra import
export type { TenantContext };
