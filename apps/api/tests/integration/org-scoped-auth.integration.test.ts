// Sprint 3 M3 / TEN-3.2.2 + TEN-3.2.3 — org-scoped auth data layer over a real DB.
//
// Proves the MIGRATED PrismaAuthRepository methods (getMembershipRole, createRefreshToken) work
// end-to-end through withTenant + the tenant extension (organizationId injected, never passed),
// and that the tenant repository CANNOT be used outside a withTenant scope (the TEN-3.2.3 guard).
//
// Runs over the admin connection (D2 — runtime not switched to leados_app); DB-gated.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/core/prisma/client.js';
import { isPostgresUp } from '../helpers/services.js';
import { PrismaAuthRepository } from '../../src/modules/auth/auth.repository.js';
import { OrgScopedAuthRepository } from '../../src/modules/auth/org-scoped-auth.repository.js';
import { withTenant } from '../../src/core/tenancy/with-tenant.js';
import { TenantScopeViolationError } from '../../src/core/tenancy/scope.js';
import type { TenantTransactionClient } from '../../src/core/tenancy/with-tenant.js';

const pgUp = await isPostgresUp();
const repo = new PrismaAuthRepository(prisma);

let orgId = '';
let userId = '';
let roleId = '';

beforeAll(async () => {
  if (!pgUp) return;
  const nonce = process.hrtime.bigint().toString();
  const [org] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO organizations (name, slug, "updatedAt") VALUES ($1, $2, now()) RETURNING id`,
    `osa ${nonce}`,
    `osa-${nonce}`,
  );
  orgId = org!.id;
  const [user] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO users (email, "passwordHash", "firstName", "lastName", "updatedAt")
       VALUES ($1, 'x', 'O', 'S', now()) RETURNING id`,
    `osa+${nonce}@t.test`,
  );
  userId = user!.id;
  const [role] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO roles (id, "organizationId", name, "isSystem", "updatedAt")
       VALUES (uuid_generate_v4(), $1::uuid, 'OWNER', true, now()) RETURNING id`,
    orgId,
  );
  roleId = role!.id;
  await prisma.$executeRawUnsafe(
    `INSERT INTO organization_members (id, "organizationId", "userId", "roleId", status, "updatedAt")
       VALUES (uuid_generate_v4(), $1::uuid, $2::uuid, $3::uuid, 'ACTIVE', now())`,
    orgId,
    userId,
    roleId,
  );
});

afterAll(async () => {
  if (!pgUp || !orgId) return;
  await prisma.$executeRawUnsafe(`DELETE FROM refresh_tokens WHERE "organizationId" = $1::uuid`, orgId);
  await prisma.$executeRawUnsafe(`DELETE FROM organization_members WHERE "organizationId" = $1::uuid`, orgId);
  await prisma.$executeRawUnsafe(`DELETE FROM roles WHERE "organizationId" = $1::uuid`, orgId);
  await prisma.$executeRawUnsafe(`DELETE FROM users WHERE id = $1::uuid`, userId);
  await prisma.$executeRawUnsafe(`DELETE FROM organizations WHERE id = $1::uuid`, orgId);
});

describe.skipIf(!pgUp)('migrated PrismaAuthRepository (org-scoped via withTenant)', () => {
  it('getMembershipRole returns the active role through the tenant scope', async () => {
    expect(await repo.getMembershipRole(userId, orgId)).toBe('OWNER');
  });

  it('getMembershipRole does not leak across orgs (different org → null)', async () => {
    const otherOrg = '00000000-0000-0000-0000-0000000000aa';
    expect(await repo.getMembershipRole(userId, otherOrg)).toBeNull();
  });

  it('createRefreshToken injects organizationId (org-free create) and persists it scoped', async () => {
    const tokenHash = `hash-${process.hrtime.bigint()}`;
    await repo.createRefreshToken({
      userId,
      organizationId: orgId,
      tokenHash,
      family: '00000000-0000-0000-0000-0000000f0001', // family is a uuid column
      expiresAt: new Date(Date.now() + 60_000),
    });
    const [row] = await prisma.$queryRawUnsafe<{ organizationId: string }[]>(
      `SELECT "organizationId" FROM refresh_tokens WHERE "tokenHash" = $1`,
      tokenHash,
    );
    expect(row?.organizationId).toBe(orgId); // injected, not passed into the create data
  });
});

describe.skipIf(!pgUp)('OrgScopedAuthRepository (TEN-3.2.3 guard, over real DB)', () => {
  it('works inside withTenant', async () => {
    const role = await withTenant(orgId, (db) => new OrgScopedAuthRepository(db).getMembershipRole(userId));
    expect(role).toBe('OWNER');
  });

  it('cannot be constructed outside withTenant (guard throws)', () => {
    expect(() => new OrgScopedAuthRepository({} as TenantTransactionClient)).toThrow(
      TenantScopeViolationError,
    );
  });
});
