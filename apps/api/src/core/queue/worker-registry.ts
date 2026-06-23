// Worker registration (INFRA-2.5). Run in the SEPARATE worker process (worker.ts).
// Sprint 1 wires the `system` queue worker (demo job) with DLQ + metrics. Domain queues'
// workers are registered by their owning modules in later sprints via registerWorker().

import { Worker, type Processor } from 'bullmq';
import { prisma } from '../prisma/client.js';
import { createQueueConnection } from '../redis/client.js';
import { logger } from '../observability/logger.js';
import { queueJobsProcessed } from '../observability/metrics.js';
import { moveToDeadLetter } from './dlq.js';
import { QUEUE_CONCURRENCY, type QueueName } from './names.js';
import { HEALTH_ECHO_JOB, processHealthEcho, type HealthEchoPayload } from './jobs/health-echo.js';
import { LEAD_IMPORT_JOB, processLeadImportJob } from './workers/lead-import.worker.js';
import { LEAD_EXPORT_JOB, processLeadExportJob } from './workers/lead-export.worker.js';
import {
  WEBHOOK_JOB,
  INSTAGRAM_WEBHOOK_SUBSCRIBE_JOB,
  INSTAGRAM_ENRICH_JOB,
  processWebhookJob,
  processInstagramWebhookSubscribeJob,
  processInstagramEnrichJob,
  reEnqueueStalePendingWebhooks,
} from './workers/webhook.worker.js';
import { createInstagramSendWorker } from './workers/instagram-send.worker.js';
import { NOTIFICATION_DELIVERY_JOB, processNotificationDeliveryJob } from './workers/notification-delivery.worker.js';
import { EMAIL_DELIVERY_JOB, processEmailDeliveryJob } from './workers/email-delivery.worker.js';
import { AI_SCORING_JOB, processAiScoringJob } from './workers/ai-scoring.worker.js';
import { processWorkflowExecutionJob } from './workers/workflow-execution.worker.js';
import { processFollowupSweepJob } from './workers/followup-sweep.worker.js';
import { WHATSAPP_SEND_JOB, processWhatsAppSendJob } from './workers/whatsapp-send.worker.js';

const workers: Worker[] = [];

export function registerWorker(name: QueueName, processor: Processor): Worker {
  const worker = new Worker(name, processor, {
    connection: createQueueConnection(),
    concurrency: QUEUE_CONCURRENCY[name],
  });

  worker.on('completed', (job) => {
    queueJobsProcessed.inc({ queue: name, status: 'completed' });
    logger.debug({ message: 'Job completed', queue: name, jobId: job.id });
  });

  worker.on('failed', async (job, err) => {
    queueJobsProcessed.inc({ queue: name, status: 'failed' });
    const exhausted = !job || job.attemptsMade >= (job.opts.attempts ?? 1);
    logger.warn({
      message: 'Job failed',
      queue: name,
      jobId: job?.id,
      attemptsMade: job?.attemptsMade,
      error: err.message,
    });
    if (exhausted) {
      await moveToDeadLetter(name, job?.id, job?.data, err.message);
    }
  });

  workers.push(worker);
  return worker;
}

/** Starts all domain workers. Sprint-6 M1 adds the instagram-send stub worker. */
export function startWorkers(): Worker[] {
  registerWorker('system', async (job) => {
    if (job.name === HEALTH_ECHO_JOB) {
      return processHealthEcho(job.data as HealthEchoPayload);
    }
    if (job.name === 'instagram-token-refresh') {
      const { InstagramService } = await import('../../modules/instagram/instagram.service.js');
      return new InstagramService().refreshAllActiveTokens();
    }
    if (job.name === 'followup-sweep') {
      return processFollowupSweepJob(job);
    }
    if (job.name === 'billing-reconciliation') {
      const { BillingService } = await import('../../modules/billing/billing.service.js');
      const service = new BillingService(prisma);
      return service.reconcileSubscriptions();
    }
    return undefined;
  });

  registerWorker('lead-import', async (job) => {
    if (job.name === LEAD_IMPORT_JOB) {
      return processLeadImportJob(job);
    }
    return undefined;
  });

  registerWorker('lead-export', async (job) => {
    if (job.name === LEAD_EXPORT_JOB) {
      return processLeadExportJob(job);
    }
    return undefined;
  });

  registerWorker('webhook-processing', async (job) => {
    if (job.name === WEBHOOK_JOB) {
      return processWebhookJob(job);
    }
    if (job.name === INSTAGRAM_WEBHOOK_SUBSCRIBE_JOB) {
      return processInstagramWebhookSubscribeJob(job);
    }
    if (job.name === INSTAGRAM_ENRICH_JOB) {
      return processInstagramEnrichJob(job);
    }
    return undefined;
  });

  // Sprint 6 M1 — Instagram send worker (stub; full implementation in M2).
  const instagramSendWorker = createInstagramSendWorker();
  workers.push(instagramSendWorker);

  // Sprint 7 M1 — Notification + email delivery workers.
  registerWorker('notification-delivery', async (job) => {
    if (job.name === NOTIFICATION_DELIVERY_JOB) {
      return processNotificationDeliveryJob(job);
    }
    return undefined;
  });

  registerWorker('email-delivery', async (job) => {
    if (job.name === EMAIL_DELIVERY_JOB) {
      return processEmailDeliveryJob(job);
    }
    return undefined;
  });

  registerWorker('ai-scoring', async (job) => {
    if (job.name === AI_SCORING_JOB) {
      return processAiScoringJob(job);
    }
    return undefined;
  });

  registerWorker('workflow-execution', async (job) => {
    // Process both event-named jobs and default workflow jobs
    return processWorkflowExecutionJob(job);
  });

  // Sprint 9 — WhatsApp send worker.
  registerWorker('whatsapp-send', async (job) => {
    if (job.name === WHATSAPP_SEND_JOB) {
      return processWhatsAppSendJob(job);
    }
    return undefined;
  });

  // Re-enqueue PENDING webhook events orphaned by a crash between DB write and Redis enqueue.
  void reEnqueueStalePendingWebhooks().catch((err: Error) => {
    logger.warn({ message: 'Stale webhook re-enqueue failed on startup', error: err.message });
  });

  logger.info({ message: 'Workers started', queues: workers.length });
  return workers;
}

export async function stopWorkers(): Promise<void> {
  await Promise.all(workers.map((w) => w.close()));
  workers.length = 0;
}
