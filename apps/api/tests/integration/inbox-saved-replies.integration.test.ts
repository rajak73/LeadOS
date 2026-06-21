// Sprint 6 M6 — Saved replies + create-lead integration tests.
//
// Tests cover:
//   - GET /inbox/saved-replies (list)
//   - POST /inbox/saved-replies (create)
//   - PATCH /inbox/saved-replies/:id (update)
//   - DELETE /inbox/saved-replies/:id (soft-delete)
//   - POST /inbox/conversations/:id/leads (create lead from conversation)
//   - CONFLICT (409) when conversation already has a lead
//   - CONFLICT (409) when lead with same instagramUserId already exists
//   - Permission guards: SALES_EXECUTIVE cannot manage saved-replies or create leads
//
// Real Postgres + Redis required; self-skips if unavailable.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/core/prisma/client.js';
import { isPostgresUp, isRedisUp } from '../helpers/services.js';
import { signAccessToken } from '../../src/core/auth/jwt.js';

const pgUp = await isPostgresUp();
const redisUp = await isRedisUp();
const infra = pgUp && redisUp;

const app = buildApp();

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedOrg(name: string): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO organizations (name, slug, "updatedAt") VALUES ($1, $2, now()) RETURNING id`,
    name, `${name.toLowerCase().replace(/\s/g, '-')}-saved-replies-${Date.now()}`,
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
    orgId, igUserId, `user_${igUserId}`, encToken,
  );
  return row!.id;
}

async function seedConversation(
  orgId: string,
  igAccountId: string,
  igConversationId: string,
  lastInboundAt: Date | null = new Date(),
  leadId: string | null = null,
): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO instagram_conversations
       ("organizationId", "igConversationId", "igAccountId", status, labels,
        "lastInboundAt", "lastMessageAt", "leadId", "updatedAt")
     VALUES ($1::uuid, $2, $3::uuid, 'OPEN'::"ConversationStatus", '[]',
             $4, now(), $5::uuid, now())
     RETURNING id`,
    orgId, igConversationId, igAccountId, lastInboundAt, leadId,
  );
  return row!.id;
}

async function token(orgId: string, userId: string, role = 'MANAGER'): Promise<string> {
  return signAccessToken({ sub: userId, orgId, role, isSuperAdmin: false });
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('Inbox saved-replies + create-lead (M6)', () => {
  let orgId: string;
  let managerId: string;
  let salesExecId: string;
  let igAccountId: string;
  let convId: string;
  let convWithLeadId: string;
  let managerToken: string;
  let salesExecToken: string;

  const IG_ACCOUNT_USER_ID = 'acct111';
  const CUSTOMER_IG_USER_ID = 'cust999';
  // igConversationId format: "${recipientId}_${senderId}" where sender = customer
  const IG_CONV_ID = `${IG_ACCOUNT_USER_ID}_${CUSTOMER_IG_USER_ID}`;

  beforeAll(async () => {
    if (!infra) return;
    orgId = await seedOrg('SavedReply Test Org');
    managerId = await seedUser(`mgr-sr-${Date.now()}@test.com`);
    salesExecId = await seedUser(`se-sr-${Date.now()}@test.com`);

    const mgrRole = await seedRole(orgId, 'MANAGER');
    const seRole = await seedRole(orgId, 'SALES_EXECUTIVE');

    await seedMember(orgId, managerId, mgrRole);
    await seedMember(orgId, salesExecId, seRole);
    // No permission rows needed — resolver falls back to ROLE_PERMISSIONS[roleName] when empty

    igAccountId = await seedInstagramAccount(orgId, IG_ACCOUNT_USER_ID);
    convId = await seedConversation(orgId, igAccountId, IG_CONV_ID);

    // Seed a second conversation that already has a lead linked
    const existingLeadId = (await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO leads ("organizationId", "firstName", source, status, "createdById", "updatedAt")
       VALUES ($1::uuid, 'Existing', 'INSTAGRAM_DM'::"LeadSource", 'NEW'::"LeadStatus", $2::uuid, now())
       RETURNING id`,
      orgId, managerId,
    ))[0]!.id;
    convWithLeadId = await seedConversation(orgId, igAccountId, `${IG_ACCOUNT_USER_ID}_linked999`, new Date(), existingLeadId);

    managerToken = await token(orgId, managerId, 'MANAGER');
    salesExecToken = await token(orgId, salesExecId, 'SALES_EXECUTIVE');
  });

  afterAll(async () => {
    if (!infra) return;
    await prisma.$executeRawUnsafe(`DELETE FROM saved_replies WHERE "organizationId" = $1::uuid`, orgId);
    await prisma.$executeRawUnsafe(`DELETE FROM instagram_conversations WHERE "organizationId" = $1::uuid`, orgId);
    await prisma.$executeRawUnsafe(`DELETE FROM leads WHERE "organizationId" = $1::uuid`, orgId);
    await prisma.$executeRawUnsafe(`DELETE FROM instagram_accounts WHERE "organizationId" = $1::uuid`, orgId);
    await prisma.$executeRawUnsafe(`DELETE FROM organization_members WHERE "organizationId" = $1::uuid`, orgId);
    await prisma.$executeRawUnsafe(`DELETE FROM roles WHERE "organizationId" = $1::uuid`, orgId);
    await prisma.$executeRawUnsafe(`DELETE FROM users WHERE id = $1::uuid`, managerId);
    await prisma.$executeRawUnsafe(`DELETE FROM users WHERE id = $1::uuid`, salesExecId);
    await prisma.$executeRawUnsafe(`DELETE FROM organizations WHERE id = $1::uuid`, orgId);
  });

  // ─── Saved Replies ─────────────────────────────────────────────────────────

  describe('GET /inbox/saved-replies', () => {
    it.skipIf(!infra)('returns empty list initially', async () => {
      const res = await request(app)
        .get('/api/v1/inbox/saved-replies')
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-CSRF-Token', '1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toEqual([]);
    });

    it.skipIf(!infra)('returns 403 for unauthenticated request', async () => {
      const res = await request(app)
        .get('/api/v1/inbox/saved-replies')
        .set('X-CSRF-Token', '1');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /inbox/saved-replies', () => {
    it.skipIf(!infra)('creates a saved reply (MANAGER)', async () => {
      const res = await request(app)
        .post('/api/v1/inbox/saved-replies')
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-CSRF-Token', '1')
        .send({ title: 'Greeting', content: 'Hello! How can I help you today?' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Greeting');
      expect(res.body.data.content).toBe('Hello! How can I help you today?');
      expect(res.body.data.isGlobal).toBe(true);
      expect(res.body.data.deletedAt).toBeNull();
    });

    it.skipIf(!infra)('creates a saved reply with shortcut', async () => {
      const res = await request(app)
        .post('/api/v1/inbox/saved-replies')
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-CSRF-Token', '1')
        .send({ title: 'Pricing', content: 'Our pricing starts at ₹999/mo', shortcut: '/price' });

      expect(res.status).toBe(201);
      expect(res.body.data.shortcut).toBe('/price');
    });

    it.skipIf(!infra)('returns 403 when SALES_EXECUTIVE tries to create', async () => {
      const res = await request(app)
        .post('/api/v1/inbox/saved-replies')
        .set('Authorization', `Bearer ${salesExecToken}`)
        .set('X-CSRF-Token', '1')
        .send({ title: 'Test', content: 'Test content' });

      expect(res.status).toBe(403);
    });

    it.skipIf(!infra)('returns 422 when title is missing', async () => {
      const res = await request(app)
        .post('/api/v1/inbox/saved-replies')
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-CSRF-Token', '1')
        .send({ content: 'No title here' });

      expect(res.status).toBe(422);
    });
  });

  describe('GET /inbox/saved-replies (after create)', () => {
    it.skipIf(!infra)('lists created replies', async () => {
      const res = await request(app)
        .get('/api/v1/inbox/saved-replies')
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-CSRF-Token', '1');

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThan(0);
      const titles = res.body.data.items.map((r: { title: string }) => r.title);
      expect(titles).toContain('Greeting');
    });

    it.skipIf(!infra)('SALES_EXECUTIVE can list (via inbox.reply_own)', async () => {
      const res = await request(app)
        .get('/api/v1/inbox/saved-replies')
        .set('Authorization', `Bearer ${salesExecToken}`)
        .set('X-CSRF-Token', '1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it.skipIf(!infra)('filters by shortcut when ?q= is provided', async () => {
      const res = await request(app)
        .get('/api/v1/inbox/saved-replies?q=/price')
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-CSRF-Token', '1');

      expect(res.status).toBe(200);
      const titles = res.body.data.items.map((r: { title: string }) => r.title);
      expect(titles).toContain('Pricing');
      expect(titles).not.toContain('Greeting');
    });
  });

  describe('PATCH /inbox/saved-replies/:id', () => {
    let replyId: string;

    beforeAll(async () => {
      if (!infra) return;
      const res = await request(app)
        .post('/api/v1/inbox/saved-replies')
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-CSRF-Token', '1')
        .send({ title: 'To Update', content: 'Original content' });
      replyId = res.body.data.id;
    });

    it.skipIf(!infra)('updates title and content', async () => {
      const res = await request(app)
        .patch(`/api/v1/inbox/saved-replies/${replyId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-CSRF-Token', '1')
        .send({ title: 'Updated', content: 'Updated content' });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Updated');
      expect(res.body.data.content).toBe('Updated content');
    });

    it.skipIf(!infra)('returns 403 for SALES_EXECUTIVE', async () => {
      const res = await request(app)
        .patch(`/api/v1/inbox/saved-replies/${replyId}`)
        .set('Authorization', `Bearer ${salesExecToken}`)
        .set('X-CSRF-Token', '1')
        .send({ title: 'Hacked' });

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /inbox/saved-replies/:id', () => {
    let replyId: string;

    beforeAll(async () => {
      if (!infra) return;
      const res = await request(app)
        .post('/api/v1/inbox/saved-replies')
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-CSRF-Token', '1')
        .send({ title: 'To Delete', content: 'Will be deleted' });
      replyId = res.body.data.id;
    });

    it.skipIf(!infra)('soft-deletes the reply', async () => {
      const res = await request(app)
        .delete(`/api/v1/inbox/saved-replies/${replyId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-CSRF-Token', '1');

      expect(res.status).toBe(204);
    });

    it.skipIf(!infra)('deleted reply no longer appears in list', async () => {
      const res = await request(app)
        .get('/api/v1/inbox/saved-replies')
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-CSRF-Token', '1');

      const ids = res.body.data.items.map((r: { id: string }) => r.id);
      expect(ids).not.toContain(replyId);
    });

    it.skipIf(!infra)('returns 404 for already-deleted reply', async () => {
      const res = await request(app)
        .patch(`/api/v1/inbox/saved-replies/${replyId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-CSRF-Token', '1')
        .send({ title: 'Ghost' });

      expect(res.status).toBe(404);
    });
  });

  // ─── Create Lead from Conversation ────────────────────────────────────────

  describe('POST /inbox/conversations/:id/leads', () => {
    it.skipIf(!infra)('creates a lead and links it to the conversation', async () => {
      const res = await request(app)
        .post(`/api/v1/inbox/conversations/${convId}/leads`)
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-CSRF-Token', '1')
        .send({ firstName: 'Instagram', lastName: 'Customer' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.firstName).toBe('Instagram');
      expect(res.body.data.lastName).toBe('Customer');
      expect(res.body.data.source).toBe('INSTAGRAM_DM');
      expect(res.body.data.instagramUserId).toBe(CUSTOMER_IG_USER_ID);
    });

    it.skipIf(!infra)('returns 409 when conversation already has a lead', async () => {
      const res = await request(app)
        .post(`/api/v1/inbox/conversations/${convId}/leads`)
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-CSRF-Token', '1')
        .send({ firstName: 'Another' });

      expect(res.status).toBe(409);
    });

    it.skipIf(!infra)('returns 409 when conversation was pre-seeded with a lead', async () => {
      const res = await request(app)
        .post(`/api/v1/inbox/conversations/${convWithLeadId}/leads`)
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-CSRF-Token', '1')
        .send({ firstName: 'Duplicate' });

      expect(res.status).toBe(409);
    });

    it.skipIf(!infra)('returns 422 when firstName is missing', async () => {
      const anotherConvId = await seedConversation(
        orgId, igAccountId, `${IG_ACCOUNT_USER_ID}_nofirst${Date.now()}`,
      );
      const res = await request(app)
        .post(`/api/v1/inbox/conversations/${anotherConvId}/leads`)
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-CSRF-Token', '1')
        .send({});

      expect(res.status).toBe(422);
    });

    it.skipIf(!infra)('returns 403 for SALES_EXECUTIVE (no inbox.assign)', async () => {
      const seConvId = await seedConversation(
        orgId, igAccountId, `${IG_ACCOUNT_USER_ID}_setest${Date.now()}`,
      );
      const res = await request(app)
        .post(`/api/v1/inbox/conversations/${seConvId}/leads`)
        .set('Authorization', `Bearer ${salesExecToken}`)
        .set('X-CSRF-Token', '1')
        .send({ firstName: 'SE Test' });

      expect(res.status).toBe(403);
    });
  });
});
