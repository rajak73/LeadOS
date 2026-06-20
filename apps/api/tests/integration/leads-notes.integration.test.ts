// Sprint 5 M6 — B-M6-2: POST /leads/:id/notes integration tests.
//
// Covers:
//   POST /leads/:id/notes  → 201 happy path (OWNER)
//   POST /leads/:id/notes  → 201 SALES_EXECUTIVE (leads.update_own, assigned lead)
//   POST /leads/:id/notes  → 404 SALES_EXECUTIVE (leads.update_own, unassigned lead)
//   POST /leads/:id/notes  → 404 cross-org lead
//   POST /leads/:id/notes  → 422 missing content field
//   POST /leads/:id/notes  → 422 non-object content
//   GET  /leads/:id/notes  → 200 note appears after creation

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/core/prisma/client.js';
import { isPostgresUp } from '../helpers/services.js';
import { signAccessToken } from '../../src/core/auth/jwt.js';

const pgUp = await isPostgresUp();
const app = buildApp();

// ── Fixtures ──────────────────────────────────────────────────────────────────

let orgA = '';
let orgB = '';
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

async function seedSubscription(orgId: string, plan = 'GROWTH'): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO subscriptions ("organizationId", plan, status, "updatedAt")
     VALUES ($1::uuid, $2::"SubscriptionPlan", 'ACTIVE', now())
     ON CONFLICT ("organizationId") DO UPDATE SET plan = EXCLUDED.plan`,
    orgId, plan,
  );
}

async function seedLead(orgId: string, createdById: string, assignedToId?: string): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO leads (id, "organizationId", "firstName", source, status, "createdById",
       "assignedToId", "updatedAt")
     VALUES (uuid_generate_v4(), $1::uuid, 'NoteTestLead', 'MANUAL', 'NEW', $2::uuid,
       $3::uuid, now())
     RETURNING id`,
    orgId, createdById, assignedToId ?? null,
  );
  return row!.id;
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!pgUp) return;
  const nonce = process.hrtime.bigint().toString();

  orgA = await seedOrg(`Notes A ${nonce}`, `notes-a-${nonce}`);
  orgB = await seedOrg(`Notes B ${nonce}`, `notes-b-${nonce}`);

  ownerUserId = await seedUser(`owner+notes+${nonce}@test.com`);
  salesUserId = await seedUser(`sales+notes+${nonce}@test.com`);
  otherUserId = await seedUser(`other+notes+${nonce}@test.com`);

  const ownerRoleA = await seedRole(orgA, 'OWNER');
  const salesRoleA = await seedRole(orgA, 'SALES_EXECUTIVE');
  const ownerRoleB = await seedRole(orgB, 'OWNER');

  await seedMember(orgA, ownerUserId, ownerRoleA);
  await seedMember(orgA, salesUserId, salesRoleA);
  await seedMember(orgB, otherUserId, ownerRoleB);

  await seedSubscription(orgA);
  await seedSubscription(orgB);
});

afterAll(async () => {
  if (!pgUp || !orgA) return;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
    await tx.$executeRawUnsafe(
      `DELETE FROM organization_members WHERE "organizationId" IN ($1::uuid, $2::uuid)`,
      orgA, orgB,
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM roles WHERE "organizationId" IN ($1::uuid, $2::uuid)`,
      orgA, orgB,
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM organizations WHERE id IN ($1::uuid, $2::uuid)`,
      orgA, orgB,
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM users WHERE id IN ($1::uuid, $2::uuid, $3::uuid)`,
      ownerUserId, salesUserId, otherUserId,
    );
  });
  await prisma.$disconnect();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/v1/leads/:id/notes', () => {
  it.skipIf(!pgUp)('201: OWNER can create a note and note appears in GET list', async () => {
    const leadId = await seedLead(orgA, ownerUserId);

    const createRes = await request(app)
      .post(`/api/v1/leads/${leadId}/notes`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ content: { text: 'First note from owner' } });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    expect(createRes.body.data.id).toBeDefined();

    // Note must be retrievable via GET /leads/:id/notes
    const listRes = await request(app)
      .get(`/api/v1/leads/${leadId}/notes`)
      .set('Authorization', `Bearer ${ownerToken()}`);

    expect(listRes.status).toBe(200);
    const notes = listRes.body.data as Array<{ content: Record<string, unknown> }>;
    expect(notes.some((n) => n.content['text'] === 'First note from owner')).toBe(true);
  });

  it.skipIf(!pgUp)('201: SALES_EXECUTIVE can create note on assigned lead (ownOnly)', async () => {
    const leadId = await seedLead(orgA, ownerUserId, salesUserId);

    const res = await request(app)
      .post(`/api/v1/leads/${leadId}/notes`)
      .set('Authorization', `Bearer ${salesToken()}`)
      .send({ content: { text: 'Sales note on assigned lead' } });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
  });

  it.skipIf(!pgUp)('404: SALES_EXECUTIVE cannot create note on unassigned lead', async () => {
    const leadId = await seedLead(orgA, ownerUserId); // not assigned to salesUserId

    const res = await request(app)
      .post(`/api/v1/leads/${leadId}/notes`)
      .set('Authorization', `Bearer ${salesToken()}`)
      .send({ content: { text: 'Should not work' } });

    expect(res.status).toBe(404);
  });

  it.skipIf(!pgUp)('404: cross-org lead is invisible (RLS)', async () => {
    const leadId = await seedLead(orgA, ownerUserId);

    const res = await request(app)
      .post(`/api/v1/leads/${leadId}/notes`)
      .set('Authorization', `Bearer ${otherOrgToken()}`)
      .send({ content: { text: 'Cross-org attempt' } });

    expect(res.status).toBe(404);
  });

  it.skipIf(!pgUp)('422: missing content field', async () => {
    const leadId = await seedLead(orgA, ownerUserId);

    const res = await request(app)
      .post(`/api/v1/leads/${leadId}/notes`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({});

    expect(res.status).toBe(422);
  });

  it.skipIf(!pgUp)('422: content must be a JSON object (not a string)', async () => {
    const leadId = await seedLead(orgA, ownerUserId);

    const res = await request(app)
      .post(`/api/v1/leads/${leadId}/notes`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ content: 'plain string is invalid' });

    expect(res.status).toBe(422);
  });
});
