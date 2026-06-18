// Single-flight scheduler (INFRA-3.1 / AR-5). Uses BullMQ repeatable jobs keyed by a
// stable jobId, so the SAME cron registered on N instances runs once, not N times.
// Sprint 1 proves the mechanism; the registry it schedules is currently empty.

import { getQueue } from '../queue/queues.js';
import { QUEUE } from '../queue/names.js';
import { logger } from '../observability/logger.js';
import { CRON_REGISTRY, type CronDefinition } from './cron-registry.js';

export async function scheduleCron(def: CronDefinition): Promise<void> {
  const queue = getQueue(QUEUE.SYSTEM);
  await queue.add(
    def.id,
    { cronId: def.id },
    {
      jobId: def.id, // single-flight: identical jobId is deduplicated across instances
      repeat: { pattern: def.cron },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );
  logger.info({ message: 'Cron scheduled', id: def.id, cron: def.cron });
}

export async function scheduleAllCrons(): Promise<void> {
  for (const def of CRON_REGISTRY) {
    await scheduleCron(def);
  }
  logger.info({ message: 'Cron registry scheduled', count: CRON_REGISTRY.length });
}
