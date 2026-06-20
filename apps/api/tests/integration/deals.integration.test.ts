// Sprint 5 M3 — CRM-9 Deal module integration tests.
//
// Real JWTs + assembled app + real Postgres as leados_app (via withTenant).
// DB-gated: self-skips when Postgres is unavailable.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/core/prisma/client.js';
import { isPostgresUp } from '../helpers/services.js';
import { signAccessToken } from '../../src/core/auth/jwt.js';
import { ActivityType, PLAN_LIMITS } from '@leados/shared';

const pgUp = await isPostgresUp();
const app = buildApp();

let orgA = '';
let orgB = '';
let orgTrial = '';

let ownerUserId = '';
let salesUserId = '';
let otherSalesUserId = '';
let otherOrgUserId = '';

let pipelineA = '';
let stageProspect = '';
let stageProposal = '';
let stageWon = '';
let stageLost = '';
let pipelineB = '';
let stageOtherPipeline = '';
let orgBPipeline = '';
let orgBStage = '';
let leadA = '';
let contactA = '';
let orgBLead = '';
let orgBContact = '';

function ownerToken(): string {
  return signAccessToken({ sub: ownerUserId, orgId: orgA, role: 'OWNER', isSuperAdmin: false });
}
function salesToken(): string {
  return signAccessToken({ sub: salesUserId, orgId: orgA, role: 'SALES_EXECUTIVE', isSuperAdmin: false });
}
function otherOrgToken(): string {
  return signAccessToken({ sub: otherOrgUserId, orgId: orgB, role: 'OWNER', isSuperAdmin: false });
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

async function seedUser(email: string, firstName = 'Test'): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO users (email, "passwordHash", "firstName", "lastName", "updatedAt")
     VALUES ($1, 'x', $2, 'User', now()) RETURNING id`,
    email, firstName,
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

async function seedStage(
  orgId: string,
  pipelineId: string,
  name: string,
  order: number,
  probability: number | null,
  flags: { isWon?: boolean; isLost?: boolean } = {},
): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO pipeline_stages
       ("organizationId", "pipelineId", name, "order", probability, "isWon", "isLost", "updatedAt")
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, now()) RETURNING id`,
    orgId, pipelineId, name, order, probability, flags.isWon ?? false, flags.isLost ?? false,
  );
  return row!.id;
}

async function seedLead(orgId: string, createdById: string, firstName: string): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO leads ("organizationId", "firstName", source, status, "createdById", "updatedAt")
     VALUES ($1::uuid, $2, 'MANUAL', 'NEW', $3::uuid, now()) RETURNING id`,
    orgId, firstName, createdById,
  );
  return row!.id;
}

async function seedContact(orgId: string, createdById: string, firstName: string): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO contacts ("organizationId", "firstName", "createdById", "updatedAt")
     VALUES ($1::uuid, $2, $3::uuid, now()) RETURNING id`,
    orgId, firstName, createdById,
  );
  return row!.id;
}

async function seedDeal(
  orgId: string,
  pipelineId: string,
  stageId: string,
  createdById: string,
  title: string,
  assignedToId: string | null = null,
  value = 100,
): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO deals
       ("organizationId", "pipelineId", "stageId", title, value, currency, status,
        "assignedToId", "createdById", "updatedAt")
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, 'INR', 'OPEN',
        $6::uuid, $7::uuid, now()) RETURNING id`,
    orgId, pipelineId, stageId, title, value, assignedToId, createdById,
  );
  return row!.id;
}

async function seedTrialDealsToLimit(): Promise<void> {
  const pipeline = await seedPipeline(orgTrial, 'Trial Deal Pipeline', true);
  const stage = await seedStage(orgTrial, pipeline, 'Only Stage', 0, 10);
  for (let i = 0; i < PLAN_LIMITS.TRIAL.deals; i++) {
    await seedDeal(orgTrial, pipeline, stage, ownerUserId, `Trial Deal ${i}`, ownerUserId, 1);
  }
}

beforeAll(async () => {
  if (!pgUp) return;
  const nonce = process.hrtime.bigint().toString();

  orgA = await seedOrg(`Deals A ${nonce}`, `deals-a-${nonce}`);
  orgB = await seedOrg(`Deals B ${nonce}`, `deals-b-${nonce}`);
  orgTrial = await seedOrg(`Deals Trial ${nonce}`, `deals-trial-${nonce}`);

  ownerUserId = await seedUser(`owner+${nonce}@deals.test`, 'Owner');
  salesUserId = await seedUser(`sales+${nonce}@deals.test`, 'Sales');
  otherSalesUserId = await seedUser(`other-sales+${nonce}@deals.test`, 'OtherSales');
  otherOrgUserId = await seedUser(`other-org+${nonce}@deals.test`, 'OtherOrg');

  const ownerRoleA = await seedRole(orgA, 'OWNER');
  const salesRoleA = await seedRole(orgA, 'SALES_EXECUTIVE');
  const ownerRoleB = await seedRole(orgB, 'OWNER');
  const ownerRoleTrial = await seedRole(orgTrial, 'OWNER');

  await seedMember(orgA, ownerUserId, ownerRoleA);
  await seedMember(orgA, salesUserId, salesRoleA);
  await seedMember(orgA, otherSalesUserId, salesRoleA);
  await seedMember(orgB, otherOrgUserId, ownerRoleB);
  await seedMember(orgTrial, ownerUserId, ownerRoleTrial);

  await seedSubscription(orgA, 'GROWTH');
  await seedSubscription(orgB, 'GROWTH');
  await seedSubscription(orgTrial, 'TRIAL');

  pipelineA = await seedPipeline(orgA, 'Primary Pipeline', true);
  stageProspect = await seedStage(orgA, pipelineA, 'Prospect', 0, 10);
  stageProposal = await seedStage(orgA, pipelineA, 'Proposal', 1, 60);
  stageWon = await seedStage(orgA, pipelineA, 'Won', 2, 100, { isWon: true });
  stageLost = await seedStage(orgA, pipelineA, 'Lost', 3, 0, { isLost: true });

  pipelineB = await seedPipeline(orgA, 'Secondary Pipeline');
  stageOtherPipeline = await seedStage(orgA, pipelineB, 'Other Prospect', 0, 25);

  orgBPipeline = await seedPipeline(orgB, 'Other Org Pipeline', true);
  orgBStage = await seedStage(orgB, orgBPipeline, 'Other Org Stage', 0, 50);

  leadA = await seedLead(orgA, ownerUserId, 'Lead A');
  contactA = await seedContact(orgA, ownerUserId, 'Contact A');
  orgBLead = await seedLead(orgB, otherOrgUserId, 'Lead B');
  orgBContact = await seedContact(orgB, otherOrgUserId, 'Contact B');

  await seedTrialDealsToLimit();
});

afterAll(async () => {
  if (!pgUp || !orgA) return;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
    await tx.$executeRawUnsafe(
      `DELETE FROM activities WHERE "organizationId" IN ($1::uuid, $2::uuid, $3::uuid)`,
      orgA, orgB, orgTrial,
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM audit_logs WHERE "organizationId" IN ($1::uuid, $2::uuid, $3::uuid)`,
      orgA, orgB, orgTrial,
    );
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
      `DELETE FROM contacts WHERE "organizationId" IN ($1::uuid, $2::uuid, $3::uuid)`,
      orgA, orgB, orgTrial,
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM leads WHERE "organizationId" IN ($1::uuid, $2::uuid, $3::uuid)`,
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
      `DELETE FROM users WHERE id IN ($1::uuid, $2::uuid, $3::uuid, $4::uuid)`,
      ownerUserId, salesUserId, otherSalesUserId, otherOrgUserId,
    );
  });
});

describe.skipIf(!pgUp)('POST /api/v1/deals', () => {
  it('201 — creates a deal and writes activity + audit rows', async () => {
    const res = await request(app)
      .post('/api/v1/deals')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({
        title: 'New Revenue Deal',
        value: 5000,
        currency: 'INR',
        pipelineId: pipelineA,
        stageId: stageProspect,
        leadId: leadA,
        contactId: contactA,
        assignedToId: salesUserId,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('New Revenue Deal');
    expect(res.body.data.organizationId).toBe(orgA);
    expect(res.body.data.pipelineId).toBe(pipelineA);
    expect(res.body.data.stageId).toBe(stageProspect);
    expect(res.body.data.assignedToId).toBe(salesUserId);

    const activity = await prisma.activity.findFirst({
      where: {
        organizationId: orgA,
        type: ActivityType.DEAL_CREATED,
        relatedDealId: res.body.data.id,
      },
    });
    expect(activity).not.toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { organizationId: orgA, resource: 'deal', resourceId: res.body.data.id, action: 'created' },
    });
    expect(audit).not.toBeNull();
  });

  it('401 — no auth token', async () => {
    const res = await request(app)
      .post('/api/v1/deals')
      .send({ title: 'No Auth', pipelineId: pipelineA, stageId: stageProspect });
    expect(res.status).toBe(401);
  });

  it('422 — stage must belong to selected pipeline', async () => {
    const res = await request(app)
      .post('/api/v1/deals')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ title: 'Bad Stage', pipelineId: pipelineA, stageId: stageOtherPipeline });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('404 — rejects cross-org lead and contact references', async () => {
    const res = await request(app)
      .post('/api/v1/deals')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({
        title: 'Cross Org Reference',
        pipelineId: pipelineA,
        stageId: stageProspect,
        leadId: orgBLead,
        contactId: orgBContact,
      });
    expect(res.status).toBe(404);
  });

  it('402 — TRIAL org at deal limit returns PLAN_LIMIT_EXCEEDED', async () => {
    const res = await request(app)
      .post('/api/v1/deals')
      .set('Authorization', `Bearer ${trialToken()}`)
      .send({ title: 'Over Limit', pipelineId: pipelineA, stageId: stageProspect });
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('PLAN_LIMIT_EXCEEDED');
  });

  it('403 — SALES_EXECUTIVE cannot assign a deal to another user', async () => {
    const res = await request(app)
      .post('/api/v1/deals')
      .set('Authorization', `Bearer ${salesToken()}`)
      .send({
        title: 'Bad Assignment',
        pipelineId: pipelineA,
        stageId: stageProspect,
        assignedToId: otherSalesUserId,
      });
    expect(res.status).toBe(403);
  });
});

describe.skipIf(!pgUp)('GET /api/v1/deals', () => {
  it('200 — lists deals with pagination', async () => {
    await seedDeal(orgA, pipelineA, stageProspect, ownerUserId, 'List Deal A', ownerUserId, 10);
    const res = await request(app)
      .get('/api/v1/deals?page=1&limit=5')
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.total).toBeGreaterThan(0);
    expect(res.body.data.items.length).toBeLessThanOrEqual(5);
  });

  it('200 — ownOnly user only sees assigned deals', async () => {
    const ownDeal = await seedDeal(orgA, pipelineA, stageProspect, ownerUserId, 'Own Deal', salesUserId, 100);
    await seedDeal(orgA, pipelineA, stageProspect, ownerUserId, 'Other User Deal', otherSalesUserId, 100);

    const res = await request(app)
      .get('/api/v1/deals')
      .set('Authorization', `Bearer ${salesToken()}`);
    expect(res.status).toBe(200);
    const ids = (res.body.data.items as Array<{ id: string; assignedToId: string | null }>).map((d) => d.id);
    expect(ids).toContain(ownDeal);
    for (const item of res.body.data.items as Array<{ assignedToId: string | null }>) {
      expect(item.assignedToId).toBe(salesUserId);
    }
  });
});

describe.skipIf(!pgUp)('GET /api/v1/deals/:id', () => {
  it('200 — returns a deal by id', async () => {
    const dealId = await seedDeal(orgA, pipelineA, stageProspect, ownerUserId, 'Get Deal', ownerUserId, 100);
    const res = await request(app)
      .get(`/api/v1/deals/${dealId}`)
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(dealId);
  });

  it('404 — orgB cannot read orgA deal', async () => {
    const dealId = await seedDeal(orgA, pipelineA, stageProspect, ownerUserId, 'Isolated Deal', ownerUserId, 100);
    const res = await request(app)
      .get(`/api/v1/deals/${dealId}`)
      .set('Authorization', `Bearer ${otherOrgToken()}`);
    expect(res.status).toBe(404);
  });

  it('404 — ownOnly user cannot read a deal assigned to another user', async () => {
    const dealId = await seedDeal(orgA, pipelineA, stageProspect, ownerUserId, 'Not Mine', otherSalesUserId, 100);
    const res = await request(app)
      .get(`/api/v1/deals/${dealId}`)
      .set('Authorization', `Bearer ${salesToken()}`);
    expect(res.status).toBe(404);
  });
});

describe.skipIf(!pgUp)('PATCH /api/v1/deals/:id', () => {
  it('200 — updates allowed fields and writes activity + audit rows', async () => {
    const dealId = await seedDeal(orgA, pipelineA, stageProspect, ownerUserId, 'Patch Me', ownerUserId, 100);
    const res = await request(app)
      .patch(`/api/v1/deals/${dealId}`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ title: 'Patched Deal', value: 250, assignedToId: salesUserId });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Patched Deal');
    expect(res.body.data.assignedToId).toBe(salesUserId);

    const activity = await prisma.activity.findFirst({
      where: { organizationId: orgA, type: ActivityType.DEAL_UPDATED, relatedDealId: dealId },
    });
    expect(activity).not.toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { organizationId: orgA, resource: 'deal', resourceId: dealId, action: 'updated' },
    });
    expect(audit).not.toBeNull();
  });

  it('404 — ownOnly user cannot update another user’s deal', async () => {
    const dealId = await seedDeal(orgA, pipelineA, stageProspect, ownerUserId, 'Cannot Patch', otherSalesUserId, 100);
    const res = await request(app)
      .patch(`/api/v1/deals/${dealId}`)
      .set('Authorization', `Bearer ${salesToken()}`)
      .send({ title: 'Nope' });
    expect(res.status).toBe(404);
  });

  it('403 — ownOnly user cannot reassign their deal to another user', async () => {
    const dealId = await seedDeal(orgA, pipelineA, stageProspect, ownerUserId, 'No Reassign', salesUserId, 100);
    const res = await request(app)
      .patch(`/api/v1/deals/${dealId}`)
      .set('Authorization', `Bearer ${salesToken()}`)
      .send({ assignedToId: otherSalesUserId });
    expect(res.status).toBe(403);
  });
});

describe.skipIf(!pgUp)('POST /api/v1/deals/:id/move', () => {
  it('200 — moves a deal within the same pipeline and writes activity + audit', async () => {
    const dealId = await seedDeal(orgA, pipelineA, stageProspect, ownerUserId, 'Move Me', ownerUserId, 100);
    const res = await request(app)
      .post(`/api/v1/deals/${dealId}/move`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ stageId: stageProposal });
    expect(res.status).toBe(200);
    expect(res.body.data.stageId).toBe(stageProposal);

    const activity = await prisma.activity.findFirst({
      where: { organizationId: orgA, type: ActivityType.DEAL_STAGE_MOVED, relatedDealId: dealId },
    });
    expect(activity).not.toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { organizationId: orgA, resource: 'deal', resourceId: dealId, action: 'moved' },
    });
    expect(audit).not.toBeNull();
  });

  it('422 — rejects cross-pipeline move', async () => {
    const dealId = await seedDeal(orgA, pipelineA, stageProspect, ownerUserId, 'Cross Pipeline Move', ownerUserId, 100);
    const res = await request(app)
      .post(`/api/v1/deals/${dealId}/move`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ stageId: stageOtherPipeline });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('404 — ownOnly user cannot move another user’s deal', async () => {
    const dealId = await seedDeal(orgA, pipelineA, stageProspect, ownerUserId, 'Cannot Move', otherSalesUserId, 100);
    const res = await request(app)
      .post(`/api/v1/deals/${dealId}/move`)
      .set('Authorization', `Bearer ${salesToken()}`)
      .send({ stageId: stageProposal });
    expect(res.status).toBe(404);
  });
});

describe.skipIf(!pgUp)('POST /api/v1/deals/:id/won', () => {
  it('200 — marks a deal won and emits activity', async () => {
    const dealId = await seedDeal(orgA, pipelineA, stageWon, ownerUserId, 'Win Me', salesUserId, 1000);
    const res = await request(app)
      .post(`/api/v1/deals/${dealId}/won`)
      .set('Authorization', `Bearer ${salesToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('WON');
    expect(res.body.data.closedAt).toBeTruthy();

    const activity = await prisma.activity.findFirst({
      where: { organizationId: orgA, type: ActivityType.DEAL_WON, relatedDealId: dealId },
    });
    expect(activity).not.toBeNull();
  });

  it('409 — won deal cannot be moved', async () => {
    const dealId = await seedDeal(orgA, pipelineA, stageWon, ownerUserId, 'Already Won', ownerUserId, 1000);
    await request(app).post(`/api/v1/deals/${dealId}/won`).set('Authorization', `Bearer ${ownerToken()}`);

    const res = await request(app)
      .post(`/api/v1/deals/${dealId}/move`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ stageId: stageProposal });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('409 — cannot mark a won deal won again', async () => {
    const dealId = await seedDeal(orgA, pipelineA, stageWon, ownerUserId, 'Double Won', ownerUserId, 1000);
    await request(app).post(`/api/v1/deals/${dealId}/won`).set('Authorization', `Bearer ${ownerToken()}`);
    const res = await request(app).post(`/api/v1/deals/${dealId}/won`).set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(409);
  });
});

describe.skipIf(!pgUp)('POST /api/v1/deals/:id/lost', () => {
  it('200 — marks a deal lost with reason and emits activity', async () => {
    const dealId = await seedDeal(orgA, pipelineA, stageLost, ownerUserId, 'Lose Me', ownerUserId, 100);
    const res = await request(app)
      .post(`/api/v1/deals/${dealId}/lost`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ reason: 'Price objection' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('LOST');
    expect(res.body.data.lostReason).toBe('Price objection');

    const activity = await prisma.activity.findFirst({
      where: { organizationId: orgA, type: ActivityType.DEAL_LOST, relatedDealId: dealId },
    });
    expect(activity).not.toBeNull();
  });

  it('409 — lost deal cannot be moved', async () => {
    const dealId = await seedDeal(orgA, pipelineA, stageLost, ownerUserId, 'Already Lost', ownerUserId, 100);
    await request(app).post(`/api/v1/deals/${dealId}/lost`).set('Authorization', `Bearer ${ownerToken()}`).send({});

    const res = await request(app)
      .post(`/api/v1/deals/${dealId}/move`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ stageId: stageProposal });
    expect(res.status).toBe(409);
  });
});

describe.skipIf(!pgUp)('DELETE /api/v1/deals/:id', () => {
  it('204 — soft deletes a deal and writes audit', async () => {
    const dealId = await seedDeal(orgA, pipelineA, stageProspect, ownerUserId, 'Delete Me', ownerUserId, 100);
    const res = await request(app)
      .delete(`/api/v1/deals/${dealId}`)
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(204);

    const getRes = await request(app)
      .get(`/api/v1/deals/${dealId}`)
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(getRes.status).toBe(404);

    const audit = await prisma.auditLog.findFirst({
      where: { organizationId: orgA, resource: 'deal', resourceId: dealId, action: 'deleted' },
    });
    expect(audit).not.toBeNull();
  });

  it('403 — SALES_EXECUTIVE lacks deals.delete', async () => {
    const dealId = await seedDeal(orgA, pipelineA, stageProspect, ownerUserId, 'Cannot Delete', salesUserId, 100);
    const res = await request(app)
      .delete(`/api/v1/deals/${dealId}`)
      .set('Authorization', `Bearer ${salesToken()}`);
    expect(res.status).toBe(403);
  });
});

describe.skipIf(!pgUp)('GET /api/v1/deals/forecast', () => {
  it('200 — returns weighted forecast for known stage probabilities', async () => {
    const pipeline = await seedPipeline(orgA, 'Forecast Pipeline');
    const low = await seedStage(orgA, pipeline, 'Low', 0, 25);
    const high = await seedStage(orgA, pipeline, 'High', 1, 75);
    await seedDeal(orgA, pipeline, low, ownerUserId, 'Low Value', ownerUserId, 100);
    await seedDeal(orgA, pipeline, high, ownerUserId, 'High Value A', ownerUserId, 200);
    await seedDeal(orgA, pipeline, high, ownerUserId, 'High Value B', ownerUserId, 300);

    const res = await request(app)
      .get(`/api/v1/deals/forecast?pipelineId=${pipeline}`)
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      {
        stageId: low,
        stageName: 'Low',
        probability: 25,
        totalValue: '100.00',
        weightedValue: '25.00',
        dealCount: 1,
      },
      {
        stageId: high,
        stageName: 'High',
        probability: 75,
        totalValue: '500.00',
        weightedValue: '375.00',
        dealCount: 2,
      },
    ]);
  });

  it('403 — SALES_EXECUTIVE read_own is insufficient for forecast', async () => {
    const res = await request(app)
      .get('/api/v1/deals/forecast')
      .set('Authorization', `Bearer ${salesToken()}`);
    expect(res.status).toBe(403);
  });

  it('200 — forecast does not leak another org pipeline', async () => {
    await seedDeal(orgB, orgBPipeline, orgBStage, otherOrgUserId, 'Other Org Forecast', otherOrgUserId, 999);
    const res = await request(app)
      .get(`/api/v1/deals/forecast?pipelineId=${orgBPipeline}`)
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(404);
  });
});
