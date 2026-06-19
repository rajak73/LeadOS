// TEN-3.1.3 — RLS coverage gate (CI + local). Asserts, against a real database, that:
//   1. the set of tables physically carrying the tenant column == the tenant-table registry
//      (no org-scoped table is unprotected, and the registry has no phantom entries), and
//   2. every registry table has RLS ENABLED + FORCED with at least one policy.
//
// Exits non-zero (and prints what is wrong) on any gap. Introspection-only — runs as the
// admin/migration connection (DATABASE_URL). Invoke: `pnpm --filter @leados/api check:rls`.

import { PrismaClient } from '@prisma/client';
import { TENANT_TABLES, TENANT_COLUMN } from '../src/core/tenancy/tenant-tables.js';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const failures: string[] = [];

  // 1. Coverage == registry.
  const cols = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = $1`,
    TENANT_COLUMN,
  );
  const physical = new Set(cols.map((c) => c.table_name));
  const registry = new Set<string>(TENANT_TABLES);
  for (const t of physical) {
    if (!registry.has(t)) failures.push(`table "${t}" has ${TENANT_COLUMN} but is NOT in the registry → would ship without enforced RLS`);
  }
  for (const t of registry) {
    if (!physical.has(t)) failures.push(`registry table "${t}" has no ${TENANT_COLUMN} column → stale registry entry`);
  }

  // 2. RLS enabled + forced + policy on every registry table.
  const rls = await prisma.$queryRawUnsafe<
    { relname: string; rls: boolean; forced: boolean; policies: bigint }[]
  >(
    `SELECT c.relname,
            c.relrowsecurity AS rls,
            c.relforcerowsecurity AS forced,
            (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])`,
    TENANT_TABLES as unknown as string[],
  );
  const seen = new Map(rls.map((r) => [r.relname, r]));
  for (const t of TENANT_TABLES) {
    const r = seen.get(t);
    if (!r) {
      failures.push(`table "${t}" not found in the database`);
      continue;
    }
    if (!r.rls) failures.push(`table "${t}" does not have RLS ENABLED`);
    if (!r.forced) failures.push(`table "${t}" does not have RLS FORCED`);
    if (Number(r.policies) < 1) failures.push(`table "${t}" has no RLS policy`);
  }

  if (failures.length > 0) {
    console.error('RLS coverage check FAILED:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `RLS coverage check: OK — ${TENANT_TABLES.length} tenant tables enabled + forced + policied; coverage matches registry.`,
  );
}

main()
  .catch((err) => {
    console.error('RLS coverage check errored:', err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
