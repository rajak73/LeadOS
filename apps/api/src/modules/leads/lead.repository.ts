// CRM-2.1 — Lead repository.
//
// Receives the TenantTransactionClient from the calling service's withTenant callback.
// organizationId is injected automatically by the tenant extension — callers never supply it.
// All queries are soft-delete aware (deletedAt IS NULL) unless explicitly noted.

import type { Prisma, Lead, LeadStatus, LeadSource } from '@prisma/client';
import { TenantRepository, asTenantCreate } from '../../core/tenancy/tenant-repository.js';
import type { TenantTransactionClient } from '../../core/tenancy/with-tenant.js';
import type { CreateLeadInput, PatchLeadInput, LeadListQuery } from '@leados/shared';

export type { Lead };

export class PrismaLeadRepository extends TenantRepository {
  constructor(db: TenantTransactionClient) {
    super(db);
  }

  async create(data: CreateLeadInput & { createdById: string }): Promise<Lead> {
    return this.db.lead.create({
      data: asTenantCreate<Prisma.LeadUncheckedCreateInput>({
        firstName: data.firstName,
        lastName: data.lastName ?? null,
        email: data.email ?? null,
        phone: data.phone ?? null,
        source: data.source,
        status: data.status,
        assignedToId: data.assignedToId ?? null,
        tags: data.tags ?? [],
        customFields: (data.customFields ?? {}) as Prisma.InputJsonValue,
        lostReason: data.lostReason ?? null,
        instagramHandle: data.instagramHandle ?? null,
        instagramUserId: data.instagramUserId ?? null,
        createdById: data.createdById,
      }),
    });
  }

  async findById(id: string, ownedByUserId?: string): Promise<Lead | null> {
    return this.db.lead.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(ownedByUserId !== undefined ? { assignedToId: ownedByUserId } : {}),
      },
    });
  }

  async findByIdOrThrow(id: string, ownedByUserId?: string): Promise<Lead> {
    const lead = await this.findById(id, ownedByUserId);
    if (lead === null) {
      const { AppError } = await import('../../core/errors/app-error.js');
      throw AppError.notFound('Lead not found');
    }
    return lead;
  }

  async update(id: string, data: PatchLeadInput): Promise<Lead> {
    return this.db.lead.update({
      where: { id },
      data: {
        ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
        ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.assignedToId !== undefined ? { assignedToId: data.assignedToId } : {}),
        ...(data.tags !== undefined ? { tags: data.tags } : {}),
        ...(data.customFields !== undefined
          ? { customFields: data.customFields as Prisma.InputJsonValue }
          : {}),
        ...(data.lostReason !== undefined ? { lostReason: data.lostReason } : {}),
        ...(data.instagramHandle !== undefined ? { instagramHandle: data.instagramHandle } : {}),
        ...(data.instagramUserId !== undefined ? { instagramUserId: data.instagramUserId } : {}),
      },
    });
  }

  async softDelete(id: string): Promise<Lead> {
    return this.db.lead.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /** Count non-deleted leads for the active org (used for plan-limit checks). */
  async count(): Promise<number> {
    return this.db.lead.count({ where: { deletedAt: null } });
  }

  /** Dedup check — returns the lead id if a non-deleted lead with this email exists. */
  async findByEmail(email: string): Promise<{ id: string } | null> {
    return this.db.lead.findFirst({
      where: { email, deletedAt: null },
      select: { id: true },
    });
  }

  /** Dedup check — returns the lead id if a non-deleted lead with this phone exists. */
  async findByPhone(phone: string): Promise<{ id: string } | null> {
    return this.db.lead.findFirst({
      where: { phone, deletedAt: null },
      select: { id: true },
    });
  }

  /** All matching leads for CRM-6.4 export (no pagination, no sort — caller formats). */
  async findAllWithFilter(
    query: Omit<LeadListQuery, 'page' | 'limit' | 'sortBy' | 'sortOrder'>,
    ownedByUserId?: string,
  ): Promise<Lead[]> {
    const where: Prisma.LeadWhereInput = { deletedAt: null };

    if (ownedByUserId !== undefined) {
      where.assignedToId = ownedByUserId;
    } else if (query.assignedToId !== undefined) {
      where.assignedToId = query.assignedToId;
    }

    if (query.status?.length) {
      where.status = { in: query.status as LeadStatus[] };
    }
    if (query.source?.length) {
      where.source = { in: query.source as LeadSource[] };
    }
    if (query.tags?.length) {
      where.tags = { hasSome: query.tags };
    }
    if (query.aiScoreMin !== undefined || query.aiScoreMax !== undefined) {
      const scoreFilter: NonNullable<Prisma.LeadWhereInput['aiScore']> = {};
      if (query.aiScoreMin !== undefined) scoreFilter.gte = query.aiScoreMin;
      if (query.aiScoreMax !== undefined) scoreFilter.lte = query.aiScoreMax;
      where.aiScore = scoreFilter;
    }
    if (query.createdFrom !== undefined || query.createdTo !== undefined) {
      const dateFilter: Prisma.DateTimeFilter<'Lead'> = {};
      if (query.createdFrom !== undefined) dateFilter.gte = query.createdFrom;
      if (query.createdTo !== undefined) dateFilter.lte = query.createdTo;
      where.createdAt = dateFilter;
    }
    if (query.search !== undefined && query.search.trim().length > 0) {
      const term = query.search.trim();
      where.OR = [
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } },
      ];
    }

    return this.db.lead.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  /** Paginated, filtered, sorted lead list for CRM-6.1. */
  async findManyWithFilter(
    query: LeadListQuery,
    ownedByUserId?: string,
  ): Promise<{ items: Lead[]; total: number }> {
    // Build the WHERE clause incrementally to avoid exactOptionalPropertyTypes issues.
    const where: Prisma.LeadWhereInput = { deletedAt: null };

    // ownOnly takes precedence over any assignedToId filter from the query.
    if (ownedByUserId !== undefined) {
      where.assignedToId = ownedByUserId;
    } else if (query.assignedToId !== undefined) {
      where.assignedToId = query.assignedToId;
    }

    if (query.status?.length) {
      // Cast to LeadStatus[] (not LeadStatus[] | undefined) to satisfy exactOptionalPropertyTypes.
      // The ?.length guard above already proves the array is non-empty and non-undefined.
      where.status = { in: query.status as LeadStatus[] };
    }

    if (query.source?.length) {
      where.source = { in: query.source as LeadSource[] };
    }

    if (query.tags?.length) {
      where.tags = { hasSome: query.tags };
    }

    if (query.aiScoreMin !== undefined || query.aiScoreMax !== undefined) {
      // Use the inferred field type to avoid depending on the internal Prisma filter type name.
      const scoreFilter: NonNullable<Prisma.LeadWhereInput['aiScore']> = {};
      if (query.aiScoreMin !== undefined) scoreFilter.gte = query.aiScoreMin;
      if (query.aiScoreMax !== undefined) scoreFilter.lte = query.aiScoreMax;
      where.aiScore = scoreFilter;
    }

    if (query.createdFrom !== undefined || query.createdTo !== undefined) {
      const dateFilter: Prisma.DateTimeFilter<'Lead'> = {};
      if (query.createdFrom !== undefined) dateFilter.gte = query.createdFrom;
      if (query.createdTo !== undefined) dateFilter.lte = query.createdTo;
      where.createdAt = dateFilter;
    }

    if (query.search !== undefined && query.search.trim().length > 0) {
      const term = query.search.trim();
      where.OR = [
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } },
      ];
    }

    // Nullable sort fields (lastActivityAt, aiScore) use NULLS LAST to keep
    // leads without a value at the bottom of the result regardless of direction.
    const nullableSortFields = new Set<string>(['lastActivityAt', 'aiScore']);
    const orderBy: Prisma.LeadOrderByWithRelationInput = nullableSortFields.has(query.sortBy)
      ? ({ [query.sortBy]: { sort: query.sortOrder, nulls: 'last' } } as Prisma.LeadOrderByWithRelationInput)
      : ({ [query.sortBy]: query.sortOrder } as Prisma.LeadOrderByWithRelationInput);

    const skip = (query.page - 1) * query.limit;

    const [total, items] = await Promise.all([
      this.db.lead.count({ where }),
      this.db.lead.findMany({ where, orderBy, skip, take: query.limit }),
    ]);

    return { items, total };
  }
}
