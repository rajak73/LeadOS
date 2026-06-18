// Dead-letter handling: when a job exhausts its retries, its payload is preserved for
// inspection/replay (doc 04 §4.5). Sprint 1 stores DLQ entries in a Redis list per queue.

import { createQueueConnection } from '../redis/client.js';
import { logger } from '../observability/logger.js';
import type { QueueName } from './names.js';

const dlqConnection = createQueueConnection();

export async function moveToDeadLetter(
  queue: QueueName,
  jobId: string | undefined,
  data: unknown,
  reason: string,
): Promise<void> {
  const entry = JSON.stringify({ jobId, data, reason, at: new Date().toISOString() });
  try {
    await dlqConnection.lpush(`dlq:${queue}`, entry);
    await dlqConnection.ltrim(`dlq:${queue}`, 0, 9999);
  } catch (err) {
    logger.error({ message: 'Failed to write to DLQ', queue, error: String(err) });
  }
  logger.error({ message: 'Job moved to dead-letter queue', queue, jobId, reason });
}

export async function deadLetterDepth(queue: QueueName): Promise<number> {
  try {
    return await dlqConnection.llen(`dlq:${queue}`);
  } catch {
    return 0;
  }
}
