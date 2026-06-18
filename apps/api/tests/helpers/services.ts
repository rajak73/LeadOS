// Probes that let integration tests self-gate on external infra. CI provides Postgres +
// Redis via docker-compose, so the gated suites RUN there; locally without infra they are
// skipped (not omitted) so `pnpm test` is green everywhere. This is the documented gating
// pattern from SPRINT_1_EXECUTION_PLAN §6.5 — not a way to skip required CI coverage.

import { pingRedis } from '../../src/core/redis/client.js';
import { pingDatabase, prisma } from '../../src/core/prisma/client.js';

// In CI the Postgres + Redis services are guaranteed up (ci.yml `services:`), so a probe
// that comes back false there means the infra/env is misconfigured (e.g. the connection env
// var was not passed through to the test process) — NOT a legitimate "no local infra" skip.
// Turning that into a hard failure is the DEF-3 guardrail: it stops the gated auth/queue
// integration suites from silently skipping in CI and giving a false-green run.
const inCI = process.env.CI === 'true' || process.env.CI === '1';

function assertUpInCI(up: boolean, service: string): boolean {
  if (inCI && !up) {
    throw new Error(
      `[DEF-3 guard] ${service} probe returned false while running in CI. The ${service} ` +
        `service must be reachable in CI so the gated integration tests execute. Check the ` +
        `CI service definition and that its connection env var is passed through to the ` +
        `test task (turbo.json passThroughEnv).`,
    );
  }
  return up;
}

export async function isRedisUp(): Promise<boolean> {
  return assertUpInCI(await pingRedis(1000), 'Redis');
}

export async function isPostgresUp(): Promise<boolean> {
  let up = false;
  try {
    up = await pingDatabase();
  } catch {
    up = false;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
  return assertUpInCI(up, 'Postgres');
}
