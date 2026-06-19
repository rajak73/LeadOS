// TEN-3.1.4 — Tenancy mechanism micro-benchmark.
//
// Measures the latency of the per-unit-of-work tenancy pattern that Sprint 3 standardizes:
// one interactive transaction whose first statement is `set_config('app.current_organization_id',
// …, true)` (SET LOCAL — transaction-scoped, so it is pinned to the same connection the rest of
// the transaction uses), followed by an RLS-enforced query, all as the NOBYPASSRLS role
// `leados_app`. Reports P50/P95/P99 + a non-tenant baseline.
//
// Purpose: quantify the GUC + RLS overhead and confirm the mechanism is sound before the
// data layer is built (M3 gate). NOTE: this runs against a DIRECT connection locally; the
// transaction-mode pooler (Neon/PgBouncer) validation is recorded in
// docs/planning/TENANCY_POOLING_BENCHMARK.md — SET LOCAL is transaction-mode-pooler-safe by
// construction, but the production number must be taken against the real pooler.
//
// Invoke: DATABASE_APP_URL=… pnpm --filter @leados/api bench:tenancy

import { PrismaClient } from '@prisma/client';
import { TENANT_GUC } from '../src/core/tenancy/tenant-tables.js';

const ADMIN_URL = process.env.DATABASE_URL ?? 'postgresql://leados:leados@localhost:5432/leados';
const APP_URL =
  process.env.DATABASE_APP_URL ?? 'postgresql://leados_app:leados_app@localhost:5432/leados';
const ITERATIONS = Number(process.env.BENCH_ITERATIONS ?? 500);

const admin = new PrismaClient({ datasourceUrl: ADMIN_URL });
const app = new PrismaClient({ datasourceUrl: APP_URL });

function percentile(sortedMs: number[], p: number): number {
  const idx = Math.min(sortedMs.length - 1, Math.ceil((p / 100) * sortedMs.length) - 1);
  return sortedMs[idx]!;
}

function summarize(label: string, samples: number[]): void {
  const s = [...samples].sort((a, b) => a - b);
  const mean = s.reduce((acc, v) => acc + v, 0) / s.length;
  console.log(
    `${label.padEnd(34)} n=${s.length}  ` +
      `mean=${mean.toFixed(3)}ms  p50=${percentile(s, 50).toFixed(3)}ms  ` +
      `p95=${percentile(s, 95).toFixed(3)}ms  p99=${percentile(s, 99).toFixed(3)}ms`,
  );
}

async function main(): Promise<void> {
  // Seed a throwaway org + roles (admin bypasses RLS).
  const nonce = Date.now().toString();
  const [org] = await admin.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO organizations (name, slug, "updatedAt") VALUES ($1, $2, now()) RETURNING id`,
    `bench ${nonce}`,
    `bench-${nonce}`,
  );
  const orgId = org!.id;
  await admin.$executeRawUnsafe(
    `INSERT INTO roles (id, "organizationId", name, "isSystem", "updatedAt")
       VALUES (uuid_generate_v4(), $1::uuid, 'OWNER', true, now()),
              (uuid_generate_v4(), $1::uuid, 'ADMIN', true, now())`,
    orgId,
  );

  try {
    // Warmup (establish connections, plan caches).
    for (let i = 0; i < 50; i++) {
      await app.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SELECT set_config('${TENANT_GUC}', $1, true)`, orgId);
        return tx.role.count();
      });
    }

    const tenantUow: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const t0 = process.hrtime.bigint();
      const n = await app.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SELECT set_config('${TENANT_GUC}', $1, true)`, orgId);
        return tx.role.count();
      });
      const t1 = process.hrtime.bigint();
      if (n !== 2) throw new Error(`expected 2 scoped roles, saw ${n} — RLS/GUC misbehaving`);
      tenantUow.push(Number(t1 - t0) / 1e6);
    }

    // Baseline: a single non-tenant query (no transaction, no GUC) for comparison.
    const baseline: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const t0 = process.hrtime.bigint();
      await app.$queryRawUnsafe(`SELECT 1`);
      const t1 = process.hrtime.bigint();
      baseline.push(Number(t1 - t0) / 1e6);
    }

    console.log(`\nTenancy benchmark — ${ITERATIONS} iterations, role=leados_app, direct connection\n`);
    summarize('tenant unit-of-work (tx+GUC+RLS)', tenantUow);
    summarize('baseline (SELECT 1)', baseline);
    console.log('');
  } finally {
    await admin.$executeRawUnsafe(`DELETE FROM roles WHERE "organizationId" = $1::uuid`, orgId);
    await admin.$executeRawUnsafe(`DELETE FROM organizations WHERE id = $1::uuid`, orgId);
    await admin.$disconnect().catch(() => undefined);
    await app.$disconnect().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error('benchmark errored:', err);
  process.exitCode = 1;
});
