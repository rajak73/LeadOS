// CRM-2.2 + CRM-2.3 — Lead service (CRUD + status machine).
// CRM-3.2 — Lead→Contact conversion (atomic).
// CRM-4.1 — Lead activity feed.
// CRM-5.1 — Lead notes sub-resource.
// CRM-5.2 — Lead files sub-resource.
//
// Every mutation that touches tenant data runs inside a single withTenant() transaction.
// The ActivityService.append() is called within the SAME transaction (atomicity) so an
// activity row is never orphaned if the parent mutation fails.
// The AuditRecorder runs AFTER the transaction (best-effort separate write — existing pattern).
//
// convert() is placed here (not in contact.service.ts) per the execution plan: the lead is
// the entity transitioning state (NEW/CONTACTED/... → WON). The contact creation is a side
// effect of that transition. PrismaContactRepository is imported here as a sanctioned
// cross-module repository reference; both repos share the same TenantTransactionClient (db)
// so the entire operation is atomic.

import type { Lead, Contact } from '@prisma/client';
import { withTenant } from '../../core/tenancy/with-tenant.js';
import { requireTenantContext, type TenantContext } from '../../core/tenancy/context.js';
import { AppError } from '../../core/errors/app-error.js';
import { ErrorCode, PLAN_LIMITS, ActivityType } from '@leados/shared';
import type { CreateLeadInput, PatchLeadInput } from '@leados/shared';
import type { AuditRecorder } from '../../core/audit/audit-recorder.js';
import { ActivityService, type ActivityPage } from '../../core/activities/activity.service.js';
import { PrismaLeadRepository } from './lead.repository.js';
import { PrismaContactRepository } from '../contacts/contact.repository.js';
import { sanitizeContact } from '../contacts/contact.service.js';
import { NoteService, type NotePage } from '../notes/note.service.js';
import { FileService, type FileResponse } from '../files/file.service.js';

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
  private readonly noteService: NoteService;
  private readonly fileService: FileService;

  constructor(private readonly audit: AuditRecorder) {
    this.noteService = new NoteService(audit);
    this.fileService = new FileService(audit);
  }

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

  // ── CRM-3.2: convert (lead → contact, atomic) ──────────────────────────────
  //
  // All 8 steps run inside a single withTenant transaction. If any step throws,
  // Prisma rolls back the entire transaction — no orphaned contacts, no leads
  // stuck in WON status. Both activity rows are also rolled back on failure.
  //
  // Cross-module note: PrismaContactRepository is imported here (not in contact.service.ts)
  // because the execution plan places convert() in the leads module and the operation
  // must share the same TenantTransactionClient as the lead mutation.

  async convert(leadId: string): Promise<{ lead: Lead; contact: Contact }> {
    const ctx = requireTenantContext();
    const ownedByUserId = ctx.ownOnly === true ? ctx.userId : undefined;

    const result = await withTenant(ctx.organizationId, async (db) => {
      const leadRepo = new PrismaLeadRepository(db);
      const contactRepo = new PrismaContactRepository(db);

      // Step 1: Load lead (ownOnly respected — SALES_EXECUTIVE can only convert assigned leads)
      const lead = await leadRepo.findByIdOrThrow(leadId, ownedByUserId);

      // Step 2: Guard — already converted
      if (lead.status === 'WON' || lead.convertedToContactId !== null) {
        throw new AppError(ErrorCode.CONFLICT, 'Lead has already been converted', {
          leadId,
          convertedToContactId: lead.convertedToContactId,
        });
      }

      // Step 3: Contact plan limit check
      const sub = await db.subscription.findFirst({ select: { plan: true } });
      const plan = (sub?.plan ?? 'TRIAL') as keyof typeof PLAN_LIMITS;
      const contactLimit = PLAN_LIMITS[plan].contacts;
      const contactCount = await contactRepo.count();
      if (contactCount >= contactLimit) {
        throw new AppError(
          ErrorCode.PLAN_LIMIT_EXCEEDED,
          `Contact limit of ${contactLimit} reached for ${plan} plan`,
          { plan, limit: contactLimit, current: contactCount },
        );
      }

      // Step 4: Create contact from lead fields
      const contact = await contactRepo.create({
        firstName: lead.firstName,
        lastName: lead.lastName ?? undefined,
        email: lead.email ?? undefined,
        phone: lead.phone ?? undefined,
        tags: lead.tags,
        customFields: (lead.customFields as Record<string, unknown>) ?? undefined,
        assignedToId: lead.assignedToId ?? undefined,
        createdFromLeadId: lead.id,
        createdById: ctx.userId,
      });

      // Step 5: Update lead — status=WON, convertedToContactId set
      // Uses db.lead.update() directly (bypassing PatchLeadInput's WON exclusion, which is
      // an HTTP-boundary concern). This is the ONLY code path that may set status=WON.
      const updatedLead = await db.lead.update({
        where: { id: leadId },
        data: {
          status: 'WON',
          convertedToContactId: contact.id,
        },
      });

      // Step 6: Emit LEAD_WON activity (relatedLeadId — also updates lead.lastActivityAt)
      await this.activityService.append(db, ctx, {
        type: ActivityType.LEAD_WON,
        description: `Lead converted to contact: ${contact.firstName}${contact.lastName ? ` ${contact.lastName}` : ''}`,
        metadata: { type: ActivityType.LEAD_WON, convertedToContactId: contact.id },
        relatedLeadId: lead.id,
      });

      // Step 7: Emit CONTACT_CREATED activity (relatedContactId — also updates contact.lastActivityAt)
      await this.activityService.append(db, ctx, {
        type: ActivityType.CONTACT_CREATED,
        description: `Contact created from lead conversion`,
        metadata: { type: ActivityType.CONTACT_CREATED, createdFromLeadId: lead.id },
        relatedContactId: contact.id,
      });

      return { lead: updatedLead, contact };
    });

    // Post-transaction audit (best-effort, separate transactions)
    await this.audit.record({
      action: 'converted',
      resource: 'lead',
      resourceId: leadId,
      after: sanitizeLead(result.lead),
    });
    await this.audit.record({
      action: 'created',
      resource: 'contact',
      resourceId: result.contact.id,
      after: sanitizeContact(result.contact),
    });

    return result;
  }

  // ── CRM-4.1: listActivities ───────────────────────────────────────────────

  async listActivities(leadId: string, page: number, limit: number): Promise<ActivityPage> {
    const ctx = requireTenantContext();
    const ownedByUserId = ctx.ownOnly === true ? ctx.userId : undefined;

    return withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaLeadRepository(db);
      await repo.findByIdOrThrow(leadId, ownedByUserId); // 404 guard + ownOnly
      return this.activityService.listForLead(db, leadId, page, limit);
    });
  }

  // ── CRM-5.1: listNotes ───────────────────────────────────────────────────

  async listNotes(leadId: string, page: number, limit: number): Promise<NotePage> {
    const ctx = requireTenantContext();
    const ownedByUserId = ctx.ownOnly === true ? ctx.userId : undefined;

    await withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaLeadRepository(db);
      await repo.findByIdOrThrow(leadId, ownedByUserId); // 404 guard + ownOnly
    });

    return this.noteService.listForLead(leadId, page, limit);
  }

  // ── CRM-5.2: listFiles ───────────────────────────────────────────────────

  async listFiles(leadId: string, page: number, limit: number): Promise<{ items: FileResponse[]; total: number }> {
    const ctx = requireTenantContext();
    const ownedByUserId = ctx.ownOnly === true ? ctx.userId : undefined;

    await withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaLeadRepository(db);
      await repo.findByIdOrThrow(leadId, ownedByUserId); // 404 guard + ownOnly
    });

    return this.fileService.listForLead(leadId, page, limit);
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
