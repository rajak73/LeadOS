/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

// CRM-6.3 — Lead import worker processor.
// Registered in worker-registry.ts. Calls processImport() with the job payload.

import type { Job } from 'bullmq';
import { logger } from '../../observability/logger.js';
import { processImport, type ImportJobPayload, type ImportResult } from '../../../modules/leads/lead-import.service.js';
import { prisma as db } from '../../prisma/client.js';

export const LEAD_IMPORT_JOB = 'lead-import';

export async function processLeadImportJob(job: Job<ImportJobPayload>): Promise<ImportResult> {
  logger.info({ message: 'Processing lead import', jobId: job.id, org: job.data.organizationId });
  try {
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
  } catch (error: any) {
    logger.error({ message: 'Lead import failed', error: error.message });
    await db.importHistory.update({
      where: { id: job.data.historyId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorSummary: { message: error.message }
      }
    }).catch(() => undefined); // Ignore if already updated or history doesn't exist
    throw error;
  }
}
