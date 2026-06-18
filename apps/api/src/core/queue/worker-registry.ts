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

/** Starts the Sprint-1 worker set (the system/demo queue). */
export function startWorkers(): Worker[] {
  registerWorker('system', async (job) => {
    if (job.name === HEALTH_ECHO_JOB) {
      return processHealthEcho(job.data as HealthEchoPayload);
    }
    return undefined;
  });
  logger.info({ message: 'Workers started', queues: workers.length });
  return workers;
}

export async function stopWorkers(): Promise<void> {
  await Promise.all(workers.map((w) => w.close()));
  workers.length = 0;
}
