// TEN-3.1.3 — RLS coverage gate (CI + local). Asserts, against a real database, that:
//   1. the set of tables physically carrying the tenant column == the tenant-table registry
//      (no org-scoped table is unprotected, and the registry has no phantom entries), and
//   2. every registry table has RLS ENABLED + FORCED with at least one policy.
//
// Exits non-zero (and prints what is wrong) on any gap. Introspection-only — runs as the
// admin/migration connection (DATABASE_URL). Invoke: `pnpm --filter @leados/api check:rls`.

import { PrismaClient } from '@prisma/client';
import { TENANT_TABLES, TENANT_COLUMN } from '../src/core/tenancy/tenant-tables.js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load workspace-root .env when DATABASE_URL is not already in the environment.
// Mirrors the pattern in tests/global-setup.ts so the script runs without the caller
// needing to manually export vars. Empty values (placeholder stubs) are skipped.
(function loadEnvFile() {
  if (process.env['DATABASE_URL']) return;
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
    const raw = readFileSync(resolve(root, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (key && val && !(key in process.env)) process.env[key] = val;
    }
  } catch { /* .env absent — caller must supply DATABASE_URL explicitly */ }
})();

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const failures: string[] = [];

  // 1. Coverage == registry.
  // Exclude partition child tables (relispartition = true): they inherit the organizationId
  // column AND the parent's RLS policies automatically in PG 12+, so they do not need a
  // separate registry entry. Only the parent partition table ("activities") is registered.
  const cols = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT col.table_name
       FROM information_schema.columns col
       JOIN pg_class c ON c.relname = col.table_name AND c.relnamespace = (
         SELECT oid FROM pg_namespace WHERE nspname = 'public'
       )
      WHERE col.table_schema = 'public'
        AND col.column_name = $1
        AND c.relispartition = false`,
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
