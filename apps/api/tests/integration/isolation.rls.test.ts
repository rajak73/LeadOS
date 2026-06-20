// Sprint 3 M6 / ISO-2 — RLS-layer isolation suite.
//
// Connects as `leados_app` (DATABASE_APP_URL) — the NOBYPASSRLS application role — so
// PostgreSQL RLS is actually enforced. A superuser connection would bypass RLS and give
// false-green results (Risk R3). This suite proves the DB backstop holds independently of
// the app-layer extension:
//
//   • Unset GUC → 0 rows on ALL 5 tenant tables (missing-safe policy).
//   • GUC = orgA → only orgA rows visible (not orgB).
//   • WITH CHECK → cross-org inserts rejected.
//   • Cross-org UPDATE/DELETE → 0 rows affected (orgB invisible to orgA's GUC).
//
// The structural checks (RLS enabled + forced + policy on every table) are in
// rls.foundation.test.ts and not duplicated here — that file asserts the floor,
// this file asserts the per-table enforcement breadth.
//
// DB-gated; DEF-3 guard fires in CI if Postgres is unreachable.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../../src/core/prisma/client.js';
import { isPostgresUp } from '../helpers/services.js';
import { env } from '../../src/core/config/env.js';
import { TENANT_GUC } from '../../src/core/tenancy/tenant-tables.js';

const pgUp = await isPostgresUp();

// The non-bypass application role — RLS is enforced for this connection.
const APP_URL =
  env.DATABASE_APP_URL ?? 'postgresql://leados_app:leados_app@localhost:5432/leados';

const appPrisma = new PrismaClient({ datasourceUrl: APP_URL });

// ─── asTenant helper ──────────────────────────────────────────────────────────

/** Open a transaction as leados_app. If orgId is null, the GUC is NOT set (missing-safe test). */
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

// ─── Seed state ───────────────────────────────────────────────────────────────

let orgA = '';
let orgB = '';
let roleA_id = '';
let roleB_id = '';
let memberB_id = '';
let userA = '';
let userB = '';

beforeAll(async () => {
  if (!pgUp) return;
  const n = process.hrtime.bigint().toString();

  // Orgs
  const [a] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO organizations (name, slug, "updatedAt") VALUES ($1,$2,now()) RETURNING id`,
    `ISO-2 A ${n}`, `iso2-a-${n}`,
  );
  const [b] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO organizations (name, slug, "updatedAt") VALUES ($1,$2,now()) RETURNING id`,
    `ISO-2 B ${n}`, `iso2-b-${n}`,
  );
  orgA = a!.id;
  orgB = b!.id;

  // Roles (one each, via admin to bypass RLS)
  const [rA] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO roles (id,"organizationId",name,"isSystem","updatedAt")
       VALUES (uuid_generate_v4(),$1::uuid,'OWNER',true,now()) RETURNING id`, orgA,
  );
  const [rB] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO roles (id,"organizationId",name,"isSystem","updatedAt")
       VALUES (uuid_generate_v4(),$1::uuid,'OWNER',true,now()) RETURNING id`, orgB,
  );
  roleA_id = rA!.id;
  roleB_id = rB!.id;

  // Users
  const [ua] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO users (email,"passwordHash","firstName","lastName","updatedAt")
       VALUES ($1,'x','F','L',now()) RETURNING id`, `ua+${n}@iso2.test`,
  );
  const [ub] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO users (email,"passwordHash","firstName","lastName","updatedAt")
       VALUES ($1,'x','F','L',now()) RETURNING id`, `ub+${n}@iso2.test`,
  );
  userA = ua!.id;
  userB = ub!.id;

  // organization_members
  await prisma.$executeRawUnsafe(
    `INSERT INTO organization_members (id,"organizationId","userId","roleId",status,"updatedAt")
       VALUES (uuid_generate_v4(),$1::uuid,$2::uuid,$3::uuid,'ACTIVE',now())`,
    orgA, userA, roleA_id,
  );
  const [mB] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO organization_members (id,"organizationId","userId","roleId",status,"updatedAt")
       VALUES (uuid_generate_v4(),$1::uuid,$2::uuid,$3::uuid,'ACTIVE',now()) RETURNING id`,
    orgB, userB, roleB_id,
  );
  memberB_id = mB!.id;

  // audit_logs (admin connection — not gated by RLS for seed; no updatedAt on this table)
  await prisma.$executeRawUnsafe(
    `INSERT INTO audit_logs (id,"organizationId",action,resource)
       VALUES (uuid_generate_v4(),$1::uuid,'seed','iso2')`,
    orgA,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO audit_logs (id,"organizationId",action,resource)
       VALUES (uuid_generate_v4(),$1::uuid,'seed','iso2')`,
    orgB,
  );

  // subscriptions (one per org — organizationId is unique on subscriptions)
  await prisma.$executeRawUnsafe(
    `INSERT INTO subscriptions (id,"organizationId",plan,status,"updatedAt")
       VALUES (uuid_generate_v4(),$1::uuid,'TRIAL','TRIALING',now())
       ON CONFLICT ("organizationId") DO NOTHING`,
    orgA,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO subscriptions (id,"organizationId",plan,status,"updatedAt")
       VALUES (uuid_generate_v4(),$1::uuid,'TRIAL','TRIALING',now())
       ON CONFLICT ("organizationId") DO NOTHING`,
    orgB,
  );

  // refresh_tokens (one per org, linked to each org's user)
  await prisma.$executeRawUnsafe(
    `INSERT INTO refresh_tokens (id,"userId","organizationId","tokenHash",family,"expiresAt")
       VALUES (uuid_generate_v4(),$1::uuid,$2::uuid,$3,uuid_generate_v4(),now()+'1 hour')`,
    userA, orgA, `hash-a-${n}`,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO refresh_tokens (id,"userId","organizationId","tokenHash",family,"expiresAt")
       VALUES (uuid_generate_v4(),$1::uuid,$2::uuid,$3,uuid_generate_v4(),now()+'1 hour')`,
    userB, orgB, `hash-b-${n}`,
  );
});

afterAll(async () => {
  if (!pgUp || !orgA) return;
  await prisma.$executeRawUnsafe(`DELETE FROM refresh_tokens WHERE "organizationId" IN ($1::uuid,$2::uuid)`, orgA, orgB);
  await prisma.$executeRawUnsafe(`DELETE FROM subscriptions WHERE "organizationId" IN ($1::uuid,$2::uuid)`, orgA, orgB);
  await prisma.$executeRawUnsafe(`DELETE FROM audit_logs WHERE "organizationId" IN ($1::uuid,$2::uuid)`, orgA, orgB);
  await prisma.$executeRawUnsafe(`DELETE FROM organization_members WHERE "organizationId" IN ($1::uuid,$2::uuid)`, orgA, orgB);
  await prisma.$executeRawUnsafe(`DELETE FROM roles WHERE "organizationId" IN ($1::uuid,$2::uuid)`, orgA, orgB);
  await prisma.$executeRawUnsafe(`DELETE FROM users WHERE id IN ($1::uuid,$2::uuid)`, userA, userB);
  await prisma.$executeRawUnsafe(`DELETE FROM organizations WHERE id IN ($1::uuid,$2::uuid)`, orgA, orgB);
  await appPrisma.$disconnect().catch(() => undefined);
});

// ─── ISO-2a: Unset GUC → 0 rows on ALL tenant tables ────────────────────────

describe.skipIf(!pgUp)('ISO-2 — unset GUC → 0 rows on all 5 tenant tables (missing-safe)', () => {
  it('roles: 0 rows with unset GUC', async () => {
    const count = await asTenant(null, (tx) => tx.role.count());
    expect(count).toBe(0);
  });

  it('organization_members: 0 rows with unset GUC', async () => {
    const count = await asTenant(null, (tx) => tx.organizationMember.count());
    expect(count).toBe(0);
  });

  it('audit_logs: 0 rows with unset GUC', async () => {
    const count = await asTenant(null, (tx) =>
      tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM audit_logs`),
    ).then((rows) => Number((rows[0] as { n: bigint }).n));
    expect(count).toBe(0);
  });

  it('subscriptions: 0 rows with unset GUC', async () => {
    const count = await asTenant(null, (tx) =>
      tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM subscriptions`),
    ).then((rows) => Number((rows[0] as { n: bigint }).n));
    expect(count).toBe(0);
  });

  it('refresh_tokens: 0 rows with unset GUC', async () => {
    const count = await asTenant(null, (tx) =>
      tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM refresh_tokens`),
    ).then((rows) => Number((rows[0] as { n: bigint }).n));
    expect(count).toBe(0);
  });
});

// ─── ISO-2b: GUC-scoped visibility ───────────────────────────────────────────

describe.skipIf(!pgUp)('ISO-2 — GUC scoped to orgA sees only orgA rows', () => {
  it('roles: GUC=orgA → 1 row, orgB invisible', async () => {
    const { a, b, total } = await asTenant(orgA, async (tx) => ({
      total: await tx.role.count(),
      a: await tx.role.count({ where: { organizationId: orgA } }),
      b: await tx.role.count({ where: { organizationId: orgB } }),
    }));
    expect(total).toBe(1);
    expect(a).toBe(1);
    expect(b).toBe(0); // orgB invisible under orgA's GUC
  });

  it('roles: GUC=orgB → 1 row, orgA invisible', async () => {
    const count = await asTenant(orgB, (tx) => tx.role.count());
    expect(count).toBe(1);
    const crossOrg = await asTenant(orgB, (tx) =>
      tx.role.count({ where: { organizationId: orgA } }),
    );
    expect(crossOrg).toBe(0);
  });

  it('organization_members: GUC=orgA → 1 member, orgB member invisible', async () => {
    const count = await asTenant(orgA, (tx) => tx.organizationMember.count());
    expect(count).toBe(1);
  });

  it('audit_logs: GUC=orgA → 1 row, orgB row invisible', async () => {
    const rows = await asTenant(orgA, (tx) =>
      tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM audit_logs`),
    );
    expect(Number((rows[0] as { n: bigint }).n)).toBe(1);
  });

  it('subscriptions: GUC=orgA → 1 subscription, orgB invisible', async () => {
    const rows = await asTenant(orgA, (tx) =>
      tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM subscriptions`),
    );
    expect(Number((rows[0] as { n: bigint }).n)).toBe(1);
  });

  it('refresh_tokens: GUC=orgA → 1 token, orgB invisible', async () => {
    const rows = await asTenant(orgA, (tx) =>
      tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM refresh_tokens`),
    );
    expect(Number((rows[0] as { n: bigint }).n)).toBe(1);
  });
});

// ─── ISO-2c: WITH CHECK — cross-org insert rejected ──────────────────────────

describe.skipIf(!pgUp)('ISO-2 — WITH CHECK: inserting a row for a different org is rejected', () => {
  it('roles: insert for orgB while GUC=orgA → rejected by RLS', async () => {
    await expect(
      asTenant(orgA, (tx) =>
        tx.role.create({ data: { organizationId: orgB, name: 'EVIL', isSystem: false } }),
      ),
    ).rejects.toThrow();
  });

  it('organization_members: insert for orgB while GUC=orgA → rejected by RLS', async () => {
    await expect(
      asTenant(orgA, (tx) =>
        tx.$executeRawUnsafe(
          `INSERT INTO organization_members (id,"organizationId","userId","roleId",status,"updatedAt")
             VALUES (uuid_generate_v4(),$1::uuid,$2::uuid,$3::uuid,'ACTIVE',now())`,
          orgB, userB, roleB_id,
        ),
      ),
    ).rejects.toThrow();
  });
});

// ─── ISO-2d: Cross-org UPDATE/DELETE → 0 affected ───────────────────────────

describe.skipIf(!pgUp)('ISO-2 — cross-org UPDATE/DELETE affects 0 rows (orgB invisible under orgA GUC)', () => {
  it('roles: updateMany targeting orgB row → 0 updated, row unchanged', async () => {
    const updated = await asTenant(orgA, (tx) =>
      tx.role.updateMany({ where: { organizationId: orgB }, data: { name: 'HIJACK' } }),
    );
    expect(updated.count).toBe(0);
    // Verify orgB's role name is untouched (admin client bypasses RLS)
    const [check] = await prisma.$queryRawUnsafe<{ name: string }[]>(
      `SELECT name FROM roles WHERE id = $1::uuid`, roleB_id,
    );
    expect(check!.name).toBe('OWNER');
  });

  it('roles: deleteMany targeting orgB row → 0 deleted, row survives', async () => {
    const deleted = await asTenant(orgA, (tx) =>
      tx.role.deleteMany({ where: { organizationId: orgB } }),
    );
    expect(deleted.count).toBe(0);
    const [check] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM roles WHERE id = $1::uuid`, roleB_id,
    );
    expect(check?.id).toBe(roleB_id);
  });

  it('organization_members: UPDATE targeting orgB member → 0 affected', async () => {
    const result = await asTenant(orgA, (tx) =>
      tx.$executeRawUnsafe(
        `UPDATE organization_members SET status='SUSPENDED' WHERE id=$1::uuid`,
        memberB_id,
      ),
    );
    expect(result).toBe(0);
    // Confirm orgB member still ACTIVE
    const [check] = await prisma.$queryRawUnsafe<{ status: string }[]>(
      `SELECT status FROM organization_members WHERE id = $1::uuid`, memberB_id,
    );
    expect(check!.status).toBe('ACTIVE');
  });
});

// ─── ISO-2e: Positive control ─────────────────────────────────────────────────

describe.skipIf(!pgUp)('ISO-2 — positive control: orgA writes to its own rows succeed', () => {
  it('roles: insert for orgA while GUC=orgA → succeeds', async () => {
    const created = await asTenant(orgA, (tx) =>
      tx.role.create({ data: { organizationId: orgA, name: 'ISO2_TEMP', isSystem: false } }),
    );
    expect(created.organizationId).toBe(orgA);
    await prisma.$executeRawUnsafe(`DELETE FROM roles WHERE id = $1::uuid`, created.id);
  });

  it('roles: update own row while GUC=orgA → succeeds', async () => {
    const updated = await asTenant(orgA, (tx) =>
      tx.role.updateMany({ where: { id: roleA_id }, data: { name: 'OWNER' } }),
    );
    expect(updated.count).toBe(1);
  });
});

// ─── ISO-2f: Sprint 5 M1 — pipelines RLS ────────────────────────────────────
// Verifies that the tenant_isolation policy on pipelines enforces the GUC correctly.
// RLS on pipeline_stages and deals is also verified here (3 tables × 2 assertions each = 6 tests).

describe.skipIf(!pgUp)('ISO-2 Sprint 5 — pipelines RLS', () => {
  let pipelineA = '';
  let pipelineB = '';

  beforeAll(async () => {
    if (!pgUp) return;
    const n = process.hrtime.bigint().toString();
    const [a] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO pipelines ("organizationId", name, "isDefault", "updatedAt")
         VALUES ($1::uuid, $2, true, now()) RETURNING id`,
      orgA, `ISO2-Pipeline-A-${n}`,
    );
    const [b] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO pipelines ("organizationId", name, "isDefault", "updatedAt")
         VALUES ($1::uuid, $2, true, now()) RETURNING id`,
      orgB, `ISO2-Pipeline-B-${n}`,
    );
    pipelineA = a!.id;
    pipelineB = b!.id;
  });

  afterAll(async () => {
    if (!pgUp || !pipelineA) return;
    await prisma.$executeRawUnsafe(
      `DELETE FROM pipelines WHERE id IN ($1::uuid, $2::uuid)`, pipelineA, pipelineB,
    );
  });

  it('GUC=orgA → sees only orgA pipeline, orgB invisible', async () => {
    const rows = await asTenant(orgA, (tx) =>
      tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM pipelines`),
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(pipelineA);
    expect(ids).not.toContain(pipelineB);
  });

  it('GUC=orgB → sees only orgB pipeline, orgA invisible', async () => {
    const rows = await asTenant(orgB, (tx) =>
      tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM pipelines`),
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(pipelineB);
    expect(ids).not.toContain(pipelineA);
  });
});

// ─── ISO-2g: Sprint 5 M1 — pipeline_stages RLS ───────────────────────────────

describe.skipIf(!pgUp)('ISO-2 Sprint 5 — pipeline_stages RLS', () => {
  let stageA = '';
  let stageB = '';
  let pipelineForStageA = '';
  let pipelineForStageB = '';

  beforeAll(async () => {
    if (!pgUp) return;
    const n = process.hrtime.bigint().toString();
    const [pa] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO pipelines ("organizationId", name, "isDefault", "updatedAt")
         VALUES ($1::uuid, $2, false, now()) RETURNING id`,
      orgA, `ISO2-StageParent-A-${n}`,
    );
    const [pb] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO pipelines ("organizationId", name, "isDefault", "updatedAt")
         VALUES ($1::uuid, $2, false, now()) RETURNING id`,
      orgB, `ISO2-StageParent-B-${n}`,
    );
    pipelineForStageA = pa!.id;
    pipelineForStageB = pb!.id;

    const [sa] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO pipeline_stages ("organizationId", "pipelineId", name, "order", "updatedAt")
         VALUES ($1::uuid, $2::uuid, 'Stage A', 0, now()) RETURNING id`,
      orgA, pipelineForStageA,
    );
    const [sb] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO pipeline_stages ("organizationId", "pipelineId", name, "order", "updatedAt")
         VALUES ($1::uuid, $2::uuid, 'Stage B', 0, now()) RETURNING id`,
      orgB, pipelineForStageB,
    );
    stageA = sa!.id;
    stageB = sb!.id;
  });

  afterAll(async () => {
    if (!pgUp || !stageA) return;
    await prisma.$executeRawUnsafe(
      `DELETE FROM pipeline_stages WHERE id IN ($1::uuid, $2::uuid)`, stageA, stageB,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM pipelines WHERE id IN ($1::uuid, $2::uuid)`, pipelineForStageA, pipelineForStageB,
    );
  });

  it('GUC=orgA → sees only orgA stage, orgB stage invisible', async () => {
    const rows = await asTenant(orgA, (tx) =>
      tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM pipeline_stages`),
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(stageA);
    expect(ids).not.toContain(stageB);
  });

  it('GUC=orgB → sees only orgB stage, orgA stage invisible', async () => {
    const rows = await asTenant(orgB, (tx) =>
      tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM pipeline_stages`),
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(stageB);
    expect(ids).not.toContain(stageA);
  });
});

// ─── ISO-2h: Sprint 5 M1 — deals RLS ────────────────────────────────────────

describe.skipIf(!pgUp)('ISO-2 Sprint 5 — deals RLS', () => {
  let dealA = '';
  let dealB = '';
  let pipelineForDealA = '';
  let pipelineForDealB = '';
  let stageForDealA = '';
  let stageForDealB = '';

  beforeAll(async () => {
    if (!pgUp) return;
    const n = process.hrtime.bigint().toString();

    const [pa] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO pipelines ("organizationId", name, "isDefault", "updatedAt")
         VALUES ($1::uuid, $2, false, now()) RETURNING id`,
      orgA, `ISO2-DealParent-A-${n}`,
    );
    const [pb] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO pipelines ("organizationId", name, "isDefault", "updatedAt")
         VALUES ($1::uuid, $2, false, now()) RETURNING id`,
      orgB, `ISO2-DealParent-B-${n}`,
    );
    pipelineForDealA = pa!.id;
    pipelineForDealB = pb!.id;

    const [sa] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO pipeline_stages ("organizationId", "pipelineId", name, "order", "updatedAt")
         VALUES ($1::uuid, $2::uuid, 'Open', 0, now()) RETURNING id`,
      orgA, pipelineForDealA,
    );
    const [sb] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO pipeline_stages ("organizationId", "pipelineId", name, "order", "updatedAt")
         VALUES ($1::uuid, $2::uuid, 'Open', 0, now()) RETURNING id`,
      orgB, pipelineForDealB,
    );
    stageForDealA = sa!.id;
    stageForDealB = sb!.id;

    const [da] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO deals ("organizationId", title, "pipelineId", "stageId", "createdById", "updatedAt")
         VALUES ($1::uuid, 'Deal A', $2::uuid, $3::uuid, $4::uuid, now()) RETURNING id`,
      orgA, pipelineForDealA, stageForDealA, userA,
    );
    const [db] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO deals ("organizationId", title, "pipelineId", "stageId", "createdById", "updatedAt")
         VALUES ($1::uuid, 'Deal B', $2::uuid, $3::uuid, $4::uuid, now()) RETURNING id`,
      orgB, pipelineForDealB, stageForDealB, userB,
    );
    dealA = da!.id;
    dealB = db!.id;
  });

  afterAll(async () => {
    if (!pgUp || !dealA) return;
    await prisma.$executeRawUnsafe(
      `DELETE FROM deals WHERE id IN ($1::uuid, $2::uuid)`, dealA, dealB,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM pipeline_stages WHERE id IN ($1::uuid, $2::uuid)`, stageForDealA, stageForDealB,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM pipelines WHERE id IN ($1::uuid, $2::uuid)`, pipelineForDealA, pipelineForDealB,
    );
  });

  it('GUC=orgA → sees only orgA deal, orgB deal invisible', async () => {
    const rows = await asTenant(orgA, (tx) =>
      tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM deals`),
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(dealA);
    expect(ids).not.toContain(dealB);
  });

  it('GUC=orgB → sees only orgB deal, orgA deal invisible', async () => {
    const rows = await asTenant(orgB, (tx) =>
      tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM deals`),
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(dealB);
    expect(ids).not.toContain(dealA);
  });
});
