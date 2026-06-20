// CRM-5.2 — File repository.
//
// Extends TenantRepository — always used inside a withTenant() callback.
// organizationId is injected by the tenant extension via asTenantCreate().
//
// Files have no updatedAt (immutable after upload). softDelete sets deletedAt.
// Physical deletion from storage is handled by S3 lifecycle policy, not here.
//
// sizeBytes is BigInt in Prisma (maps to PostgreSQL BIGINT). The service layer
// maps it to number before returning to HTTP clients to avoid JSON serialization errors.

import { Prisma, type File } from '@prisma/client';
import { TenantRepository, asTenantCreate } from '../../core/tenancy/tenant-repository.js';
import type { TenantTransactionClient } from '../../core/tenancy/with-tenant.js';
import { AppError } from '../../core/errors/app-error.js';
import { ErrorCode } from '@leados/shared';
import type { RecordFileInput } from '@leados/shared';

export type { File };

export interface FilePage {
  items: File[];
  total: number;
}

export class PrismaFileRepository extends TenantRepository {
  constructor(db: TenantTransactionClient) {
    super(db);
  }

  async create(data: RecordFileInput & { uploadedById: string; storageProvider: 'S3' | 'CLOUDINARY' }): Promise<File> {
    return this.db.file.create({
      data: asTenantCreate<Prisma.FileUncheckedCreateInput>({
        id: data.fileId,
        name: data.fileName,
        storageKey: data.storageKey,
        storageProvider: data.storageProvider,
        mimeType: data.mimeType,
        sizeBytes: BigInt(data.sizeBytes),
        url: data.url,
        relatedLeadId: data.relatedLeadId ?? null,
        relatedContactId: data.relatedContactId ?? null,
        uploadedById: data.uploadedById,
      }),
    });
  }

  async findById(id: string): Promise<File | null> {
    return this.db.file.findFirst({ where: { id, deletedAt: null } });
  }

  async findByIdOrThrow(id: string): Promise<File> {
    const file = await this.findById(id);
    if (file === null) {
      throw new AppError(ErrorCode.NOT_FOUND, 'File not found', { fileId: id });
    }
    return file;
  }

  async softDelete(id: string): Promise<File> {
    return this.db.file.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async listForLead(leadId: string, page: number, limit: number): Promise<FilePage> {
    const where = { relatedLeadId: leadId, deletedAt: null };
    const total = await this.db.file.count({ where });
    const items = await this.db.file.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total };
  }

  async listForContact(contactId: string, page: number, limit: number): Promise<FilePage> {
    const where = { relatedContactId: contactId, deletedAt: null };
    const total = await this.db.file.count({ where });
    const items = await this.db.file.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total };
  }
}
