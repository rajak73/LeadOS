// Sprint 4 M4 — CRM-4.2 – 4.4 Task module + CRM-4.1 activity feed integration tests.
//
// Real JWTs + assembled app + real Postgres as leados_app (via withTenant).
// DB-gated: self-skips when Postgres is unavailable; runs in CI (DEF-3 guard).
//
// Coverage checklist (12 tests):
//   POST   /tasks              → 201 task with relatedLeadId (TASK_CREATED activity emitted)
//   POST   /tasks              → 422 missing title
//   POST   /tasks              → 401 no auth
//   GET    /tasks/:id          → 200 owner reads task
//   GET    /tasks/:id          → 404 cross-org isolation (RLS)
//   PATCH  /tasks/:id          → 200 PENDING → IN_PROGRESS
//   PATCH  /tasks/:id          → 422 PENDING → COMPLETED (no-skip rule)
//   PATCH  /tasks/:id          → 200 IN_PROGRESS → COMPLETED (completedAt set by server)
//   PATCH  /tasks/:id          → 200 SALES_EXECUTIVE updates own assigned task
//   PATCH  /tasks/:id          → 404 SALES_EXECUTIVE cannot update unassigned task
//   DELETE /tasks/:id          → 204 soft delete
//   GET    /leads/:id/activities → 200 paginated feed includes TASK_CREATED activity

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/core/prisma/client.js';
import { isPostgresUp } from '../helpers/services.js';
import { signAccessToken } from '../../src/core/auth/jwt.js';

const pgUp = await isPostgresUp();
const app = buildApp();

// ── Outer fixtures ────────────────────────────────────────────────────────────

let orgA = '';
let orgB = '';
let ownerUserId = '';
let salesUserId = '';
let otherUserId = '';
let leadForActivitiesId = ''; // created in outer beforeAll; used by activity feed describe

function ownerToken(): string {
  return signAccessToken({ sub: ownerUserId, orgId: orgA, role: 'OWNER', isSuperAdmin: false });
}
function salesToken(): string {
  return signAccessToken({ sub: salesUserId, orgId: orgA, role: 'SALES_EXECUTIVE', isSuperAdmin: false });
}
function otherOrgToken(): string {
  return signAccessToken({ sub: otherUserId, orgId: orgB, role: 'OWNER', isSuperAdmin: false });
}

// ── Seed helpers ──────────────────────────────────────────────────────────────

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

async function seedLead(orgId: string, createdById: string): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO leads (id, "organizationId", "firstName", source, status, "createdById", "updatedAt")
     VALUES (uuid_generate_v4(), $1::uuid, 'ActivityFeedLead', 'MANUAL', 'NEW', $2::uuid, now()) RETURNING id`,
    orgId, createdById,
  );
  return row!.id;
}

async function seedTask(
  orgId: string,
  createdById: string,
  overrides: {
    status?: string;
    assignedToId?: string | null;
    relatedLeadId?: string | null;
  } = {},
): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO tasks (id, "organizationId", title, type, priority, status,
       "createdById", "assignedToId", "relatedLeadId", "updatedAt")
     VALUES (uuid_generate_v4(), $1::uuid, 'Integration Test Task',
       'CALL'::"TaskType", 'MEDIUM'::"TaskPriority", $2::"TaskStatus",
       $3::uuid, $4::uuid, $5::uuid, now()) RETURNING id`,
    orgId,
    overrides.status ?? 'PENDING',
    createdById,
    overrides.assignedToId ?? null,
    overrides.relatedLeadId ?? null,
  );
  return row!.id;
}

// ── Outer beforeAll / afterAll ────────────────────────────────────────────────

beforeAll(async () => {
  if (!pgUp) return;
  const nonce = process.hrtime.bigint().toString();

  orgA = await seedOrg(`Tasks A ${nonce}`, `tasks-a-${nonce}`);
  orgB = await seedOrg(`Tasks B ${nonce}`, `tasks-b-${nonce}`);

  ownerUserId = await seedUser(`task-owner+${nonce}@tasks.test`);
  salesUserId = await seedUser(`task-sales+${nonce}@tasks.test`);
  otherUserId = await seedUser(`task-other+${nonce}@tasks.test`);

  const ownerRoleA = await seedRole(orgA, 'OWNER');
  const salesRoleA = await seedRole(orgA, 'SALES_EXECUTIVE');
  const ownerRoleB = await seedRole(orgB, 'OWNER');

  await seedMember(orgA, ownerUserId, ownerRoleA);
  await seedMember(orgA, salesUserId, salesRoleA);
  await seedMember(orgB, otherUserId, ownerRoleB);

  await seedSubscription(orgA, 'TRIAL');
  await seedSubscription(orgB, 'TRIAL');

  leadForActivitiesId = await seedLead(orgA, ownerUserId);
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
});

// ── POST /tasks ───────────────────────────────────────────────────────────────

describe.skipIf(!pgUp)('POST /tasks', () => {
  it('201 — creates a task with relatedLeadId and emits TASK_CREATED activity', async () => {
    const res = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({
        title: 'Follow up call',
        type: 'CALL',
        priority: 'HIGH',
        relatedLeadId: leadForActivitiesId,
      });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      title: 'Follow up call',
      type: 'CALL',
      priority: 'HIGH',
      status: 'PENDING',
      organizationId: orgA,
    });
  });

  it('422 — rejects missing title', async () => {
    const res = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ type: 'CALL' });
    expect(res.status).toBe(422);
  });

  it('401 — rejects unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/v1/tasks')
      .send({ title: 'Task', type: 'CALL' });
    expect(res.status).toBe(401);
  });
});

// ── GET /tasks/:id ────────────────────────────────────────────────────────────

describe.skipIf(!pgUp)('GET /tasks/:id', () => {
  let taskId = '';

  beforeAll(async () => {
    if (!pgUp) return;
    taskId = await seedTask(orgA, ownerUserId);
  });

  it('200 — owner retrieves their org task', async () => {
    const res = await request(app)
      .get(`/api/v1/tasks/${taskId}`)
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(taskId);
    expect(res.body.data.organizationId).toBe(orgA);
  });

  it('404 — cross-org token cannot see orgA task (RLS)', async () => {
    const res = await request(app)
      .get(`/api/v1/tasks/${taskId}`)
      .set('Authorization', `Bearer ${otherOrgToken()}`);
    expect(res.status).toBe(404);
  });
});

// ── PATCH /tasks/:id (status machine) ────────────────────────────────────────

describe.skipIf(!pgUp)('PATCH /tasks/:id — status machine', () => {
  let transitionTaskId = ''; // PENDING → IN_PROGRESS → COMPLETED sequence
  let noSkipTaskId = '';     // separate task for the PENDING → COMPLETED rejection

  beforeAll(async () => {
    if (!pgUp) return;
    transitionTaskId = await seedTask(orgA, ownerUserId);
    noSkipTaskId = await seedTask(orgA, ownerUserId);
  });

  it('200 — PENDING → IN_PROGRESS', async () => {
    const res = await request(app)
      .patch(`/api/v1/tasks/${transitionTaskId}`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ status: 'IN_PROGRESS' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('IN_PROGRESS');
    expect(res.body.data.completedAt).toBeNull();
  });

  it('422 — PENDING → COMPLETED (no-skip rule)', async () => {
    const res = await request(app)
      .patch(`/api/v1/tasks/${noSkipTaskId}`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ status: 'COMPLETED' });
    expect(res.status).toBe(422);
  });

  it('200 — IN_PROGRESS → COMPLETED (server sets completedAt)', async () => {
    // transitionTaskId is now IN_PROGRESS from the first test in this describe
    const res = await request(app)
      .patch(`/api/v1/tasks/${transitionTaskId}`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ status: 'COMPLETED' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('COMPLETED');
    expect(res.body.data.completedAt).not.toBeNull();
  });
});

// ── PATCH /tasks/:id (ownOnly — SALES_EXECUTIVE) ─────────────────────────────

describe.skipIf(!pgUp)('PATCH /tasks/:id — SALES_EXECUTIVE ownOnly', () => {
  let ownTaskId = '';   // assignedToId = salesUserId
  let otherTaskId = ''; // assignedToId = ownerUserId

  beforeAll(async () => {
    if (!pgUp) return;
    ownTaskId = await seedTask(orgA, ownerUserId, { assignedToId: salesUserId });
    otherTaskId = await seedTask(orgA, ownerUserId, { assignedToId: ownerUserId });
  });

  it('200 — SALES_EXECUTIVE updates a task assigned to themselves', async () => {
    const res = await request(app)
      .patch(`/api/v1/tasks/${ownTaskId}`)
      .set('Authorization', `Bearer ${salesToken()}`)
      .send({ priority: 'URGENT' });
    expect(res.status).toBe(200);
    expect(res.body.data.priority).toBe('URGENT');
  });

  it('404 — SALES_EXECUTIVE cannot update a task assigned to someone else', async () => {
    const res = await request(app)
      .patch(`/api/v1/tasks/${otherTaskId}`)
      .set('Authorization', `Bearer ${salesToken()}`)
      .send({ priority: 'LOW' });
    expect(res.status).toBe(404);
  });
});

// ── DELETE /tasks/:id ─────────────────────────────────────────────────────────

describe.skipIf(!pgUp)('DELETE /tasks/:id', () => {
  let deleteTaskId = '';

  beforeAll(async () => {
    if (!pgUp) return;
    deleteTaskId = await seedTask(orgA, ownerUserId);
  });

  it('204 — soft deletes a task', async () => {
    const res = await request(app)
      .delete(`/api/v1/tasks/${deleteTaskId}`)
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(204);

    // Verify it is no longer accessible
    const getRes = await request(app)
      .get(`/api/v1/tasks/${deleteTaskId}`)
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(getRes.status).toBe(404);
  });
});

// ── GET /leads/:id/activities ─────────────────────────────────────────────────

describe.skipIf(!pgUp)('GET /leads/:id/activities', () => {
  beforeAll(async () => {
    if (!pgUp) return;
    // Create a task linked to the lead so a TASK_CREATED activity is emitted
    await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ title: 'Activity feed task', type: 'MEETING', relatedLeadId: leadForActivitiesId });
  });

  it('200 — returns paginated activity feed for the lead', async () => {
    const res = await request(app)
      .get(`/api/v1/leads/${leadForActivitiesId}/activities`)
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.meta).toMatchObject({
      page: 1,
      limit: 25,
      hasNextPage: false,
      hasPrevPage: false,
    });
    const activityTypes = res.body.data.map((a: { type: string }) => a.type);
    expect(activityTypes).toContain('TASK_CREATED');
  });

  it('404 — cross-org token cannot access activities (RLS hides lead)', async () => {
    const res = await request(app)
      .get(`/api/v1/leads/${leadForActivitiesId}/activities`)
      .set('Authorization', `Bearer ${otherOrgToken()}`);
    expect(res.status).toBe(404);
  });
});
