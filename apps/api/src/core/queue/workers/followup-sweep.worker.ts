import { type Job } from 'bullmq';
import { logger } from '../../observability/logger.js';
import { FollowupService } from '../../../modules/tasks/followup.service.js';

export async function processFollowupSweepJob(job: Job): Promise<void> {
  logger.info({ message: 'Processing follow-up sweep job', jobId: job.id });
  const service = new FollowupService();
  await service.sweepAllOrganizations();
  logger.info({ message: 'Follow-up sweep job completed successfully' });
}
