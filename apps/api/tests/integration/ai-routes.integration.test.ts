import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/core/prisma/client.js';
import { isPostgresUp, isRedisUp } from '../helpers/services.js';
import { signAccessToken } from '../../src/core/auth/jwt.js';
import { resetFlags, setFlag } from '../../src/core/flags/flags.js';

const pgUp = await isPostgresUp();
const redisUp = await isRedisUp();
const infra = pgUp && redisUp;
const app = buildApp();

let orgId = '';
let otherOrgId = '';
let ownerUserId = '';
let otherUserId = '';

function ownerToken(): string {
  return signAccessToken({ sub: ownerUserId, orgId, role: 'OWNER', isSuperAdmin: false });
}

function otherOrgToken(): string {
  return signAccessToken({ sub: otherUserId, orgId: otherOrgId, role: 'OWNER', isSuperAdmin: false });
}

async function seedOrg(name: string): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO organizations (name, slug, "updatedAt") VALUES ($1, $2, now()) RETURNING id`,
    name,
    `${name.toLowerCase().replace(/\s/g, '-')}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
    orgId,
    name,
  );
  return row!.id;
}

async function seedMember(orgId: string, userId: string, roleId: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO organization_members ("organizationId", "userId", "roleId", status, "updatedAt")
     VALUES ($1::uuid, $2::uuid, $3::uuid, 'ACTIVE', now())`,
    orgId,
    userId,
    roleId,
  );
}

async function seedLead(orgId: string, firstName: string, email: string | null, source: string, createdById: string): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO leads ("organizationId", "firstName", email, source, status, "createdById", "updatedAt")
     VALUES ($1::uuid, $2, $3, $4::"LeadSource", 'NEW'::"LeadStatus", $5::uuid, now()) RETURNING id`,
    orgId,
    firstName,
    email,
    source,
    createdById,
  );
  return row!.id;
}

async function seedSubscription(orgId: string, plan: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO subscriptions ("organizationId", plan, status, "updatedAt")
     VALUES ($1::uuid, $2::"SubscriptionPlan", 'ACTIVE'::"SubscriptionStatus", now())
     ON CONFLICT ("organizationId") DO UPDATE SET plan = EXCLUDED.plan`,
    orgId,
    plan,
  );
}

beforeAll(async () => {
  if (!infra) return;

  orgId = await seedOrg('AI Routes Org A');
  otherOrgId = await seedOrg('AI Routes Org B');

  ownerUserId = await seedUser(`ai-route-owner-a-${Date.now()}@test.com`);
  otherUserId = await seedUser(`ai-route-owner-b-${Date.now()}@test.com`);

  const roleA = await seedRole(orgId, 'OWNER');
  const roleB = await seedRole(otherOrgId, 'OWNER');

  await seedMember(orgId, ownerUserId, roleA);
  await seedMember(otherOrgId, otherUserId, roleB);

  await seedSubscription(orgId, 'TRIAL');
  await seedSubscription(otherOrgId, 'TRIAL');
});

beforeEach(async () => {
  if (!infra) return;
  resetFlags();
  await prisma.aiUsageCounter.deleteMany({
    where: { organizationId: orgId },
  });
});

afterAll(async () => {
  if (!infra) return;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
    for (const table of [
      'ai_scores',
      'ai_usage_counters',
      'leads',
      'organization_members',
      'roles',
      'subscriptions',
    ]) {
      await tx.$executeRawUnsafe(
        `DELETE FROM "${table}" WHERE "organizationId" IN ($1::uuid, $2::uuid)`,
        orgId,
        otherOrgId,
      );
    }
    await tx.$executeRawUnsafe(
      `DELETE FROM organizations WHERE id IN ($1::uuid, $2::uuid)`,
      orgId,
      otherOrgId,
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM users WHERE id IN ($1::uuid, $2::uuid)`,
      ownerUserId,
      otherUserId,
    );
  });
});

describe.skipIf(!infra)('AI Scoring HTTP Routes', () => {
  it('GET /api/v1/leads/:id/score -> 200 returns score details and empty history', async () => {
    const leadId = await seedLead(orgId, 'Route Lead', 'route@test.com', 'MANUAL', ownerUserId);

    const res = await request(app)
      .get(`/api/v1/leads/${leadId}/score`)
      .set('Authorization', `Bearer ${ownerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.score).toBeNull();
    expect(res.body.data.history).toBeInstanceOf(Array);
    expect(res.body.data.history.length).toBe(0);
  });

  it('GET /api/v1/leads/:id/score -> 404 cross-org check', async () => {
    const leadId = await seedLead(orgId, 'Route Lead Cross', 'cross@test.com', 'MANUAL', ownerUserId);

    const res = await request(app)
      .get(`/api/v1/leads/${leadId}/score`)
      .set('Authorization', `Bearer ${otherOrgToken()}`);

    expect(res.status).toBe(404);
  });

  it('POST /api/v1/leads/:id/rescore -> 202 enqueues rescore job', async () => {
    const leadId = await seedLead(orgId, 'Rescore Lead', 'rescore@test.com', 'MANUAL', ownerUserId);

    const res = await request(app)
      .post(`/api/v1/leads/${leadId}/rescore`)
      .set('Authorization', `Bearer ${ownerToken()}`);

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('PENDING');
  });

  it('POST /api/v1/leads/:id/rescore -> 503 FEATURE_DISABLED when flag is off', async () => {
    setFlag('ai.scoring.enabled', false);
    const leadId = await seedLead(orgId, 'Rescore Flag Lead', 'rescore-flag@test.com', 'MANUAL', ownerUserId);

    const res = await request(app)
      .post(`/api/v1/leads/${leadId}/rescore`)
      .set('Authorization', `Bearer ${ownerToken()}`);

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('FEATURE_DISABLED');
  });

  it('POST /api/v1/leads/:id/rescore -> 429 AI_QUOTA_EXCEEDED when over monthly limit', async () => {
    const leadId = await seedLead(orgId, 'Rescore Quota Lead', 'rescore-quota@test.com', 'MANUAL', ownerUserId);
    
    // Seed quota limit exceeded
    const periodMonth = new Date().toISOString().slice(0, 7);
    await prisma.aiUsageCounter.create({
      data: {
        organizationId: orgId,
        periodMonth,
        callCount: 505, // Trial limit is 500
      }
    });

    const res = await request(app)
      .post(`/api/v1/leads/${leadId}/rescore`)
      .set('Authorization', `Bearer ${ownerToken()}`);

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('AI_QUOTA_EXCEEDED');
  });

  it('GET /api/v1/leads/:id/follow-up-suggestion -> returns channel and draft suggestion', async () => {
    const periodMonth = new Date().toISOString().slice(0, 7);
    await prisma.aiUsageCounter.deleteMany({
      where: { organizationId: orgId, periodMonth }
    });

    const leadId = await seedLead(orgId, 'Suggestion Lead', 'suggest@test.com', 'MANUAL', ownerUserId);

    const res = await request(app)
      .get(`/api/v1/leads/${leadId}/follow-up-suggestion`)
      .set('Authorization', `Bearer ${ownerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.channel).toBe('EMAIL');
    expect(res.body.data.draft).toContain('Hi Suggestion');
  });
});
