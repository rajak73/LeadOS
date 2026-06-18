// Probes that let integration tests self-gate on external infra. CI provides Postgres +
// Redis via docker-compose, so the gated suites RUN there; locally without infra they are
// skipped (not omitted) so `pnpm test` is green everywhere. This is the documented gating
// pattern from SPRINT_1_EXECUTION_PLAN §6.5 — not a way to skip required CI coverage.

import { pingRedis } from '../../src/core/redis/client.js';
import { pingDatabase, prisma } from '../../src/core/prisma/client.js';

export async function isRedisUp(): Promise<boolean> {
  return pingRedis(1000);
}

export async function isPostgresUp(): Promise<boolean> {
  try {
    return await pingDatabase();
  } catch {
    return false;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}
