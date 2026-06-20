// CRM-6.3 — Lead CSV import service (worker side).
//
// Called by the lead-import BullMQ worker — NOT from an Express request handler.
// There is no AsyncLocalStorage context in a worker process, so:
//   • withTenant() is called with an explicit organizationId from the job payload.
//   • A synthetic TenantContext is constructed from the payload for ActivityService.append()
//     and audit writes.
//
// Partial-success semantics: valid rows are inserted even if some rows fail validation.
// Invalid rows are collected and returned in errorRows so the caller can report them.
//
// Plan-limit check: performed after dedup (so duplicates don't inflate the needed headroom)
// but before any INSERT.  If valid_after_dedup + current_count > limit the entire batch is
// rejected (rather than partial insertion to the limit) to give users a predictable outcome.

import { parse as parseCsv } from 'csv-parse/sync';
import { withTenant } from '../../core/tenancy/with-tenant.js';
import type { TenantContext } from '../../core/tenancy/context.js';
import { ActivityType, PLAN_LIMITS, ErrorCode } from '@leados/shared';
import { leadImportRowSchema } from '@leados/shared';
import { AppError } from '../../core/errors/app-error.js';
import { ActivityService } from '../../core/activities/activity.service.js';
import { buildAuditRow } from '../../core/audit/audit-recorder.js';
import { asTenantCreate } from '../../core/tenancy/tenant-repository.js';
import { PrismaLeadRepository } from './lead.repository.js';
import type { Prisma } from '@prisma/client';

export interface ImportJobPayload {
  organizationId: string;
  userId: string;
  role: string;
  csvBase64: string;
}

export interface ImportResult {
  total: number;
  imported: number;
  duplicates: number;
  errorRows: { row: number; errors: string[] }[];
}

const activityService = new ActivityService();

export async function processImport(payload: ImportJobPayload): Promise<ImportResult> {
  const ctx: TenantContext = {
    organizationId: payload.organizationId,
    userId: payload.userId,
    role: payload.role,
    isSuperAdmin: false,
    ownOnly: false,
  };

  const csvBuffer = Buffer.from(payload.csvBase64, 'base64');

  // Parse CSV into raw record objects (first row is the header).
  const rawRows: Record<string, string>[] = parseCsv(csvBuffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const total = rawRows.length;
  const errorRows: { row: number; errors: string[] }[] = [];

  // Validate every row upfront. Collect valid rows and invalid indices.
  interface ValidRow {
    rowIndex: number;
    firstName: string;
    lastName: string | undefined;
    email: string | undefined;
    phone: string | undefined;
    source: 'INSTAGRAM_DM' | 'INSTAGRAM_COMMENT' | 'WHATSAPP' | 'MANUAL' | 'IMPORT' | 'REFERRAL' | 'WEB_FORM' | 'OTHER';
    tags: string[];
  }

  const validRows: ValidRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i]!;
    // Split comma-separated tags string into an array before validating.
    const tagsRaw = raw['tags'];
    const tagsArr = tagsRaw ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : [];
    const parsed = leadImportRowSchema.safeParse({ ...raw, tags: tagsArr });

    if (!parsed.success) {
      errorRows.push({
        row: i + 2, // +1 for 1-based, +1 for header row
        errors: parsed.error.issues.map((iss) => `${iss.path.join('.')}: ${iss.message}`),
      });
      continue;
    }
    const d = parsed.data;
    validRows.push({
      rowIndex: i + 2,
      firstName: d.firstName,
      lastName: d.lastName,
      email: d.email,
      phone: d.phone,
      source: d.source,
      tags: d.tags,
    });
  }

  if (validRows.length === 0) {
    return { total, imported: 0, duplicates: 0, errorRows };
  }

  let imported = 0;
  let duplicates = 0;

  // Single transaction: plan limit check + dedup + batch insert + activity.
  await withTenant(ctx.organizationId, async (db) => {
    const repo = new PrismaLeadRepository(db);

    // Plan limit check.
    const sub = await db.subscription.findFirst({ select: { plan: true } });
    const plan = (sub?.plan ?? 'TRIAL') as keyof typeof PLAN_LIMITS;
    const limit = PLAN_LIMITS[plan].leads;
    const currentCount = await repo.count();
    const headroom = limit - currentCount;

    // Collect emails and phones from valid rows for batch dedup.
    const emails = validRows.map((r) => r.email).filter((e): e is string => e !== undefined);
    const phones = validRows.map((r) => r.phone).filter((p): p is string => p !== undefined);

    // Fetch existing leads that would collide.
    const existingByEmail =
      emails.length > 0
        ? await db.lead.findMany({
            where: { email: { in: emails }, deletedAt: null },
            select: { email: true },
          })
        : [];
    const existingByPhone =
      phones.length > 0
        ? await db.lead.findMany({
            where: { phone: { in: phones }, deletedAt: null },
            select: { phone: true },
          })
        : [];

    const dupEmails = new Set(existingByEmail.map((r) => r.email).filter((e): e is string => e !== null));
    const dupPhones = new Set(existingByPhone.map((r) => r.phone).filter((p): p is string => p !== null));

    const toInsert = validRows.filter((r) => {
      const isDup =
        (r.email !== undefined && dupEmails.has(r.email)) ||
        (r.phone !== undefined && dupPhones.has(r.phone));
      if (isDup) {
        duplicates++;
        return false;
      }
      return true;
    });

    if (toInsert.length > headroom) {
      throw new AppError(
        ErrorCode.PLAN_LIMIT_EXCEEDED,
        `Import would exceed the lead limit of ${limit} for ${plan} plan. ` +
          `Current: ${currentCount}, headroom: ${headroom}, rows to import: ${toInsert.length}.`,
        { plan, limit, current: currentCount, headroom, requested: toInsert.length },
      );
    }

    // Batch insert in groups of 100.
    const BATCH = 100;
    for (let start = 0; start < toInsert.length; start += BATCH) {
      const batch = toInsert.slice(start, start + BATCH);
      for (const row of batch) {
        const lead = await db.lead.create({
          data: asTenantCreate<Prisma.LeadUncheckedCreateInput>({
            firstName: row.firstName,
            lastName: row.lastName ?? null,
            email: row.email ?? null,
            phone: row.phone ?? null,
            source: row.source,
            status: 'NEW',
            tags: row.tags,
            customFields: {},
            createdById: ctx.userId,
          }),
        });

        await activityService.append(db, ctx, {
          type: ActivityType.LEAD_CREATED,
          description: `Lead imported: ${lead.firstName}${lead.lastName ? ` ${lead.lastName}` : ''}`,
          metadata: { type: ActivityType.LEAD_CREATED, source: lead.source },
          relatedLeadId: lead.id,
        });

        imported++;

        // Audit — inside transaction (import is a bulk operation; individual audit rows
        // are written here rather than post-transaction to keep them atomic with the insert).
        const auditRow = buildAuditRow(
          { action: 'created', resource: 'lead', resourceId: lead.id, after: { id: lead.id, firstName: lead.firstName, email: lead.email } },
          ctx,
        );
        await db.auditLog.create({
          data: asTenantCreate<Prisma.AuditLogUncheckedCreateInput>(auditRow),
        });
      }
    }
  });

  return { total, imported, duplicates, errorRows };
}
