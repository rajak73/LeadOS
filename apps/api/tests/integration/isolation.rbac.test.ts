// Sprint 3 M6 / ISO-3 — RBAC enforcement matrix.
//
// A systematic permission matrix across all four system roles (OWNER / ADMIN / MANAGER /
// SALES_EXECUTIVE) exercised via real HTTP requests through the assembled app. Verifies:
//
//   • Permission grants: each role reaches the endpoints its ROLE_PERMISSIONS allow.
//   • Permission denials: each role is blocked on endpoints it lacks permission for.
//   • Auth failures: unauthenticated → 401, non-member → 403.
//   • Super-admin bypass: isSuperAdmin=true bypasses permission check (still requires membership).
//   • Cache invalidation: role-change → permission cache flushed → next request reflects new role.
//
// ownOnly path: SALES_EXECUTIVE holds `org.read` and `team.read` directly (not _own variants),
// so the current endpoints do not trigger the ownOnly branch for SALES_EXECUTIVE. The ownOnly
// decision logic is unit-tested exhaustively in rbac.middleware.test.ts + permission-check.test.ts.
//
// DB-gated; DEF-3 guard fires in CI if Postgres is unreachable.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/core/prisma/client.js';
import { isPostgresUp } from '../helpers/services.js';
import { signAccessToken } from '../../src/core/auth/jwt.js';

const pgUp = await isPostgresUp();
const app = buildApp();

// ─── Seed state ───────────────────────────────────────────────────────────────

let orgId = '';
let ownerRoleId = '';
let adminRoleId = '';
let managerRoleId = '';
let salesRoleId = '';
let ownerUserId = '';
let adminUserId = '';
let managerUserId = '';
let salesUserId = '';
let targetUserId = '';

// ─── Token factories ──────────────────────────────────────────────────────────

const tok = (sub: string, role: string, isSuperAdmin = false): string =>
  signAccessToken({ sub, orgId, role, isSuperAdmin });

const ownerToken = (): string => tok(ownerUserId, 'OWNER');
const adminToken = (): string => tok(adminUserId, 'ADMIN');
const managerToken = (): string => tok(managerUserId, 'MANAGER');
const salesToken = (): string => tok(salesUserId, 'SALES_EXECUTIVE');

async function seedUser(email: string): Promise<string> {
  const [u] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO users (email,"passwordHash","firstName","lastName","updatedAt")
       VALUES ($1,'x','F','L',now()) RETURNING id`,
    email,
  );
  return u!.id;
}

async function seedRole(name: string): Promise<string> {
  const [r] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO roles (id,"organizationId",name,"isSystem","updatedAt")
       VALUES (uuid_generate_v4(),$1::uuid,$2,true,now()) RETURNING id`,
    orgId, name,
  );
  return r!.id;
}

async function seedMember(userId: string, roleId: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO organization_members (id,"organizationId","userId","roleId",status,"updatedAt")
       VALUES (uuid_generate_v4(),$1::uuid,$2::uuid,$3::uuid,'ACTIVE',now())`,
    orgId, userId, roleId,
  );
}

beforeAll(async () => {
  if (!pgUp) return;
  const n = process.hrtime.bigint().toString();

  const [org] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO organizations (name, slug, "updatedAt") VALUES ($1,$2,now()) RETURNING id`,
    `ISO-3 ${n}`, `iso3-${n}`,
  );
  orgId = org!.id;

  // Seed all 4 system roles + a target role
  ownerRoleId = await seedRole('OWNER');
  adminRoleId = await seedRole('ADMIN');
  managerRoleId = await seedRole('MANAGER');
  salesRoleId = await seedRole('SALES_EXECUTIVE');
  // Seed users
  ownerUserId = await seedUser(`owner+${n}@iso3.test`);
  adminUserId = await seedUser(`admin+${n}@iso3.test`);
  managerUserId = await seedUser(`manager+${n}@iso3.test`);
  salesUserId = await seedUser(`sales+${n}@iso3.test`);
  targetUserId = await seedUser(`target+${n}@iso3.test`);

  // Seed members
  await seedMember(ownerUserId, ownerRoleId);
  await seedMember(adminUserId, adminRoleId);
  await seedMember(managerUserId, managerRoleId);
  await seedMember(salesUserId, salesRoleId);
  await seedMember(targetUserId, salesRoleId);
});

afterAll(async () => {
  if (!pgUp || !orgId) return;
  await prisma.$executeRawUnsafe(`DELETE FROM audit_logs WHERE "organizationId" = $1::uuid`, orgId);
  await prisma.$executeRawUnsafe(`DELETE FROM organization_members WHERE "organizationId" = $1::uuid`, orgId);
  await prisma.$executeRawUnsafe(`DELETE FROM roles WHERE "organizationId" = $1::uuid`, orgId);
  const userIds = [ownerUserId, adminUserId, managerUserId, salesUserId, targetUserId].filter(Boolean);
  if (userIds.length) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM users WHERE id IN (${userIds.map((_, i) => `$${i + 1}::uuid`).join(',')})`,
      ...userIds,
    );
  }
  await prisma.$executeRawUnsafe(`DELETE FROM organizations WHERE id = $1::uuid`, orgId);
});

// ─── ISO-3a: GET /ping — requires org.read ────────────────────────────────────

describe.skipIf(!pgUp)('ISO-3 — GET /ping (requires org.read)', () => {
  it('OWNER → 200', async () => {
    const res = await request(app).get('/api/v1/ping').set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(200);
  });
  it('ADMIN → 200', async () => {
    const res = await request(app).get('/api/v1/ping').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
  });
  it('MANAGER → 200', async () => {
    const res = await request(app).get('/api/v1/ping').set('Authorization', `Bearer ${managerToken()}`);
    expect(res.status).toBe(200);
  });
  it('SALES_EXECUTIVE → 200', async () => {
    const res = await request(app).get('/api/v1/ping').set('Authorization', `Bearer ${salesToken()}`);
    expect(res.status).toBe(200);
  });
  it('no token → 401', async () => {
    const res = await request(app).get('/api/v1/ping');
    expect(res.status).toBe(401);
  });
  it('non-member user token → 403', async () => {
    // A user ID that does not exist in the org — tenantMiddleware rejects
    const res = await request(app)
      .get('/api/v1/ping')
      .set('Authorization', `Bearer ${signAccessToken({ sub: '00000000-dead-beef-dead-000000000000', orgId, role: 'OWNER', isSuperAdmin: false })}`);
    expect(res.status).toBe(403);
  });
});

// ─── ISO-3b: GET /roles — requires team.read ─────────────────────────────────

describe.skipIf(!pgUp)('ISO-3 — GET /roles (requires team.read)', () => {
  it('OWNER → 200', async () => {
    const res = await request(app).get('/api/v1/roles').set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.roles)).toBe(true);
  });
  it('ADMIN → 200', async () => {
    const res = await request(app).get('/api/v1/roles').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
  });
  it('MANAGER → 200', async () => {
    const res = await request(app).get('/api/v1/roles').set('Authorization', `Bearer ${managerToken()}`);
    expect(res.status).toBe(200);
  });
  it('SALES_EXECUTIVE → 200', async () => {
    const res = await request(app).get('/api/v1/roles').set('Authorization', `Bearer ${salesToken()}`);
    expect(res.status).toBe(200);
  });
  it('no token → 401', async () => {
    expect((await request(app).get('/api/v1/roles')).status).toBe(401);
  });
});

// ─── ISO-3c: PATCH /members/:id/role — requires team.update_role ─────────────
//
// OWNER + ADMIN have team.update_role → 200.
// MANAGER + SALES_EXECUTIVE lack it → 403 (no state change on deny).

describe.skipIf(!pgUp)('ISO-3 — PATCH /members/:id/role (requires team.update_role)', () => {
  it('MANAGER → 403 (lacks team.update_role)', async () => {
    const res = await request(app)
      .patch(`/api/v1/members/${targetUserId}/role`)
      .set('Authorization', `Bearer ${managerToken()}`)
      .send({ roleId: ownerRoleId });
    expect(res.status).toBe(403);
  });

  it('SALES_EXECUTIVE → 403 (lacks team.update_role)', async () => {
    const res = await request(app)
      .patch(`/api/v1/members/${targetUserId}/role`)
      .set('Authorization', `Bearer ${salesToken()}`)
      .send({ roleId: ownerRoleId });
    expect(res.status).toBe(403);
  });

  it('no token → 401', async () => {
    const res = await request(app)
      .patch(`/api/v1/members/${targetUserId}/role`)
      .send({ roleId: ownerRoleId });
    expect(res.status).toBe(401);
  });

  it('OWNER → 200 (promotes target to OWNER, triggers cache invalidation)', async () => {
    const res = await request(app)
      .patch(`/api/v1/members/${targetUserId}/role`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ roleId: ownerRoleId });
    expect(res.status).toBe(200);
  });

  it('ADMIN → 200 (reassigns target back to SALES)', async () => {
    const res = await request(app)
      .patch(`/api/v1/members/${targetUserId}/role`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ roleId: salesRoleId });
    expect(res.status).toBe(200);
  });
});

// ─── ISO-3d: POST /members/:id/suspend — requires team.suspend ───────────────

describe.skipIf(!pgUp)('ISO-3 — POST /members/:id/suspend (requires team.suspend)', () => {
  it('MANAGER → 403 (lacks team.suspend)', async () => {
    const res = await request(app)
      .post(`/api/v1/members/${targetUserId}/suspend`)
      .set('Authorization', `Bearer ${managerToken()}`);
    expect(res.status).toBe(403);
  });

  it('SALES_EXECUTIVE → 403 (lacks team.suspend)', async () => {
    const res = await request(app)
      .post(`/api/v1/members/${targetUserId}/suspend`)
      .set('Authorization', `Bearer ${salesToken()}`);
    expect(res.status).toBe(403);
  });

  it('no token → 401', async () => {
    expect(
      (await request(app).post(`/api/v1/members/${targetUserId}/suspend`)).status,
    ).toBe(401);
  });

  it('OWNER → 200 (suspends target)', async () => {
    const res = await request(app)
      .post(`/api/v1/members/${targetUserId}/suspend`)
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(200);
  });

  it('suspended target → next request rejected at membership gate → 403', async () => {
    // target's membership is now SUSPENDED; cache was invalidated by suspend
    const res = await request(app)
      .get('/api/v1/ping')
      .set('Authorization', `Bearer ${tok(targetUserId, 'SALES_EXECUTIVE')}`);
    expect(res.status).toBe(403);
  });
});

// ─── ISO-3e: Super-admin bypass ───────────────────────────────────────────────

describe.skipIf(!pgUp)('ISO-3 — super-admin bypass skips permission check', () => {
  it('isSuperAdmin=true member with MANAGER role passes team.update_role endpoint → 200', async () => {
    // MANAGER normally lacks team.update_role → 403. With isSuperAdmin=true the RBAC
    // middleware bypasses the permission check entirely (still passes tenantMiddleware).
    // We restore target's status first to ensure the endpoint can execute.
    await prisma.$executeRawUnsafe(
      `UPDATE organization_members SET status='ACTIVE',"roleId"=$1::uuid WHERE "userId"=$2::uuid AND "organizationId"=$3::uuid`,
      salesRoleId, targetUserId, orgId,
    );
    // Invalidate any stale cache entry for target (mimics what the app does on re-activate)
    const superAdminManagerToken = signAccessToken({
      sub: managerUserId, orgId, role: 'MANAGER', isSuperAdmin: true,
    });
    const res = await request(app)
      .patch(`/api/v1/members/${targetUserId}/role`)
      .set('Authorization', `Bearer ${superAdminManagerToken}`)
      .send({ roleId: salesRoleId });
    expect(res.status).toBe(200); // bypass worked even though MANAGER lacks team.update_role
  });
});

// ─── ISO-3f: Cache invalidation (role change) ────────────────────────────────

describe.skipIf(!pgUp)('ISO-3 — cache invalidation: role change takes effect immediately', () => {
  it('SALES_EXECUTIVE member promoted to OWNER: stale SALES token gains team.update_role → 200', async () => {
    // 1. Create a fresh user for this test so prior state does not interfere
    const n = process.hrtime.bigint().toString();
    const freshUserId = await seedUser(`cache-${n}@iso3.test`);
    await seedMember(freshUserId, salesRoleId);

    // 2. Promote via OWNER (cache is invalidated by the RBAC service)
    const promote = await request(app)
      .patch(`/api/v1/members/${freshUserId}/role`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ roleId: ownerRoleId });
    expect(promote.status).toBe(200);

    // 3. freshUser's stale SALES token now uses the DB-resolved OWNER role
    const staleToken = signAccessToken({ sub: freshUserId, orgId, role: 'SALES_EXECUTIVE', isSuperAdmin: false });
    const res = await request(app)
      .patch(`/api/v1/members/${targetUserId}/role`)
      .set('Authorization', `Bearer ${staleToken}`)
      .send({ roleId: salesRoleId });
    expect(res.status).toBe(200); // cache cleared → DB shows OWNER → permission granted

    // Cleanup
    await prisma.$executeRawUnsafe(`DELETE FROM audit_logs WHERE "organizationId"=$1::uuid AND "actorUserId"=$2::uuid`, orgId, freshUserId);
    await prisma.$executeRawUnsafe(`DELETE FROM organization_members WHERE "userId"=$1::uuid AND "organizationId"=$2::uuid`, freshUserId, orgId);
    await prisma.$executeRawUnsafe(`DELETE FROM users WHERE id=$1::uuid`, freshUserId);
  });
});
