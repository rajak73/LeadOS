// Sprint 5 M2 — CRM-8 Pipeline module integration tests.
//
// Real JWTs + assembled app + real Postgres as leados_app (via withTenant).
// DB-gated: self-skips when Postgres is unavailable.
//
// Coverage checklist:
//   POST   /pipelines                        → 201 creates pipeline
//   POST   /pipelines                        → writes audit row
//   POST   /pipelines                        → 201 with initial stages
//   POST   /pipelines                        → 201 first pipeline auto-set as default
//   POST   /pipelines                        → 402 plan limit (TRIAL = 1 pipeline)
//   POST   /pipelines                        → 401 no auth
//   POST   /pipelines                        → 403 SALES_EXECUTIVE (no pipelines.create)
//   POST   /pipelines                        → 422 validation (empty name)
//   GET    /pipelines                        → 200 lists pipelines including stages
//   GET    /pipelines/:id                    → 200 returns pipeline with stages
//   GET    /pipelines/:id                    → 404 cross-org isolation (RLS)
//   GET    /pipelines/:id                    → 404 unknown UUID
//   GET    /pipelines                        → 200 MANAGER can read (pipelines.read)
//   PATCH  /pipelines/:id                    → 200 updates name
//   PATCH  /pipelines/:id                    → writes audit row
//   PATCH  /pipelines/:id                    → 200 isDefault swap (only one default per org)
//   DELETE /pipelines/:id                    → 204 deletes pipeline with no deals
//   DELETE /pipelines/:id                    → 409 pipeline has deals
//   DELETE /pipelines/:id                    → 409 default pipeline
//   POST   /pipelines/:id/stages             → 201 adds stage
//   POST   /pipelines/:id/stages             → 409 second isWon=true stage
//   POST   /pipelines/:id/stages             → 409 second isLost=true stage
//   POST   /pipelines/:id/stages             → 422 cannot be both won and lost
//   PATCH  /pipelines/:id/stages/:stageId    → 200 updates stage
//   PATCH  /pipelines/:id/stages/:stageId    → 422 cannot be both won and lost
//   PATCH  /pipelines/:id/stages/reorder     → 200 reorders stages
//   PATCH  /pipelines/:id/stages/reorder     → 422 missing stage ID
//   DELETE /pipelines/:id/stages/:stageId    → 204 deletes unused non-final stage
//   DELETE /pipelines/:id/stages/:stageId    → 409 last stage
//   DELETE /pipelines/:id/stages/:stageId    → 409 stage has deals
//   POST   /pipelines/:id/stages             → 403 SALES_EXECUTIVE (no pipelines.update)

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/core/prisma/client.js';
import { isPostgresUp } from '../helpers/services.js';
import { signAccessToken } from '../../src/core/auth/jwt.js';
import { ActivityType, PLAN_LIMITS } from '@leados/shared';

const pgUp = await isPostgresUp();
const app = buildApp();

// ── Fixtures ─────────────────────────────────────────────────────────────────

let orgA = '';
let orgB = '';
let orgTrial = '';

let ownerUserId = '';
let salesUserId = '';
let otherUserId = '';

function ownerToken(): string {
  return signAccessToken({ sub: ownerUserId, orgId: orgA, role: 'OWNER', isSuperAdmin: false });
}
function salesToken(): string {
  return signAccessToken({ sub: salesUserId, orgId: orgA, role: 'SALES_EXECUTIVE', isSuperAdmin: false });
}
function managerToken(): string {
  return signAccessToken({ sub: ownerUserId, orgId: orgA, role: 'MANAGER', isSuperAdmin: false });
}
function otherOrgToken(): string {
  return signAccessToken({ sub: otherUserId, orgId: orgB, role: 'OWNER', isSuperAdmin: false });
}
function trialToken(): string {
  return signAccessToken({ sub: ownerUserId, orgId: orgTrial, role: 'OWNER', isSuperAdmin: false });
}

async function seedOrg(name: string, slug: string): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO organizations (name, slug, "updatedAt") VALUES ($1, $2, now()) RETURNING id`,
    name, slug,
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
    `INSERT INTO organization_members (id, "organizationId", "userId", "roleId", status, "updatedAt")
     VALUES (uuid_generate_v4(), $1::uuid, $2::uuid, $3::uuid, 'ACTIVE', now())`,
    orgId, userId, roleId,
  );
}

async function seedSubscription(orgId: string, plan: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO subscriptions ("organizationId", plan, status, "updatedAt")
     VALUES ($1::uuid, $2::"SubscriptionPlan", 'ACTIVE', now())
     ON CONFLICT ("organizationId") DO UPDATE SET plan = EXCLUDED.plan`,
    orgId, plan,
  );
}

async function seedPipeline(orgId: string, name: string, isDefault = false): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO pipelines ("organizationId", name, "isDefault", "updatedAt")
     VALUES ($1::uuid, $2, $3, now()) RETURNING id`,
    orgId, name, isDefault,
  );
  return row!.id;
}

async function seedStage(orgId: string, pipelineId: string, name: string, order: number): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO pipeline_stages ("organizationId", "pipelineId", name, "order", "isWon", "isLost", "updatedAt")
     VALUES ($1::uuid, $2::uuid, $3, $4, false, false, now()) RETURNING id`,
    orgId, pipelineId, name, order,
  );
  return row!.id;
}

async function seedDeal(orgId: string, pipelineId: string, stageId: string, createdById: string): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO deals ("organizationId", "pipelineId", "stageId", title, status, "createdById", "updatedAt")
     VALUES ($1::uuid, $2::uuid, $3::uuid, 'Test Deal', 'OPEN', $4::uuid, now()) RETURNING id`,
    orgId, pipelineId, stageId, createdById,
  );
  return row!.id;
}

const TRIAL_PIPELINE_LIMIT = PLAN_LIMITS.TRIAL.pipelines;

beforeAll(async () => {
  if (!pgUp) return;
  const nonce = process.hrtime.bigint().toString();

  orgA     = await seedOrg(`Pipelines A ${nonce}`, `pip-a-${nonce}`);
  orgB     = await seedOrg(`Pipelines B ${nonce}`, `pip-b-${nonce}`);
  orgTrial = await seedOrg(`Pipelines Trial ${nonce}`, `pip-trial-${nonce}`);

  ownerUserId = await seedUser(`owner+${nonce}@pip.test`);
  salesUserId = await seedUser(`sales+${nonce}@pip.test`);
  otherUserId = await seedUser(`other+${nonce}@pip.test`);

  const ownerRoleA     = await seedRole(orgA, 'OWNER');
  const salesRoleA     = await seedRole(orgA, 'SALES_EXECUTIVE');
  const ownerRoleB     = await seedRole(orgB, 'OWNER');
  const ownerRoleTrial = await seedRole(orgTrial, 'OWNER');

  await seedMember(orgA, ownerUserId, ownerRoleA);
  await seedMember(orgA, salesUserId, salesRoleA);
  await seedMember(orgB, otherUserId, ownerRoleB);
  await seedMember(orgTrial, ownerUserId, ownerRoleTrial);

  await seedSubscription(orgA,     'GROWTH');
  await seedSubscription(orgB,     'GROWTH');
  await seedSubscription(orgTrial, 'TRIAL');

  // Pre-seed orgTrial to the pipeline limit so the 402 test is repeatable regardless of order.
  for (let i = 0; i < TRIAL_PIPELINE_LIMIT; i++) {
    await seedPipeline(orgTrial, `Trial Pipeline ${i}`, i === 0);
  }
});

afterAll(async () => {
  if (!pgUp || !orgA) return;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
    await tx.$executeRawUnsafe(
      `DELETE FROM deals WHERE "organizationId" IN ($1::uuid, $2::uuid, $3::uuid)`,
      orgA, orgB, orgTrial,
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM pipeline_stages WHERE "organizationId" IN ($1::uuid, $2::uuid, $3::uuid)`,
      orgA, orgB, orgTrial,
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM pipelines WHERE "organizationId" IN ($1::uuid, $2::uuid, $3::uuid)`,
      orgA, orgB, orgTrial,
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM activities WHERE "organizationId" IN ($1::uuid, $2::uuid, $3::uuid)`,
      orgA, orgB, orgTrial,
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM audit_logs WHERE "organizationId" IN ($1::uuid, $2::uuid, $3::uuid)`,
      orgA, orgB, orgTrial,
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM organization_members WHERE "organizationId" IN ($1::uuid, $2::uuid, $3::uuid)`,
      orgA, orgB, orgTrial,
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM roles WHERE "organizationId" IN ($1::uuid, $2::uuid, $3::uuid)`,
      orgA, orgB, orgTrial,
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM subscriptions WHERE "organizationId" IN ($1::uuid, $2::uuid, $3::uuid)`,
      orgA, orgB, orgTrial,
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM organizations WHERE id IN ($1::uuid, $2::uuid, $3::uuid)`,
      orgA, orgB, orgTrial,
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM users WHERE id IN ($1::uuid, $2::uuid)`,
      ownerUserId, salesUserId,
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM users WHERE id = $1::uuid`,
      otherUserId,
    );
  });
});

// ── POST /api/v1/pipelines ────────────────────────────────────────────────────

describe.skipIf(!pgUp)('POST /api/v1/pipelines', () => {
  it('201 — creates a pipeline (OWNER)', async () => {
    const res = await request(app)
      .post('/api/v1/pipelines')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ name: 'Sales Pipeline' });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Sales Pipeline');
    expect(res.body.data.organizationId).toBe(orgA);
    expect(res.body.data.stages).toEqual([]);

    const audit = await prisma.auditLog.findFirst({
      where: { organizationId: orgA, resource: 'pipeline', resourceId: res.body.data.id, action: 'created' },
    });
    expect(audit).not.toBeNull();

    const activity = await prisma.activity.findFirst({
      where: {
        organizationId: orgA,
        type: ActivityType.PIPELINE_CREATED,
        relatedPipelineId: res.body.data.id,
      },
    });
    expect(activity).not.toBeNull();
  });

  it('201 — creates pipeline with initial stages (order preserved)', async () => {
    const res = await request(app)
      .post('/api/v1/pipelines')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({
        name: 'Staged Pipeline',
        stages: [
          { name: 'Prospect' },
          { name: 'Qualified' },
          { name: 'Closed Won', isWon: true },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.stages).toHaveLength(3);
    expect(res.body.data.stages[0].name).toBe('Prospect');
    expect(res.body.data.stages[0].order).toBe(0);
    expect(res.body.data.stages[2].name).toBe('Closed Won');
    expect(res.body.data.stages[2].isWon).toBe(true);

    const stageActivityCount = await prisma.activity.count({
      where: {
        organizationId: orgA,
        type: ActivityType.PIPELINE_STAGE_CREATED,
        relatedPipelineId: res.body.data.id,
      },
    });
    expect(stageActivityCount).toBe(3);
  });

  it('201 — first pipeline in org is auto-set as default', async () => {
    // orgTrial already has pre-seeded pipelines but none via API yet for a fresh org test.
    // Use orgB (GROWTH, currently empty) to test auto-default on first pipeline.
    const res = await request(app)
      .post('/api/v1/pipelines')
      .set('Authorization', `Bearer ${otherOrgToken()}`)
      .send({ name: 'First Pipeline', isDefault: false });
    expect(res.status).toBe(201);
    expect(res.body.data.isDefault).toBe(true);
  });

  it('402 — TRIAL org at pipeline limit returns PLAN_LIMIT_EXCEEDED', async () => {
    const res = await request(app)
      .post('/api/v1/pipelines')
      .set('Authorization', `Bearer ${trialToken()}`)
      .send({ name: 'Extra Pipeline' });
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('PLAN_LIMIT_EXCEEDED');
  });

  it('401 — no auth token', async () => {
    const res = await request(app)
      .post('/api/v1/pipelines')
      .send({ name: 'Unauth Pipeline' });
    expect(res.status).toBe(401);
  });

  it('403 — SALES_EXECUTIVE lacks pipelines.create', async () => {
    const res = await request(app)
      .post('/api/v1/pipelines')
      .set('Authorization', `Bearer ${salesToken()}`)
      .send({ name: 'Sales Cannot Create' });
    expect(res.status).toBe(403);
  });

  it('422 — empty name fails validation', async () => {
    const res = await request(app)
      .post('/api/v1/pipelines')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ name: '' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ── GET /api/v1/pipelines ─────────────────────────────────────────────────────

describe.skipIf(!pgUp)('GET /api/v1/pipelines', () => {
  it('200 — lists pipelines with their stages', async () => {
    const res = await request(app)
      .get('/api/v1/pipelines')
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    for (const p of res.body.data) {
      expect(Array.isArray(p.stages)).toBe(true);
    }
  });

  it('200 — MANAGER can list pipelines (has pipelines.read)', async () => {
    const res = await request(app)
      .get('/api/v1/pipelines')
      .set('Authorization', `Bearer ${managerToken()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ── GET /api/v1/pipelines/:id ─────────────────────────────────────────────────

describe.skipIf(!pgUp)('GET /api/v1/pipelines/:id', () => {
  let pipelineId = '';

  beforeAll(async () => {
    if (!pgUp) return;
    pipelineId = await seedPipeline(orgA, 'GetById Pipeline');
    await seedStage(orgA, pipelineId, 'Stage Alpha', 0);
  });

  it('200 — returns pipeline with stages ordered', async () => {
    const res = await request(app)
      .get(`/api/v1/pipelines/${pipelineId}`)
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(pipelineId);
    expect(Array.isArray(res.body.data.stages)).toBe(true);
    expect(res.body.data.stages[0].name).toBe('Stage Alpha');
  });

  it('404 — orgB cannot read orgA pipeline (cross-org RLS)', async () => {
    const res = await request(app)
      .get(`/api/v1/pipelines/${pipelineId}`)
      .set('Authorization', `Bearer ${otherOrgToken()}`);
    expect(res.status).toBe(404);
  });

  it('404 — unknown pipeline UUID', async () => {
    const res = await request(app)
      .get('/api/v1/pipelines/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(404);
  });
});

// ── PATCH /api/v1/pipelines/:id ───────────────────────────────────────────────

describe.skipIf(!pgUp)('PATCH /api/v1/pipelines/:id', () => {
  let pipA = '';
  let pipB = '';

  beforeAll(async () => {
    if (!pgUp) return;
    // Seed both as non-default — orgA already has a default from earlier tests,
    // so inserting isDefault=true via raw SQL would violate the partial unique index.
    pipA = await seedPipeline(orgA, 'Update Pipeline A');
    pipB = await seedPipeline(orgA, 'Update Pipeline B');
  });

  it('200 — updates pipeline name', async () => {
    const res = await request(app)
      .patch(`/api/v1/pipelines/${pipA}`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ name: 'Renamed Pipeline' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Renamed Pipeline');

    const audit = await prisma.auditLog.findFirst({
      where: { organizationId: orgA, resource: 'pipeline', resourceId: pipA, action: 'updated' },
    });
    expect(audit).not.toBeNull();

    const activity = await prisma.activity.findFirst({
      where: {
        organizationId: orgA,
        type: ActivityType.PIPELINE_UPDATED,
        relatedPipelineId: pipA,
      },
    });
    expect(activity).not.toBeNull();
  });

  it('200 — setting isDefault swaps default (only one per org)', async () => {
    // First make pipA the default via API (which atomically clears any existing default).
    await request(app)
      .patch(`/api/v1/pipelines/${pipA}`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ isDefault: true });

    // Now swap default to pipB.
    const res = await request(app)
      .patch(`/api/v1/pipelines/${pipB}`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ isDefault: true });
    expect(res.status).toBe(200);
    expect(res.body.data.isDefault).toBe(true);

    // Verify pipA was atomically unset.
    const checkA = await request(app)
      .get(`/api/v1/pipelines/${pipA}`)
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(checkA.body.data.isDefault).toBe(false);
  });

  it('404 — orgB cannot update orgA pipeline (cross-org isolation)', async () => {
    const res = await request(app)
      .patch(`/api/v1/pipelines/${pipA}`)
      .set('Authorization', `Bearer ${otherOrgToken()}`)
      .send({ name: 'Cross Org Rename' });
    expect(res.status).toBe(404);
  });
});

// ── DELETE /api/v1/pipelines/:id ──────────────────────────────────────────────

describe.skipIf(!pgUp)('DELETE /api/v1/pipelines/:id', () => {
  it('204 — deletes a non-default pipeline with no deals', async () => {
    const id = await seedPipeline(orgA, 'Delete Me');
    const res = await request(app)
      .delete(`/api/v1/pipelines/${id}`)
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(204);

    const activity = await prisma.activity.findFirst({
      where: {
        organizationId: orgA,
        type: ActivityType.PIPELINE_DELETED,
        relatedPipelineId: id,
      },
    });
    expect(activity).not.toBeNull();
  });

  it('409 — cannot delete pipeline that has deals', async () => {
    const pipelineId = await seedPipeline(orgA, 'Has Deals Pipeline');
    const stageId = await seedStage(orgA, pipelineId, 'Only Stage', 0);
    await seedDeal(orgA, pipelineId, stageId, ownerUserId);

    const res = await request(app)
      .delete(`/api/v1/pipelines/${pipelineId}`)
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('409 — cannot delete the default pipeline', async () => {
    // Use the existing default pipeline for orgA (avoids seeding a second isDefault=true
    // which would violate the partial unique index).
    const listRes = await request(app)
      .get('/api/v1/pipelines')
      .set('Authorization', `Bearer ${ownerToken()}`);
    const defaultPipeline = (listRes.body.data as { id: string; isDefault: boolean }[])
      .find((p) => p.isDefault);
    expect(defaultPipeline).toBeDefined();

    const res = await request(app)
      .delete(`/api/v1/pipelines/${defaultPipeline!.id}`)
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});

// ── POST /api/v1/pipelines/:id/stages ────────────────────────────────────────

describe.skipIf(!pgUp)('POST /api/v1/pipelines/:id/stages', () => {
  let pipelineId = '';

  beforeAll(async () => {
    if (!pgUp) return;
    pipelineId = await seedPipeline(orgA, 'Stage Host Pipeline');
    await seedStage(orgA, pipelineId, 'Initial Stage', 0);
  });

  it('201 — adds a stage to pipeline (OWNER)', async () => {
    const res = await request(app)
      .post(`/api/v1/pipelines/${pipelineId}/stages`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ name: 'New Stage', color: '#FF5733', probability: 50 });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('New Stage');
    expect(res.body.data.color).toBe('#FF5733');
    expect(res.body.data.probability).toBe(50);
    expect(res.body.data.pipelineId).toBe(pipelineId);

    const activity = await prisma.activity.findFirst({
      where: {
        organizationId: orgA,
        type: ActivityType.PIPELINE_STAGE_CREATED,
        relatedPipelineStageId: res.body.data.id,
      },
    });
    expect(activity).not.toBeNull();
  });

  it('409 — second isWon=true stage returns CONFLICT', async () => {
    // Add first won stage
    await request(app)
      .post(`/api/v1/pipelines/${pipelineId}/stages`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ name: 'Won Stage', isWon: true });

    // Try adding second won stage
    const res = await request(app)
      .post(`/api/v1/pipelines/${pipelineId}/stages`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ name: 'Another Won Stage', isWon: true });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('409 — second isLost=true stage returns CONFLICT', async () => {
    await request(app)
      .post(`/api/v1/pipelines/${pipelineId}/stages`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ name: 'Lost Stage', isLost: true });

    const res = await request(app)
      .post(`/api/v1/pipelines/${pipelineId}/stages`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ name: 'Another Lost Stage', isLost: true });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('422 — rejects a stage marked both won and lost', async () => {
    const res = await request(app)
      .post(`/api/v1/pipelines/${pipelineId}/stages`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ name: 'Impossible Stage', isWon: true, isLost: true });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('403 — SALES_EXECUTIVE lacks pipelines.update', async () => {
    const res = await request(app)
      .post(`/api/v1/pipelines/${pipelineId}/stages`)
      .set('Authorization', `Bearer ${salesToken()}`)
      .send({ name: 'Forbidden Stage' });
    expect(res.status).toBe(403);
  });
});

// ── PATCH /api/v1/pipelines/:id/stages/:stageId ───────────────────────────────

describe.skipIf(!pgUp)('PATCH /api/v1/pipelines/:id/stages/:stageId', () => {
  let pipelineId = '';
  let stageId = '';

  beforeAll(async () => {
    if (!pgUp) return;
    pipelineId = await seedPipeline(orgA, 'Update Stage Pipeline');
    stageId = await seedStage(orgA, pipelineId, 'Stage To Update', 0);
  });

  it('200 — updates stage name and color', async () => {
    const res = await request(app)
      .patch(`/api/v1/pipelines/${pipelineId}/stages/${stageId}`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ name: 'Updated Stage', color: '#00FF00' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated Stage');
    expect(res.body.data.color).toBe('#00FF00');

    const activity = await prisma.activity.findFirst({
      where: {
        organizationId: orgA,
        type: ActivityType.PIPELINE_STAGE_UPDATED,
        relatedPipelineStageId: stageId,
      },
    });
    expect(activity).not.toBeNull();
  });

  it('422 — rejects a stage update marked both won and lost', async () => {
    const res = await request(app)
      .patch(`/api/v1/pipelines/${pipelineId}/stages/${stageId}`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ isWon: true, isLost: true });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ── PATCH /api/v1/pipelines/:id/stages/reorder ───────────────────────────────

describe.skipIf(!pgUp)('PATCH /api/v1/pipelines/:id/stages/reorder', () => {
  let pipelineId = '';
  let stageA = '';
  let stageB = '';
  let stageC = '';

  beforeAll(async () => {
    if (!pgUp) return;
    pipelineId = await seedPipeline(orgA, 'Reorder Pipeline');
    stageA = await seedStage(orgA, pipelineId, 'Alpha', 0);
    stageB = await seedStage(orgA, pipelineId, 'Beta', 1);
    stageC = await seedStage(orgA, pipelineId, 'Gamma', 2);
  });

  it('200 — reorders stages and returns them in new order', async () => {
    const res = await request(app)
      .patch(`/api/v1/pipelines/${pipelineId}/stages/reorder`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ stageIds: [stageC, stageA, stageB] });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].id).toBe(stageC);
    expect(res.body.data[1].id).toBe(stageA);
    expect(res.body.data[2].id).toBe(stageB);

    const activity = await prisma.activity.findFirst({
      where: {
        organizationId: orgA,
        type: ActivityType.PIPELINE_STAGE_REORDERED,
        relatedPipelineId: pipelineId,
      },
    });
    expect(activity).not.toBeNull();
  });

  it('422 — reorder with wrong number of IDs fails validation', async () => {
    const res = await request(app)
      .patch(`/api/v1/pipelines/${pipelineId}/stages/reorder`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ stageIds: [stageA, stageB] }); // missing stageC
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ── DELETE /api/v1/pipelines/:id/stages/:stageId ─────────────────────────────

describe.skipIf(!pgUp)('DELETE /api/v1/pipelines/:id/stages/:stageId', () => {
  it('204 — deletes an unused non-final stage', async () => {
    const pipelineId = await seedPipeline(orgA, 'Delete Stage Pipeline');
    const stageId = await seedStage(orgA, pipelineId, 'Delete This Stage', 0);
    await seedStage(orgA, pipelineId, 'Keep This Stage', 1);

    const res = await request(app)
      .delete(`/api/v1/pipelines/${pipelineId}/stages/${stageId}`)
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(204);

    const activity = await prisma.activity.findFirst({
      where: {
        organizationId: orgA,
        type: ActivityType.PIPELINE_STAGE_DELETED,
        relatedPipelineStageId: stageId,
      },
    });
    expect(activity).not.toBeNull();
  });

  it('409 — cannot delete the only stage in a pipeline', async () => {
    const pipelineId = await seedPipeline(orgA, 'Single Stage Pipeline');
    const stageId = await seedStage(orgA, pipelineId, 'Only Stage', 0);

    const res = await request(app)
      .delete(`/api/v1/pipelines/${pipelineId}/stages/${stageId}`)
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('409 — cannot delete stage that has deals', async () => {
    const pipelineId = await seedPipeline(orgA, 'Stage With Deals Pipeline');
    const stageId = await seedStage(orgA, pipelineId, 'Stage With Deal', 0);
    const stageId2 = await seedStage(orgA, pipelineId, 'Another Stage', 1);
    await seedDeal(orgA, pipelineId, stageId, ownerUserId);

    const res = await request(app)
      .delete(`/api/v1/pipelines/${pipelineId}/stages/${stageId}`)
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');

    // Cleanup the extra stage so afterAll can delete cleanly
    void stageId2;
  });
});
