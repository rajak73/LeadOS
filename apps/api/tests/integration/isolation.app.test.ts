// Sprint 3 M6 / ISO-1 — App-layer cross-tenant isolation suite.
//
// Proves that the Prisma tenant extension (TEN-2.2) enforces org isolation across ALL
// supported operations on ALL tenant models, running over the ADMIN connection (RLS bypassed).
// This is the application-layer defense; ISO-2 proves the RLS backstop holds independently.
//
// Covered: reads (findMany / count / aggregate / groupBy), writes (create), updates
// (updateMany), deletes (deleteMany), and deny-by-default (TenantScopeError for
// unsupported operations). Tables: roles, organization_members, audit_logs.
//
// DB-gated; DEF-3 guard fires in CI if Postgres is unreachable.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/core/prisma/client.js';
import { isPostgresUp } from '../helpers/services.js';
import { withTenant } from '../../src/core/tenancy/with-tenant.js';
import { asTenantCreate } from '../../src/core/tenancy/tenant-repository.js';
import { injectTenant, TenantScopeError } from '../../src/core/tenancy/tenant-extension.js';
import type { Prisma } from '@prisma/client';

const pgUp = await isPostgresUp();

// ─── Seed state ──────────────────────────────────────────────────────────────

let orgA = '';
let orgB = '';
let roleA_owner = '';
let roleA_admin = '';
let roleB_owner = '';
let userA1 = '';
let userA2 = '';
let userB1 = '';

async function seedUser(email: string): Promise<string> {
  const [u] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO users (email, "passwordHash", "firstName", "lastName", "updatedAt")
       VALUES ($1, 'x', 'F', 'L', now()) RETURNING id`,
    email,
  );
  return u!.id;
}

beforeAll(async () => {
  if (!pgUp) return;
  const n = process.hrtime.bigint().toString();

  // Orgs
  const [a] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO organizations (name, slug, "updatedAt") VALUES ($1, $2, now()) RETURNING id`,
    `ISO-1 A ${n}`, `iso1-a-${n}`,
  );
  const [b] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO organizations (name, slug, "updatedAt") VALUES ($1, $2, now()) RETURNING id`,
    `ISO-1 B ${n}`, `iso1-b-${n}`,
  );
  orgA = a!.id;
  orgB = b!.id;

  // Roles (admin client — bypasses RLS for seeding)
  const [roA1] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO roles (id,"organizationId",name,"isSystem","updatedAt")
       VALUES (uuid_generate_v4(),$1::uuid,'OWNER',true,now()) RETURNING id`, orgA,
  );
  const [roA2] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO roles (id,"organizationId",name,"isSystem","updatedAt")
       VALUES (uuid_generate_v4(),$1::uuid,'ADMIN',true,now()) RETURNING id`, orgA,
  );
  const [roB1] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO roles (id,"organizationId",name,"isSystem","updatedAt")
       VALUES (uuid_generate_v4(),$1::uuid,'OWNER',true,now()) RETURNING id`, orgB,
  );
  roleA_owner = roA1!.id;
  roleA_admin = roA2!.id;
  roleB_owner = roB1!.id;

  // Users
  userA1 = await seedUser(`a1+${n}@iso1.test`);
  userA2 = await seedUser(`a2+${n}@iso1.test`);
  userB1 = await seedUser(`b1+${n}@iso1.test`);

  // Members
  for (const [uid, oid, rid] of [
    [userA1, orgA, roleA_owner],
    [userA2, orgA, roleA_admin],
    [userB1, orgB, roleB_owner],
  ]) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO organization_members (id,"organizationId","userId","roleId",status,"updatedAt")
         VALUES (uuid_generate_v4(),$1::uuid,$2::uuid,$3::uuid,'ACTIVE',now())`,
      oid, uid, rid,
    );
  }

  // Audit logs — one per org via withTenant (proves the create path too; verified in ISO-1)
  await withTenant(orgA, (db) =>
    db.auditLog.create({ data: asTenantCreate<Prisma.AuditLogUncheckedCreateInput>({ action: 'seed', resource: 'iso1', actorUserId: null, resourceId: null }) }),
  );
  await withTenant(orgB, (db) =>
    db.auditLog.create({ data: asTenantCreate<Prisma.AuditLogUncheckedCreateInput>({ action: 'seed', resource: 'iso1', actorUserId: null, resourceId: null }) }),
  );
});

afterAll(async () => {
  if (!pgUp || !orgA) return;
  await prisma.$executeRawUnsafe(`DELETE FROM audit_logs WHERE "organizationId" IN ($1::uuid,$2::uuid)`, orgA, orgB);
  await prisma.$executeRawUnsafe(`DELETE FROM organization_members WHERE "organizationId" IN ($1::uuid,$2::uuid)`, orgA, orgB);
  await prisma.$executeRawUnsafe(`DELETE FROM roles WHERE "organizationId" IN ($1::uuid,$2::uuid)`, orgA, orgB);
  await prisma.$executeRawUnsafe(`DELETE FROM users WHERE id IN ($1::uuid,$2::uuid,$3::uuid)`, userA1, userA2, userB1);
  await prisma.$executeRawUnsafe(`DELETE FROM organizations WHERE id IN ($1::uuid,$2::uuid)`, orgA, orgB);
});

// ─── ISO-1a: Read isolation (roles) ──────────────────────────────────────────

describe.skipIf(!pgUp)('ISO-1 — reads: scoped to orgA cannot see orgB (roles)', () => {
  it('findMany scoped to orgA returns only orgA rows', async () => {
    const roles = await withTenant(orgA, (db) => db.role.findMany());
    expect(roles.length).toBe(2);
    expect(roles.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('count scoped to orgA = 2; targeting orgB\'s specific row id yields 0 (invisible)', async () => {
    const { total, specificOrgBRow } = await withTenant(orgA, async (db) => ({
      total: await db.role.count(),
      // Targeting orgB's specific role by id — the extension adds organizationId = orgA to WHERE,
      // so the query becomes: WHERE id = roleB_owner AND organizationId = orgA → no match → 0.
      specificOrgBRow: await db.role.count({ where: { id: roleB_owner } }),
    }));
    expect(total).toBe(2);
    expect(specificOrgBRow).toBe(0); // orgB's row invisible — extension adds orgA constraint
  });

  it('aggregate scoped to orgA counts 2 roles', async () => {
    const result = await withTenant(orgA, (db) =>
      db.role.aggregate({ _count: { _all: true } }),
    );
    expect(result._count._all).toBe(2);
  });

  it('groupBy scoped to orgA returns only orgA role names', async () => {
    const groups = await withTenant(orgA, (db) =>
      db.role.groupBy({ by: ['name'], _count: { _all: true } }),
    );
    const names = groups.map((g) => g.name).sort();
    expect(names).toEqual(['ADMIN', 'OWNER']);
    // orgB's 'OWNER' would inflate to 2 if leaking
    const ownerGroup = groups.find((g) => g.name === 'OWNER');
    expect(ownerGroup?._count._all).toBe(1); // only orgA's OWNER, not orgB's
  });
});

// ─── ISO-1b: Read isolation (organization_members + audit_logs) ───────────────

describe.skipIf(!pgUp)('ISO-1 — reads: organization_members and audit_logs', () => {
  it('organization_members findMany scoped to orgA returns 2 (not orgB)', async () => {
    const members = await withTenant(orgA, (db) => db.organizationMember.findMany());
    expect(members.length).toBe(2);
    expect(members.every((m) => m.organizationId === orgA)).toBe(true);
  });

  it('organization_members count scoped to orgA = 2', async () => {
    const count = await withTenant(orgA, (db) => db.organizationMember.count());
    expect(count).toBe(2);
  });

  it('audit_logs findMany scoped to orgA returns 1 (seed row), none from orgB', async () => {
    const rows = await withTenant(orgA, (db) =>
      db.auditLog.findMany({ where: { resource: 'iso1' } }),
    );
    expect(rows.length).toBe(1);
    expect(rows[0]!.organizationId).toBe(orgA);
  });
});

// ─── ISO-1c: Write isolation ─────────────────────────────────────────────────

describe.skipIf(!pgUp)('ISO-1 — writes: extension forces organizationId to active org', () => {
  it('create with explicit orgB organizationId → row lands in orgA', async () => {
    // The extension strips orgB and injects orgA.
    const created = await withTenant(orgA, (db) =>
      db.role.create({
        data: {
          organizationId: orgB, // hostile — should be overridden
          name: 'ISO1_CREATE_TEST',
          isSystem: false,
        } as unknown as Prisma.RoleUncheckedCreateInput,
      }),
    );
    expect(created.organizationId).toBe(orgA); // extension forced orgA
    // Cleanup
    await prisma.$executeRawUnsafe(`DELETE FROM roles WHERE id = $1::uuid`, created.id);
  });

  it('audit_log create via withTenant injects organizationId automatically', async () => {
    const row = await withTenant(orgA, (db) =>
      db.auditLog.create({
        data: asTenantCreate<Prisma.AuditLogUncheckedCreateInput>({ action: 'iso1.write_test', resource: 'test' }),
      }),
    );
    expect(row.organizationId).toBe(orgA);
    await prisma.$executeRawUnsafe(`DELETE FROM audit_logs WHERE id = $1::uuid`, row.id);
  });
});

// ─── ISO-1d: Update isolation ────────────────────────────────────────────────

describe.skipIf(!pgUp)('ISO-1 — updates: cross-org updateMany targets 0 rows', () => {
  it('updateMany with orgB row id scoped to orgA → 0 affected (extension adds orgA to WHERE)', async () => {
    const result = await withTenant(orgA, (db) =>
      // Targeting orgB's specific role id — extension adds AND organizationId = orgA → no match
      db.role.updateMany({ where: { id: roleB_owner }, data: { name: 'HIJACKED' } }),
    );
    expect(result.count).toBe(0);
    // Verify orgB's role is untouched
    const [survivor] = await prisma.$queryRawUnsafe<{ name: string }[]>(
      `SELECT name FROM roles WHERE id = $1::uuid`, roleB_owner,
    );
    expect(survivor!.name).toBe('OWNER');
  });
});

// ─── ISO-1e: Delete isolation ────────────────────────────────────────────────

describe.skipIf(!pgUp)('ISO-1 — deletes: cross-org deleteMany targets 0 rows', () => {
  it('deleteMany with orgB row id scoped to orgA → 0 deleted, orgB row survives', async () => {
    const result = await withTenant(orgA, (db) =>
      db.role.deleteMany({ where: { id: roleB_owner } }),
    );
    expect(result.count).toBe(0);
    // Confirm orgB's role still exists via admin client
    const [check] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM roles WHERE id = $1::uuid`, roleB_owner,
    );
    expect(check?.id).toBe(roleB_owner);
  });
});

// ─── ISO-1f: Deny-by-default ─────────────────────────────────────────────────

describe('ISO-1 — deny-by-default: unsupported operations throw TenantScopeError', () => {
  // Pure function test (no DB required) — injectTenant is the extension's core logic.
  it('an operation not in the scoped set throws TenantScopeError', () => {
    expect(() => injectTenant('findRaw', {}, 'some-org-id')).toThrow(TenantScopeError);
    expect(() => injectTenant('executeRaw', {}, 'some-org-id')).toThrow(TenantScopeError);
    expect(() => injectTenant('unscopedCustomOp', {}, 'some-org-id')).toThrow(TenantScopeError);
  });

  it('all standard read/write/mutate operations are scoped (no TenantScopeError)', () => {
    const ops = [
      'create', 'createMany', 'update', 'updateMany', 'upsert',
      'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow',
      'findMany', 'delete', 'deleteMany', 'count', 'aggregate', 'groupBy',
    ];
    const orgId = 'a0000000-0000-0000-0000-000000000001';
    for (const op of ops) {
      expect(() => injectTenant(op, {}, orgId), `${op} should not throw`).not.toThrow();
    }
  });
});
