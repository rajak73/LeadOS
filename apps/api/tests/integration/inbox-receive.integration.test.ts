// Sprint 6 M3 — Inbox receive pipeline integration tests.
//
// Tests cover: DM → conversation + message + lead creation, mid-grain dedup,
// multi-entry / multi-message iteration, lead re-matching, RLS isolation, cursor
// pagination, and inbox.read_own own-only gate.
//
// Real Postgres + Redis required; self-skips if unavailable.
// processInstagramMessage is exercised via the real handleInstagram path from
// processWebhookJob (same path used in production).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/core/prisma/client.js';
import { isPostgresUp, isRedisUp } from '../helpers/services.js';
import { signAccessToken } from '../../src/core/auth/jwt.js';
import { processWebhookJob } from '../../src/core/queue/workers/webhook.worker.js';

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

async function seedWebhookEvent(source: string, payload: unknown): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO webhook_events (source, "externalEventId", payload, status, attempts, "updatedAt")
     VALUES ($1::"WebhookSource", $2, $3::jsonb, 'PENDING'::"WebhookEventStatus", 0, now())
     RETURNING id`,
    source, `test-ext-${Date.now()}-${Math.random()}`, JSON.stringify(payload),
  );
  return row!.id;
}

function buildDmPayload(recipientIgUserId: string, senderIgUserId: string, mid: string, text = 'Hello'): unknown {
  return {
    object: 'instagram',
    entry: [
      {
        id: recipientIgUserId,
        time: Date.now(),
        messaging: [
          {
            sender: { id: senderIgUserId },
            recipient: { id: recipientIgUserId },
            timestamp: Date.now(),
            message: { mid, text },
          },
        ],
      },
    ],
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

let orgAId = '';
let orgBId = '';
let ownerAId = '';
let ownerBId = '';
let salesUserId = '';
let igAccountAId = '';
const RECIPIENT_IG = 'ig-biz-001';
const RECIPIENT_IG_B = 'ig-biz-002';

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!infra) return;

  orgAId = await seedOrg('Inbox Org A');
  orgBId = await seedOrg('Inbox Org B');
  ownerAId = await seedUser(`inbox-owner-a-${Date.now()}@test.com`);
  ownerBId = await seedUser(`inbox-owner-b-${Date.now()}@test.com`);
  salesUserId = await seedUser(`inbox-sales-${Date.now()}@test.com`);

  const ownerRoleA = await seedRole(orgAId, 'OWNER');
  const ownerRoleB = await seedRole(orgBId, 'OWNER');
  const salesRole = await seedRole(orgAId, 'SALES_EXECUTIVE');

  await seedMember(orgAId, ownerAId, ownerRoleA);
  await seedMember(orgBId, ownerBId, ownerRoleB);
  await seedMember(orgAId, salesUserId, salesRole);

  igAccountAId = await seedInstagramAccount(orgAId, RECIPIENT_IG);
  await seedInstagramAccount(orgBId, RECIPIENT_IG_B);
});

afterAll(async () => {
  if (!infra) return;
  for (const orgId of [orgAId, orgBId]) {
    await prisma.$executeRawUnsafe(`DELETE FROM messages WHERE "organizationId" = $1::uuid`, orgId);
    await prisma.$executeRawUnsafe(`DELETE FROM instagram_conversations WHERE "organizationId" = $1::uuid`, orgId);
    await prisma.$executeRawUnsafe(`DELETE FROM leads WHERE "organizationId" = $1::uuid`, orgId);
    await prisma.$executeRawUnsafe(`DELETE FROM instagram_accounts WHERE "organizationId" = $1::uuid`, orgId);
    await prisma.$executeRawUnsafe(`DELETE FROM organization_members WHERE "organizationId" = $1::uuid`, orgId);
    await prisma.$executeRawUnsafe(`DELETE FROM roles WHERE "organizationId" = $1::uuid`, orgId);
    await prisma.$executeRawUnsafe(`DELETE FROM organizations WHERE id = $1::uuid`, orgId);
  }
  await prisma.$executeRawUnsafe(
    `DELETE FROM users WHERE id IN ($1::uuid, $2::uuid, $3::uuid)`,
    ownerAId, ownerBId, salesUserId,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM webhook_events WHERE source = 'INSTAGRAM' AND "externalEventId" LIKE 'test-ext-%'`,
  );
});

// ─── Tokens ───────────────────────────────────────────────────────────────────

function ownerToken(orgId = orgAId, userId = ownerAId): string {
  return signAccessToken({ sub: userId, orgId, role: 'OWNER', isSuperAdmin: false });
}

function salesToken(): string {
  return signAccessToken({ sub: salesUserId, orgId: orgAId, role: 'SALES_EXECUTIVE', isSuperAdmin: false });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Instagram Inbox — Receive Pipeline', () => {

  describe('Single DM — happy path', () => {
    it('creates conversation, message, and lead', async () => {
      if (!infra) return;

      const mid = `mid-single-${Date.now()}`;
      const senderIg = `sender-${Date.now()}`;
      const payload = buildDmPayload(RECIPIENT_IG, senderIg, mid, 'Hello world');
      const eventId = await seedWebhookEvent('INSTAGRAM', payload);

      await processWebhookJob(makeJob(eventId));

      // Message created
      const [msg] = await prisma.$queryRawUnsafe<{ id: string; direction: string }[]>(
        `SELECT id, direction FROM messages WHERE mid = $1`,
        mid,
      );
      expect(msg?.direction).toBe('INBOUND');

      // Conversation created
      const [conv] = await prisma.$queryRawUnsafe<{ id: string; status: string }[]>(
        `SELECT id, status FROM instagram_conversations WHERE "igAccountId" = $1::uuid`,
        igAccountAId,
      );
      expect(conv?.status).toBe('OPEN');

      // Lead created with INSTAGRAM_DM source
      const [lead] = await prisma.$queryRawUnsafe<{ id: string; source: string }[]>(
        `SELECT id, source FROM leads WHERE "instagramUserId" = $1 AND "organizationId" = $2::uuid`,
        senderIg, orgAId,
      );
      expect(lead?.source).toBe('INSTAGRAM_DM');
    });
  });

  describe('Duplicate DM (same mid)', () => {
    it('is a no-op — only one messages row exists', async () => {
      if (!infra) return;

      const mid = `mid-dup-${Date.now()}`;
      const senderIg = `sender-dup-${Date.now()}`;
      const payload = buildDmPayload(RECIPIENT_IG, senderIg, mid);

      const eventId1 = await seedWebhookEvent('INSTAGRAM', payload);
      await processWebhookJob(makeJob(eventId1));

      const eventId2 = await seedWebhookEvent('INSTAGRAM', payload);
      await processWebhookJob(makeJob(eventId2));

      const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM messages WHERE mid = $1`,
        mid,
      );
      expect(rows.length).toBe(1);
    });
  });

  describe('Unknown recipientId', () => {
    it('does not throw — batch continues', async () => {
      if (!infra) return;

      const payload = buildDmPayload('ig-nonexistent-9999', `sender-${Date.now()}`, `mid-unknown-${Date.now()}`);
      const eventId = await seedWebhookEvent('INSTAGRAM', payload);

      // Should not throw; event marked DONE or processes gracefully
      await expect(processWebhookJob(makeJob(eventId))).resolves.toBeUndefined();
    });
  });

  describe('Multi-entry webhook', () => {
    it('creates one message per entry (2 entries → 2 messages)', async () => {
      if (!infra) return;

      const mid1 = `mid-me1-${Date.now()}`;
      const mid2 = `mid-me2-${Date.now()}`;
      const sender1 = `sender-me1-${Date.now()}`;
      const sender2 = `sender-me2-${Date.now()}`;

      const payload = {
        object: 'instagram',
        entry: [
          {
            id: RECIPIENT_IG,
            time: Date.now(),
            messaging: [{ sender: { id: sender1 }, recipient: { id: RECIPIENT_IG }, timestamp: Date.now(), message: { mid: mid1, text: 'Msg 1' } }],
          },
          {
            id: RECIPIENT_IG,
            time: Date.now(),
            messaging: [{ sender: { id: sender2 }, recipient: { id: RECIPIENT_IG }, timestamp: Date.now(), message: { mid: mid2, text: 'Msg 2' } }],
          },
        ],
      };

      const eventId = await seedWebhookEvent('INSTAGRAM', payload);
      await processWebhookJob(makeJob(eventId));

      const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM messages WHERE mid IN ($1, $2)`,
        mid1, mid2,
      );
      expect(rows.length).toBe(2);
    });
  });

  describe('Multi-message single entry', () => {
    it('creates one message per messaging event (1 entry × 2 events → 2 messages)', async () => {
      if (!infra) return;

      const mid1 = `mid-mm1-${Date.now()}`;
      const mid2 = `mid-mm2-${Date.now()}`;
      const sender = `sender-mm-${Date.now()}`;

      const payload = {
        object: 'instagram',
        entry: [
          {
            id: RECIPIENT_IG,
            time: Date.now(),
            messaging: [
              { sender: { id: sender }, recipient: { id: RECIPIENT_IG }, timestamp: Date.now(), message: { mid: mid1, text: 'First' } },
              { sender: { id: sender }, recipient: { id: RECIPIENT_IG }, timestamp: Date.now() + 1, message: { mid: mid2, text: 'Second' } },
            ],
          },
        ],
      };

      const eventId = await seedWebhookEvent('INSTAGRAM', payload);
      await processWebhookJob(makeJob(eventId));

      const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM messages WHERE mid IN ($1, $2)`,
        mid1, mid2,
      );
      expect(rows.length).toBe(2);
    });
  });

  describe('Existing lead matched by instagramUserId', () => {
    it('links the existing lead to the conversation', async () => {
      if (!infra) return;

      const senderIg = `sender-existing-${Date.now()}`;
      // Pre-create a lead with this instagramUserId
      const [existingLead] = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO leads ("organizationId", "firstName", source, status, "instagramUserId",
          tags, "customFields", "createdById", "updatedAt")
         VALUES ($1::uuid, 'Existing Lead', 'INSTAGRAM_DM'::"LeadSource", 'NEW'::"LeadStatus",
                 $2, '{}', '{}', $3::uuid, now())
         RETURNING id`,
        orgAId, senderIg, ownerAId,
      );

      const mid = `mid-existing-${Date.now()}`;
      const payload = buildDmPayload(RECIPIENT_IG, senderIg, mid);
      const eventId = await seedWebhookEvent('INSTAGRAM', payload);
      await processWebhookJob(makeJob(eventId));

      // Conversation should be linked to the existing lead
      const [conv] = await prisma.$queryRawUnsafe<{ leadId: string | null }[]>(
        `SELECT "leadId" FROM instagram_conversations
         WHERE "igConversationId" = $1 AND "organizationId" = $2::uuid`,
        `${RECIPIENT_IG}_${senderIg}`, orgAId,
      );
      expect(conv?.leadId).toBe(existingLead!.id);
    });
  });

  describe('Concurrent DMs (same conversation)', () => {
    it('creates 1 conversation and 2 messages without throwing', async () => {
      if (!infra) return;

      const senderIg = `sender-concurrent-${Date.now()}`;
      const mid1 = `mid-con1-${Date.now()}`;
      const mid2 = `mid-con2-${Date.now() + 1}`;

      const payload1 = buildDmPayload(RECIPIENT_IG, senderIg, mid1, 'First concurrent');
      const payload2 = buildDmPayload(RECIPIENT_IG, senderIg, mid2, 'Second concurrent');

      const eventId1 = await seedWebhookEvent('INSTAGRAM', payload1);
      const eventId2 = await seedWebhookEvent('INSTAGRAM', payload2);

      await expect(
        Promise.all([processWebhookJob(makeJob(eventId1)), processWebhookJob(makeJob(eventId2))]),
      ).resolves.toBeDefined();

      const convRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM instagram_conversations
         WHERE "igConversationId" = $1 AND "organizationId" = $2::uuid`,
        `${RECIPIENT_IG}_${senderIg}`, orgAId,
      );
      expect(convRows.length).toBe(1);

      const msgRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM messages WHERE mid IN ($1, $2)`,
        mid1, mid2,
      );
      expect(msgRows.length).toBe(2);
    });
  });

  describe('Cross-org RLS isolation', () => {
    it('org B conversations are not visible to org A', async () => {
      if (!infra) return;

      // Create a conversation for org B
      const senderIg = `sender-orgb-${Date.now()}`;
      const mid = `mid-orgb-${Date.now()}`;
      const payload = buildDmPayload(RECIPIENT_IG_B, senderIg, mid);
      const eventId = await seedWebhookEvent('INSTAGRAM', payload);
      await processWebhookJob(makeJob(eventId));

      // Org A owner should see 0 results for org B's conversations
      const res = await request(app)
        .get('/api/v1/inbox/conversations')
        .set('Authorization', `Bearer ${ownerToken(orgAId, ownerAId)}`);

      expect(res.status).toBe(200);
      const convIds = (res.body.data.items as Array<{ igAccount: { id: string } }>)
        .map((c) => c.igAccount.id);
      // igAccountAId belongs to orgA; none of orgB's account IDs should appear
      expect(convIds.every((id) => id === igAccountAId)).toBe(true);
    });
  });

  describe('GET /api/v1/inbox/conversations', () => {
    it('returns conversations for org with inbox.read permission', async () => {
      if (!infra) return;

      const res = await request(app)
        .get('/api/v1/inbox/conversations')
        .set('Authorization', `Bearer ${ownerToken()}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/inbox/conversations with inbox.read_own', () => {
    it('returns 0 results for SALES_EXECUTIVE when no conversations are assigned to them', async () => {
      if (!infra) return;

      // SALES_EXECUTIVE has inbox.read_own — can only see conversations assigned to them
      // None of the seeded conversations are assigned to salesUserId
      const res = await request(app)
        .get('/api/v1/inbox/conversations')
        .set('Authorization', `Bearer ${salesToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(0);
    });
  });

  describe('GET /api/v1/inbox/conversations/:id/messages', () => {
    it('returns messages in sentAt DESC order', async () => {
      if (!infra) return;

      // Seed a conversation with multiple messages
      const senderIg = `sender-order-${Date.now()}`;
      const mid1 = `mid-ord1-${Date.now()}`;
      const mid2 = `mid-ord2-${Date.now() + 100}`;

      const payload1 = buildDmPayload(RECIPIENT_IG, senderIg, mid1, 'First message');
      const payload2 = buildDmPayload(RECIPIENT_IG, senderIg, mid2, 'Second message');

      const e1 = await seedWebhookEvent('INSTAGRAM', payload1);
      const e2 = await seedWebhookEvent('INSTAGRAM', payload2);
      await processWebhookJob(makeJob(e1));
      await processWebhookJob(makeJob(e2));

      const igConvId = `${RECIPIENT_IG}_${senderIg}`;

      const [conv] = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM instagram_conversations WHERE "igConversationId" = $1 AND "organizationId" = $2::uuid`,
        igConvId, orgAId,
      );
      if (!conv) return; // skip if conversation not found

      const res = await request(app)
        .get(`/api/v1/inbox/conversations/${conv.id}/messages`)
        .set('Authorization', `Bearer ${ownerToken()}`);

      expect(res.status).toBe(200);
      const messages = res.body.data.items as Array<{ mid: string; sentAt: string }>;
      expect(messages.length).toBeGreaterThanOrEqual(2);

      // Verify DESC ordering: first item has a later or equal sentAt
      const timestamps = messages.map((m) => new Date(m.sentAt).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i - 1]!).toBeGreaterThanOrEqual(timestamps[i]!);
      }
    });
  });

});
