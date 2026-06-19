// Sprint 4 M3 — CRM-3.1 – 3.3 Contact module + lead→contact conversion integration tests.
//
// Real JWTs + assembled app + real Postgres as leados_app (via withTenant).
// DB-gated: self-skips when Postgres is unavailable; runs in CI (DEF-3 guard).
//
// Coverage checklist:
//   POST   /contacts           → 201 happy path
//   POST   /contacts           → 409 email dedup
//   POST   /contacts           → 409 phone dedup
//   POST   /contacts           → 402 plan limit
//   POST   /contacts           → 422 validation (missing required field)
//   POST   /contacts           → 401 no auth
//   POST   /contacts           → 403 non-member
//   GET    /contacts/:id       → 200 owner
//   GET    /contacts/:id       → 404 cross-org isolation (RLS)
//   GET    /contacts/:id       → 404 unknown UUID
//   PATCH  /contacts/:id       → 200 field update
//   PATCH  /contacts/:id       → 422 empty body
//   PATCH  /contacts/:id       → 404 cross-org (RLS)
//   DELETE /contacts/:id       → 204 soft delete
//   GET    /contacts/:id       → 404 after delete
//   POST   /leads/:id/convert  → 201 happy path (lead=WON, contact created, link set)
//   POST   /leads/:id/convert  → 409 already converted
//   POST   /leads/:id/convert  → 404 unknown lead
//   POST   /leads/:id/convert  → 404 cross-org lead (RLS)
//   POST   /leads/:id/convert  → 201 SALES_EXECUTIVE ownOnly on assigned lead
//   POST   /leads/:id/convert  → 404 SALES_EXECUTIVE ownOnly on unassigned lead

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
let orgLimited = '';

let ownerUserId = '';
let salesUserId = '';
let otherUserId = '';

function ownerToken(): string {
  return signAccessToken({ sub: ownerUserId, orgId: orgA, role: 'OWNER', isSuperAdmin: false });
}
function salesToken(): string {
  return signAccessToken({ sub: salesUserId, orgId: orgA, role: 'SALES_EXECUTIVE', isSuperAdmin: false });
}
function otherOrgToken(): string {
  return signAccessToken({ sub: otherUserId, orgId: orgB, role: 'OWNER', isSuperAdmin: false });
}
function nonMemberToken(): string {
  return signAccessToken({ sub: otherUserId, orgId: orgA, role: 'OWNER', isSuperAdmin: false });
}
function limitedOrgToken(): string {
  return signAccessToken({ sub: ownerUserId, orgId: orgLimited, role: 'OWNER', isSuperAdmin: false });
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

async function seedLead(orgId: string, createdById: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO leads (id, "organizationId", "firstName", source, status, "createdById", "updatedAt")
     VALUES (uuid_generate_v4(), $1::uuid, $2, 'MANUAL', 'NEW', $3::uuid, now()) RETURNING id`,
    orgId,
    (overrides['firstName'] as string) ?? 'ConvertMe',
    createdById,
  );
  return row!.id;
}

const TRIAL_CONTACT_LIMIT = PLAN_LIMITS.TRIAL.contacts;

beforeAll(async () => {
  if (!pgUp) return;
  const nonce = process.hrtime.bigint().toString();

  orgA       = await seedOrg(`Contacts A ${nonce}`, `contacts-a-${nonce}`);
  orgB       = await seedOrg(`Contacts B ${nonce}`, `contacts-b-${nonce}`);
  orgLimited = await seedOrg(`Contacts Ltd ${nonce}`, `contacts-ltd-${nonce}`);

  ownerUserId = await seedUser(`owner+${nonce}@contacts.test`);
  salesUserId = await seedUser(`sales+${nonce}@contacts.test`);
  otherUserId = await seedUser(`other+${nonce}@contacts.test`);

  const ownerRoleA   = await seedRole(orgA, 'OWNER');
  const salesRoleA   = await seedRole(orgA, 'SALES_EXECUTIVE');
  const ownerRoleB   = await seedRole(orgB, 'OWNER');
  const ownerRoleLtd = await seedRole(orgLimited, 'OWNER');

  await seedMember(orgA, ownerUserId, ownerRoleA);
  await seedMember(orgA, salesUserId, salesRoleA);
  await seedMember(orgB, otherUserId, ownerRoleB);
  await seedMember(orgLimited, ownerUserId, ownerRoleLtd);

  await seedSubscription(orgA,       'TRIAL');
  await seedSubscription(orgB,       'TRIAL');
  await seedSubscription(orgLimited, 'TRIAL');

  // Pre-seed orgLimited to the contact plan limit
  await prisma.$executeRawUnsafe(
    `INSERT INTO contacts (id, "organizationId", "firstName", "createdById", "updatedAt")
     SELECT uuid_generate_v4(), $1::uuid, 'LimitContact' || n, $2::uuid, now()
     FROM generate_series(1, ${TRIAL_CONTACT_LIMIT}) AS g(n)`,
    orgLimited,
    ownerUserId,
  );
});

afterAll(async () => {
  if (!pgUp || !orgA) return;
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

// ── POST /api/v1/contacts ─────────────────────────────────────────────────────

describe.skipIf(!pgUp)('POST /api/v1/contacts', () => {
  it('201 — creates a contact (OWNER)', async () => {
    const res = await request(app)
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ firstName: 'Priya', email: 'priya@example.com', company: 'Acme' });
    expect(res.status).toBe(201);
    expect(res.body.data.firstName).toBe('Priya');
    expect(res.body.data.email).toBe('priya@example.com');
    expect(res.body.data.organizationId).toBe(orgA);
  });

  it('409 — email duplicate returns CONFLICT', async () => {
    const res = await request(app)
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ firstName: 'Duplicate', email: 'priya@example.com' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.details.existingContactId).toBeTruthy();
  });

  it('409 — phone duplicate returns CONFLICT', async () => {
    // First create a contact with a phone number
    await request(app)
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ firstName: 'PhoneOwner', phone: '+919876543210' });
    // Then try to create another with the same phone
    const res = await request(app)
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ firstName: 'PhoneDup', phone: '+919876543210' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('402 — plan limit exceeded returns PLAN_LIMIT_EXCEEDED', async () => {
    const res = await request(app)
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${limitedOrgToken()}`)
      .send({ firstName: 'OverLimit' });
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('PLAN_LIMIT_EXCEEDED');
  });

  it('422 — missing firstName returns VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ email: 'nofirst@example.com' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.fields).toHaveProperty('firstName');
  });

  it('401 — no auth token', async () => {
    const res = await request(app)
      .post('/api/v1/contacts')
      .send({ firstName: 'Ghost' });
    expect(res.status).toBe(401);
  });

  it('403 — non-member token (claims orgA, user not in orgA)', async () => {
    const res = await request(app)
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${nonMemberToken()}`)
      .send({ firstName: 'Intruder' });
    expect(res.status).toBe(403);
  });
});

// ── GET /api/v1/contacts/:id ──────────────────────────────────────────────────

describe.skipIf(!pgUp)('GET /api/v1/contacts/:id', () => {
  let contactId = '';

  beforeAll(async () => {
    if (!pgUp) return;
    const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO contacts (id, "organizationId", "firstName", "createdById", "updatedAt")
       VALUES (uuid_generate_v4(), $1::uuid, 'FetchMe', $2::uuid, now()) RETURNING id`,
      orgA, ownerUserId,
    );
    contactId = row!.id;
  });

  it('200 — OWNER can fetch own org contact', async () => {
    const res = await request(app)
      .get(`/api/v1/contacts/${contactId}`)
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(contactId);
    expect(res.body.data.firstName).toBe('FetchMe');
  });

  it('404 — cross-org isolation: orgB user cannot see orgA contact (RLS)', async () => {
    const res = await request(app)
      .get(`/api/v1/contacts/${contactId}`)
      .set('Authorization', `Bearer ${otherOrgToken()}`);
    expect(res.status).toBe(404);
  });

  it('404 — unknown UUID returns NOT_FOUND', async () => {
    const res = await request(app)
      .get('/api/v1/contacts/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

// ── PATCH /api/v1/contacts/:id ────────────────────────────────────────────────

describe.skipIf(!pgUp)('PATCH /api/v1/contacts/:id', () => {
  let contactId = '';

  beforeAll(async () => {
    if (!pgUp) return;
    const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO contacts (id, "organizationId", "firstName", "createdById", "updatedAt")
       VALUES (uuid_generate_v4(), $1::uuid, 'PatchMe', $2::uuid, now()) RETURNING id`,
      orgA, ownerUserId,
    );
    contactId = row!.id;
  });

  it('200 — field update (company)', async () => {
    const res = await request(app)
      .patch(`/api/v1/contacts/${contactId}`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ company: 'Acme Corp' });
    expect(res.status).toBe(200);
    expect(res.body.data.company).toBe('Acme Corp');
  });

  it('422 — empty body is rejected by schema', async () => {
    const res = await request(app)
      .patch(`/api/v1/contacts/${contactId}`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({});
    expect(res.status).toBe(422);
  });

  it('404 — cross-org PATCH: orgB user cannot see orgA contact (RLS)', async () => {
    const res = await request(app)
      .patch(`/api/v1/contacts/${contactId}`)
      .set('Authorization', `Bearer ${otherOrgToken()}`)
      .send({ company: 'Hacked' });
    expect(res.status).toBe(404);
  });
});

// ── DELETE /api/v1/contacts/:id ───────────────────────────────────────────────

describe.skipIf(!pgUp)('DELETE /api/v1/contacts/:id', () => {
  let contactId = '';

  beforeAll(async () => {
    if (!pgUp) return;
    const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO contacts (id, "organizationId", "firstName", "createdById", "updatedAt")
       VALUES (uuid_generate_v4(), $1::uuid, 'DeleteMe', $2::uuid, now()) RETURNING id`,
      orgA, ownerUserId,
    );
    contactId = row!.id;
  });

  it('204 — soft deletes the contact', async () => {
    const res = await request(app)
      .delete(`/api/v1/contacts/${contactId}`)
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(204);
  });

  it('404 — deleted contact no longer visible via GET', async () => {
    const res = await request(app)
      .get(`/api/v1/contacts/${contactId}`)
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(404);
  });
});

// ── POST /api/v1/leads/:id/convert ───────────────────────────────────────────

describe.skipIf(!pgUp)('POST /api/v1/leads/:id/convert', () => {
  let convertibleLeadId = '';
  let assignedLeadId = '';
  let unassignedLeadId = '';

  beforeAll(async () => {
    if (!pgUp) return;

    // Lead to convert — owned by orgA, unassigned
    convertibleLeadId = await seedLead(orgA, ownerUserId, { firstName: 'ToConvert' });

    // Lead assigned to salesUserId — for ownOnly test
    const [assignedRow] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO leads (id, "organizationId", "firstName", source, status, "createdById", "assignedToId", "updatedAt")
       VALUES (uuid_generate_v4(), $1::uuid, 'AssignedLead', 'MANUAL', 'NEW', $2::uuid, $3::uuid, now()) RETURNING id`,
      orgA, ownerUserId, salesUserId,
    );
    assignedLeadId = assignedRow!.id;

    // Lead not assigned to salesUserId — for ownOnly rejection test
    unassignedLeadId = await seedLead(orgA, ownerUserId, { firstName: 'UnassignedLead' });
  });

  it('201 — converts lead to contact atomically (OWNER)', async () => {
    const res = await request(app)
      .post(`/api/v1/leads/${convertibleLeadId}/convert`)
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(201);

    const { lead, contact } = res.body.data;

    // Lead must be WON with convertedToContactId set
    expect(lead.status).toBe('WON');
    expect(lead.id).toBe(convertibleLeadId);
    expect(lead.convertedToContactId).toBe(contact.id);

    // Contact must be created with correct fields and back-link
    expect(contact.organizationId).toBe(orgA);
    expect(contact.firstName).toBe('ToConvert');
    expect(contact.createdFromLeadId).toBe(convertibleLeadId);
  });

  it('409 — converting an already-converted lead returns CONFLICT', async () => {
    // convertibleLeadId was just converted in the previous test
    const res = await request(app)
      .post(`/api/v1/leads/${convertibleLeadId}/convert`)
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('404 — unknown lead returns NOT_FOUND', async () => {
    const res = await request(app)
      .post('/api/v1/leads/00000000-0000-0000-0000-000000000000/convert')
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('404 — cross-org lead: orgB user cannot convert orgA lead (RLS hides it)', async () => {
    const res = await request(app)
      .post(`/api/v1/leads/${convertibleLeadId}/convert`)
      .set('Authorization', `Bearer ${otherOrgToken()}`);
    expect(res.status).toBe(404);
  });

  it('201 — SALES_EXECUTIVE (ownOnly) converts their own assigned lead', async () => {
    const res = await request(app)
      .post(`/api/v1/leads/${assignedLeadId}/convert`)
      .set('Authorization', `Bearer ${salesToken()}`);
    expect(res.status).toBe(201);
    expect(res.body.data.lead.status).toBe('WON');
    expect(res.body.data.contact.createdFromLeadId).toBe(assignedLeadId);
  });

  it('404 — SALES_EXECUTIVE (ownOnly) cannot convert unassigned lead', async () => {
    const res = await request(app)
      .post(`/api/v1/leads/${unassignedLeadId}/convert`)
      .set('Authorization', `Bearer ${salesToken()}`);
    expect(res.status).toBe(404);
  });
});
