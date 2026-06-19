// CRM-4.1 (partial, M2 prerequisite) — append-only activity write path.
//
// ActivityService.append() is a cross-cutting concern used by Lead, Contact, Task, Note,
// and File services. It is built here (before those modules) per the execution plan's
// recommended sequence ("Build ActivityService first, then E2/E3 consume it").
//
// Append is the ONLY write operation. There is no update or delete method — activities are
// immutable by design, enforced by DB triggers (activities_no_update, activities_no_delete)
// AND the absence of those methods here (belt + suspenders per R-S4-6).
//
// The caller passes the already-scoped TenantTransactionClient from their own withTenant
// call so the activity row and the lastActivityAt denormalization happen atomically in the
// same transaction as the domain mutation. Never call this outside a withTenant scope.

import type { Prisma } from '@prisma/client';
import type { TenantTransactionClient } from '../tenancy/with-tenant.js';
import type { TenantContext } from '../tenancy/context.js';
import { asTenantCreate } from '../tenancy/tenant-repository.js';
import type { ActivityAppendInput } from '@leados/shared';

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
}
