// Sprint 4 M6A — CRM-6.1 Lead list integration tests.
//
// Real JWTs + assembled app + real Postgres as leados_app (via withTenant).
// DB-gated: self-skips when Postgres is unavailable.
//
// Coverage checklist (11 tests):
//   GET /leads            → 200 paginated list with meta
//   GET /leads?status=NEW → 200 only NEW leads returned
//   GET /leads?assignedToId → 200 only assigned leads
//   GET /leads?search=    → 200 text search across firstName/lastName/email/phone
//   GET /leads?sortBy=firstName&sortOrder=asc → 200 sorted correctly
//   GET /leads?page=2&limit=1 → 200 correct offset pagination
//   GET /leads?tags=      → 200 tag overlap filter
//   ownOnly (SALES_EXECUTIVE) → only sees leads assigned to themselves
//   cross-org             → 200 with empty data array (RLS hides other org's leads)
//   401                   → no auth token rejected
//   meta.total            → accurate count matches filter

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/core/prisma/client.js';
import { isPostgresUp } from '../helpers/services.js';
import { signAccessToken } from '../../src/core/auth/jwt.js';

const pgUp = await isPostgresUp();
const app = buildApp();

let orgA = '';
let orgB = '';
let ownerUserId = '';
let salesUserId = '';
let otherOrgUserId = '';

function ownerToken(): string {
  return signAccessToken({ sub: ownerUserId, orgId: orgA, role: 'OWNER', isSuperAdmin: false });
}
function salesToken(): string {
  return signAccessToken({ sub: salesUserId, orgId: orgA, role: 'SALES_EXECUTIVE', isSuperAdmin: false });
}
function otherOrgToken(): string {
  return signAccessToken({ sub: otherOrgUserId, orgId: orgB, role: 'OWNER', isSuperAdmin: false });
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

async function seedSubscription(orgId: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO subscriptions ("organizationId", plan, status, "updatedAt")
     VALUES ($1::uuid, 'TRIAL'::"SubscriptionPlan", 'ACTIVE', now())
     ON CONFLICT ("organizationId") DO UPDATE SET plan = EXCLUDED.plan`,
    orgId,
  );
}

async function seedLead(
  orgId: string,
  createdById: string,
  overrides: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    status?: 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST';
    assignedToId?: string;
    tags?: string[];
  } = {},
): Promise<string> {
  // Enum values (status, source) are interpolated as SQL literals — Postgres coerces them to the
  // enum type automatically. Values are constrained to a TS union so interpolation is safe.
  // Nullable text/uuid params use explicit ::text / ::uuid casts so Postgres can infer the type.
  const status = overrides.status ?? 'NEW';
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO leads (id, "organizationId", "firstName", "lastName", email, phone, source, status,
                        "assignedToId", tags, "customFields", "createdById", "updatedAt")
     VALUES (uuid_generate_v4(), $1::uuid, $2::text, $3::text, $4::text, $5::text,
             'MANUAL', '${status}', $6::uuid, ARRAY[]::text[], '{}', $7::uuid, now())
     RETURNING id`,
    orgId,
    overrides.firstName ?? 'Test',
    overrides.lastName ?? null,
    overrides.email ?? null,
    overrides.phone ?? null,
    overrides.assignedToId ?? null,
    createdById,
  );
  const id = row!.id;

  // Tags are passed as a native JS array parameter — Prisma serialises it to a Postgres array.
  if (overrides.tags?.length) {
    await prisma.$executeRawUnsafe(
      `UPDATE leads SET tags = $1::text[] WHERE id = $2::uuid`,
      overrides.tags,
      id,
    );
  }

  return id;
}

beforeAll(async () => {
  if (!pgUp) return;
  const nonce = process.hrtime.bigint().toString();

  orgA = await seedOrg(`List A ${nonce}`, `list-a-${nonce}`);
  orgB = await seedOrg(`List B ${nonce}`, `list-b-${nonce}`);

  ownerUserId = await seedUser(`list-owner+${nonce}@list.test`);
  salesUserId = await seedUser(`list-sales+${nonce}@list.test`);
  otherOrgUserId = await seedUser(`list-other+${nonce}@list.test`);

  const ownerRoleA = await seedRole(orgA, 'OWNER');
  const salesRoleA = await seedRole(orgA, 'SALES_EXECUTIVE');
  const ownerRoleB = await seedRole(orgB, 'OWNER');

  await seedMember(orgA, ownerUserId, ownerRoleA);
  await seedMember(orgA, salesUserId, salesRoleA);
  await seedMember(orgB, otherOrgUserId, ownerRoleB);

  await seedSubscription(orgA);
  await seedSubscription(orgB);

  // Seed a varied set of leads in orgA for filter/sort/search tests.
  await seedLead(orgA, ownerUserId, {
    firstName: 'Alice', lastName: 'Alpha', email: 'alice@example.com',
    status: 'NEW', assignedToId: ownerUserId, tags: ['vip', 'hot'],
  });
  await seedLead(orgA, ownerUserId, {
    firstName: 'Bob', lastName: 'Beta', email: 'bob@example.com',
    status: 'CONTACTED', assignedToId: salesUserId, tags: ['hot'],
  });
  await seedLead(orgA, ownerUserId, {
    firstName: 'Carol', lastName: 'Gamma', phone: '9876543210',
    status: 'QUALIFIED', assignedToId: ownerUserId,
  });

  // One lead in orgB — must never appear in orgA queries.
  await seedLead(orgB, otherOrgUserId, { firstName: 'CrossOrg', status: 'NEW' });
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
      ownerUserId, salesUserId, otherOrgUserId,
    );
  });
});

// ── GET /leads ────────────────────────────────────────────────────────────────

describe.skipIf(!pgUp)('GET /leads', () => {
  it('200 — returns paginated list with meta', async () => {
    const res = await request(app)
      .get('/api/v1/leads')
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 25 });
    expect(typeof res.body.meta.total).toBe('number');
    expect(res.body.meta.total).toBeGreaterThanOrEqual(3);
  });

  it('401 — rejects unauthenticated request', async () => {
    const res = await request(app).get('/api/v1/leads');
    expect(res.status).toBe(401);
  });

  it('200 — status filter returns only matching leads', async () => {
    const res = await request(app)
      .get('/api/v1/leads?status=NEW')
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(200);
    const statuses = (res.body.data as { status: string }[]).map((l) => l.status);
    expect(statuses.every((s) => s === 'NEW')).toBe(true);
    expect(statuses.length).toBeGreaterThanOrEqual(1);
  });

  it('200 — multiple status values filter correctly', async () => {
    const res = await request(app)
      .get('/api/v1/leads?status=NEW&status=CONTACTED')
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(200);
    const statuses = (res.body.data as { status: string }[]).map((l) => l.status);
    expect(statuses.every((s) => s === 'NEW' || s === 'CONTACTED')).toBe(true);
  });

  it('200 — assignedToId filter returns only assigned leads', async () => {
    const res = await request(app)
      .get(`/api/v1/leads?assignedToId=${ownerUserId}`)
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(200);
    const ids = (res.body.data as { assignedToId: string }[]).map((l) => l.assignedToId);
    expect(ids.every((id) => id === ownerUserId)).toBe(true);
    expect(ids.length).toBeGreaterThanOrEqual(2);
  });

  it('200 — search matches firstName, lastName, email, phone (ILIKE)', async () => {
    // Search by first name
    const byName = await request(app)
      .get('/api/v1/leads?search=Alice')
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(byName.status).toBe(200);
    expect((byName.body.data as { firstName: string }[]).some((l) => l.firstName === 'Alice')).toBe(true);

    // Search by email fragment
    const byEmail = await request(app)
      .get('/api/v1/leads?search=bob@example')
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(byEmail.status).toBe(200);
    expect((byEmail.body.data as { firstName: string }[]).some((l) => l.firstName === 'Bob')).toBe(true);

    // Search by phone fragment
    const byPhone = await request(app)
      .get('/api/v1/leads?search=987654')
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(byPhone.status).toBe(200);
    expect((byPhone.body.data as { firstName: string }[]).some((l) => l.firstName === 'Carol')).toBe(true);
  });

  it('200 — tags filter uses hasSome (overlap match)', async () => {
    const res = await request(app)
      .get('/api/v1/leads?tags=vip')
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(200);
    // Alice has vip tag; Bob only has hot; Carol has none.
    const names = (res.body.data as { firstName: string }[]).map((l) => l.firstName);
    expect(names).toContain('Alice');
    expect(names).not.toContain('Carol');
  });

  it('200 — sortBy=firstName&sortOrder=asc returns alphabetical order', async () => {
    const res = await request(app)
      .get('/api/v1/leads?sortBy=firstName&sortOrder=asc')
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(200);
    const firstNames = (res.body.data as { firstName: string }[]).map((l) => l.firstName);
    const sorted = [...firstNames].sort((a, b) => a.localeCompare(b));
    expect(firstNames).toEqual(sorted);
  });

  it('200 — pagination: page=2 limit=1 returns second lead', async () => {
    // Get first two leads sorted by firstName asc to predict order.
    const page1 = await request(app)
      .get('/api/v1/leads?sortBy=firstName&sortOrder=asc&limit=1&page=1')
      .set('Authorization', `Bearer ${ownerToken()}`);
    const page2 = await request(app)
      .get('/api/v1/leads?sortBy=firstName&sortOrder=asc&limit=1&page=2')
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(page1.status).toBe(200);
    expect(page2.status).toBe(200);
    // The two pages must return different leads.
    const id1 = (page1.body.data as { id: string }[])[0]!.id;
    const id2 = (page2.body.data as { id: string }[])[0]!.id;
    expect(id1).not.toBe(id2);
    // meta.total is consistent across pages.
    expect(page1.body.meta.total).toBe(page2.body.meta.total);
  });

  it('200 — ownOnly: SALES_EXECUTIVE only sees their assigned leads', async () => {
    const res = await request(app)
      .get('/api/v1/leads')
      .set('Authorization', `Bearer ${salesToken()}`);
    expect(res.status).toBe(200);
    // salesUserId is assigned only Bob. Alice and Carol are assigned to ownerUserId.
    const names = (res.body.data as { firstName: string }[]).map((l) => l.firstName);
    expect(names).toContain('Bob');
    expect(names).not.toContain('Alice');
    expect(names).not.toContain('Carol');
  });

  it('200 — cross-org isolation: orgB token returns empty list (RLS hides orgA leads)', async () => {
    const res = await request(app)
      .get('/api/v1/leads')
      .set('Authorization', `Bearer ${otherOrgToken()}`);
    expect(res.status).toBe(200);
    // orgB has one lead (CrossOrg) but it's only visible to orgB members.
    // The org B owner can see their own lead but NOT orgA's leads.
    const names = (res.body.data as { firstName: string }[]).map((l) => l.firstName);
    expect(names).not.toContain('Alice');
    expect(names).not.toContain('Bob');
    expect(names).not.toContain('Carol');
  });

  it('200 — meta.total matches the count of filtered results', async () => {
    const res = await request(app)
      .get('/api/v1/leads?status=QUALIFIED')
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(200);
    const count = (res.body.data as unknown[]).length;
    expect(res.body.meta.total).toBe(count);
  });
});
