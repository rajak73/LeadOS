import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/core/prisma/client.js';
import { isPostgresUp, isRedisUp } from '../helpers/services.js';
import { signAccessToken } from '../../src/core/auth/jwt.js';

const pgUp = await isPostgresUp();
const redisUp = await isRedisUp();
const infra = pgUp && redisUp;

const app = buildApp();

async function seedOrg(name: string): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO organizations (name, slug, "updatedAt") VALUES ($1, $2, now()) RETURNING id`,
    name, `${name.toLowerCase().replace(/\s/g, '-')}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  return row!.id;
}

async function seedUser(email: string): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO users (email, "passwordHash", "firstName", "lastName", "updatedAt")
     VALUES ($1, 'x', 'Test', 'User', now()) RETURNING id`,
    email,
  );
  return row!.id;
}

async function seedRole(orgId: string, name: string): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO roles (id, "organizationId", name, "isSystem", "updatedAt")
     VALUES (uuid_generate_v4(), $1::uuid, $2, true, now()) RETURNING id`,
    orgId, name,
  );
  return row!.id;
}

async function seedMember(orgId: string, userId: string, roleId: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO organization_members ("organizationId", "userId", "roleId", status, "updatedAt")
     VALUES ($1::uuid, $2::uuid, $3::uuid, 'ACTIVE', now())`,
    orgId, userId, roleId,
  );
}

let orgId = '';
let userId = '';
let token = '';

beforeAll(async () => {
  if (!infra) return;
  orgId = await seedOrg('Analytics Org');
  userId = await seedUser(`analytics-user-${Date.now()}@test.com`);
  const roleId = await seedRole(orgId, 'OWNER');
  await seedMember(orgId, userId, roleId);
  token = signAccessToken({ sub: userId, orgId, role: 'OWNER', isSuperAdmin: false });
});

afterAll(async () => {
  if (!infra) return;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
    for (const table of ['deals', 'leads', 'organization_members', 'roles']) {
      await tx.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "organizationId" = $1::uuid`, orgId);
    }
    await tx.$executeRawUnsafe(`DELETE FROM organizations WHERE id = $1::uuid`, orgId);
    await tx.$executeRawUnsafe(`DELETE FROM users WHERE id = $1::uuid`, userId);
  });
});

describe('Analytics & Insights Dashboard API', () => {
  it('GET /api/v1/analytics/dashboard -> returns cached dashboard metrics summary', async () => {
    if (!infra) return;

    // Seed some leads and deals
    await prisma.lead.create({
      data: {
        organizationId: orgId,
        firstName: 'Analytics',
        lastName: 'Lead 1',
        status: 'NEW',
        source: 'MANUAL',
        createdById: userId,
      },
    });

    await prisma.lead.create({
      data: {
        organizationId: orgId,
        firstName: 'Analytics',
        lastName: 'Lead 2',
        status: 'QUALIFIED',
        source: 'INSTAGRAM_DM',
        createdById: userId,
      },
    });

    const res = await request(app)
      .get('/api/v1/analytics/dashboard')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalLeads).toBe(2);
    expect(res.body.data.statusBreakdown.NEW).toBe(1);
    expect(res.body.data.statusBreakdown.QUALIFIED).toBe(1);
    expect(res.body.data.sourceBreakdown).toContainEqual(expect.objectContaining({ source: 'MANUAL', count: 1 }));
    expect(res.body.data.sourceBreakdown).toContainEqual(expect.objectContaining({ source: 'INSTAGRAM_DM', count: 1 }));
  });
});
