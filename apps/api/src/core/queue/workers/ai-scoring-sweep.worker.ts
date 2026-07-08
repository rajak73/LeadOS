import type { Job } from 'bullmq';
import { prisma } from '../../prisma/client.js';
import { logger } from '../../observability/logger.js';
import { enqueue } from '../queues.js';
import { QUEUE } from '../names.js';

export async function processAiScoringSweepJob(job: Job): Promise<void> {
  logger.info({ message: 'Starting AI scoring sweep job', jobId: job.id });
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Find leads where aiScoreUpdatedAt is null OR older than 7 days, AND not deleted, AND not converted
  const staleLeads = await prisma.lead.findMany({
    where: {
      deletedAt: null,
      status: { notIn: ['WON', 'LOST'] },
      OR: [
        { aiScoreUpdatedAt: null },
        { aiScoreUpdatedAt: { lt: sevenDaysAgo } }
      ]
    },
    select: { id: true, organizationId: true }
  });

  for (const lead of staleLeads) {
    await enqueue(QUEUE.AI_SCORING, 'score-lead', {
      leadId: lead.id,
      organizationId: lead.organizationId,
      triggerEvent: 'SWEEP_STALE_LEAD'
    });
  }

  logger.info({ message: 'Completed AI scoring sweep job', queuedLeads: staleLeads.length });
}
