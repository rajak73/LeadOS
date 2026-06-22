// Sprint 7 M1 — Notification engine integration tests.
//
// Covers: notify() persists a row + NOTIFICATION_SENT activity; opt-out returns null;
// GET list (+unread filter) self-scoped; mark-read (+404); mark-all; preferences default
// + upsert; cross-org isolation (R-SEC-1); assigned-conversation IG message → notification
// (DM1-a). Also a B-2 verification: pipeline create emits an activity.
//
// Real Postgres + Redis required; self-skips if unavailable.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/core/prisma/client.js';
import { isPostgresUp, isRedisUp } from '../helpers/services.js';
import { signAccessToken } from '../../src/core/auth/jwt.js';
import { NotificationService } from '../../src/modules/notifications/notification.service.js';
import { processWebhookJob } from '../../src/core/queue/workers/webhook.worker.js';

const pgUp = await isPostgresUp();
const redisUp = await isRedisUp();
const infra = pgUp && redisUp;

const app = buildApp();

// ─── Seed helpers (raw SQL — same pattern as inbox-receive) ────────────────────

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

async function seedInstagramAccount(orgId: string, igUserId: string): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO instagram_accounts ("organizationId", "igUserId", "igUsername", "accessToken",
      "tokenExpiresAt", "tokenType", status, "webhookSubscribed", "updatedAt")
     VALUES ($1::uuid, $2, $3, 'v1:test:test:test', now() + interval '60 days',
             'bearer', 'ACTIVE'::"InstagramAccountStatus", true, now())
     RETURNING id`,
    orgId, igUserId, `test_${igUserId}`,
  );
  return row!.id;
}

async function seedWebhookEvent(payload: unknown): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO webhook_events (source, "externalEventId", payload, status, attempts, "updatedAt")
     VALUES ('INSTAGRAM'::"WebhookSource", $1, $2::jsonb, 'PENDING'::"WebhookEventStatus", 0, now())
     RETURNING id`,
    `notif-ext-${Date.now()}-${Math.random()}`, JSON.stringify(payload),
  );
  return row!.id;
}

function buildDmPayload(recipientIgUserId: string, senderIgUserId: string, mid: string, text = 'Hello'): unknown {
  return {
    object: 'instagram',
    entry: [{
      id: recipientIgUserId,
      time: Date.now(),
      messaging: [{
        sender: { id: senderIgUserId },
        recipient: { id: recipientIgUserId },
        timestamp: Date.now(),
        message: { mid, text },
      }],
    }],
  };
}

function makeJob(webhookEventId: string): Parameters<typeof processWebhookJob>[0] {
  return { data: { webhookEventId, source: 'INSTAGRAM' }, opts: { attempts: 3 }, attemptsMade: 0 } as Parameters<typeof processWebhookJob>[0];
}

// ─── State ──────────────────────────────────────────────────────────────────

let orgAId = '';
let orgBId = '';
let ownerAId = '';
let ownerBId = '';
let salesUserId = '';
let igAccountAId = '';
const RECIPIENT_IG = `ig-notif-${Date.now()}`;

beforeAll(async () => {
  if (!infra) return;
  orgAId = await seedOrg('Notif Org A');
  orgBId = await seedOrg('Notif Org B');
  ownerAId = await seedUser(`notif-owner-a-${Date.now()}@test.com`);
  ownerBId = await seedUser(`notif-owner-b-${Date.now()}@test.com`);
  salesUserId = await seedUser(`notif-sales-${Date.now()}@test.com`);
  const roleA = await seedRole(orgAId, 'OWNER');
  const roleB = await seedRole(orgBId, 'OWNER');
  const salesRole = await seedRole(orgAId, 'SALES_EXECUTIVE');
  await seedMember(orgAId, ownerAId, roleA);
  await seedMember(orgBId, ownerBId, roleB);
  await seedMember(orgAId, salesUserId, salesRole);
  igAccountAId = await seedInstagramAccount(orgAId, RECIPIENT_IG);
});

afterAll(async () => {
  if (!infra) return;
  // session_replication_role = replica bypasses the activities immutability triggers and
  // FK cascades for teardown only — the established cleanup pattern (see deals.integration).
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
    for (const table of [
      'notifications',
      'notification_preferences',
      'activities',
      'messages',
      'instagram_conversations',
      'leads',
      'instagram_accounts',
      'pipeline_stages',
      'pipelines',
      'organization_members',
      'roles',
    ]) {
      await tx.$executeRawUnsafe(
        `DELETE FROM "${table}" WHERE "organizationId" IN ($1::uuid, $2::uuid)`,
        orgAId, orgBId,
      );
    }
    await tx.$executeRawUnsafe(`DELETE FROM organizations WHERE id IN ($1::uuid, $2::uuid)`, orgAId, orgBId);
    await tx.$executeRawUnsafe(
      `DELETE FROM users WHERE id IN ($1::uuid, $2::uuid, $3::uuid)`,
      ownerAId, ownerBId, salesUserId,
    );
    await tx.$executeRawUnsafe(`DELETE FROM webhook_events WHERE "externalEventId" LIKE 'notif-ext-%'`);
  });
});

function token(orgId: string, userId: string, role = 'OWNER'): string {
  return signAccessToken({ sub: userId, orgId, role, isSuperAdmin: false });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('NotificationService.notify', () => {
  it('persists a notification row and a NOTIFICATION_SENT activity', async () => {
    if (!infra) return;
    const created = await new NotificationService().notify({
      organizationId: orgAId,
      userId: ownerAId,
      type: 'INBOX_MESSAGE',
      title: 'Hello',
      body: 'A new message',
      entityType: 'conversation',
      entityId: igAccountAId,
    });
    expect(created).not.toBeNull();

    const [row] = await prisma.$queryRawUnsafe<{ id: string; title: string; readAt: string | null }[]>(
      `SELECT id, title, "readAt" FROM notifications WHERE id = $1::uuid`,
      created!.id,
    );
    expect(row?.title).toBe('Hello');
    expect(row?.readAt).toBeNull();

    const acts = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM activities WHERE type = 'NOTIFICATION_SENT' AND "organizationId" = $1::uuid
         AND metadata->>'notificationId' = $2`,
      orgAId, created!.id,
    );
    expect(acts.length).toBe(1);
  });

  it('returns null when the recipient opted out of both channels', async () => {
    if (!infra) return;
    await prisma.$executeRawUnsafe(
      `INSERT INTO notification_preferences ("organizationId", "userId", type, "inApp", email, "updatedAt")
       VALUES ($1::uuid, $2::uuid, 'CONVERSATION_ASSIGNED'::"NotificationType", false, false, now())`,
      orgAId, ownerAId,
    );
    const created = await new NotificationService().notify({
      organizationId: orgAId,
      userId: ownerAId,
      type: 'CONVERSATION_ASSIGNED',
      title: 'Opted out',
      body: 'Should not persist',
    });
    expect(created).toBeNull();
  });
});

describe('GET /api/v1/notifications', () => {
  it('returns the caller notifications and filters by unread', async () => {
    if (!infra) return;
    await new NotificationService().notify({
      organizationId: orgAId, userId: ownerAId, type: 'INBOX_MESSAGE', title: 'Unread one', body: 'b',
    });

    const res = await request(app)
      .get('/api/v1/notifications?unread=true')
      .set('Authorization', `Bearer ${token(orgAId, ownerAId)}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.items.every((n: { readAt: string | null }) => n.readAt === null)).toBe(true);
    expect(typeof res.body.data.unreadCount).toBe('number');
    expect(res.body.data.unreadCount).toBeGreaterThan(0);
  });
});

describe('POST /api/v1/notifications/:id/read', () => {
  it('marks a notification read; returns 404 for a foreign id', async () => {
    if (!infra) return;
    const created = await new NotificationService().notify({
      organizationId: orgAId, userId: ownerAId, type: 'INBOX_MESSAGE', title: 'To read', body: 'b',
    });

    const ok = await request(app)
      .post(`/api/v1/notifications/${created!.id}/read`)
      .set('Authorization', `Bearer ${token(orgAId, ownerAId)}`);
    expect(ok.status).toBe(200);

    const [row] = await prisma.$queryRawUnsafe<{ readAt: string | null }[]>(
      `SELECT "readAt" FROM notifications WHERE id = $1::uuid`, created!.id,
    );
    expect(row?.readAt).not.toBeNull();

    // A different user (owner B) cannot mark org A's notification → 404
    const forbidden = await request(app)
      .post(`/api/v1/notifications/${created!.id}/read`)
      .set('Authorization', `Bearer ${token(orgBId, ownerBId)}`);
    expect(forbidden.status).toBe(404);
    expect(forbidden.body.error?.code).toBe('NOTIFICATION_NOT_FOUND');
  });
});

describe('POST /api/v1/notifications/read (mark all)', () => {
  it('marks all of the caller unread notifications read', async () => {
    if (!infra) return;
    await new NotificationService().notify({ organizationId: orgAId, userId: salesUserId, type: 'INBOX_MESSAGE', title: 'a', body: 'b' });
    await new NotificationService().notify({ organizationId: orgAId, userId: salesUserId, type: 'INBOX_MESSAGE', title: 'c', body: 'd' });

    const res = await request(app)
      .post('/api/v1/notifications/read')
      .set('Authorization', `Bearer ${token(orgAId, salesUserId, 'SALES_EXECUTIVE')}`)
      .send({});
    expect(res.status).toBe(200);

    const remaining = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM notifications WHERE "userId" = $1::uuid AND "readAt" IS NULL`, salesUserId,
    );
    expect(remaining.length).toBe(0);
  });
});

describe('GET/PUT /api/v1/notifications/preferences', () => {
  it('returns defaults and persists updates', async () => {
    if (!infra) return;
    const get = await request(app)
      .get('/api/v1/notifications/preferences')
      .set('Authorization', `Bearer ${token(orgBId, ownerBId)}`);
    expect(get.status).toBe(200);
    expect(Array.isArray(get.body.data.preferences)).toBe(true);
    expect(get.body.data.preferences.length).toBeGreaterThanOrEqual(2);

    const put = await request(app)
      .put('/api/v1/notifications/preferences')
      .set('Authorization', `Bearer ${token(orgBId, ownerBId)}`)
      .send({ preferences: [{ type: 'INBOX_MESSAGE', inApp: true, email: true }] });
    expect(put.status).toBe(200);
    const inbox = put.body.data.preferences.find((p: { type: string }) => p.type === 'INBOX_MESSAGE');
    expect(inbox.email).toBe(true);
  });
});

describe('Cross-org isolation (R-SEC-1)', () => {
  it('org B does not see org A notifications', async () => {
    if (!infra) return;
    const created = await new NotificationService().notify({
      organizationId: orgAId, userId: ownerAId, type: 'INBOX_MESSAGE', title: 'Org A only', body: 'b',
    });
    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${token(orgBId, ownerBId)}`);
    expect(res.status).toBe(200);
    const ids = (res.body.data.items as Array<{ id: string }>).map((n) => n.id);
    expect(ids).not.toContain(created!.id);
  });
});

describe('Assigned-conversation IG message → notification (DM1-a)', () => {
  it('creates a notification for the assigned agent on a new inbound message', async () => {
    if (!infra) return;
    const senderIg = `sender-assigned-${Date.now()}`;

    // First DM creates the conversation (unassigned → no notification yet).
    await processWebhookJob(makeJob(await seedWebhookEvent(buildDmPayload(RECIPIENT_IG, senderIg, `mid-a1-${Date.now()}`))));

    // Assign the conversation to the sales user.
    await prisma.$executeRawUnsafe(
      `UPDATE instagram_conversations SET "assignedToId" = $1::uuid
       WHERE "igConversationId" = $2 AND "organizationId" = $3::uuid`,
      salesUserId, `${RECIPIENT_IG}_${senderIg}`, orgAId,
    );

    // Second DM (same conversation, now assigned) → notification for the assignee.
    await processWebhookJob(makeJob(await seedWebhookEvent(buildDmPayload(RECIPIENT_IG, senderIg, `mid-a2-${Date.now()}`, 'Second'))));

    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM notifications WHERE "userId" = $1::uuid AND type = 'INBOX_MESSAGE'::"NotificationType"
         AND "entityType" = 'conversation'`,
      salesUserId,
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});

describe('B-2 verification — pipeline create emits an activity', () => {
  it('creating a pipeline produces a PIPELINE_CREATED activity row', async () => {
    if (!infra) return;
    const res = await request(app)
      .post('/api/v1/pipelines')
      .set('Authorization', `Bearer ${token(orgAId, ownerAId)}`)
      .send({ name: `B2 Pipeline ${Date.now()}` });
    expect([200, 201]).toContain(res.status);
    const pipelineId = res.body.data?.id as string;
    expect(pipelineId).toBeTruthy();

    const acts = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM activities WHERE type = 'PIPELINE_CREATED' AND "relatedPipelineId" = $1::uuid`,
      pipelineId,
    );
    expect(acts.length).toBe(1);
  });
});
