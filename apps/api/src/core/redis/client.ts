// Redis connections (INFRA-2.4). Separate namespaces for cache vs queue so a cache flush
// can never touch queue data (R-TECH-1). Lazy connections so importing this module does
// not open sockets (keeps tests that don't need Redis clean).

import IORedis, { type Redis } from 'ioredis';
import { env } from '../config/env.js';

/** Cache / rate-limit / pub-sub client. */
export const cacheRedis: Redis = new IORedis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 2,
  keyPrefix: 'cache:',
  enableOfflineQueue: false,
});

/**
 * Queue connection factory for BullMQ. BullMQ requires maxRetriesPerRequest: null.
 * A fresh connection is used for queues/workers (not the cache client).
 */
export function createQueueConnection(): Redis {
  return new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    enableOfflineQueue: true,
  });
}

export async function pingRedis(timeoutMs = 1500): Promise<boolean> {
  const probe = new IORedis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: timeoutMs,
    enableOfflineQueue: false,
  });
  try {
    await probe.connect();
    const res = await probe.ping();
    return res === 'PONG';
  } catch {
    return false;
  } finally {
    probe.disconnect();
  }
}
