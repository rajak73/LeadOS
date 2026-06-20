// CRM-9.1 — Deal repository.
//
// Receives a TenantTransactionClient from the calling service's withTenant callback.
// organizationId is injected automatically by the tenant extension. All deal queries are
// soft-delete aware unless a method explicitly needs to count all FK references.

import { DealStatus, Prisma, type Deal } from '@prisma/client';
import { TenantRepository, asTenantCreate } from '../../core/tenancy/tenant-repository.js';
import type { TenantTransactionClient } from '../../core/tenancy/with-tenant.js';
import type { CreateDeal, DealListQuery, PatchDeal } from '@leados/shared';
import { ErrorCode } from '@leados/shared';
import { AppError } from '../../core/errors/app-error.js';

export type { Deal };

export interface DealCreateData extends Omit<CreateDeal, 'assignedToId'> {
  createdById: string;
  assignedToId?: string | null;
}

export interface ForecastRow {
  stageId: string;
  stageName: string;
  probability: number;
  totalValue: string;
  weightedValue: string;
  dealCount: number;
}

export class PrismaDealRepository extends TenantRepository {
  constructor(db: TenantTransactionClient) {
    super(db);
  }

  async create(data: DealCreateData): Promise<Deal> {
    await this.assertStageBelongsToPipeline(data.pipelineId, data.stageId);

    return this.db.deal.create({
      data: asTenantCreate<Prisma.DealUncheckedCreateInput>({
        title: data.title,
        value: data.value !== undefined ? new Prisma.Decimal(data.value) : null,
        currency: data.currency ?? 'INR',
        pipelineId: data.pipelineId,
        stageId: data.stageId,
        leadId: data.leadId ?? null,
        contactId: data.contactId ?? null,
        assignedToId: data.assignedToId ?? null,
        expectedCloseDate: data.expectedCloseDate ?? null,
        customFields: (data.customFields ?? {}) as Prisma.InputJsonValue,
        createdById: data.createdById,
      }),
    });
  }

  async findById(id: string, ownedByUserId?: string): Promise<Deal | null> {
    return this.db.deal.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(ownedByUserId !== undefined ? { assignedToId: ownedByUserId } : {}),
      },
    });
  }

  async findByIdOrThrow(id: string, ownedByUserId?: string): Promise<Deal> {
    const deal = await this.findById(id, ownedByUserId);
    if (deal === null) {
      throw AppError.notFound('Deal not found');
    }
    return deal;
  }

  async findManyWithFilter(
    query: DealListQuery,
    ownedByUserId?: string,
  ): Promise<{ items: Deal[]; total: number }> {
    const where = this.buildWhere(query, ownedByUserId);
    const page = query.page;
    const limit = query.limit;

    const [items, total] = await Promise.all([
      this.db.deal.findMany({
        where,
        orderBy: { createdAt: query.sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.db.deal.count({ where }),
    ]);

    return { items, total };
  }

  async update(id: string, data: PatchDeal): Promise<Deal> {
    return this.db.deal.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.value !== undefined ? { value: new Prisma.Decimal(data.value) } : {}),
        ...(data.currency !== undefined ? { currency: data.currency } : {}),
        ...(data.assignedToId !== undefined ? { assignedToId: data.assignedToId } : {}),
        ...(data.expectedCloseDate !== undefined ? { expectedCloseDate: data.expectedCloseDate } : {}),
        ...(data.customFields !== undefined
          ? { customFields: data.customFields as Prisma.InputJsonValue }
          : {}),
      } as Prisma.DealUncheckedUpdateInput,
    });
  }

  async moveToStage(id: string, stageId: string): Promise<Deal> {
    const existing = await this.findByIdOrThrow(id);
    if (existing.status !== DealStatus.OPEN) {
      throw new AppError(ErrorCode.CONFLICT, 'Only OPEN deals can be moved');
    }

    await this.assertStageBelongsToPipeline(existing.pipelineId, stageId);

    return this.db.deal.update({
      where: { id },
      data: { stageId },
    });
  }

  async markWon(id: string): Promise<Deal> {
    const existing = await this.findByIdOrThrow(id);
    if (existing.status !== DealStatus.OPEN) {
      throw new AppError(ErrorCode.CONFLICT, 'Only OPEN deals can be marked won');
    }

    return this.db.deal.update({
      where: { id },
      data: { status: DealStatus.WON, closedAt: new Date(), lostReason: null },
    });
  }

  async markLost(id: string, reason?: string): Promise<Deal> {
    const existing = await this.findByIdOrThrow(id);
    if (existing.status !== DealStatus.OPEN) {
      throw new AppError(ErrorCode.CONFLICT, 'Only OPEN deals can be marked lost');
    }

    return this.db.deal.update({
      where: { id },
      data: { status: DealStatus.LOST, closedAt: new Date(), lostReason: reason ?? null },
    });
  }

  async softDelete(id: string): Promise<Deal> {
    return this.db.deal.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async count(filter?: Prisma.DealWhereInput): Promise<number> {
    return this.db.deal.count({
      where: { deletedAt: null, ...(filter ?? {}) },
    });
  }

  async getWeightedForecast(pipelineId?: string): Promise<ForecastRow[]> {
    const rows = await this.db.$queryRaw<
      Array<{
        stageId: string;
        stageName: string;
        probability: number;
        totalValue: Prisma.Decimal;
        weightedValue: Prisma.Decimal;
        dealCount: bigint;
      }>
    >`
      SELECT
        s.id AS "stageId",
        s.name AS "stageName",
        COALESCE(s.probability, 0) AS probability,
        COALESCE(SUM(d.value), 0)::numeric(15, 2) AS "totalValue",
        COALESCE(SUM(d.value * COALESCE(s.probability, 0) / 100), 0)::numeric(15, 2) AS "weightedValue",
        COUNT(d.id)::bigint AS "dealCount"
      FROM pipeline_stages s
      LEFT JOIN deals d
        ON d."stageId" = s.id
       AND d."organizationId" = current_setting('app.current_organization_id', true)::uuid
       AND d."deletedAt" IS NULL
       AND d.status = 'OPEN'
      WHERE s."organizationId" = current_setting('app.current_organization_id', true)::uuid
        AND (${pipelineId ?? null}::uuid IS NULL OR s."pipelineId" = ${pipelineId ?? null}::uuid)
      GROUP BY s.id, s.name, s.probability, s."order"
      ORDER BY s."order" ASC
    `;

    return rows.map((row) => ({
      stageId: row.stageId,
      stageName: row.stageName,
      probability: row.probability,
      totalValue: row.totalValue.toFixed(2),
      weightedValue: row.weightedValue.toFixed(2),
      dealCount: Number(row.dealCount),
    }));
  }

  async assertPipelineExists(pipelineId: string): Promise<void> {
    const pipeline = await this.db.pipeline.findFirst({ where: { id: pipelineId }, select: { id: true } });
    if (pipeline === null) {
      throw AppError.notFound('Pipeline not found');
    }
  }

  async assertStageBelongsToPipeline(pipelineId: string, stageId: string): Promise<void> {
    const stage = await this.db.pipelineStage.findFirst({
      where: { id: stageId, pipelineId },
      select: { id: true },
    });
    if (stage === null) {
      throw AppError.validation('stageId must belong to the selected pipeline', {
        pipelineId,
        stageId,
      });
    }
  }

  async assertLeadVisible(leadId: string): Promise<void> {
    const lead = await this.db.lead.findFirst({
      where: { id: leadId, deletedAt: null },
      select: { id: true },
    });
    if (lead === null) {
      throw AppError.notFound('Lead not found');
    }
  }

  async assertContactVisible(contactId: string): Promise<void> {
    const contact = await this.db.contact.findFirst({
      where: { id: contactId, deletedAt: null },
      select: { id: true },
    });
    if (contact === null) {
      throw AppError.notFound('Contact not found');
    }
  }

  private buildWhere(query: DealListQuery, ownedByUserId?: string): Prisma.DealWhereInput {
    const where: Prisma.DealWhereInput = { deletedAt: null };

    if (ownedByUserId !== undefined) {
      where.assignedToId = ownedByUserId;
    } else if (query.assignedToId !== undefined) {
      where.assignedToId = query.assignedToId;
    }

    if (query.pipelineId !== undefined) where.pipelineId = query.pipelineId;
    if (query.stageId !== undefined) where.stageId = query.stageId;
    if (query.leadId !== undefined) where.leadId = query.leadId;
    if (query.contactId !== undefined) where.contactId = query.contactId;

    if (query.status?.length) {
      where.status = { in: query.status as DealStatus[] };
    }

    if (query.search !== undefined && query.search.trim().length > 0) {
      where.title = { contains: query.search.trim(), mode: 'insensitive' };
    }

    if (query.valueMin !== undefined || query.valueMax !== undefined) {
      const valueFilter: NonNullable<Prisma.DealWhereInput['value']> = {};
      if (query.valueMin !== undefined) valueFilter.gte = new Prisma.Decimal(query.valueMin);
      if (query.valueMax !== undefined) valueFilter.lte = new Prisma.Decimal(query.valueMax);
      where.value = valueFilter;
    }

    if (query.closedFrom !== undefined || query.closedTo !== undefined) {
      const closedFilter: NonNullable<Prisma.DealWhereInput['closedAt']> = {};
      if (query.closedFrom !== undefined) closedFilter.gte = query.closedFrom;
      if (query.closedTo !== undefined) closedFilter.lte = query.closedTo;
      where.closedAt = closedFilter;
    }

    return where;
  }
}
