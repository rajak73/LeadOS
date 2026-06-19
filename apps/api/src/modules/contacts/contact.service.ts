// CRM-3.1 — Contact service (CRUD).
// CRM-4.1 — Contact activity feed.
//
// Every mutation that touches tenant data runs inside a single withTenant() transaction.
// ActivityService.append() is called within the SAME transaction for atomicity.
// AuditRecorder runs AFTER the transaction (best-effort separate write — existing pattern).
// Contacts have no lifecycle status machine (unlike leads).

import type { Contact } from '@prisma/client';
import { withTenant } from '../../core/tenancy/with-tenant.js';
import { requireTenantContext } from '../../core/tenancy/context.js';
import { AppError } from '../../core/errors/app-error.js';
import { ErrorCode, PLAN_LIMITS, ActivityType } from '@leados/shared';
import type { CreateContactInput, PatchContactInput } from '@leados/shared';
import type { AuditRecorder } from '../../core/audit/audit-recorder.js';
import { ActivityService, type ActivityPage } from '../../core/activities/activity.service.js';
import { PrismaContactRepository } from './contact.repository.js';

export class ContactService {
  private readonly activityService = new ActivityService();

  constructor(private readonly audit: AuditRecorder) {}

  // ── CRM-3.1: create ────────────────────────────────────────────────────────

  async create(input: CreateContactInput): Promise<Contact> {
    const ctx = requireTenantContext();

    const contact = await withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaContactRepository(db);

      // Plan limit check
      const sub = await db.subscription.findFirst({ select: { plan: true } });
      const plan = (sub?.plan ?? 'TRIAL') as keyof typeof PLAN_LIMITS;
      const limit = PLAN_LIMITS[plan].contacts;
      const count = await repo.count();
      if (count >= limit) {
        throw new AppError(
          ErrorCode.PLAN_LIMIT_EXCEEDED,
          `Contact limit of ${limit} reached for ${plan} plan`,
          { plan, limit, current: count },
        );
      }

      // Email dedup
      if (input.email) {
        const existing = await repo.findByEmail(input.email);
        if (existing !== null) {
          throw new AppError(ErrorCode.CONFLICT, 'A contact with this email already exists', {
            existingContactId: existing.id,
          });
        }
      }

      // Phone dedup
      if (input.phone) {
        const existing = await repo.findByPhone(input.phone);
        if (existing !== null) {
          throw new AppError(ErrorCode.CONFLICT, 'A contact with this phone already exists', {
            existingContactId: existing.id,
          });
        }
      }

      // Create
      const created = await repo.create({ ...input, createdById: ctx.userId });

      // Activity — same transaction
      await this.activityService.append(db, ctx, {
        type: ActivityType.CONTACT_CREATED,
        description: `Contact created: ${created.firstName}${created.lastName ? ` ${created.lastName}` : ''}`,
        metadata: { type: ActivityType.CONTACT_CREATED },
        relatedContactId: created.id,
      });

      return created;
    });

    // Audit — best-effort separate transaction
    await this.audit.record({
      action: 'created',
      resource: 'contact',
      resourceId: contact.id,
      after: sanitizeContact(contact),
    });

    return contact;
  }

  // ── CRM-3.1: getById ───────────────────────────────────────────────────────

  async getById(id: string): Promise<Contact> {
    const ctx = requireTenantContext();
    const ownedByUserId = ctx.ownOnly === true ? ctx.userId : undefined;

    return withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaContactRepository(db);
      return repo.findByIdOrThrow(id, ownedByUserId);
    });
  }

  // ── CRM-3.1: update ────────────────────────────────────────────────────────

  async update(id: string, input: PatchContactInput): Promise<Contact> {
    const ctx = requireTenantContext();
    const ownedByUserId = ctx.ownOnly === true ? ctx.userId : undefined;

    const contact = await withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaContactRepository(db);
      await repo.findByIdOrThrow(id, ownedByUserId); // 404 guard

      const updated = await repo.update(id, input);

      // Activity — track which fields changed
      const changedFields = Object.keys(input).filter(
        (k) => (input as Record<string, unknown>)[k] !== undefined,
      );
      await this.activityService.append(db, ctx, {
        type: ActivityType.CONTACT_UPDATED,
        description: `Contact updated: ${changedFields.join(', ')}`,
        metadata: { type: ActivityType.CONTACT_UPDATED, fields: changedFields },
        relatedContactId: id,
      });

      return updated;
    });

    await this.audit.record({
      action: 'updated',
      resource: 'contact',
      resourceId: id,
      after: sanitizeContact(contact),
    });

    return contact;
  }

  // ── CRM-3.1: softDelete ────────────────────────────────────────────────────

  async softDelete(id: string): Promise<void> {
    const ctx = requireTenantContext();

    await withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaContactRepository(db);
      await repo.findByIdOrThrow(id); // 404 if not found
      await repo.softDelete(id);
    });

    await this.audit.record({
      action: 'deleted',
      resource: 'contact',
      resourceId: id,
    });
  }

  // ── CRM-4.1: listActivities ───────────────────────────────────────────────
  //
  // ownOnly: SALES_EXECUTIVE with contacts.read_own may only see activities for contacts
  // assigned to them. findByIdOrThrow with ownedByUserId enforces this before the fetch.

  async listActivities(contactId: string, page: number, limit: number): Promise<ActivityPage> {
    const ctx = requireTenantContext();
    const ownedByUserId = ctx.ownOnly === true ? ctx.userId : undefined;

    return withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaContactRepository(db);
      await repo.findByIdOrThrow(contactId, ownedByUserId); // 404 guard + ownOnly
      return this.activityService.listForContact(db, contactId, page, limit);
    });
  }
}

// Strip fields that should not appear in audit snapshots
export function sanitizeContact(contact: Contact): Partial<Contact> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { customFields, ...rest } = contact;
  return rest;
}
