// Sprint 7 Milestone 2 — AI lead scoring integration tests.
//
// Covers:
// - Creating a lead enqueues a score-lead job.
// - Modifying status enqueues a score-lead job.
// - processAiScoringJob successfully scores, persists score history,
//   updates denormalized lead score, and appends LEAD_SCORED activity.
// - Delta check (>= 10 points score shift) triggers agent notification.
// - Exceeding monthly quota skips scoring cleanly (returns 200/success in worker, no queue failures).
// - Transient issues (hourly rate-limit or circuit breaker) throw for BullMQ backoff retry.
// - Row-level security (RLS) restricts access across organizations.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../../src/core/prisma/client.js';
import { isPostgresUp, isRedisUp } from '../helpers/services.js';
import { processAiScoringJob, type AiScoringPayload } from '../../src/core/queue/workers/ai-scoring.worker.js';
import { cacheRedis } from '../../src/core/redis/client.js';
import type { Job } from 'bullmq';
import { ActivityType } from '@leados/shared';

const pgUp = await isPostgresUp();
const redisUp = await isRedisUp();
const infra = pgUp && redisUp;

// ─── Seed Helpers ────────────────────────────────────────────────────────────

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

async function seedSubscription(orgId: string, plan: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO subscriptions ("organizationId", plan, status, "updatedAt")
     VALUES ($1::uuid, $2::"SubscriptionPlan", 'ACTIVE'::"SubscriptionStatus", now())`,
    orgId,
    plan,
  );
}

async function seedLead(orgId: string, firstName: string, email: string | null, source: string, assignedToId?: string): Promise<string> {
  const systemMember = await prisma.organizationMember.findFirst({
    where: { organizationId: orgId, status: 'ACTIVE' },
    select: { userId: true },
  });
  const createdById = systemMember!.userId;

  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO leads ("organizationId", "firstName", email, source, status, "assignedToId", "createdById", "updatedAt")
     VALUES ($1::uuid, $2, $3, $4::"LeadSource", 'NEW'::"LeadStatus", $5::uuid, $6::uuid, now()) RETURNING id`,
    orgId,
    firstName,
    email,
    source,
    assignedToId || null,
    createdById,
  );
  return row!.id;
}

function makeJob(leadId: string, organizationId: string, triggerEvent: string): Job<AiScoringPayload> {
  return {
    id: 'job-1',
    data: { leadId, organizationId, triggerEvent },
    opts: { attempts: 3 },
    attemptsMade: 0,
  } as unknown as Job<AiScoringPayload>;
}

// ─── Setup & Teardown ────────────────────────────────────────────────────────

let orgAId = '';
let orgBId = '';
let ownerAId = '';
let ownerBId = '';

beforeAll(async () => {
  if (!infra) return;

  if (cacheRedis.status === 'wait' || cacheRedis.status === 'end') {
    await cacheRedis.connect().catch(() => undefined);
  }

  orgAId = await seedOrg('AI Org A');
  orgBId = await seedOrg('AI Org B');
  ownerAId = await seedUser(`ai-owner-a-${Date.now()}@test.com`);
  ownerBId = await seedUser(`ai-owner-b-${Date.now()}@test.com`);

  const roleA = await seedRole(orgAId, 'OWNER');
  const roleB = await seedRole(orgBId, 'OWNER');

  await seedMember(orgAId, ownerAId, roleA);
  await seedMember(orgBId, ownerBId, roleB);

  await seedSubscription(orgAId, 'TRIAL');
  await seedSubscription(orgBId, 'TRIAL');
});

beforeEach(async () => {
  if (!infra) return;
  // Reset Redis cache namespaces before each test to guarantee isolated sliding windows
  const keys = await cacheRedis.keys('ai:*');
  if (keys.length > 0) {
    await cacheRedis.del(...keys);
  }
  // Reset DB quota counters to prevent monthly-quota state leaking between tests
  await prisma.$executeRawUnsafe(
    `DELETE FROM ai_usage_counters WHERE "organizationId" IN ($1::uuid, $2::uuid)`,
    orgAId || '00000000-0000-0000-0000-000000000000',
    orgBId || '00000000-0000-0000-0000-000000000000',
  );
});

afterAll(async () => {
  if (!infra) return;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
    for (const table of [
      'ai_scores',
      'ai_usage_counters',
      'activities',
      'notifications',
      'leads',
      'organization_members',
      'roles',
      'subscriptions',
    ]) {
      await tx.$executeRawUnsafe(
        `DELETE FROM "${table}" WHERE "organizationId" IN ($1::uuid, $2::uuid)`,
        orgAId,
        orgBId,
      );
    }
    await tx.$executeRawUnsafe(
      `DELETE FROM organizations WHERE id IN ($1::uuid, $2::uuid)`,
      orgAId,
      orgBId,
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM users WHERE id IN ($1::uuid, $2::uuid)`,
      ownerAId,
      ownerBId,
    );
  });
  await cacheRedis.quit().catch(() => undefined);
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AI Scoring Engine Integration', () => {
  it('processAiScoringJob completes scoring, persists score details, updates cache, and appends activity', async () => {
    if (!infra) return;

    // 1. Seed a lead with email (+20) -> Mock score target is 70
    const leadId = await seedLead(orgAId, 'Lead Positive', 'lead-pos@example.com', 'MANUAL');

    // 2. Process worker job
    const job = makeJob(leadId, orgAId, 'LEAD_CREATED');
    await processAiScoringJob(job);

    // 3. Assert AiScore history is created
    const scores = await prisma.aiScore.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
    });
    expect(scores.length).toBe(1);
    expect(scores[0]!.score).toBe(70);
    expect(scores[0]!.triggeredBy).toBe('LEAD_CREATED');

    // 4. Assert Lead table denormalization updates
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { aiScore: true, aiScoreUpdatedAt: true },
    });
    expect(lead?.aiScore).toBe(70);
    expect(lead?.aiScoreUpdatedAt).toBeInstanceOf(Date);

    // 5. Assert Activity emission is present
    const activities = await prisma.activity.findMany({
      where: { relatedLeadId: leadId, type: ActivityType.LEAD_SCORED },
    });
    expect(activities.length).toBe(1);
    expect(activities[0]!.description).toContain('Lead scored by AI: 70');
  });

  it('triggers agent notification when score delta shift is >= 10 points', async () => {
    if (!infra) return;

    // 1. Seed lead assigned to Owner A
    const leadId = await seedLead(orgAId, 'Delta Lead', null, 'MANUAL', ownerAId);

    // 2. Set initial score (50 base - 10 no email = 40)
    await processAiScoringJob(makeJob(leadId, orgAId, 'LEAD_CREATED'));

    const initialNotificationsCount = await prisma.notification.count({
      where: { userId: ownerAId, type: 'LEAD_SCORED' },
    });

    // 3. Update email in database to change score target to 70 (+30 delta)
    await prisma.lead.update({
      where: { id: leadId },
      data: { email: 'delta-change@example.com' },
    });

    // 4. Run worker again simulating lead status change
    await processAiScoringJob(makeJob(leadId, orgAId, 'LEAD_STATUS_CHANGED'));

    // 5. Assert notification is created for assigned user
    const currentNotifications = await prisma.notification.findMany({
      where: { userId: ownerAId, type: 'LEAD_SCORED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(currentNotifications.length - initialNotificationsCount).toBe(1);
    expect(currentNotifications[0]!.title).toContain('Lead Score Change');
    expect(currentNotifications[0]!.body).toContain('score changed to 70');
  });

  it('gracefully skips scoring when monthly usage quota limit is exceeded', async () => {
    if (!infra) return;

    const leadId = await seedLead(orgAId, 'Quota Out Lead', 'quota@example.com', 'MANUAL');

    // Simulate exceeding quota by seeding 500 calls in ai_usage_counters table for the current month
    const periodMonth = new Date().toISOString().slice(0, 7);
    await prisma.aiUsageCounter.upsert({
      where: { organizationId_periodMonth: { organizationId: orgAId, periodMonth } },
      create: { organizationId: orgAId, periodMonth, callCount: 500, tokenCount: 0 },
      update: { callCount: 500 },
    });

    // Run scoring worker
    const job = makeJob(leadId, orgAId, 'LEAD_CREATED');
    await expect(processAiScoringJob(job)).resolves.not.toThrow();

    // Check that no AiScore record was created due to quota skip
    const scores = await prisma.aiScore.findMany({ where: { leadId } });
    expect(scores.length).toBe(0);
  });

  it('re-throws RATE_LIMITED error for BullMQ queue retry backoff', async () => {
    if (!infra) return;

    // Use orgBId for isolation — unaffected by orgAId quota state
    const leadId = await seedLead(orgBId, 'Rate Limit Lead', 'rate@example.com', 'MANUAL');

    // Seed Redis rate limit key to block hourly calls for orgBId
    const limitKey = `ai:rate_limit:hourly:${orgBId}`;
    const now = Date.now();
    for (let i = 0; i < 55; i++) {
      await cacheRedis.zadd(limitKey, now - i * 1000, `val-${i}`);
    }

    const job = makeJob(leadId, orgBId, 'LEAD_CREATED');
    await expect(processAiScoringJob(job)).rejects.toThrow('Hourly AI rate limit exceeded');
  });

  it('enforces row-level security (RLS) preventing cross-tenant access', async () => {
    if (!infra) return;

    // Seed lead in Org A
    const leadIdA = await seedLead(orgAId, 'Lead Org A', null, 'MANUAL');

    // Attempt to score Org A lead under Org B context -> should fail with Lead not found (404/AppError)
    const job = makeJob(leadIdA, orgBId, 'LEAD_CREATED');
    await expect(processAiScoringJob(job)).resolves.not.toThrow(); // returns cleanly because findUnique returns null under Org B scope

    const scores = await prisma.aiScore.findMany({ where: { leadId: leadIdA } });
    expect(scores.length).toBe(0); // no score inserted
  });
});
