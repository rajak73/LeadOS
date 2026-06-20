// CRM-5.2 — File service.
//
// Two-step upload flow:
//   1. generatePresignedUrl()  — client calls before uploading directly to S3.
//   2. recordMetadata()        — client calls after upload to persist file row.
//
// softDelete marks deletedAt. Physical deletion from S3 is handled by lifecycle policy.
//
// BigInt mapping: Prisma returns File.sizeBytes as bigint (PostgreSQL BIGINT). JSON.stringify
// throws on BigInt. The service maps sizeBytes to number before returning to the HTTP layer.
// This is safe for files ≤ 9 PB (Number.MAX_SAFE_INTEGER is ~9 * 10^15 bytes).
//
// Activity emission:
//   FILE_UPLOADED → on recordMetadata (if entity FK present)
//   FILE_DELETED  → on softDelete (if entity FK present)

import type { File } from '@prisma/client';
import { withTenant } from '../../core/tenancy/with-tenant.js';
import { requireTenantContext } from '../../core/tenancy/context.js';
import { ActivityType } from '@leados/shared';
import type { PresignedUrlRequestInput, RecordFileInput, ActivityAppendInput } from '@leados/shared';
import type { AuditRecorder } from '../../core/audit/audit-recorder.js';
import { ActivityService } from '../../core/activities/activity.service.js';
import { StorageService, type PresignedUrlResult } from '../../core/storage/storage.service.js';
import { PrismaFileRepository } from './file.repository.js';

type AppendInput = Omit<ActivityAppendInput, 'organizationId'>;

// HTTP-safe file shape — sizeBytes as number, not bigint.
export interface FileResponse extends Omit<File, 'sizeBytes'> {
  sizeBytes: number;
}

function toFileResponse(file: File): FileResponse {
  return { ...file, sizeBytes: Number(file.sizeBytes) };
}

export class FileService {
  private readonly activityService = new ActivityService();
  private readonly storageService = new StorageService();

  constructor(private readonly audit: AuditRecorder) {}

  // ── CRM-5.2: step 1 — generate presigned URL ──────────────────────────────

  async generatePresignedUrl(
    input: PresignedUrlRequestInput,
  ): Promise<PresignedUrlResult & { fileId: string }> {
    const ctx = requireTenantContext();
    // Generate a pre-assigned fileId so the client can include it in the step-2 POST.
    const { randomUUID } = await import('crypto');
    const fileId = randomUUID();

    const result = await this.storageService.generatePresignedUrl({
      organizationId: ctx.organizationId,
      fileId,
      fileName: input.fileName,
      mimeType: input.mimeType,
    });

    return { ...result, fileId };
  }

  // ── CRM-5.2: step 2 — record file metadata after upload ───────────────────

  async recordMetadata(input: RecordFileInput): Promise<FileResponse> {
    const ctx = requireTenantContext();

    const file = await withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaFileRepository(db);
      const created = await repo.create({
        ...input,
        uploadedById: ctx.userId,
        storageProvider: 'S3',
      });

      const hasEntityFk = created.relatedLeadId !== null || created.relatedContactId !== null;
      if (hasEntityFk) {
        await this.activityService.append(db, ctx, {
          type: ActivityType.FILE_UPLOADED,
          description: `File uploaded: ${created.name}`,
          metadata: {
            type: ActivityType.FILE_UPLOADED,
            fileId: created.id,
            fileName: created.name,
            mimeType: created.mimeType,
          },
          ...(created.relatedLeadId !== null ? { relatedLeadId: created.relatedLeadId } : {}),
          ...(created.relatedContactId !== null ? { relatedContactId: created.relatedContactId } : {}),
        } as AppendInput);
      }

      return created;
    });

    await this.audit.record({
      action: 'created',
      resource: 'file',
      resourceId: file.id,
      after: toFileResponse(file),
    });

    return toFileResponse(file);
  }

  // ── CRM-5.2: softDelete ───────────────────────────────────────────────────

  async softDelete(id: string): Promise<void> {
    const ctx = requireTenantContext();

    await withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaFileRepository(db);
      const existing = await repo.findByIdOrThrow(id);
      await repo.softDelete(id);

      const hasEntityFk = existing.relatedLeadId !== null || existing.relatedContactId !== null;
      if (hasEntityFk) {
        await this.activityService.append(db, ctx, {
          type: ActivityType.FILE_DELETED,
          description: `File deleted: ${existing.name}`,
          metadata: {
            type: ActivityType.FILE_DELETED,
            fileId: id,
            fileName: existing.name,
          },
          ...(existing.relatedLeadId !== null ? { relatedLeadId: existing.relatedLeadId } : {}),
          ...(existing.relatedContactId !== null ? { relatedContactId: existing.relatedContactId } : {}),
        } as AppendInput);
      }
    });

    await this.audit.record({
      action: 'deleted',
      resource: 'file',
      resourceId: id,
    });
  }

  // ── Read path (delegated by LeadService / ContactService) ─────────────────

  async listForLead(leadId: string, page: number, limit: number): Promise<{ items: FileResponse[]; total: number }> {
    const ctx = requireTenantContext();
    const { items, total } = await withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaFileRepository(db);
      return repo.listForLead(leadId, page, limit);
    });
    return { items: items.map(toFileResponse), total };
  }

  async listForContact(contactId: string, page: number, limit: number): Promise<{ items: FileResponse[]; total: number }> {
    const ctx = requireTenantContext();
    const { items, total } = await withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaFileRepository(db);
      return repo.listForContact(contactId, page, limit);
    });
    return { items: items.map(toFileResponse), total };
  }
}
