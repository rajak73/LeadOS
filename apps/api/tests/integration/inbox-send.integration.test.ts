// Sprint 6 M4 — Inbox send pipeline integration tests.
//
// Tests cover: POST send (happy path), window expiry (409), feature-flag kill switch (503),
// inbox.reply_own FORBIDDEN (403), delivered status webhook, read status webhook,
// firstResponseAt SLA stamp (set on first send), firstResponseAt immutability (not updated),
// per-account rate limiting (M4-GAP-1 fix).
//
// Real Postgres + Redis required; self-skips if unavailable.
// The send worker (processInstagramSendJob) is exercised separately from the HTTP layer —
// HTTP tests verify the service/controller/queue, not the async Meta API call.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import IORedis from 'ioredis';
import request from 'supertest';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/core/prisma/client.js';
import { isPostgresUp, isRedisUp } from '../helpers/services.js';
import { signAccessToken } from '../../src/core/auth/jwt.js';
import { processWebhookJob } from '../../src/core/queue/workers/webhook.worker.js';
import {
  checkAccountRateLimit,
  rateLimitKey,
  INSTAGRAM_SEND_RATE_MAX,
  INSTAGRAM_SEND_RATE_WINDOW_MS,
} from '../../src/core/queue/workers/instagram-send.worker.js';
import * as envModule from '../../src/core/config/env.js';

const pgUp = await isPostgresUp();
const redisUp = await isRedisUp();
const infra = pgUp && redisUp;

const app = buildApp();

// ─── Seed helpers ────────────────────────────────────────────────────────────

async function seedOrg(name: string): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO organizations (name, slug, "updatedAt") VALUES ($1, $2, now()) RETURNING id`,
    name, `${name.toLowerCase().replace(/\s/g, '-')}-${Date.now()}`,
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
  const { encryptField } = await import('../../src/core/crypto/field-encryption.js');
  const encToken = encryptField('sandbox-access-token');
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO instagram_accounts ("organizationId", "igUserId", "igUsername", "accessToken",
      "tokenExpiresAt", "tokenType", status, "webhookSubscribed", "updatedAt")
     VALUES ($1::uuid, $2, $3, $4, now() + interval '60 days',
             'bearer', 'ACTIVE'::"InstagramAccountStatus", true, now())
     RETURNING id`,
    orgId, igUserId, `test_${igUserId}`, encToken,
  );
  return row!.id;
}

async function seedConversation(
  orgId: string,
  igAccountId: string,
  igConversationId: string,
  lastInboundAt: Date | null,
): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO instagram_conversations
       ("organizationId", "igAccountId", "igConversationId", status, labels,
        "lastInboundAt", "lastMessageAt", "updatedAt")
     VALUES ($1::uuid, $2::uuid, $3, 'OPEN'::"ConversationStatus", '[]',
             $4, $4, now())
     RETURNING id`,
    orgId, igAccountId, igConversationId, lastInboundAt,
  );
  return row!.id;
}

async function seedOutboundMessage(
  orgId: string,
  conversationId: string,
  mid: string,
  sentAt: Date,
): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO messages
       ("organizationId", "conversationId", mid, direction, "contentType", content,
        status, "sentAt", "updatedAt")
     VALUES ($1::uuid, $2::uuid, $3, 'OUTBOUND'::"MessageDirection", 'TEXT',
             '{"text":"hello"}'::jsonb, 'SENT'::"MessageStatus", $4, now())
     RETURNING id`,
    orgId, conversationId, mid, sentAt,
  );
  return row!.id;
}

async function seedWebhookEvent(source: string, payload: unknown): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO webhook_events (source, "externalEventId", payload, status, attempts, "updatedAt")
     VALUES ($1::"WebhookSource", $2, $3::jsonb, 'PENDING'::"WebhookEventStatus", 0, now())
     RETURNING id`,
    source, `test-send-ext-${Date.now()}-${Math.random()}`, JSON.stringify(payload),
  );
  return row!.id;
}

function buildDeliveryPayload(recipientIgUserId: string, senderIgUserId: string, mids: string[]): unknown {
  return {
    object: 'instagram',
    entry: [{
      id: recipientIgUserId,
      time: Date.now(),
      messaging: [{
        sender: { id: senderIgUserId },
        recipient: { id: recipientIgUserId },
        timestamp: Date.now(),
        delivery: { mids, watermark: Date.now() },
      }],
    }],
  };
}

function buildReadPayload(recipientIgUserId: string, senderIgUserId: string, watermark: number): unknown {
  return {
    object: 'instagram',
    entry: [{
      id: recipientIgUserId,
      time: Date.now(),
      messaging: [{
        sender: { id: senderIgUserId },
        recipient: { id: recipientIgUserId },
        timestamp: Date.now(),
        read: { watermark },
      }],
    }],
  };
}

function makeJob(webhookEventId: string): Parameters<typeof processWebhookJob>[0] {
  return {
    data: { webhookEventId, source: 'INSTAGRAM' },
    opts: { attempts: 3 },
    attemptsMade: 0,
  } as Parameters<typeof processWebhookJob>[0];
}

// ─── State ────────────────────────────────────────────────────────────────────

let orgId = '';
let ownerId = '';
let salesUserId = '';
let igAccountId = '';
const RECIPIENT_IG = 'ig-send-biz-001';
const CUSTOMER_IG = 'ig-send-customer-001';
const CONV_IG_ID = `${RECIPIENT_IG}_${CUSTOMER_IG}`;

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!infra) return;

  orgId = await seedOrg('Inbox Send Org');
  ownerId = await seedUser(`send-owner-${Date.now()}@test.com`);
  salesUserId = await seedUser(`send-sales-${Date.now()}@test.com`);

  const ownerRole = await seedRole(orgId, 'OWNER');
  const salesRole = await seedRole(orgId, 'SALES_EXECUTIVE');

  await seedMember(orgId, ownerId, ownerRole);
  await seedMember(orgId, salesUserId, salesRole);

  igAccountId = await seedInstagramAccount(orgId, RECIPIENT_IG);
});

afterAll(async () => {
  if (!infra) return;
  await prisma.$executeRawUnsafe(`DELETE FROM messages WHERE "organizationId" = $1::uuid`, orgId);
  await prisma.$executeRawUnsafe(`DELETE FROM instagram_conversations WHERE "organizationId" = $1::uuid`, orgId);
  await prisma.$executeRawUnsafe(`DELETE FROM leads WHERE "organizationId" = $1::uuid`, orgId);
  await prisma.$executeRawUnsafe(`DELETE FROM instagram_accounts WHERE "organizationId" = $1::uuid`, orgId);
  await prisma.$executeRawUnsafe(`DELETE FROM organization_members WHERE "organizationId" = $1::uuid`, orgId);
  await prisma.$executeRawUnsafe(`DELETE FROM roles WHERE "organizationId" = $1::uuid`, orgId);
  await prisma.$executeRawUnsafe(`DELETE FROM organizations WHERE id = $1::uuid`, orgId);
  await prisma.$executeRawUnsafe(`DELETE FROM users WHERE id IN ($1::uuid, $2::uuid)`, ownerId, salesUserId);
  await prisma.$executeRawUnsafe(
    `DELETE FROM webhook_events WHERE "externalEventId" LIKE 'test-send-ext-%'`,
  );
});

// ─── Token helpers ────────────────────────────────────────────────────────────

function ownerToken(): string {
  return signAccessToken({ sub: ownerId, orgId, role: 'OWNER', isSuperAdmin: false });
}

function salesToken(): string {
  return signAccessToken({ sub: salesUserId, orgId, role: 'SALES_EXECUTIVE', isSuperAdmin: false });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Instagram Inbox — Send Pipeline', () => {

  describe('POST /api/v1/inbox/conversations/:id/messages — happy path', () => {
    it('returns 201 and creates an OUTBOUND message row', async () => {
      if (!infra) return;

      const convId = await seedConversation(orgId, igAccountId, CONV_IG_ID, new Date());

      const res = await request(app)
        .post(`/api/v1/inbox/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${ownerToken()}`)
        .send({ content: { text: 'Hello from agent!' } });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ status: 'SENT' });
      expect(typeof res.body.data.messageId).toBe('string');

      const [msg] = await prisma.$queryRawUnsafe<{ direction: string; status: string }[]>(
        `SELECT direction, status FROM messages WHERE id = $1::uuid`,
        res.body.data.messageId,
      );
      expect(msg?.direction).toBe('OUTBOUND');
      expect(msg?.status).toBe('SENT');

      // Cleanup
      await prisma.$executeRawUnsafe(`DELETE FROM messages WHERE "conversationId" = $1::uuid`, convId);
      await prisma.$executeRawUnsafe(`DELETE FROM instagram_conversations WHERE id = $1::uuid`, convId);
    });
  });

  describe('POST — messaging window expired', () => {
    it('returns 409 WINDOW_CLOSED when lastInboundAt > 24h ago', async () => {
      if (!infra) return;

      const staleAt = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      const convId = await seedConversation(orgId, igAccountId, `${CONV_IG_ID}-stale-${Date.now()}`, staleAt);

      const res = await request(app)
        .post(`/api/v1/inbox/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${ownerToken()}`)
        .send({ content: { text: 'Too late!' } });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('WINDOW_CLOSED');

      await prisma.$executeRawUnsafe(`DELETE FROM instagram_conversations WHERE id = $1::uuid`, convId);
    });
  });

  describe('POST — feature flag kill switch', () => {
    it('returns 503 FEATURE_DISABLED when FLAG_INSTAGRAM_SENDS_ENABLED is false', async () => {
      if (!infra) return;

      const convId = await seedConversation(orgId, igAccountId, `${CONV_IG_ID}-flag-${Date.now()}`, new Date());

      // Temporarily disable the flag by mutating the already-parsed env object
      const original = envModule.env.FLAG_INSTAGRAM_SENDS_ENABLED;
      (envModule.env as Record<string, unknown>)['FLAG_INSTAGRAM_SENDS_ENABLED'] = false;
      try {
        const res = await request(app)
          .post(`/api/v1/inbox/conversations/${convId}/messages`)
          .set('Authorization', `Bearer ${ownerToken()}`)
          .send({ content: { text: 'Disabled!' } });

        expect(res.status).toBe(503);
        expect(res.body.error.code).toBe('FEATURE_DISABLED');
      } finally {
        (envModule.env as Record<string, unknown>)['FLAG_INSTAGRAM_SENDS_ENABLED'] = original;
        await prisma.$executeRawUnsafe(`DELETE FROM instagram_conversations WHERE id = $1::uuid`, convId);
      }
    });
  });

  describe('POST — inbox.reply_own on unassigned conversation', () => {
    it('returns 403 FORBIDDEN when SALES_EXECUTIVE tries to reply to an unassigned conversation', async () => {
      if (!infra) return;

      const convId = await seedConversation(orgId, igAccountId, `${CONV_IG_ID}-own-${Date.now()}`, new Date());
      // Conversation is not assigned to salesUserId — assignedToId is NULL

      const res = await request(app)
        .post(`/api/v1/inbox/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${salesToken()}`)
        .send({ content: { text: 'Can I reply?' } });

      expect(res.status).toBe(403);

      await prisma.$executeRawUnsafe(`DELETE FROM instagram_conversations WHERE id = $1::uuid`, convId);
    });
  });

  describe('Status webhook — delivered', () => {
    it('updates messages.status to DELIVERED and sets deliveredAt', async () => {
      if (!infra) return;

      const convId = await seedConversation(orgId, igAccountId, `${CONV_IG_ID}-del-${Date.now()}`, new Date());
      const metaMid = `meta-mid-delivered-${Date.now()}`;
      const msgId = await seedOutboundMessage(orgId, convId, metaMid, new Date());

      const payload = buildDeliveryPayload(RECIPIENT_IG, CUSTOMER_IG, [metaMid]);
      const eventId = await seedWebhookEvent('INSTAGRAM', payload);

      await processWebhookJob(makeJob(eventId));

      const [msg] = await prisma.$queryRawUnsafe<{ status: string; deliveredAt: Date | null }[]>(
        `SELECT status, "deliveredAt" FROM messages WHERE id = $1::uuid`,
        msgId,
      );
      expect(msg?.status).toBe('DELIVERED');
      expect(msg?.deliveredAt).not.toBeNull();

      await prisma.$executeRawUnsafe(`DELETE FROM messages WHERE "conversationId" = $1::uuid`, convId);
      await prisma.$executeRawUnsafe(`DELETE FROM instagram_conversations WHERE id = $1::uuid`, convId);
    });
  });

  describe('Status webhook — read', () => {
    it('updates messages.status to READ and sets readAt for OUTBOUND messages within watermark', async () => {
      if (!infra) return;

      const sentAt = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
      const convId = await seedConversation(orgId, igAccountId, `${CONV_IG_ID}-read-${Date.now()}`, new Date());
      const msgId = await seedOutboundMessage(orgId, convId, `meta-mid-read-${Date.now()}`, sentAt);

      const watermark = Date.now(); // watermark = now → all sent before now are read
      const payload = buildReadPayload(RECIPIENT_IG, CUSTOMER_IG, watermark);
      const eventId = await seedWebhookEvent('INSTAGRAM', payload);

      await processWebhookJob(makeJob(eventId));

      const [msg] = await prisma.$queryRawUnsafe<{ status: string; readAt: Date | null }[]>(
        `SELECT status, "readAt" FROM messages WHERE id = $1::uuid`,
        msgId,
      );
      expect(msg?.status).toBe('READ');
      expect(msg?.readAt).not.toBeNull();

      await prisma.$executeRawUnsafe(`DELETE FROM messages WHERE "conversationId" = $1::uuid`, convId);
      await prisma.$executeRawUnsafe(`DELETE FROM instagram_conversations WHERE id = $1::uuid`, convId);
    });
  });

  describe('firstResponseAt — SLA stamping', () => {
    it('sets firstResponseAt on the first outbound message', async () => {
      if (!infra) return;

      const convId = await seedConversation(orgId, igAccountId, `${CONV_IG_ID}-sla1-${Date.now()}`, new Date());

      const res = await request(app)
        .post(`/api/v1/inbox/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${ownerToken()}`)
        .send({ content: { text: 'First reply!' } });

      expect(res.status).toBe(201);

      const [conv] = await prisma.$queryRawUnsafe<{ firstResponseAt: Date | null }[]>(
        `SELECT "firstResponseAt" FROM instagram_conversations WHERE id = $1::uuid`,
        convId,
      );
      expect(conv?.firstResponseAt).not.toBeNull();

      await prisma.$executeRawUnsafe(`DELETE FROM messages WHERE "conversationId" = $1::uuid`, convId);
      await prisma.$executeRawUnsafe(`DELETE FROM instagram_conversations WHERE id = $1::uuid`, convId);
    });
  });

  describe('firstResponseAt — SLA immutability', () => {
    it('does not update firstResponseAt on subsequent outbound messages', async () => {
      if (!infra) return;

      const convId = await seedConversation(orgId, igAccountId, `${CONV_IG_ID}-sla2-${Date.now()}`, new Date());

      // First send
      await request(app)
        .post(`/api/v1/inbox/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${ownerToken()}`)
        .send({ content: { text: 'First!' } });

      const [conv1] = await prisma.$queryRawUnsafe<{ firstResponseAt: Date | null }[]>(
        `SELECT "firstResponseAt" FROM instagram_conversations WHERE id = $1::uuid`,
        convId,
      );
      const firstStamp = conv1?.firstResponseAt;
      expect(firstStamp).not.toBeNull();

      // Short sleep to ensure a different timestamp would be generated
      await new Promise((r) => setTimeout(r, 10));

      // Second send
      await request(app)
        .post(`/api/v1/inbox/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${ownerToken()}`)
        .send({ content: { text: 'Second!' } });

      const [conv2] = await prisma.$queryRawUnsafe<{ firstResponseAt: Date | null }[]>(
        `SELECT "firstResponseAt" FROM instagram_conversations WHERE id = $1::uuid`,
        convId,
      );
      // firstResponseAt must equal the original stamp — not updated on second send
      expect(conv2?.firstResponseAt?.toISOString()).toBe(firstStamp?.toISOString());

      await prisma.$executeRawUnsafe(`DELETE FROM messages WHERE "conversationId" = $1::uuid`, convId);
      await prisma.$executeRawUnsafe(`DELETE FROM instagram_conversations WHERE id = $1::uuid`, convId);
    });
  });

  describe('OBS-1 — messaging window boundary', () => {
    it('returns 409 WINDOW_CLOSED when lastInboundAt is exactly 24h ago', async () => {
      if (!infra) return;

      const exactly24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const convId = await seedConversation(orgId, igAccountId, `${CONV_IG_ID}-obs1-boundary-${Date.now()}`, exactly24h);

      const res = await request(app)
        .post(`/api/v1/inbox/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${ownerToken()}`)
        .send({ content: { text: 'Boundary test' } });

      expect(res.status).toBe(409);
      expect(res.body.error?.code).toBe('WINDOW_CLOSED');

      await prisma.$executeRawUnsafe(`DELETE FROM instagram_conversations WHERE id = $1::uuid`, convId);
    });

    it('returns 201 when lastInboundAt is 23 hours ago (inside window)', async () => {
      if (!infra) return;

      const twentyThreeHoursAgo = new Date(Date.now() - 23 * 60 * 60 * 1000);
      const convId = await seedConversation(orgId, igAccountId, `${CONV_IG_ID}-obs1-inside-${Date.now()}`, twentyThreeHoursAgo);

      const res = await request(app)
        .post(`/api/v1/inbox/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${ownerToken()}`)
        .send({ content: { text: 'Inside window test' } });

      expect(res.status).toBe(201);

      await prisma.$executeRawUnsafe(`DELETE FROM messages WHERE "conversationId" = $1::uuid`, convId);
      await prisma.$executeRawUnsafe(`DELETE FROM instagram_conversations WHERE id = $1::uuid`, convId);
    });
  });

});

// ─── Per-account rate limiting (M4-GAP-1) ────────────────────────────────────
//
// These tests exercise checkAccountRateLimit() directly against a real Redis instance.
// They do not go through the HTTP/worker layer — they prove the rate-limit primitive works.

describe('Instagram Send — per-account rate limiting (checkAccountRateLimit)', () => {
  let rlRedis: IORedis;

  beforeAll(async () => {
    if (!infra) return;
    rlRedis = new IORedis(envModule.env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: false });
  });

  afterAll(async () => {
    if (!infra) return;
    await rlRedis.quit();
  });

  it('allows sends up to the configured rate limit max', async () => {
    if (!infra) return;

    const id = `rl-test-allow-${Date.now()}`;
    await rlRedis.del(rateLimitKey(id));

    for (let i = 0; i < INSTAGRAM_SEND_RATE_MAX; i++) {
      const allowed = await checkAccountRateLimit(id, rlRedis);
      expect(allowed).toBe(true);
    }
  });

  it('denies sends that exceed the rate limit max within the same window', async () => {
    if (!infra) return;

    const id = `rl-test-deny-${Date.now()}`;
    await rlRedis.del(rateLimitKey(id));

    // Exhaust the limit
    for (let i = 0; i < INSTAGRAM_SEND_RATE_MAX; i++) {
      await checkAccountRateLimit(id, rlRedis);
    }

    // One more call must be denied
    const denied = await checkAccountRateLimit(id, rlRedis);
    expect(denied).toBe(false);
  });

  it('allows sends again after the window expires', async () => {
    if (!infra) return;

    const id = `rl-test-reset-${Date.now()}`;
    const shortWindowMs = 150; // short window so the test completes quickly
    await rlRedis.del(rateLimitKey(id));

    // Exhaust limit with short window
    for (let i = 0; i < INSTAGRAM_SEND_RATE_MAX; i++) {
      await checkAccountRateLimit(id, rlRedis, INSTAGRAM_SEND_RATE_MAX, shortWindowMs);
    }

    // Verify denied within window
    const deniedMidWindow = await checkAccountRateLimit(id, rlRedis, INSTAGRAM_SEND_RATE_MAX, shortWindowMs);
    expect(deniedMidWindow).toBe(false);

    // Wait for window to expire
    await new Promise((r) => setTimeout(r, shortWindowMs + 50));

    // Counter should have expired — first call in new window is allowed
    const allowedAfterReset = await checkAccountRateLimit(id, rlRedis, INSTAGRAM_SEND_RATE_MAX, shortWindowMs);
    expect(allowedAfterReset).toBe(true);
  });

  it('rate limits each account independently (accounts do not share counters)', async () => {
    if (!infra) return;

    const idA = `rl-test-isolate-a-${Date.now()}`;
    const idB = `rl-test-isolate-b-${Date.now()}`;
    await rlRedis.del(rateLimitKey(idA));
    await rlRedis.del(rateLimitKey(idB));

    // Exhaust account A's limit
    for (let i = 0; i < INSTAGRAM_SEND_RATE_MAX; i++) {
      await checkAccountRateLimit(idA, rlRedis);
    }

    // Account A denied
    const aAllowed = await checkAccountRateLimit(idA, rlRedis);
    expect(aAllowed).toBe(false);

    // Account B is unaffected — first call must be allowed
    const bAllowed = await checkAccountRateLimit(idB, rlRedis);
    expect(bAllowed).toBe(true);
  });

  it('rate limit key has the expected format', () => {
    expect(rateLimitKey('abc-123')).toBe('rl:ig-send:abc-123');
  });

  it('default constants are defined and positive', () => {
    expect(INSTAGRAM_SEND_RATE_MAX).toBeGreaterThan(0);
    expect(INSTAGRAM_SEND_RATE_WINDOW_MS).toBeGreaterThan(0);
  });
});
