// CRM-6.4 — Lead CSV export service (worker side).
//
// Called by the lead-export BullMQ worker.  Like the import service, this runs outside
// an Express request so no AsyncLocalStorage context exists.  organizationId and userId
// come from the job payload.
//
// Flow:
//   1. Run findAllWithFilter inside withTenant (RLS enforced).
//   2. Serialize the lead array to CSV with csv-stringify.
//   3. Upload the CSV buffer to S3 (or no-op in test mode).
//   4. Generate a 1-hour presigned GET URL and return it.

import { stringify as stringifyCsv } from 'csv-stringify/sync';
import { withTenant } from '../../core/tenancy/with-tenant.js';
import { StorageService } from '../../core/storage/storage.service.js';
import { PrismaLeadRepository } from './lead.repository.js';
import type { LeadExportBody } from '@leados/shared';
import type { Lead } from '@prisma/client';

export interface ExportJobPayload {
  organizationId: string;
  userId: string;
  role: string;
  filters: LeadExportBody;
}

export interface ExportResult {
  downloadUrl: string;
  rowCount: number;
}

const storageService = new StorageService();

// Columns to include in the export CSV (excludes internal/sensitive fields).
const CSV_COLUMNS: (keyof Lead)[] = [
  'id', 'firstName', 'lastName', 'email', 'phone',
  'source', 'status', 'assignedToId', 'tags',
  'aiScore', 'lostReason', 'createdAt', 'updatedAt',
];

export async function processExport(payload: ExportJobPayload): Promise<ExportResult> {
  const leads = await withTenant(payload.organizationId, async (db) => {
    const repo = new PrismaLeadRepository(db);
    return repo.findAllWithFilter(payload.filters);
  });

  // Build CSV rows — convert arrays and dates to strings for readability.
  const rows = leads.map((lead) =>
    CSV_COLUMNS.reduce<Record<string, unknown>>((acc, col) => {
      const val = lead[col];
      if (Array.isArray(val)) {
        acc[col] = (val as string[]).join(',');
      } else if (val instanceof Date) {
        acc[col] = val.toISOString();
      } else {
        acc[col] = val ?? '';
      }
      return acc;
    }, {}),
  );

  const csvContent = stringifyCsv(rows, { header: true, columns: CSV_COLUMNS as string[] });
  const csvBuffer = Buffer.from(csvContent, 'utf8');

  const storageKey = `orgs/${payload.organizationId}/exports/leads-${Date.now()}.csv`;
  await storageService.putObject({ storageKey, body: csvBuffer, contentType: 'text/csv' });
  const downloadUrl = await storageService.generateDownloadUrl(storageKey);

  return { downloadUrl, rowCount: leads.length };
}
