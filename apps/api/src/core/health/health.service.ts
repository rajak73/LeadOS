// Health checks (INFRA-2.7). Each dependency check resolves to a status + latency and
// NEVER throws (a downed dependency reports 'down', it doesn't crash the probe).

import { pingDatabase } from '../prisma/client.js';
import { pingRedis } from '../redis/client.js';
import { queueDepth } from '../queue/queues.js';
import { QUEUE } from '../queue/names.js';
import { env } from '../config/env.js';

export interface DependencyCheck {
  status: 'ok' | 'down';
  latencyMs: number;
}

export interface DeepHealth {
  status: 'ok' | 'degraded';
  checks: {
    database: DependencyCheck;
    redis: DependencyCheck;
    queue: DependencyCheck & { systemDepth: number };
  };
  version: string;
  uptimeSec: number;
}

async function timed(fn: () => Promise<boolean>): Promise<DependencyCheck> {
  const start = Date.now();
  const ok = await fn().catch(() => false);
  return { status: ok ? 'ok' : 'down', latencyMs: Date.now() - start };
}

export async function getDeepHealth(): Promise<DeepHealth> {
  const [database, redis] = await Promise.all([timed(pingDatabase), timed(pingRedis)]);

  let systemDepth = 0;
  let queueStatus: DependencyCheck = { status: 'down', latencyMs: 0 };
  const qStart = Date.now();
  try {
    systemDepth = await queueDepth(QUEUE.SYSTEM);
    queueStatus = { status: 'ok', latencyMs: Date.now() - qStart };
  } catch {
    queueStatus = { status: 'down', latencyMs: Date.now() - qStart };
  }

  const allOk =
    database.status === 'ok' && redis.status === 'ok' && queueStatus.status === 'ok';

  return {
    status: allOk ? 'ok' : 'degraded',
    checks: {
      database,
      redis,
      queue: { ...queueStatus, systemDepth },
    },
    version: env.GIT_SHA,
    uptimeSec: Math.floor(process.uptime()),
  };
}
