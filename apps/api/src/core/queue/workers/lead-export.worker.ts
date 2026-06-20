// CRM-6.4 — Lead export worker processor.
// Registered in worker-registry.ts. Calls processExport() with the job payload.

import type { Job } from 'bullmq';
import { logger } from '../../observability/logger.js';
import { processExport, type ExportJobPayload, type ExportResult } from '../../../modules/leads/lead-export.service.js';

export const LEAD_EXPORT_JOB = 'lead-export';

export async function processLeadExportJob(job: Job<ExportJobPayload>): Promise<ExportResult> {
  logger.info({ message: 'Processing lead export', jobId: job.id, org: job.data.organizationId });
  const result = await processExport(job.data);
  logger.info({ message: 'Lead export complete', jobId: job.id, rowCount: result.rowCount });
  return result;
}
