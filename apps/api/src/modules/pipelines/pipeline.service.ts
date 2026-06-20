// CRM-8.2 — Pipeline service.
//
// Every mutation that touches tenant data runs inside a single withTenant() transaction.
// Pipeline/stage activity and audit rows are written inside the SAME transaction as the
// mutation so the activity/audit trail cannot drift from the pipeline state.

import type { PipelineStage, Prisma } from '@prisma/client';
import { withTenant, type TenantTransactionClient } from '../../core/tenancy/with-tenant.js';
import { requireTenantContext, type TenantContext } from '../../core/tenancy/context.js';
import { AppError } from '../../core/errors/app-error.js';
import { ActivityType, ErrorCode, PLAN_LIMITS } from '@leados/shared';
import type { CreatePipeline, PatchPipeline, CreateStage, PatchStage, ReorderStages } from '@leados/shared';
import { buildAuditRow, type AuditInput } from '../../core/audit/audit-recorder.js';
import { ActivityService } from '../../core/activities/activity.service.js';
import { asTenantCreate } from '../../core/tenancy/tenant-repository.js';
import {
  PrismaPipelineRepository,
  PrismaPipelineStageRepository,
  type PipelineWithStages,
  type Pipeline,
} from './pipeline.repository.js';

export type { PipelineWithStages };

export class PipelineService {
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

  // ── create ────────────────────────────────────────────────────────────────

  async create(input: CreatePipeline): Promise<PipelineWithStages> {
    const ctx = requireTenantContext();

    const result = await withTenant(ctx.organizationId, async (db) => {
      const pipelineRepo = new PrismaPipelineRepository(db);
      const stageRepo = new PrismaPipelineStageRepository(db);

      // Plan limit
      const sub = await db.subscription.findFirst({ select: { plan: true } });
      const plan = (sub?.plan ?? 'TRIAL') as keyof typeof PLAN_LIMITS;
      const limit = PLAN_LIMITS[plan].pipelines;
      const existingCount = await pipelineRepo.count();
      if (existingCount >= limit) {
        throw new AppError(
          ErrorCode.PLAN_LIMIT_EXCEEDED,
          `Pipeline limit of ${limit} reached for ${plan} plan`,
          { plan, limit, current: existingCount },
        );
      }

      // First pipeline in the org is always the default regardless of caller input.
      const isDefault = existingCount === 0 ? true : (input.isDefault ?? false);

      // Atomically unset existing default before setting new one.
      if (isDefault) {
        await db.pipeline.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      }

      const pipeline = await pipelineRepo.create({ name: input.name, isDefault });

      // Create any initial stages sequentially so order is deterministic.
      const stages: PipelineStage[] = [];
      if (input.stages && input.stages.length > 0) {
        for (const stageInput of input.stages) {
          const stage = await stageRepo.create(pipeline.id, stageInput);
          stages.push(stage);
          await this.activityService.append(db, ctx, {
            type: ActivityType.PIPELINE_STAGE_CREATED,
            description: `Pipeline stage created: ${stage.name}`,
            metadata: {
              type: ActivityType.PIPELINE_STAGE_CREATED,
              pipelineId: pipeline.id,
              stageId: stage.id,
              name: stage.name,
            },
            relatedPipelineId: pipeline.id,
            relatedPipelineStageId: stage.id,
          });
          await this.recordAudit(db, ctx, {
            action: 'created',
            resource: 'pipeline_stage',
            resourceId: stage.id,
            after: { name: stage.name, pipelineId: pipeline.id },
          });
        }
      }

      await this.activityService.append(db, ctx, {
        type: ActivityType.PIPELINE_CREATED,
        description: `Pipeline created: ${pipeline.name}`,
        metadata: {
          type: ActivityType.PIPELINE_CREATED,
          pipelineId: pipeline.id,
          name: pipeline.name,
        },
        relatedPipelineId: pipeline.id,
      });

      await this.recordAudit(db, ctx, {
        action: 'created',
        resource: 'pipeline',
        resourceId: pipeline.id,
        after: { name: pipeline.name, isDefault: pipeline.isDefault },
      });

      return { ...pipeline, stages };
    });

    return result;
  }

  // ── list ──────────────────────────────────────────────────────────────────

  async list(): Promise<PipelineWithStages[]> {
    const ctx = requireTenantContext();
    return withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaPipelineRepository(db);
      return repo.findAll();
    });
  }

  // ── getById ───────────────────────────────────────────────────────────────

  async getById(id: string): Promise<PipelineWithStages> {
    const ctx = requireTenantContext();
    return withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaPipelineRepository(db);
      return repo.findByIdOrThrow(id);
    });
  }

  // ── update ────────────────────────────────────────────────────────────────

  async update(id: string, input: PatchPipeline): Promise<Pipeline> {
    const ctx = requireTenantContext();

    const updated = await withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaPipelineRepository(db);
      const existing = await repo.findByIdOrThrow(id); // 404 guard

      // Atomically unset existing default before setting new one.
      if (input.isDefault === true) {
        await db.pipeline.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      }

      const pipeline = await repo.update(id, input);
      const fields = [
        ...(input.name !== undefined && input.name !== existing.name ? ['name'] : []),
        ...(input.isDefault !== undefined && input.isDefault !== existing.isDefault ? ['isDefault'] : []),
      ];

      await this.activityService.append(db, ctx, {
        type: ActivityType.PIPELINE_UPDATED,
        description: `Pipeline updated: ${pipeline.name}`,
        metadata: {
          type: ActivityType.PIPELINE_UPDATED,
          pipelineId: pipeline.id,
          fields,
        },
        relatedPipelineId: pipeline.id,
      });

      await this.recordAudit(db, ctx, {
        action: 'updated',
        resource: 'pipeline',
        resourceId: id,
        before: { name: existing.name, isDefault: existing.isDefault },
        after: { name: pipeline.name, isDefault: pipeline.isDefault },
      });

      return pipeline;
    });

    return updated;
  }

  // ── delete ────────────────────────────────────────────────────────────────

  async delete(id: string): Promise<void> {
    const ctx = requireTenantContext();

    await withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaPipelineRepository(db);
      const existing = await repo.findByIdOrThrow(id);
      await repo.delete(id); // guards: isDefault check, deal count check

      await this.activityService.append(db, ctx, {
        type: ActivityType.PIPELINE_DELETED,
        description: `Pipeline deleted: ${existing.name}`,
        metadata: {
          type: ActivityType.PIPELINE_DELETED,
          pipelineId: existing.id,
          name: existing.name,
        },
        relatedPipelineId: existing.id,
      });

      await this.recordAudit(db, ctx, {
        action: 'deleted',
        resource: 'pipeline',
        resourceId: id,
        before: { name: existing.name, isDefault: existing.isDefault },
      });
    });
  }

  // ── createStage ───────────────────────────────────────────────────────────

  async createStage(pipelineId: string, input: CreateStage): Promise<PipelineStage> {
    const ctx = requireTenantContext();

    const stage = await withTenant(ctx.organizationId, async (db) => {
      const pipelineRepo = new PrismaPipelineRepository(db);
      const stageRepo = new PrismaPipelineStageRepository(db);

      await pipelineRepo.findByIdOrThrow(pipelineId); // 404 guard on parent
      const stage = await stageRepo.create(pipelineId, input);

      await this.activityService.append(db, ctx, {
        type: ActivityType.PIPELINE_STAGE_CREATED,
        description: `Pipeline stage created: ${stage.name}`,
        metadata: {
          type: ActivityType.PIPELINE_STAGE_CREATED,
          pipelineId,
          stageId: stage.id,
          name: stage.name,
        },
        relatedPipelineId: pipelineId,
        relatedPipelineStageId: stage.id,
      });

      await this.recordAudit(db, ctx, {
        action: 'created',
        resource: 'pipeline_stage',
        resourceId: stage.id,
        after: { name: stage.name, pipelineId },
      });

      return stage;
    });

    return stage;
  }

  // ── updateStage ───────────────────────────────────────────────────────────

  async updateStage(pipelineId: string, stageId: string, input: PatchStage): Promise<PipelineStage> {
    const ctx = requireTenantContext();

    const stage = await withTenant(ctx.organizationId, async (db) => {
      const pipelineRepo = new PrismaPipelineRepository(db);
      const stageRepo = new PrismaPipelineStageRepository(db);

      await pipelineRepo.findByIdOrThrow(pipelineId);
      const existing = await stageRepo.findByIdOrThrow(stageId, pipelineId);
      const updated = await stageRepo.update(stageId, pipelineId, input);
      const fields = [
        ...(input.name !== undefined && input.name !== existing.name ? ['name'] : []),
        ...(input.color !== undefined && input.color !== existing.color ? ['color'] : []),
        ...(input.probability !== undefined && input.probability !== existing.probability ? ['probability'] : []),
        ...(input.isWon !== undefined && input.isWon !== existing.isWon ? ['isWon'] : []),
        ...(input.isLost !== undefined && input.isLost !== existing.isLost ? ['isLost'] : []),
      ];

      await this.activityService.append(db, ctx, {
        type: ActivityType.PIPELINE_STAGE_UPDATED,
        description: `Pipeline stage updated: ${updated.name}`,
        metadata: {
          type: ActivityType.PIPELINE_STAGE_UPDATED,
          pipelineId,
          stageId,
          fields,
        },
        relatedPipelineId: pipelineId,
        relatedPipelineStageId: stageId,
      });

      await this.recordAudit(db, ctx, {
        action: 'updated',
        resource: 'pipeline_stage',
        resourceId: stageId,
        before: { pipelineId, name: existing.name },
        after: { pipelineId, name: updated.name },
      });

      return updated;
    });

    return stage;
  }

  // ── deleteStage ───────────────────────────────────────────────────────────

  async deleteStage(pipelineId: string, stageId: string): Promise<void> {
    const ctx = requireTenantContext();

    await withTenant(ctx.organizationId, async (db) => {
      const pipelineRepo = new PrismaPipelineRepository(db);
      const stageRepo = new PrismaPipelineStageRepository(db);

      await pipelineRepo.findByIdOrThrow(pipelineId);
      const existing = await stageRepo.findByIdOrThrow(stageId, pipelineId);
      await stageRepo.delete(stageId, pipelineId);

      await this.activityService.append(db, ctx, {
        type: ActivityType.PIPELINE_STAGE_DELETED,
        description: `Pipeline stage deleted: ${existing.name}`,
        metadata: {
          type: ActivityType.PIPELINE_STAGE_DELETED,
          pipelineId,
          stageId,
          name: existing.name,
        },
        relatedPipelineId: pipelineId,
        relatedPipelineStageId: stageId,
      });

      await this.recordAudit(db, ctx, {
        action: 'deleted',
        resource: 'pipeline_stage',
        resourceId: stageId,
        before: { pipelineId, name: existing.name },
      });
    });
  }

  // ── reorderStages ─────────────────────────────────────────────────────────

  async reorderStages(pipelineId: string, input: ReorderStages): Promise<PipelineStage[]> {
    const ctx = requireTenantContext();

    const stages = await withTenant(ctx.organizationId, async (db) => {
      const pipelineRepo = new PrismaPipelineRepository(db);
      const stageRepo = new PrismaPipelineStageRepository(db);

      await pipelineRepo.findByIdOrThrow(pipelineId);
      const stages = await stageRepo.reorder(pipelineId, input.stageIds);

      await this.activityService.append(db, ctx, {
        type: ActivityType.PIPELINE_STAGE_REORDERED,
        description: 'Pipeline stages reordered',
        metadata: {
          type: ActivityType.PIPELINE_STAGE_REORDERED,
          pipelineId,
          stageIds: input.stageIds,
        },
        relatedPipelineId: pipelineId,
      });

      await this.recordAudit(db, ctx, {
        action: 'reordered',
        resource: 'pipeline_stages',
        resourceId: pipelineId,
        after: { stageIds: input.stageIds },
      });

      return stages;
    });

    return stages;
  }
}
