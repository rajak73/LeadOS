// Sprint 3 M1 / TEN-3.1.2 + TEN-3.1.3 — RLS foundation proof.
//
// Verifies the tenancy correctness floor against a REAL Postgres, connecting as the
// non-bypass application role `leados_app` (DATABASE_APP_URL). RLS is inert for a superuser,
// so proving it as `leados_app` is essential (Risk R3 — a superuser test would be false-green).
//
// DB-gated: self-skips locally without Postgres; executes in CI (DEF-3 guard). The full
// per-table app-layer + RLS isolation suite (ISO-1/ISO-2) is Milestone 2 — this milestone
// proves the foundation (RLS enabled+forced+missing-safe, coverage == registry) and the
// policy semantics on a representative tenant table (`roles`).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../../src/core/prisma/client.js';
import { isPostgresUp } from '../helpers/services.js';
import { env } from '../../src/core/config/env.js';
import {
  TENANT_TABLES,
  TENANT_COLUMN,
  TENANT_GUC,
  NON_TENANT_TABLES,
} from '../../src/core/tenancy/tenant-tables.js';

const pgUp = await isPostgresUp();

// The RLS-enforced app role. Falls back to the local dev credential created by migration 0002.
const APP_URL =
  env.DATABASE_APP_URL ?? 'postgresql://leados_app:leados_app@localhost:5432/leados';

// Admin (superuser) client = the imported `prisma` singleton, used for seeding + introspection
// (bypasses RLS). App client connects as leados_app so RLS actually applies.
const appPrisma = new PrismaClient({ datasourceUrl: APP_URL });

let orgA = '';
let orgB = '';

/** Run a unit of work as the tenant app role with the GUC pinned (SET LOCAL) — or unset. */
async function asTenant<T>(
  orgId: string | null,
  fn: (tx: Parameters<Parameters<typeof appPrisma.$transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return appPrisma.$transaction(async (tx) => {
    if (orgId !== null) {
      await tx.$executeRawUnsafe(`SELECT set_config('${TENANT_GUC}', $1, true)`, orgId);
    }
    return fn(tx);
  });
}

beforeAll(async () => {
  if (!pgUp) return;
  const nonce = process.hrtime.bigint().toString();
  const [a] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO organizations (name, slug, "updatedAt") VALUES ($1, $2, now()) RETURNING id`,
    `RLS A ${nonce}`,
    `rls-a-${nonce}`,
  );
  const [b] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO organizations (name, slug, "updatedAt") VALUES ($1, $2, now()) RETURNING id`,
    `RLS B ${nonce}`,
    `rls-b-${nonce}`,
  );
  orgA = a!.id;
  orgB = b!.id;
  // Seed roles: 2 for A, 1 for B (admin client bypasses RLS).
  await prisma.$executeRawUnsafe(
    `INSERT INTO roles (id, "organizationId", name, "isSystem", "updatedAt")
       VALUES (uuid_generate_v4(), $1::uuid, 'OWNER', true, now()),
              (uuid_generate_v4(), $1::uuid, 'ADMIN', true, now())`,
    orgA,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO roles (id, "organizationId", name, "isSystem", "updatedAt")
       VALUES (uuid_generate_v4(), $1::uuid, 'OWNER', true, now())`,
    orgB,
  );
});

afterAll(async () => {
  if (pgUp && orgA && orgB) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM roles WHERE "organizationId" IN ($1::uuid, $2::uuid)`,
      orgA,
      orgB,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM organizations WHERE id IN ($1::uuid, $2::uuid)`,
      orgA,
      orgB,
    );
  }
  await appPrisma.$disconnect().catch(() => undefined);
});

describe.skipIf(!pgUp)('RLS foundation — structure (TEN-3.1.2)', () => {
  it('every tenant table has RLS ENABLED + FORCED with a policy', async () => {
    const rows = await prisma.$queryRawUnsafe<
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
    expect(rows.length).toBe(TENANT_TABLES.length);
    for (const r of rows) {
      expect(r.rls, `${r.relname} ENABLE RLS`).toBe(true);
      expect(r.forced, `${r.relname} FORCE RLS`).toBe(true);
      expect(Number(r.policies), `${r.relname} policy count`).toBeGreaterThanOrEqual(1);
    }
  });

  it('RLS coverage == registry: every organizationId-bearing table is registered (TEN-3.1.3)', async () => {
    // Exclude partition child tables (relispartition = true): partition children inherit the
    // organizationId column from the parent table AND inherit the parent's RLS policies in
    // PG 12+. Only the parent partition table ("activities") is in the registry.
    const rows = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
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
    const withTenantColumn = rows.map((r) => r.table_name).sort();
    expect(withTenantColumn).toEqual([...TENANT_TABLES].sort());
    // And the documented exclusions genuinely carry no tenant column.
    for (const t of NON_TENANT_TABLES) {
      expect(withTenantColumn).not.toContain(t);
    }
  });

  it('the application role is non-superuser and NOBYPASSRLS (Risk R3)', async () => {
    const [role] = await prisma.$queryRawUnsafe<
      { rolsuper: boolean; rolbypassrls: boolean }[]
    >(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'leados_app'`);
    expect(role?.rolsuper).toBe(false);
    expect(role?.rolbypassrls).toBe(false);
  });
});

describe.skipIf(!pgUp)('RLS foundation — enforcement as leados_app (missing-safe)', () => {
  it('unset GUC → zero rows (missing-safe deny)', async () => {
    const count = await asTenant(null, (tx) => tx.role.count());
    expect(count).toBe(0);
  });

  it('GUC = org A → sees only org A rows', async () => {
    const { all, a, b } = await asTenant(orgA, async (tx) => ({
      all: await tx.role.count(),
      a: await tx.role.count({ where: { organizationId: orgA } }),
      b: await tx.role.count({ where: { organizationId: orgB } }),
    }));
    expect(a).toBe(2);
    expect(b).toBe(0); // org B is invisible under org A's context
    expect(all).toBe(2);
  });

  it('GUC = org B → sees only org B rows', async () => {
    const count = await asTenant(orgB, (tx) => tx.role.count());
    expect(count).toBe(1);
  });

  it('WITH CHECK → inserting a row for a different org is rejected', async () => {
    await expect(
      asTenant(orgA, (tx) =>
        tx.role.create({ data: { organizationId: orgB, name: 'EVIL', isSystem: false } }),
      ),
    ).rejects.toThrow();
  });

  it('inserting a row for the active org is allowed (positive control)', async () => {
    const created = await asTenant(orgA, (tx) =>
      tx.role.create({ data: { organizationId: orgA, name: 'TEMP', isSystem: false } }),
    );
    expect(created.organizationId).toBe(orgA);
    await prisma.$executeRawUnsafe(`DELETE FROM roles WHERE id = $1::uuid`, created.id);
  });

  it('cross-org UPDATE/DELETE affect zero rows (target invisible)', async () => {
    const updated = await asTenant(orgA, (tx) =>
      tx.role.updateMany({ where: { organizationId: orgB }, data: { name: 'HIJACK' } }),
    );
    expect(updated.count).toBe(0);
    const deleted = await asTenant(orgA, (tx) =>
      tx.role.deleteMany({ where: { organizationId: orgB } }),
    );
    expect(deleted.count).toBe(0);
    // Confirm org B's row is still intact (via admin, bypassing RLS).
    const survivors = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM roles WHERE "organizationId" = $1::uuid`,
      orgB,
    );
    expect(Number(survivors[0]!.n)).toBe(1);
  });
});
