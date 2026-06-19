// CRM-2.1 — Lead repository.
//
// Receives the TenantTransactionClient from the calling service's withTenant callback.
// organizationId is injected automatically by the tenant extension — callers never supply it.
// All queries are soft-delete aware (deletedAt IS NULL) unless explicitly noted.

import type { Prisma, Lead } from '@prisma/client';
import { TenantRepository, asTenantCreate } from '../../core/tenancy/tenant-repository.js';
import type { TenantTransactionClient } from '../../core/tenancy/with-tenant.js';
import type { CreateLeadInput, PatchLeadInput } from '@leados/shared';

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
}
