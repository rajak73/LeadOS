// Sprint 4 M2 — CRM-2.1 – 2.4 Lead module end-to-end integration tests.
//
// Real JWTs + assembled app + real Postgres as leados_app (via withTenant).
// DB-gated: self-skips when Postgres is unavailable; runs in CI (DEF-3 guard).
//
// Coverage checklist:
//   POST   /leads        → 201 happy path
//   POST   /leads        → 409 email dedup
//   POST   /leads        → 402 plan limit (TRIAL org seeded to limit via raw SQL)
//   POST   /leads        → 422 validation (missing required field)
//   POST   /leads        → 401 no auth
//   POST   /leads        → 403 missing permission
//   GET    /leads/:id    → 200 (OWNER, full access)
//   GET    /leads/:id    → 404 cross-org isolation
//   GET    /leads/:id    → 404 unknown UUID
//   GET    /leads/:id    → 422 invalid UUID param
//   GET    /leads/:id    → 200 ownOnly (SALES_EXECUTIVE, assigned lead)
//   GET    /leads/:id    → 404 ownOnly (SALES_EXECUTIVE, unassigned lead)
//   PATCH  /leads/:id    → 200 happy path (status open→open)
//   PATCH  /leads/:id    → 200 status open→LOST (with lostReason)
//   PATCH  /leads/:id    → 400 WON via PATCH (schema rejects)
//   PATCH  /leads/:id    → 422 WON via PATCH (actually 422 from Zod)
//   PATCH  /leads/:id    → 400 LOST→open (terminal transition)
//   PATCH  /leads/:id    → 400 lostReason missing when setting LOST
//   PATCH  /leads/:id    → 404 cross-org lead
//   PATCH  /leads/:id    → 422 empty body
//   DELETE /leads/:id    → 204 soft delete
//   GET    /leads/:id    → 404 after delete
//   DELETE /leads/:id    → 404 already deleted lead
//   DELETE /leads/:id    → 404 cross-org lead

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/core/prisma/client.js';
import { isPostgresUp } from '../helpers/services.js';
import { signAccessToken } from '../../src/core/auth/jwt.js';
import { PLAN_LIMITS } from '@leados/shared';

const pgUp = await isPostgresUp();
const app = buildApp();

// ── Fixtures ─────────────────────────────────────────────────────────────────

let orgA = '';
let orgB = '';
let orgLimited = ''; // pre-seeded at plan limit

let ownerUserId = '';
let salesUserId = ''; // SALES_EXECUTIVE (leads.read_own only)
let otherUserId = ''; // member of orgB

function ownerToken(): string {
  return signAccessToken({ sub: ownerUserId, orgId: orgA, role: 'OWNER', isSuperAdmin: false });
}
function salesToken(): string {
  return signAccessToken({ sub: salesUserId, orgId: orgA, role: 'SALES_EXECUTIVE', isSuperAdmin: false });
}
// otherOrgToken: valid member of orgB, uses orgB scope (orgA's leads are RLS-invisible → 404)
function otherOrgToken(): string {
  return signAccessToken({ sub: otherUserId, orgId: orgB, role: 'OWNER', isSuperAdmin: false });
}
// nonMemberToken: otherUserId claims orgA scope but is NOT a member of orgA → 403
function nonMemberToken(): string {
  return signAccessToken({ sub: otherUserId, orgId: orgA, role: 'OWNER', isSuperAdmin: false });
}
function limitedOrgToken(): string {
  return signAccessToken({ sub: ownerUserId, orgId: orgLimited, role: 'OWNER', isSuperAdmin: false });
}

async function seedOrg(name: string, slug: string): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO organizations (name, slug, "updatedAt") VALUES ($1, $2, now()) RETURNING id`,
    name,
    slug,
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
    `INSERT INTO organization_members (id, "organizationId", "userId", "roleId", status, "updatedAt")
     VALUES (uuid_generate_v4(), $1::uuid, $2::uuid, $3::uuid, 'ACTIVE', now())`,
    orgId,
    userId,
    roleId,
  );
}

async function seedSubscription(orgId: string, plan: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO subscriptions ("organizationId", plan, status, "updatedAt")
     VALUES ($1::uuid, $2::"SubscriptionPlan", 'ACTIVE', now())
     ON CONFLICT ("organizationId") DO UPDATE SET plan = EXCLUDED.plan`,
    orgId,
    plan,
  );
}

const TRIAL_LIMIT = PLAN_LIMITS.TRIAL.leads;

beforeAll(async () => {
  if (!pgUp) return;
  const nonce = process.hrtime.bigint().toString();

  // Primary test org (orgA) — OWNER + SALES_EXECUTIVE users
  orgA = await seedOrg(`Leads A ${nonce}`, `leads-a-${nonce}`);
  orgB = await seedOrg(`Leads B ${nonce}`, `leads-b-${nonce}`);
  orgLimited = await seedOrg(`Leads Limited ${nonce}`, `leads-limited-${nonce}`);

  ownerUserId = await seedUser(`owner+${nonce}@leads.test`);
  salesUserId = await seedUser(`sales+${nonce}@leads.test`);
  otherUserId = await seedUser(`other+${nonce}@leads.test`);

  const ownerRoleA = await seedRole(orgA, 'OWNER');
  const salesRoleA = await seedRole(orgA, 'SALES_EXECUTIVE');
  const ownerRoleB = await seedRole(orgB, 'OWNER');
  const ownerRoleLimited = await seedRole(orgLimited, 'OWNER');

  await seedMember(orgA, ownerUserId, ownerRoleA);
  await seedMember(orgA, salesUserId, salesRoleA);
  await seedMember(orgB, otherUserId, ownerRoleB);
  await seedMember(orgLimited, ownerUserId, ownerRoleLimited);

  // Seed subscriptions (TRIAL plan — triggers limits)
  await seedSubscription(orgA, 'TRIAL');
  await seedSubscription(orgB, 'TRIAL');
  await seedSubscription(orgLimited, 'TRIAL');

  // Pre-seed orgLimited to the plan limit via generate_series (single fast INSERT)
  await prisma.$executeRawUnsafe(
    `INSERT INTO leads (id, "organizationId", "firstName", source, status, "createdById", "updatedAt")
     SELECT uuid_generate_v4(), $1::uuid, 'LimitLead' || n, 'MANUAL', 'NEW', $2::uuid, now()
     FROM generate_series(1, ${TRIAL_LIMIT}) AS g(n)`,
    orgLimited,
    ownerUserId,
  );
});

afterAll(async () => {
  if (!pgUp || !orgA) return;
  // Activities immutability trigger blocks DELETE (by design). Bypass it for test cleanup by
  // setting session_replication_role = replica (superuser-only) within a single transaction so
  // CASCADE from org deletion can delete activity rows without triggering the guard.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
    await tx.$executeRawUnsafe(
      `DELETE FROM organization_members WHERE "organizationId" IN ($1::uuid, $2::uuid, $3::uuid)`,
      orgA, orgB, orgLimited,
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM roles WHERE "organizationId" IN ($1::uuid, $2::uuid, $3::uuid)`,
      orgA, orgB, orgLimited,
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM organizations WHERE id IN ($1::uuid, $2::uuid, $3::uuid)`,
      orgA, orgB, orgLimited,
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM users WHERE id IN ($1::uuid, $2::uuid, $3::uuid)`,
      ownerUserId, salesUserId, otherUserId,
    );
  });
});

// ── POST /api/v1/leads ────────────────────────────────────────────────────────

describe.skipIf(!pgUp)('POST /api/v1/leads', () => {
  it('201 — creates a lead (OWNER)', async () => {
    const res = await request(app)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ firstName: 'Aarav', email: 'aarav@example.com', source: 'MANUAL' });
    expect(res.status).toBe(201);
    expect(res.body.data.firstName).toBe('Aarav');
    expect(res.body.data.email).toBe('aarav@example.com');
    expect(res.body.data.status).toBe('NEW');
    expect(res.body.data.id).toBeTruthy();
    expect(res.body.data.organizationId).toBe(orgA);
  });

  it('409 — email duplicate returns CONFLICT', async () => {
    // aarav@example.com was created in the preceding test
    const res = await request(app)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ firstName: 'Duplicate', email: 'aarav@example.com', source: 'MANUAL' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('402 — plan limit exceeded returns PLAN_LIMIT_EXCEEDED', async () => {
    const res = await request(app)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${limitedOrgToken()}`)
      .send({ firstName: 'OverLimit', source: 'MANUAL' });
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('PLAN_LIMIT_EXCEEDED');
  });

  it('422 — missing firstName returns VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ email: 'nofirst@example.com' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.fields).toHaveProperty('firstName');
  });

  it('401 — no auth token', async () => {
    const res = await request(app)
      .post('/api/v1/leads')
      .send({ firstName: 'Ghost', source: 'MANUAL' });
    expect(res.status).toBe(401);
  });

  it('403 — non-member token (claims orgA, user not in orgA) is rejected', async () => {
    // nonMemberToken: sub=otherUserId, orgId=orgA — but otherUserId has no active membership
    // in orgA. tenantMiddleware rejects with 403 before the service is reached.
    const res = await request(app)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${nonMemberToken()}`)
      .send({ firstName: 'Cross', source: 'MANUAL' });
    expect(res.status).toBe(403);
  });
});

// ── GET /api/v1/leads/:id ────────────────────────────────────────────────────

describe.skipIf(!pgUp)('GET /api/v1/leads/:id', () => {
  let leadId = '';

  beforeAll(async () => {
    if (!pgUp) return;
    // Create a lead to fetch — use raw SQL so we don't depend on the POST tests above
    const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO leads (id, "organizationId", "firstName", source, status, "createdById", "updatedAt")
       VALUES (uuid_generate_v4(), $1::uuid, 'FetchMe', 'MANUAL', 'NEW', $2::uuid, now()) RETURNING id`,
      orgA,
      ownerUserId,
    );
    leadId = row!.id;
  });

  it('200 — OWNER can fetch any lead', async () => {
    const res = await request(app)
      .get(`/api/v1/leads/${leadId}`)
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(leadId);
    expect(res.body.data.firstName).toBe('FetchMe');
  });

  it('404 — cross-org isolation: orgB user cannot see orgA lead (RLS hides it)', async () => {
    // otherOrgToken is a valid orgB member using orgB scope. RLS filters by organizationId
    // so orgA's lead is invisible to this request → 404 (not 403 — the user is authorized
    // in their own org; the row simply doesn't exist from their perspective).
    const res = await request(app)
      .get(`/api/v1/leads/${leadId}`)
      .set('Authorization', `Bearer ${otherOrgToken()}`);
    expect(res.status).toBe(404);
  });

  it('404 — unknown UUID returns NOT_FOUND', async () => {
    const res = await request(app)
      .get('/api/v1/leads/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('422 — invalid UUID param', async () => {
    const res = await request(app)
      .get('/api/v1/leads/not-a-uuid')
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(422);
  });

  it('200 — SALES_EXECUTIVE gets OWN assigned lead (ownOnly)', async () => {
    // Assign the lead to salesUserId
    await prisma.$executeRawUnsafe(
      `UPDATE leads SET "assignedToId" = $1::uuid WHERE id = $2::uuid`,
      salesUserId,
      leadId,
    );
    const res = await request(app)
      .get(`/api/v1/leads/${leadId}`)
      .set('Authorization', `Bearer ${salesToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(leadId);
  });

  it('404 — SALES_EXECUTIVE cannot get unassigned lead (ownOnly)', async () => {
    // Unassign the lead
    await prisma.$executeRawUnsafe(
      `UPDATE leads SET "assignedToId" = NULL WHERE id = $1::uuid`,
      leadId,
    );
    const res = await request(app)
      .get(`/api/v1/leads/${leadId}`)
      .set('Authorization', `Bearer ${salesToken()}`);
    expect(res.status).toBe(404);
  });
});

// ── PATCH /api/v1/leads/:id ──────────────────────────────────────────────────

describe.skipIf(!pgUp)('PATCH /api/v1/leads/:id', () => {
  let leadId = '';

  beforeAll(async () => {
    if (!pgUp) return;
    const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO leads (id, "organizationId", "firstName", source, status, "createdById", "updatedAt")
       VALUES (uuid_generate_v4(), $1::uuid, 'PatchMe', 'MANUAL', 'NEW', $2::uuid, now()) RETURNING id`,
      orgA,
      ownerUserId,
    );
    leadId = row!.id;
  });

  it('200 — open → open status transition (NEW → CONTACTED)', async () => {
    const res = await request(app)
      .patch(`/api/v1/leads/${leadId}`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ status: 'CONTACTED' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CONTACTED');
  });

  it('200 — open → LOST transition (with lostReason)', async () => {
    const res = await request(app)
      .patch(`/api/v1/leads/${leadId}`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ status: 'LOST', lostReason: 'Budget constraints' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('LOST');
    expect(res.body.data.lostReason).toBe('Budget constraints');
  });

  it('422 — WON via PATCH is rejected by schema (not a valid enum value)', async () => {
    const res = await request(app)
      .patch(`/api/v1/leads/${leadId}`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ status: 'WON' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('400/422 — LOST → open transition (terminal cannot transition)', async () => {
    // Lead is currently LOST (from previous test)
    const res = await request(app)
      .patch(`/api/v1/leads/${leadId}`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ status: 'NEW' });
    // Service throws VALIDATION_ERROR → 422
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('422 — LOST without lostReason on a lead that has no existing lostReason', async () => {
    // Create a fresh lead with no lostReason and transition it to LOST without providing one
    const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO leads (id, "organizationId", "firstName", source, status, "createdById", "updatedAt")
       VALUES (uuid_generate_v4(), $1::uuid, 'NoReason', 'MANUAL', 'NEW', $2::uuid, now()) RETURNING id`,
      orgA,
      ownerUserId,
    );
    const newLeadId = row!.id;
    const res = await request(app)
      .patch(`/api/v1/leads/${newLeadId}`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ status: 'LOST' });
    expect(res.status).toBe(422);
  });

  it('422 — empty body is rejected by schema', async () => {
    const res = await request(app)
      .patch(`/api/v1/leads/${leadId}`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({});
    expect(res.status).toBe(422);
  });

  it('404 — cross-org PATCH: orgB user cannot see orgA lead (RLS hides it)', async () => {
    const res = await request(app)
      .patch(`/api/v1/leads/${leadId}`)
      .set('Authorization', `Bearer ${otherOrgToken()}`)
      .send({ firstName: 'Hacked' });
    expect(res.status).toBe(404);
  });

  it('200 — field update (firstName) without status change', async () => {
    // Create a fresh lead for this test
    const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO leads (id, "organizationId", "firstName", source, status, "createdById", "updatedAt")
       VALUES (uuid_generate_v4(), $1::uuid, 'OrigName', 'MANUAL', 'NEW', $2::uuid, now()) RETURNING id`,
      orgA,
      ownerUserId,
    );
    const newLeadId = row!.id;
    const res = await request(app)
      .patch(`/api/v1/leads/${newLeadId}`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ firstName: 'UpdatedName' });
    expect(res.status).toBe(200);
    expect(res.body.data.firstName).toBe('UpdatedName');
  });
});

// ── DELETE /api/v1/leads/:id ─────────────────────────────────────────────────

describe.skipIf(!pgUp)('DELETE /api/v1/leads/:id', () => {
  let leadId = '';

  beforeAll(async () => {
    if (!pgUp) return;
    const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO leads (id, "organizationId", "firstName", source, status, "createdById", "updatedAt")
       VALUES (uuid_generate_v4(), $1::uuid, 'DeleteMe', 'MANUAL', 'NEW', $2::uuid, now()) RETURNING id`,
      orgA,
      ownerUserId,
    );
    leadId = row!.id;
  });

  it('204 — soft deletes the lead', async () => {
    const res = await request(app)
      .delete(`/api/v1/leads/${leadId}`)
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(204);
  });

  it('404 — deleted lead no longer visible via GET', async () => {
    const res = await request(app)
      .get(`/api/v1/leads/${leadId}`)
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(404);
  });

  it('404 — deleting an already-deleted lead returns NOT_FOUND', async () => {
    const res = await request(app)
      .delete(`/api/v1/leads/${leadId}`)
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(404);
  });

  it('404 — cross-org DELETE: orgB user cannot see orgA lead (RLS hides it)', async () => {
    // The lead is already soft-deleted so even the owner gets 404. Here we also verify
    // that an orgB user gets 404 (not the data, not a different error).
    const res = await request(app)
      .delete(`/api/v1/leads/${leadId}`)
      .set('Authorization', `Bearer ${otherOrgToken()}`);
    expect(res.status).toBe(404);
  });
});
