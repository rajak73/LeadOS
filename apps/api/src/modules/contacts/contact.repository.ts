// CRM-3.1 — Contact repository.
//
// Receives the TenantTransactionClient from the calling service's withTenant callback.
// organizationId is injected automatically by the tenant extension — callers never supply it.
// All queries are soft-delete aware (deletedAt IS NULL).

import { Prisma, type Contact } from '@prisma/client';
import { TenantRepository, asTenantCreate } from '../../core/tenancy/tenant-repository.js';
import type { TenantTransactionClient } from '../../core/tenancy/with-tenant.js';
import type { CreateContactInput, PatchContactInput } from '@leados/shared';
import { AppError } from '../../core/errors/app-error.js';

export type { Contact };

export class PrismaContactRepository extends TenantRepository {
  constructor(db: TenantTransactionClient) {
    super(db);
  }

  async create(
    data: CreateContactInput & { createdById: string; createdFromLeadId?: string },
  ): Promise<Contact> {
    return this.db.contact.create({
      data: asTenantCreate<Prisma.ContactUncheckedCreateInput>({
        firstName: data.firstName,
        lastName: data.lastName ?? null,
        email: data.email ?? null,
        phone: data.phone ?? null,
        company: data.company ?? null,
        jobTitle: data.jobTitle ?? null,
        avatarUrl: data.avatarUrl ?? null,
        // Nullable JSON field: use Prisma.DbNull to store SQL NULL (not JavaScript null)
        address: data.address != null ? (data.address as Prisma.InputJsonValue) : Prisma.DbNull,
        tags: data.tags ?? [],
        customFields: (data.customFields ?? {}) as Prisma.InputJsonValue,
        assignedToId: data.assignedToId ?? null,
        createdFromLeadId: data.createdFromLeadId ?? null,
        createdById: data.createdById,
      }),
    });
  }

  async findById(id: string, ownedByUserId?: string): Promise<Contact | null> {
    return this.db.contact.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(ownedByUserId !== undefined ? { assignedToId: ownedByUserId } : {}),
      },
    });
  }

  async findByIdOrThrow(id: string, ownedByUserId?: string): Promise<Contact> {
    const contact = await this.findById(id, ownedByUserId);
    if (contact === null) {
      throw AppError.notFound('Contact not found');
    }
    return contact;
  }

  async update(id: string, data: PatchContactInput): Promise<Contact> {
    // The conditional-spread pattern produces a type that conflicts with Prisma's
    // exactOptionalPropertyTypes + Without<> intersection. Casting to
    // ContactUncheckedUpdateInput is safe: the spreads ensure only defined fields are
    // included and the values satisfy the Prisma column types.
    return this.db.contact.update({
      where: { id },
      data: {
        ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
        ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.company !== undefined ? { company: data.company } : {}),
        ...(data.jobTitle !== undefined ? { jobTitle: data.jobTitle } : {}),
        ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
        ...(data.address !== undefined
          ? {
              address:
                data.address != null
                  ? (data.address as Prisma.InputJsonValue)
                  : Prisma.DbNull,
            }
          : {}),
        ...(data.tags !== undefined ? { tags: data.tags } : {}),
        ...(data.customFields !== undefined
          ? { customFields: data.customFields as Prisma.InputJsonValue }
          : {}),
        ...(data.assignedToId !== undefined ? { assignedToId: data.assignedToId } : {}),
      } as Prisma.ContactUncheckedUpdateInput,
    });
  }

  async softDelete(id: string): Promise<Contact> {
    return this.db.contact.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /** Count non-deleted contacts for the active org (plan-limit check). */
  async count(): Promise<number> {
    return this.db.contact.count({ where: { deletedAt: null } });
  }

  /** Dedup check — returns the contact id if a non-deleted contact with this email exists. */
  async findByEmail(email: string): Promise<{ id: string } | null> {
    return this.db.contact.findFirst({
      where: { email, deletedAt: null },
      select: { id: true },
    });
  }

  /** Dedup check — returns the contact id if a non-deleted contact with this phone exists. */
  async findByPhone(phone: string): Promise<{ id: string } | null> {
    return this.db.contact.findFirst({
      where: { phone, deletedAt: null },
      select: { id: true },
    });
  }

  /** Idempotency check for convert() — returns the contact if this lead was already converted. */
  async findByCreatedFromLeadId(leadId: string): Promise<{ id: string } | null> {
    return this.db.contact.findFirst({
      where: { createdFromLeadId: leadId, deletedAt: null },
      select: { id: true },
    });
  }
}
