// CRM-4.1 (partial, M2 prerequisite) — append-only activity write path.
// CRM-4.1 (M4 complete) — activity read path (listForLead, listForContact).
//
// ActivityService.append() is a cross-cutting concern used by Lead, Contact, Task, Note,
// and File services. It is built here (before those modules) per the execution plan's
// recommended sequence ("Build ActivityService first, then E2/E3 consume it").
//
// Append is the ONLY write operation. There is no update or delete method — activities are
// immutable by design, enforced by DB triggers (activities_no_update, activities_no_delete)
// AND the absence of those methods here (belt + suspenders per R-S4-6).
//
// Read methods (listForLead, listForContact) take the caller's TenantTransactionClient so
// they can run in the same transaction scope as the surrounding withTenant callback.
// Ordering: createdAt DESC (newest activity first).

import type { Prisma, Activity } from '@prisma/client';
import type { TenantTransactionClient } from '../tenancy/with-tenant.js';
import type { TenantContext } from '../tenancy/context.js';
import { asTenantCreate } from '../tenancy/tenant-repository.js';
import type { ActivityAppendInput } from '@leados/shared';

export interface ActivityPage {
  items: Activity[];
  total: number;
}

export class ActivityService {
  async append(
    db: TenantTransactionClient,
    ctx: TenantContext,
    input: Omit<ActivityAppendInput, 'organizationId'>,
  ): Promise<void> {
    // Insert the activity row. organizationId is injected by the tenant extension.
    await db.activity.create({
      data: asTenantCreate<Prisma.ActivityUncheckedCreateInput>({
        type: input.type,
        description: input.description,
        metadata: input.metadata as unknown as Prisma.InputJsonValue,
        performedById: input.performedById ?? ctx.userId,
        relatedLeadId: input.relatedLeadId ?? null,
        relatedContactId: input.relatedContactId ?? null,
        relatedDealId: input.relatedDealId ?? null,
        relatedPipelineId: input.relatedPipelineId ?? null,
        relatedPipelineStageId: input.relatedPipelineStageId ?? null,
        relatedConversationId: input.relatedConversationId ?? null,
      }),
    });

    // Write-through lastActivityAt denormalization — same transaction, same consistency.
    if (input.relatedLeadId) {
      await db.lead.update({
        where: { id: input.relatedLeadId },
        data: { lastActivityAt: new Date() },
      });
    }
    if (input.relatedContactId) {
      await db.contact.update({
        where: { id: input.relatedContactId },
        data: { lastActivityAt: new Date() },
      });
    }
  }

  // ── CRM-4.1: activity read path ────────────────────────────────────────────
  //
  // Both list methods receive the caller's TenantTransactionClient (already inside a
  // withTenant callback) so they are automatically scoped to the current tenant.
  // The caller is responsible for verifying the entity exists (and enforcing ownOnly)
  // before calling these methods.

  async listForLead(
    db: TenantTransactionClient,
    leadId: string,
    page: number,
    limit: number,
  ): Promise<ActivityPage> {
    const where = { relatedLeadId: leadId };
    const total = await db.activity.count({ where });
    const items = await db.activity.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total };
  }

  async listForContact(
    db: TenantTransactionClient,
    contactId: string,
    page: number,
    limit: number,
  ): Promise<ActivityPage> {
    const where = { relatedContactId: contactId };
    const total = await db.activity.count({ where });
    const items = await db.activity.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total };
  }

  async listForDeal(
    db: TenantTransactionClient,
    dealId: string,
    page: number,
    limit: number,
  ): Promise<ActivityPage> {
    const where = { relatedDealId: dealId };
    const total = await db.activity.count({ where });
    const items = await db.activity.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total };
  }
}
