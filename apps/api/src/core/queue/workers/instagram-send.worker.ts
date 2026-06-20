// Instagram Send Worker — Sprint 6 M1 stub.
//
// This worker processes jobs from the INSTAGRAM_SEND queue. The queue itself is registered
// here so BullMQ can consume it; the actual send logic (Meta Graph API call, window check,
// token decryption) is implemented in Sprint 6 M2.

import { Worker } from 'bullmq';
import { QUEUE } from '../names.js';
import { createQueueConnection } from '../../redis/client.js';
import { logger } from '../../observability/logger.js';

export function createInstagramSendWorker(): Worker {
  return new Worker(
    QUEUE.INSTAGRAM_SEND,
    async (job) => {
      logger.info({ message: 'instagram-send worker: processing (stub)', jobId: job.id, jobName: job.name });
      // Sprint 6 M2 will implement: token decrypt → window check → Meta API call.
      throw new Error('INSTAGRAM_SEND worker not yet implemented (Sprint 6 M2)');
    },
    {
      connection: createQueueConnection(),
      concurrency: 5,
    },
  );
}
