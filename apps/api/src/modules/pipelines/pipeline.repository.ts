// CRM-8.1 — Pipeline and PipelineStage repositories.
//
// Receives a TenantTransactionClient from the calling service's withTenant callback.
// organizationId is injected by the tenant extension — callers never supply it.
// Pipeline and PipelineStage have no deletedAt — they use hard delete with pre-flight guards.

import { Prisma, type Pipeline, type PipelineStage } from '@prisma/client';
import { TenantRepository, asTenantCreate } from '../../core/tenancy/tenant-repository.js';
import type { TenantTransactionClient } from '../../core/tenancy/with-tenant.js';
import type { CreateStage, PatchPipeline, PatchStage } from '@leados/shared';
import { AppError } from '../../core/errors/app-error.js';
import { ErrorCode } from '@leados/shared';

export type { Pipeline, PipelineStage };
export type PipelineWithStages = Pipeline & { stages: PipelineStage[] };

function assertValidStageTerminalFlags(input: Pick<CreateStage, 'isWon' | 'isLost'>): void {
  if (input.isWon === true && input.isLost === true) {
    throw AppError.validation('A pipeline stage cannot be both Won and Lost', {
      fields: ['isWon', 'isLost'],
    });
  }
}

// ── Pipeline repository ───────────────────────────────────────────────────────

export class PrismaPipelineRepository extends TenantRepository {
  constructor(db: TenantTransactionClient) {
    super(db);
  }

  async create(data: { name: string; isDefault: boolean }): Promise<Pipeline> {
    return this.db.pipeline.create({
      data: asTenantCreate<Prisma.PipelineUncheckedCreateInput>({
        name: data.name,
        isDefault: data.isDefault,
      }),
    });
  }

  async findById(id: string): Promise<PipelineWithStages | null> {
    return this.db.pipeline.findFirst({
      where: { id },
      include: { stages: { orderBy: { order: 'asc' } } },
    });
  }

  async findByIdOrThrow(id: string): Promise<PipelineWithStages> {
    const pipeline = await this.findById(id);
    if (pipeline === null) {
      throw AppError.notFound('Pipeline not found');
    }
    return pipeline;
  }

  async findAll(): Promise<PipelineWithStages[]> {
    return this.db.pipeline.findMany({
      include: { stages: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async update(id: string, data: PatchPipeline): Promise<Pipeline> {
    return this.db.pipeline.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
      } as Prisma.PipelineUncheckedUpdateInput,
    });
  }

  async delete(id: string): Promise<void> {
    const pipeline = await this.findByIdOrThrow(id);

    if (pipeline.isDefault) {
      throw new AppError(ErrorCode.CONFLICT, 'Cannot delete the default pipeline');
    }

    // Count ALL deal rows referencing this pipeline — the FK is ON DELETE RESTRICT and applies
    // to soft-deleted rows too. Count without deletedAt filter to match what the DB enforces.
    const dealCount = await this.db.deal.count({ where: { pipelineId: id } });
    if (dealCount > 0) {
      throw new AppError(
        ErrorCode.CONFLICT,
        `Cannot delete pipeline with ${dealCount} existing deal(s)`,
        { dealCount },
      );
    }

    await this.db.pipeline.delete({ where: { id } });
  }

  async count(): Promise<number> {
    return this.db.pipeline.count();
  }
}

// ── PipelineStage repository ──────────────────────────────────────────────────

export class PrismaPipelineStageRepository extends TenantRepository {
  constructor(db: TenantTransactionClient) {
    super(db);
  }

  async create(pipelineId: string, input: CreateStage): Promise<PipelineStage> {
    assertValidStageTerminalFlags(input);

    if (input.isWon === true) {
      const wonCount = await this.db.pipelineStage.count({ where: { pipelineId, isWon: true } });
      if (wonCount > 0) {
        throw new AppError(ErrorCode.CONFLICT, 'Pipeline already has a Won stage');
      }
    }

    if (input.isLost === true) {
      const lostCount = await this.db.pipelineStage.count({ where: { pipelineId, isLost: true } });
      if (lostCount > 0) {
        throw new AppError(ErrorCode.CONFLICT, 'Pipeline already has a Lost stage');
      }
    }

    const agg = await this.db.pipelineStage.aggregate({
      _max: { order: true },
      where: { pipelineId },
    });
    const nextOrder = (agg._max.order ?? -1) + 1;

    return this.db.pipelineStage.create({
      data: asTenantCreate<Prisma.PipelineStageUncheckedCreateInput>({
        pipelineId,
        name: input.name,
        order: nextOrder,
        color: input.color ?? null,
        probability: input.probability ?? null,
        isWon: input.isWon ?? false,
        isLost: input.isLost ?? false,
      }),
    });
  }

  async findByIdOrThrow(stageId: string, pipelineId: string): Promise<PipelineStage> {
    const stage = await this.db.pipelineStage.findFirst({ where: { id: stageId, pipelineId } });
    if (stage === null) {
      throw AppError.notFound('Pipeline stage not found');
    }
    return stage;
  }

  async findByPipeline(pipelineId: string): Promise<PipelineStage[]> {
    return this.db.pipelineStage.findMany({
      where: { pipelineId },
      orderBy: { order: 'asc' },
    });
  }

  async update(stageId: string, pipelineId: string, input: PatchStage): Promise<PipelineStage> {
    assertValidStageTerminalFlags(input);

    if (input.isWon === true) {
      const wonCount = await this.db.pipelineStage.count({
        where: { pipelineId, isWon: true, id: { not: stageId } },
      });
      if (wonCount > 0) {
        throw new AppError(ErrorCode.CONFLICT, 'Pipeline already has a Won stage');
      }
    }

    if (input.isLost === true) {
      const lostCount = await this.db.pipelineStage.count({
        where: { pipelineId, isLost: true, id: { not: stageId } },
      });
      if (lostCount > 0) {
        throw new AppError(ErrorCode.CONFLICT, 'Pipeline already has a Lost stage');
      }
    }

    return this.db.pipelineStage.update({
      where: { id: stageId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.probability !== undefined ? { probability: input.probability } : {}),
        ...(input.isWon !== undefined ? { isWon: input.isWon } : {}),
        ...(input.isLost !== undefined ? { isLost: input.isLost } : {}),
      } as Prisma.PipelineStageUncheckedUpdateInput,
    });
  }

  async delete(stageId: string, pipelineId: string): Promise<void> {
    const stageCount = await this.db.pipelineStage.count({ where: { pipelineId } });
    if (stageCount <= 1) {
      throw new AppError(ErrorCode.CONFLICT, 'Cannot delete the only stage in a pipeline');
    }

    // Same FK reasoning as pipeline delete: count ALL deal rows for this stage.
    const dealCount = await this.db.deal.count({ where: { stageId } });
    if (dealCount > 0) {
      throw new AppError(
        ErrorCode.CONFLICT,
        `Stage has ${dealCount} deal(s); move or delete them first`,
        { dealCount },
      );
    }

    await this.db.pipelineStage.delete({ where: { id: stageId } });
  }

  async reorder(pipelineId: string, orderedStageIds: string[]): Promise<PipelineStage[]> {
    const existing = await this.findByPipeline(pipelineId);

    if (existing.length !== orderedStageIds.length) {
      throw AppError.validation('stageIds must contain exactly the existing stage IDs', {
        expected: existing.length,
        received: orderedStageIds.length,
      });
    }

    const existingIds = new Set(existing.map((s) => s.id));
    for (const id of orderedStageIds) {
      if (!existingIds.has(id)) {
        throw AppError.validation(`Stage ${id} does not belong to pipeline ${pipelineId}`);
      }
    }

    for (const [index, stageId] of orderedStageIds.entries()) {
      await this.db.pipelineStage.update({
        where: { id: stageId },
        data: { order: index },
      });
    }

    return this.findByPipeline(pipelineId);
  }
}
