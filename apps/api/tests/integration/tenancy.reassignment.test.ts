// Sprint 3 — DEF-M2-1 remediation proof. Verifies that NO tenant row can be reassigned to
// another organization through application-layer writes, via either vector:
//   (1) the scalar `organizationId` in update/updateMany/upsert data, or
//   (2) the `organization` relation (connect/set) in write data.
//
// Runs over the ADMIN connection (RLS bypassed — the M2 runtime), so it proves the APP-LAYER
// extension fix, independent of the database RLS backstop. DB-gated; executes in CI.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Prisma } from '@prisma/client';
import { prisma } from '../../src/core/prisma/client.js';
import { isPostgresUp } from '../helpers/services.js';
import { withTenant } from '../../src/core/tenancy/with-tenant.js';

const pgUp = await isPostgresUp();

// Casts that express a hostile reassignment payload the type system would otherwise resist.
const reassignScalar = (org: string): Prisma.RoleUncheckedUpdateInput =>
  ({ organizationId: org }) as unknown as Prisma.RoleUncheckedUpdateInput;
const reassignViaRelation = (org: string): Prisma.RoleUpdateInput => ({
  organization: { connect: { id: org } },
});

let orgX = '';
let orgY = '';
let roleX = '';

async function roleOrg(id: string): Promise<string | undefined> {
  const r = await prisma.role.findUnique({ where: { id }, select: { organizationId: true } });
  return r?.organizationId;
}

beforeAll(async () => {
  if (!pgUp) return;
  const nonce = process.hrtime.bigint().toString();
  const [x] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO organizations (name, slug, "updatedAt") VALUES ($1, $2, now()) RETURNING id`,
    `re X ${nonce}`,
    `re-x-${nonce}`,
  );
  const [y] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO organizations (name, slug, "updatedAt") VALUES ($1, $2, now()) RETURNING id`,
    `re Y ${nonce}`,
    `re-y-${nonce}`,
  );
  orgX = x!.id;
  orgY = y!.id;
  const [r] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO roles (id, "organizationId", name, "isSystem", "updatedAt")
       VALUES (uuid_generate_v4(), $1::uuid, 'OWNER', true, now()) RETURNING id`,
    orgX,
  );
  roleX = r!.id;
  // a second role in X so updateMany has multiple targets
  await prisma.$executeRawUnsafe(
    `INSERT INTO roles (id, "organizationId", name, "isSystem", "updatedAt")
       VALUES (uuid_generate_v4(), $1::uuid, 'ADMIN', true, now())`,
    orgX,
  );
});

afterAll(async () => {
  if (pgUp && orgX && orgY) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM roles WHERE "organizationId" IN ($1::uuid, $2::uuid)`,
      orgX,
      orgY,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM organizations WHERE id IN ($1::uuid, $2::uuid)`,
      orgX,
      orgY,
    );
  }
});

describe.skipIf(!pgUp)('DEF-M2-1 — tenant reassignment is impossible (app layer)', () => {
  it('update with data.organizationId = other org → row stays in its org', async () => {
    expect(await roleOrg(roleX)).toBe(orgX);
    await withTenant(orgX, (db) =>
      db.role.update({ where: { id: roleX }, data: reassignScalar(orgY) }),
    );
    expect(await roleOrg(roleX)).toBe(orgX); // NOT reassigned
  });

  it('update via organization.connect to another org → row stays in its org', async () => {
    await withTenant(orgX, (db) =>
      db.role.update({ where: { id: roleX }, data: reassignViaRelation(orgY) }),
    );
    expect(await roleOrg(roleX)).toBe(orgX); // relation vector neutralized
  });

  it('updateMany with data.organizationId = other org → no rows reassigned', async () => {
    const beforeY = await prisma.role.count({ where: { organizationId: orgY } });
    await withTenant(orgX, (db) =>
      db.role.updateMany({ where: {}, data: reassignScalar(orgY) }),
    );
    const xStays = await prisma.role.count({ where: { organizationId: orgX } });
    const yAfter = await prisma.role.count({ where: { organizationId: orgY } });
    expect(xStays).toBe(2); // both of X's rows remain in X
    expect(yAfter).toBe(beforeY); // Y gained nothing
  });

  it('upsert (update branch) cannot reassign an existing row', async () => {
    await withTenant(orgX, (db) =>
      db.role.upsert({
        where: { id: roleX },
        create: { id: roleX, name: 'OWNER', isSystem: true } as unknown as Prisma.RoleUncheckedCreateInput,
        update: reassignScalar(orgY),
      }),
    );
    expect(await roleOrg(roleX)).toBe(orgX);
  });

  it('a benign update still works (regression — pinning does not block normal writes)', async () => {
    await withTenant(orgX, (db) =>
      db.role.update({ where: { id: roleX }, data: { name: 'OWNER-RENAMED' } }),
    );
    const r = await prisma.role.findUnique({ where: { id: roleX }, select: { name: true, organizationId: true } });
    expect(r?.name).toBe('OWNER-RENAMED');
    expect(r?.organizationId).toBe(orgX);
  });
});
