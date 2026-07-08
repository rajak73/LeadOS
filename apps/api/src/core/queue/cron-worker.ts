import { Worker, type Job } from 'bullmq';
import { createQueueConnection } from '../redis/client.js';
import { logger } from '../observability/logger.js';
import { QUEUE } from './names.js';
import { processWebhookJob, WEBHOOK_JOB, INSTAGRAM_WEBHOOK_SUBSCRIBE_JOB, INSTAGRAM_ENRICH_JOB, type WebhookJobPayload, type InstagramWebhookSubscribePayload, type InstagramEnrichPayload } from './workers/webhook.worker.js';
import { processInstagramSendJob, INSTAGRAM_SEND_JOB, type InstagramSendJobPayload } from './workers/instagram-send.worker.js';
import { processWhatsAppSendJob, WHATSAPP_SEND_JOB, type WhatsAppSendPayload } from './workers/whatsapp-send.worker.js';
import { env } from '../config/env.js';
import IORedis from 'ioredis';

/**
 * Temporarily instantiates a Worker to drain a maximum number of jobs from a specific queue.
 * Ensures the worker shuts down gracefully after hitting the max limit or the queue drains.
 */
async function processQueueBatch(
  queueName: string,
  maxJobs: number,
  timeoutMs: number,
  processor: (job: Job, token?: string) => Promise<unknown>,
): Promise<{ processed: number; failed: number }> {
  return new Promise((resolve) => {
    let processed = 0;
    let failed = 0;
    let done = false;

    const worker = new Worker(queueName, async (job, token) => {
      if (done) return;
      try {
        await processor(job, token);
        processed++;
      } catch (err) {
        failed++;
        throw err; // Let BullMQ handle the failure (retry, DLQ, etc.)
      } finally {
        if (processed + failed >= maxJobs && !done) {
          done = true;
          worker.close().then(() => resolve({ processed, failed }));
        }
      }
    }, {
      connection: createQueueConnection(),
      concurrency: 1, // Strict sequential processing to avoid db burst or overlapping logic
    });

    worker.on('drained', () => {
      if (!done) {
        done = true;
        worker.close().then(() => resolve({ processed, failed }));
      }
    });

    worker.on('error', (err) => {
      logger.error({ message: `Cron worker error for queue ${queueName}`, error: err.message });
      if (!done) {
        done = true;
        worker.close().then(() => resolve({ processed, failed }));
      }
    });

    // Safety timeout to ensure the batch doesn't run forever
    setTimeout(() => {
      if (!done) {
        done = true;
        logger.warn({ message: `Cron worker timeout for queue ${queueName}`, timeoutMs, processed, failed });
        worker.close().then(() => resolve({ processed, failed }));
      }
    }, timeoutMs);
  });
}

/**
 * Drains all Phase 9B queues synchronously within the requested timeout.
 */
export async function drainQueuesBatch(maxJobs: number, batchTimeoutMs: number): Promise<Record<string, { processed: number; failed: number }>> {
  const results: Record<string, { processed: number; failed: number }> = {};
  
  // 1. Webhooks
  results[QUEUE.WEBHOOK_PROCESSING] = await processQueueBatch(
    QUEUE.WEBHOOK_PROCESSING,
    maxJobs,
    batchTimeoutMs,
    async (job: Job) => {
      if (job.name === WEBHOOK_JOB) {
        return processWebhookJob(job as Job<WebhookJobPayload>);
      } else if (job.name === INSTAGRAM_WEBHOOK_SUBSCRIBE_JOB || job.name === INSTAGRAM_ENRICH_JOB) {
        const { processInstagramWebhookSubscribeJob, processInstagramEnrichJob } = await import('./workers/webhook.worker.js');
        if (job.name === INSTAGRAM_WEBHOOK_SUBSCRIBE_JOB) return processInstagramWebhookSubscribeJob(job as Job<InstagramWebhookSubscribePayload>);
        if (job.name === INSTAGRAM_ENRICH_JOB) return processInstagramEnrichJob(job as Job<InstagramEnrichPayload>);
      }
      return undefined;
    }
  );

  // 2. Instagram Sends
  const rateLimitRedis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
  results[QUEUE.INSTAGRAM_SEND] = await processQueueBatch(
    QUEUE.INSTAGRAM_SEND,
    maxJobs,
    batchTimeoutMs,
    async (job: Job, token?: string) => {
      if (job.name === INSTAGRAM_SEND_JOB) {
        return processInstagramSendJob(job as Job<InstagramSendJobPayload>, token, rateLimitRedis);
      }
      return undefined;
    }
  );
  rateLimitRedis.disconnect();

  // 3. WhatsApp Sends
  results[QUEUE.WHATSAPP_SEND] = await processQueueBatch(
    QUEUE.WHATSAPP_SEND,
    maxJobs,
    batchTimeoutMs,
    async (job: Job) => {
      if (job.name === WHATSAPP_SEND_JOB) {
        return processWhatsAppSendJob(job as Job<WhatsAppSendPayload>);
      }
      return undefined;
    }
  );

  return results;
}
