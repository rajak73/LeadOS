// Sprint 3 M4 / RBAC-2.2 + RBAC-2.3 + RBAC-2.4 — end-to-end RBAC enforcement over a real DB.
//
// Real JWTs through the assembled app. Proves: permission-gated allow/deny, the role-admin
// endpoints, and — critically — ACTIVE cache invalidation: after an admin changes a member's
// role (or suspends them), the change takes effect on the member's NEXT request even though
// their access token still carries the OLD role claim.
//
// DB-gated; executes in CI (DEF-3 guard). In CI (Redis up) the permission/membership caches are
// live, so test 5/7 genuinely prove invalidation; the resolver-level unit test proves the cache
// logic deterministically regardless of Redis.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/core/prisma/client.js';
import { isPostgresUp } from '../helpers/services.js';
import { signAccessToken } from '../../src/core/auth/jwt.js';

const pgUp = await isPostgresUp();
const app = buildApp();

let orgId = '';
let ownerRoleId = '';
let salesRoleId = '';
let adminUserId = '';
let targetUserId = '';

const tokenFor = (userId: string, role: string): string =>
  signAccessToken({ sub: userId, orgId: orgId, role, isSuperAdmin: false });

async function seedUser(email: string): Promise<string> {
  const [u] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO users (email, "passwordHash", "firstName", "lastName", "updatedAt")
       VALUES ($1, 'x', 'F', 'L', now()) RETURNING id`,
    email,
  );
  return u!.id;
}
async function seedRole(name: string): Promise<string> {
  const [r] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO roles (id, "organizationId", name, "isSystem", "updatedAt")
       VALUES (uuid_generate_v4(), $1::uuid, $2, true, now()) RETURNING id`,
    orgId,
    name,
  );
  return r!.id;
}
async function seedMember(userId: string, roleId: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO organization_members (id, "organizationId", "userId", "roleId", status, "updatedAt")
       VALUES (uuid_generate_v4(), $1::uuid, $2::uuid, $3::uuid, 'ACTIVE', now())`,
    orgId,
    userId,
    roleId,
  );
}

beforeAll(async () => {
  if (!pgUp) return;
  const nonce = process.hrtime.bigint().toString();
  const [org] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO organizations (name, slug, "updatedAt") VALUES ($1, $2, now()) RETURNING id`,
    `rbac ${nonce}`,
    `rbac-${nonce}`,
  );
  orgId = org!.id;
  ownerRoleId = await seedRole('OWNER');
  salesRoleId = await seedRole('SALES_EXECUTIVE');
  adminUserId = await seedUser(`admin+${nonce}@rbac.test`);
  targetUserId = await seedUser(`target+${nonce}@rbac.test`);
  await seedMember(adminUserId, ownerRoleId);
  await seedMember(targetUserId, salesRoleId);
});

afterAll(async () => {
  if (!pgUp || !orgId) return;
  await prisma.$executeRawUnsafe(`DELETE FROM organization_members WHERE "organizationId" = $1::uuid`, orgId);
  await prisma.$executeRawUnsafe(`DELETE FROM roles WHERE "organizationId" = $1::uuid`, orgId);
  await prisma.$executeRawUnsafe(`DELETE FROM users WHERE id IN ($1::uuid, $2::uuid)`, adminUserId, targetUserId);
  await prisma.$executeRawUnsafe(`DELETE FROM organizations WHERE id = $1::uuid`, orgId);
});

describe.skipIf(!pgUp)('RBAC enforcement (real JWT, assembled app)', () => {
  it('SALES_EXECUTIVE can GET /ping (holds org.read) → 200', async () => {
    const res = await request(app).get('/api/v1/ping').set('Authorization', `Bearer ${tokenFor(targetUserId, 'SALES_EXECUTIVE')}`);
    expect(res.status).toBe(200);
  });

  it('SALES_EXECUTIVE cannot change a role (lacks team.update_role) → 403', async () => {
    const res = await request(app)
      .patch(`/api/v1/members/${adminUserId}/role`)
      .set('Authorization', `Bearer ${tokenFor(targetUserId, 'SALES_EXECUTIVE')}`)
      .send({ roleId: salesRoleId });
    expect(res.status).toBe(403);
  });

  it('OWNER can list roles → 200', async () => {
    const res = await request(app).get('/api/v1/roles').set('Authorization', `Bearer ${tokenFor(adminUserId, 'OWNER')}`);
    expect(res.status).toBe(200);
    expect(res.body.data.roles.length).toBe(2);
  });

  it('OWNER can assign a role → 200 (promotes target to OWNER)', async () => {
    const res = await request(app)
      .patch(`/api/v1/members/${targetUserId}/role`)
      .set('Authorization', `Bearer ${tokenFor(adminUserId, 'OWNER')}`)
      .send({ roleId: ownerRoleId });
    expect(res.status).toBe(200);
  });

  it('ACTIVE INVALIDATION: target — with its STALE SALES token — can now change a role → 200', async () => {
    // The token still claims SALES_EXECUTIVE, but enforcement resolves the CURRENT DB role
    // (OWNER) after the cache was invalidated by the previous assignment.
    const res = await request(app)
      .patch(`/api/v1/members/${adminUserId}/role`)
      .set('Authorization', `Bearer ${tokenFor(targetUserId, 'SALES_EXECUTIVE')}`)
      .send({ roleId: ownerRoleId });
    expect(res.status).toBe(200);
  });

  it('OWNER can suspend a member → 200', async () => {
    const res = await request(app)
      .post(`/api/v1/members/${targetUserId}/suspend`)
      .set('Authorization', `Bearer ${tokenFor(adminUserId, 'OWNER')}`);
    expect(res.status).toBe(200);
  });

  it('SUSPEND INVALIDATION: the suspended member is rejected on the next request → 403', async () => {
    const res = await request(app).get('/api/v1/ping').set('Authorization', `Bearer ${tokenFor(targetUserId, 'OWNER')}`);
    expect(res.status).toBe(403); // membership gate: cache purged → DB shows SUSPENDED
  });
});
