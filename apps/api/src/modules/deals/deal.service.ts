// CRM-9.2 — Deal service.
//
// Every mutation runs inside one withTenant() transaction. Deal activity and audit rows are
// written inside that same transaction so the lifecycle trail cannot drift from deal state.

import type { Deal, Prisma } from '@prisma/client';
import { withTenant, type TenantTransactionClient } from '../../core/tenancy/with-tenant.js';
import { requireTenantContext, type TenantContext } from '../../core/tenancy/context.js';
import { AppError } from '../../core/errors/app-error.js';
import { ActivityType, ErrorCode, PLAN_LIMITS } from '@leados/shared';
import type { CreateDeal, DealListQuery, LostDeal, MoveDeal, PatchDeal, BulkDealsInput } from '@leados/shared';
import { buildAuditRow, type AuditInput } from '../../core/audit/audit-recorder.js';
import { ActivityService, type ActivityPage } from '../../core/activities/activity.service.js';
import { asTenantCreate } from '../../core/tenancy/tenant-repository.js';
import { PrismaDealRepository, type ForecastRow } from './deal.repository.js';

export interface DealPage {
  items: Deal[];
  total: number;
}

export class DealService {
  private readonly activityService = new ActivityService();

  private async recordAudit(
    db: TenantTransactionClient,
    ctx: TenantContext,
    input: AuditInput,
  ): Promise<void> {
    const row = buildAuditRow(input, ctx);
    await db.auditLog.create({
      data: asTenantCreate<Prisma.AuditLogUncheckedCreateInput>(row),
    });
  }

  async create(input: CreateDeal): Promise<Deal> {
    const ctx = requireTenantContext();

    return withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaDealRepository(db);

      const sub = await db.subscription.findFirst({ select: { plan: true } });
      const plan = (sub?.plan ?? 'TRIAL') as keyof typeof PLAN_LIMITS;
      const limit = PLAN_LIMITS[plan].deals;
      const current = await repo.count();
      if (current >= limit) {
        throw new AppError(
          ErrorCode.PLAN_LIMIT_EXCEEDED,
          `Deal limit of ${limit} reached for ${plan} plan`,
          { plan, limit, current },
        );
      }

      await repo.assertPipelineExists(input.pipelineId);
      await repo.assertStageBelongsToPipeline(input.pipelineId, input.stageId);
      if (input.leadId !== undefined) await repo.assertLeadVisible(input.leadId);
      if (input.contactId !== undefined) await repo.assertContactVisible(input.contactId);

      const assignedToId = this.resolveCreateAssignee(ctx, input.assignedToId);
      const deal = await repo.create({ ...input, assignedToId, createdById: ctx.userId });

      await this.activityService.append(db, ctx, {
        type: ActivityType.DEAL_CREATED,
        description: `Deal created: ${deal.title}`,
        metadata: {
          type: ActivityType.DEAL_CREATED,
          dealId: deal.id,
          dealTitle: deal.title,
          pipelineId: deal.pipelineId,
          stageId: deal.stageId,
          ...(deal.value !== null ? { value: deal.value.toString() } : {}),
        },
        relatedDealId: deal.id,
      });

      await this.recordAudit(db, ctx, {
        action: 'created',
        resource: 'deal',
        resourceId: deal.id,
        after: sanitizeDeal(deal),
      });

      return deal;
    });
  }

  async list(query: DealListQuery): Promise<DealPage> {
    const ctx = requireTenantContext();
    const ownedByUserId = ctx.ownOnly === true ? ctx.userId : undefined;

    return withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaDealRepository(db);
      return repo.findManyWithFilter(query, ownedByUserId);
    });
  }

  async getById(id: string): Promise<Deal> {
    const ctx = requireTenantContext();
    const ownedByUserId = ctx.ownOnly === true ? ctx.userId : undefined;

    return withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaDealRepository(db);
      return repo.findByIdOrThrow(id, ownedByUserId);
    });
  }

  async update(id: string, input: PatchDeal): Promise<Deal> {
    const ctx = requireTenantContext();
    const ownedByUserId = ctx.ownOnly === true ? ctx.userId : undefined;

    return withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaDealRepository(db);
      const existing = await repo.findByIdOrThrow(id, ownedByUserId);
      this.assertAssignmentAllowed(ctx, input.assignedToId, existing.assignedToId);

      const deal = await repo.update(id, input);
      const fields = changedFields(input, existing, deal);

      await this.activityService.append(db, ctx, {
        type: ActivityType.DEAL_UPDATED,
        description: `Deal updated: ${deal.title}`,
        metadata: {
          type: ActivityType.DEAL_UPDATED,
          dealId: deal.id,
          fields,
        },
        relatedDealId: deal.id,
      });

      await this.recordAudit(db, ctx, {
        action: 'updated',
        resource: 'deal',
        resourceId: id,
        before: sanitizeDeal(existing),
        after: sanitizeDeal(deal),
      });

      return deal;
    });
  }

  async move(id: string, input: MoveDeal): Promise<Deal> {
    const ctx = requireTenantContext();
    const ownedByUserId = ctx.ownOnly === true ? ctx.userId : undefined;

    return withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaDealRepository(db);
      const existing = await repo.findByIdOrThrow(id, ownedByUserId);
      await repo.assertStageBelongsToPipeline(existing.pipelineId, input.stageId);
      const deal = await repo.moveToStage(id, input.stageId);

      await this.activityService.append(db, ctx, {
        type: ActivityType.DEAL_STAGE_MOVED,
        description: `Deal moved: ${deal.title}`,
        metadata: {
          type: ActivityType.DEAL_STAGE_MOVED,
          dealId: deal.id,
          fromStageId: existing.stageId,
          toStageId: input.stageId,
        },
        relatedDealId: deal.id,
      });

      await this.recordAudit(db, ctx, {
        action: 'moved',
        resource: 'deal',
        resourceId: id,
        before: { stageId: existing.stageId },
        after: { stageId: deal.stageId },
      });

      return deal;
    });
  }

  async markWon(id: string): Promise<Deal> {
    const ctx = requireTenantContext();
    const ownedByUserId = ctx.ownOnly === true ? ctx.userId : undefined;

    return withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaDealRepository(db);
      await repo.findByIdOrThrow(id, ownedByUserId);
      const deal = await repo.markWon(id);

      await this.activityService.append(db, ctx, {
        type: ActivityType.DEAL_WON,
        description: `Deal won: ${deal.title}`,
        metadata: {
          type: ActivityType.DEAL_WON,
          dealId: deal.id,
        },
        relatedDealId: deal.id,
      });

      await this.recordAudit(db, ctx, {
        action: 'won',
        resource: 'deal',
        resourceId: id,
        after: { status: deal.status, closedAt: deal.closedAt },
      });

      return deal;
    });
  }

  async markLost(id: string, input: LostDeal): Promise<Deal> {
    const ctx = requireTenantContext();
    const ownedByUserId = ctx.ownOnly === true ? ctx.userId : undefined;

    return withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaDealRepository(db);
      await repo.findByIdOrThrow(id, ownedByUserId);
      const deal = await repo.markLost(id, input.reason);

      await this.activityService.append(db, ctx, {
        type: ActivityType.DEAL_LOST,
        description: `Deal lost: ${deal.title}`,
        metadata: {
          type: ActivityType.DEAL_LOST,
          dealId: deal.id,
          ...(input.reason !== undefined ? { lostReason: input.reason } : {}),
        },
        relatedDealId: deal.id,
      });

      await this.recordAudit(db, ctx, {
        action: 'lost',
        resource: 'deal',
        resourceId: id,
        after: { status: deal.status, closedAt: deal.closedAt, lostReason: deal.lostReason },
      });

      return deal;
    });
  }

  async delete(id: string): Promise<void> {
    const ctx = requireTenantContext();

    await withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaDealRepository(db);
      const existing = await repo.findByIdOrThrow(id);
      await repo.softDelete(id);

      await this.recordAudit(db, ctx, {
        action: 'deleted',
        resource: 'deal',
        resourceId: id,
        before: sanitizeDeal(existing),
      });
    });
  }

  async forecast(pipelineId?: string): Promise<ForecastRow[]> {
    const ctx = requireTenantContext();
    if (ctx.ownOnly === true) {
      throw AppError.forbidden('Missing permission: deals.read');
    }

    return withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaDealRepository(db);
      if (pipelineId !== undefined) {
        await repo.assertPipelineExists(pipelineId);
      }
      return repo.getWeightedForecast(pipelineId);
    });
  }

  async listActivities(dealId: string, page: number, limit: number): Promise<ActivityPage> {
    const ctx = requireTenantContext();
    const ownedByUserId = ctx.ownOnly === true ? ctx.userId : undefined;

    return withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaDealRepository(db);
      await repo.findByIdOrThrow(dealId, ownedByUserId);
      return this.activityService.listForDeal(db, dealId, page, limit);
    });
  }

  private resolveCreateAssignee(ctx: TenantContext, requested?: string): string | null {
    if (requested === undefined) {
      return this.hasPermission(ctx, 'deals.assign') ? null : ctx.userId;
    }

    this.assertAssignmentAllowed(ctx, requested, null);
    return requested;
  }

  private assertAssignmentAllowed(
    ctx: TenantContext,
    requested: string | undefined,
    current: string | null,
  ): void {
    if (requested === undefined || requested === current) return;
    if (this.hasPermission(ctx, 'deals.assign')) return;
    if (requested === ctx.userId) return;

    throw AppError.forbidden('Missing permission: deals.assign');
  }

  private hasPermission(ctx: TenantContext, permission: string): boolean {
    if (ctx.isSuperAdmin) return true;
    return ctx.permissions?.includes(permission) ?? false;
  }

  async bulk(input: BulkDealsInput): Promise<void> {
    const ctx = requireTenantContext();
    const ownedByUserId = ctx.ownOnly === true ? ctx.userId : undefined;

    await withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaDealRepository(db);

      for (const id of input.ids) {
        const existing = await repo.findByIdOrThrow(id, ownedByUserId);

        if (input.action === 'update-stage') {
          const stageId = input.stageId;
          if (!stageId) {
            throw new AppError(ErrorCode.VALIDATION_ERROR, 'stageId is required for update-stage action');
          }
          await repo.assertStageBelongsToPipeline(existing.pipelineId, stageId);
          const deal = await repo.moveToStage(id, stageId);

          await this.activityService.append(db, ctx, {
            type: ActivityType.DEAL_STAGE_MOVED,
            description: `Deal moved: ${deal.title} (Bulk)`,
            metadata: {
              type: ActivityType.DEAL_STAGE_MOVED,
              dealId: deal.id,
              fromStageId: existing.stageId,
              toStageId: stageId,
            },
            relatedDealId: deal.id,
          });

          await this.recordAudit(db, ctx, {
            action: 'moved',
            resource: 'deal',
            resourceId: id,
            before: { stageId: existing.stageId },
            after: { stageId: deal.stageId },
          });
        } else if (input.action === 'assign') {
          const assignedToId = input.assignedToId;
          this.assertAssignmentAllowed(ctx, assignedToId ?? undefined, existing.assignedToId);

          if (assignedToId !== existing.assignedToId) {
            const deal = await repo.update(id, { assignedToId: assignedToId ?? undefined });
            const fields = changedFields({ assignedToId: assignedToId ?? undefined }, existing, deal);

            await this.activityService.append(db, ctx, {
              type: ActivityType.DEAL_UPDATED,
              description: `Deal updated: ${deal.title} (Bulk)`,
              metadata: {
                type: ActivityType.DEAL_UPDATED,
                dealId: deal.id,
                fields,
              },
              relatedDealId: deal.id,
            });

            await this.recordAudit(db, ctx, {
              action: 'updated',
              resource: 'deal',
              resourceId: id,
              before: sanitizeDeal(existing),
              after: sanitizeDeal(deal),
            });
          }
        } else if (input.action === 'delete') {
          const hasDelete = ctx.isSuperAdmin || ctx.permissions?.includes('deals.delete');
          if (!hasDelete) {
            throw AppError.forbidden('Missing permission: deals.delete');
          }
          await repo.softDelete(id);
          
          await this.recordAudit(db, ctx, {
            action: 'deleted',
            resource: 'deal',
            resourceId: id,
            before: sanitizeDeal(existing),
          });
        }
      }
    });
  }
}

export function sanitizeDeal(deal: Deal): Record<string, unknown> {
  return {
    id: deal.id,
    title: deal.title,
    value: deal.value?.toString() ?? null,
    currency: deal.currency,
    pipelineId: deal.pipelineId,
    stageId: deal.stageId,
    leadId: deal.leadId,
    contactId: deal.contactId,
    assignedToId: deal.assignedToId,
    createdById: deal.createdById,
    status: deal.status,
    closedAt: deal.closedAt?.toISOString() ?? null,
    lostReason: deal.lostReason,
    expectedCloseDate: deal.expectedCloseDate?.toISOString() ?? null,
    deletedAt: deal.deletedAt?.toISOString() ?? null,
  };
}

function changedFields(input: PatchDeal, before: Deal, after: Deal): string[] {
  return [
    ...(input.title !== undefined && input.title !== before.title ? ['title'] : []),
    ...(input.value !== undefined && after.value?.toString() !== before.value?.toString() ? ['value'] : []),
    ...(input.currency !== undefined && input.currency !== before.currency ? ['currency'] : []),
    ...(input.assignedToId !== undefined && input.assignedToId !== before.assignedToId ? ['assignedToId'] : []),
    ...(input.expectedCloseDate !== undefined &&
    after.expectedCloseDate?.toISOString() !== before.expectedCloseDate?.toISOString()
      ? ['expectedCloseDate']
      : []),
    ...(input.customFields !== undefined ? ['customFields'] : []),
  ];
}
