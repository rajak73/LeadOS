// Integration: the defining M0 proof — a job ENQUEUED by the API is processed by a worker
// (the worker-registry processor, i.e. the separate-process code path). Requires Redis, so
// it self-gates: runs in CI (docker-compose Redis) and is skipped locally without infra.

import { describe, it, expect, afterAll } from 'vitest';
import { Worker } from 'bullmq';
import { isRedisUp } from '../helpers/services.js';
import { createQueueConnection } from '../../src/core/redis/client.js';
import { enqueueHealthEcho, HEALTH_ECHO_JOB, processHealthEcho } from '../../src/core/queue/jobs/health-echo.js';
import type { HealthEchoPayload } from '../../src/core/queue/jobs/health-echo.js';
import { QUEUE } from '../../src/core/queue/names.js';
import { closeQueues } from '../../src/core/queue/queues.js';

const redisUp = await isRedisUp();

afterAll(async () => {
  await closeQueues();
});

describe.skipIf(!redisUp)('queue round-trip (API → queue → worker)', () => {
  it('processes a health-echo job enqueued by the API in a separate worker', async () => {
    const nonce = `nonce-${Math.floor(process.hrtime()[1])}`;
    const connection = createQueueConnection();

    const processed = new Promise<string>((resolve, reject) => {
      const worker = new Worker(
        QUEUE.SYSTEM,
        async (job) => {
          if (job.name === HEALTH_ECHO_JOB) {
            const result = processHealthEcho(job.data as HealthEchoPayload);
            return result;
          }
          return undefined;
        },
        { connection },
      );
      worker.on('completed', (job, result) => {
        if ((result as { nonce?: string })?.nonce === nonce) {
          void worker.close().then(() => resolve(nonce));
        }
      });
      worker.on('error', reject);
    });

    const jobId = await enqueueHealthEcho(nonce);
    expect(jobId).toBeTruthy();

    await expect(processed).resolves.toBe(nonce);
  }, 15000);
});

// Document, in the test output, when the gated suite is skipped.
describe.runIf(!redisUp)('queue round-trip (skipped: no Redis)', () => {
  it('is gated on Redis availability (runs in CI with docker-compose)', () => {
    expect(redisUp).toBe(false);
  });
});
