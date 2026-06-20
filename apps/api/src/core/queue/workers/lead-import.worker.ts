// CRM-6.3 — Lead import worker processor.
// Registered in worker-registry.ts. Calls processImport() with the job payload.

import type { Job } from 'bullmq';
import { logger } from '../../observability/logger.js';
import { processImport, type ImportJobPayload, type ImportResult } from '../../../modules/leads/lead-import.service.js';

export const LEAD_IMPORT_JOB = 'lead-import';

export async function processLeadImportJob(job: Job<ImportJobPayload>): Promise<ImportResult> {
  logger.info({ message: 'Processing lead import', jobId: job.id, org: job.data.organizationId });
  const result = await processImport(job.data);
  logger.info({
    message: 'Lead import complete',
    jobId: job.id,
    total: result.total,
    imported: result.imported,
    duplicates: result.duplicates,
    errorCount: result.errorRows.length,
  });
  return result;
}
