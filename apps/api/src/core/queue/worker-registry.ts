// Worker registration (INFRA-2.5). Run in the SEPARATE worker process (worker.ts).
// Sprint 1 wires the `system` queue worker (demo job) with DLQ + metrics. Domain queues'
// workers are registered by their owning modules in later sprints via registerWorker().

import { Worker, type Processor } from 'bullmq';
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
  processWebhookJob,
  reEnqueueStalePendingWebhooks,
} from './workers/webhook.worker.js';

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

/** Starts all domain workers. Sprint-5 M4 adds the webhook-processing worker. */
export function startWorkers(): Worker[] {
  registerWorker('system', async (job) => {
    if (job.name === HEALTH_ECHO_JOB) {
      return processHealthEcho(job.data as HealthEchoPayload);
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
