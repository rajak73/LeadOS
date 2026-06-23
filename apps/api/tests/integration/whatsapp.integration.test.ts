// WhatsApp channel integration tests.
// Covers: Account management, templates sync, webhook verification and ingestion,
// and outbound sending behavior under SandboxWhatsAppAdapter.

import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/core/prisma/client.js';
import { isPostgresUp, isRedisUp } from '../helpers/services.js';
import { signAccessToken } from '../../src/core/auth/jwt.js';
import { processWebhookJob } from '../../src/core/queue/workers/webhook.worker.js';
import * as envModule from '../../src/core/config/env.js';

const pgUp = await isPostgresUp();
const redisUp = await isRedisUp();
const infra = pgUp && redisUp;

const app = buildApp();

// ─── Seed Helpers ────────────────────────────────────────────────────────────

async function seedOrg(name: string): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO organizations (name, slug, "updatedAt") VALUES ($1, $2, now()) RETURNING id`,
    name,
    `${name.toLowerCase().replace(/\s/g, '-')}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
    `INSERT INTO organization_members ("organizationId", "userId", "roleId", status, "updatedAt")
     VALUES ($1::uuid, $2::uuid, $3::uuid, 'ACTIVE', now())`,
    orgId,
    userId,
    roleId,
  );
}

async function seedWhatsAppAccount(
  orgId: string,
  wabaId: string,
  phoneNumberId: string,
): Promise<string> {
  const { encryptField } = await import('../../src/core/crypto/field-encryption.js');
  const encToken = encryptField('sandbox-wa-access-token');
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO whatsapp_accounts ("organizationId", "wabaId", "phoneNumberId", "displayName", "phoneNumber", "accessToken", status, "updatedAt")
     VALUES ($1::uuid, $2, $3, 'Test WhatsApp Business', '+15551234567', $4, 'ACTIVE'::"WhatsAppAccountStatus", now())
     RETURNING id`,
    orgId,
    wabaId,
    phoneNumberId,
    encToken,
  );
  return row!.id;
}

async function seedWhatsAppConversation(
  orgId: string,
  accountId: string,
  wabaConversationId: string,
  customerPhone: string,
  windowExpiresAt: Date | null,
): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO whatsapp_conversations ("organizationId", "accountId", "wabaConversationId", "customerPhone", status, "windowExpiresAt", "updatedAt")
     VALUES ($1::uuid, $2::uuid, $3, $4, 'OPEN'::"ConversationStatus", $5, now())
     RETURNING id`,
    orgId,
    accountId,
    wabaConversationId,
    customerPhone,
    windowExpiresAt,
  );
  return row!.id;
}

function signWhatsApp(body: Buffer, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function makeJob(webhookEventId: string): Parameters<typeof processWebhookJob>[0] {
  return {
    data: { webhookEventId, source: 'WHATSAPP' },
    opts: { attempts: 3 },
    attemptsMade: 0,
  } as Parameters<typeof processWebhookJob>[0];
}

// ─── State Variables ─────────────────────────────────────────────────────────

let orgId = '';
let ownerId = '';
let salesUserId = '';
let waAccountId = '';
const WABA_ID = 'waba-test-001';
const PHONE_NUMBER_ID = 'phone-id-test-001';
const CUSTOMER_PHONE = '+15558889999';

// ─── Setup / Teardown ────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!infra) return;

  orgId = await seedOrg('WhatsApp Test Org');
  ownerId = await seedUser(`wa-owner-${Date.now()}@test.com`);
  salesUserId = await seedUser(`wa-sales-${Date.now()}@test.com`);

  const ownerRole = await seedRole(orgId, 'OWNER');
  const salesRole = await seedRole(orgId, 'SALES_EXECUTIVE');

  await seedMember(orgId, ownerId, ownerRole);
  await seedMember(orgId, salesUserId, salesRole);

  // Setup starter subscription so plan limit checks pass
  await prisma.$executeRawUnsafe(
    `INSERT INTO subscriptions ("organizationId", plan, status, "updatedAt")
     VALUES ($1::uuid, 'STARTER', 'ACTIVE', now())`,
    orgId,
  );

  waAccountId = await seedWhatsAppAccount(orgId, WABA_ID, PHONE_NUMBER_ID);
});

afterAll(async () => {
  if (!infra) return;

  await prisma.$executeRawUnsafe(`DELETE FROM whatsapp_messages WHERE "organizationId" = $1::uuid`, orgId);
  await prisma.$executeRawUnsafe(`DELETE FROM whatsapp_templates WHERE "organizationId" = $1::uuid`, orgId);
  await prisma.$executeRawUnsafe(`DELETE FROM whatsapp_conversations WHERE "organizationId" = $1::uuid`, orgId);
  await prisma.$executeRawUnsafe(`DELETE FROM whatsapp_accounts WHERE "organizationId" = $1::uuid`, orgId);
  await prisma.$executeRawUnsafe(`DELETE FROM subscriptions WHERE "organizationId" = $1::uuid`, orgId);
  await prisma.$executeRawUnsafe(`DELETE FROM leads WHERE "organizationId" = $1::uuid`, orgId);
  await prisma.$executeRawUnsafe(`DELETE FROM organization_members WHERE "organizationId" = $1::uuid`, orgId);
  await prisma.$executeRawUnsafe(`DELETE FROM roles WHERE "organizationId" = $1::uuid`, orgId);
  await prisma.$executeRawUnsafe(`DELETE FROM organizations WHERE id = $1::uuid`, orgId);
  await prisma.$executeRawUnsafe(`DELETE FROM users WHERE id IN ($1::uuid, $2::uuid)`, ownerId, salesUserId);
  await prisma.$executeRawUnsafe(
    `DELETE FROM webhook_events WHERE source = 'WHATSAPP'`,
  );
});

// ─── Token Helpers ────────────────────────────────────────────────────────────

function ownerToken(): string {
  return signAccessToken({ sub: ownerId, orgId, role: 'OWNER', isSuperAdmin: false });
}

function salesToken(): string {
  return signAccessToken({ sub: salesUserId, orgId, role: 'SALES_EXECUTIVE', isSuperAdmin: false });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe.skipIf(!infra)('WhatsApp Module Integration Tests', () => {

  describe('Account Management', () => {
    it('allows owner to connect WABA account, lists accounts, and allows disconnect', async () => {
      // Temporarily change plan to GROWTH to allow multiple accounts
      await prisma.$executeRawUnsafe(
        `UPDATE subscriptions SET plan = 'GROWTH' WHERE "organizationId" = $1::uuid`,
        orgId,
      );

      const newPhoneId = `phone-id-new-${Date.now()}`;
      const connectData = {
        wabaId: `waba-new-${Date.now()}`,
        phoneNumberId: newPhoneId,
        displayName: 'Secondary Support Line',
        phoneNumber: '+15557778888',
        accessToken: 'my-meta-secret-token',
      };

      // Connect Account
      const connectRes = await request(app)
        .post('/api/v1/whatsapp/accounts')
        .set('Authorization', `Bearer ${ownerToken()}`)
        .send(connectData);

      expect(connectRes.status).toBe(201);
      expect(connectRes.body.data).toMatchObject({
        phoneNumberId: connectData.phoneNumberId,
        displayName: connectData.displayName,
        phoneNumber: connectData.phoneNumber,
        status: 'ACTIVE',
      });
      expect(connectRes.body.data.accessToken).toBeUndefined(); // Verify token stripped

      const newlyCreatedId = connectRes.body.data.id;

      // List Accounts
      const listRes = await request(app)
        .get('/api/v1/whatsapp/accounts')
        .set('Authorization', `Bearer ${ownerToken()}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.some((acc: any) => acc.id === newlyCreatedId)).toBe(true);

      // Disconnect Account (soft-delete)
      const disconnectRes = await request(app)
        .delete(`/api/v1/whatsapp/accounts/${newlyCreatedId}`)
        .set('Authorization', `Bearer ${ownerToken()}`);

      expect(disconnectRes.status).toBe(204);

      // Verify soft-deleted account does not appear in active list
      const listAfterRes = await request(app)
        .get('/api/v1/whatsapp/accounts')
        .set('Authorization', `Bearer ${ownerToken()}`);

      expect(listAfterRes.body.data.some((acc: any) => acc.id === newlyCreatedId)).toBe(false);

      // Revert subscription back to STARTER
      await prisma.$executeRawUnsafe(
        `UPDATE subscriptions SET plan = 'STARTER' WHERE "organizationId" = $1::uuid`,
        orgId,
      );
    });

    it('blocks connection if limits exceeded', async () => {
      // Connect second account (limit is 1 for STARTER plan)
      const connectData = {
        wabaId: 'waba-limit-test',
        phoneNumberId: 'phone-limit-test',
        displayName: 'Limit Line',
        phoneNumber: '+15557778999',
        accessToken: 'another-token',
      };

      const res = await request(app)
        .post('/api/v1/whatsapp/accounts')
        .set('Authorization', `Bearer ${ownerToken()}`)
        .send(connectData);

      expect(res.status).toBe(402);
      expect(res.body.error.code).toBe('PLAN_LIMIT_EXCEEDED');
    });

    it('blocks non-owner from managing accounts', async () => {
      const res = await request(app)
        .get('/api/v1/whatsapp/accounts')
        .set('Authorization', `Bearer ${salesToken()}`);

      expect(res.status).toBe(403);
    });
  });

  describe('Webhook Ingestion & Inbound Flow', () => {
    it('GET verifies challenge with correct token', async () => {
      const res = await request(app)
        .get('/api/webhooks/whatsapp')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'test-wa-verify-token',
          'hub.challenge': '12345challenge',
        });

      expect(res.status).toBe(200);
      expect(res.text).toBe('12345challenge');
    });

    it('POST rejects invalid signature', async () => {
      const payloadStr = JSON.stringify({ object: 'whatsapp_business_account' });
      const res = await request(app)
        .post('/api/webhooks/whatsapp')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', 'sha256=invalid-signature-value')
        .send(payloadStr);

      expect(res.status).toBe(400);
    });

    it('POST accepts valid signature and creates conversation + message', async () => {
      const waMessageId = `wa-msg-${Date.now()}`;
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: WABA_ID,
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '15551234567',
                    phone_number_id: PHONE_NUMBER_ID,
                  },
                  contacts: [
                    {
                      profile: { name: 'WhatsApp User' },
                      wa_id: CUSTOMER_PHONE,
                    },
                  ],
                  messages: [
                    {
                      from: CUSTOMER_PHONE,
                      id: waMessageId,
                      timestamp: Math.floor(Date.now() / 1000).toString(),
                      text: { body: 'Hello world from WhatsApp' },
                      type: 'text',
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const payloadStr = JSON.stringify(payload);
      const signature = signWhatsApp(Buffer.from(payloadStr), envModule.env.META_APP_SECRET);

      const res = await request(app)
        .post('/api/webhooks/whatsapp')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', signature)
        .send(payloadStr);

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);

      // Webhook event is created and enqueued. Find it in database
      const event = await prisma.webhookEvent.findFirst({
        where: { source: 'WHATSAPP', status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      });
      expect(event).not.toBeNull();

      // Process the worker job synchronously
      await processWebhookJob(makeJob(event!.id));

      // Assert conversation created
      const conv = await prisma.whatsAppConversation.findFirst({
        where: { accountId: waAccountId, customerPhone: CUSTOMER_PHONE },
      });
      expect(conv).not.toBeNull();
      expect(conv!.windowExpiresAt).not.toBeNull();
      // Enforce 24h window update
      expect(conv!.windowExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);

      // Assert message created
      const msg = await prisma.whatsAppMessage.findUnique({
        where: { waMessageId },
      });
      expect(msg).not.toBeNull();
      expect(msg!.direction).toBe('INBOUND');
      expect(msg!.contentType).toBe('TEXT');
      expect(msg!.content).toMatchObject({ text: 'Hello world from WhatsApp' });

      // Assert lead created
      const lead = await prisma.lead.findFirst({
        where: { phone: CUSTOMER_PHONE, organizationId: orgId },
      });
      expect(lead).not.toBeNull();
      expect(lead!.source).toBe('WHATSAPP');
    });
  });

  describe('Outbound Send Flow', () => {
    it('blocks free-form text when 24h window is closed/expired', async () => {
      // Create a conversation with an expired window
      const expiredWindow = new Date(Date.now() - 1000);
      const expiredConvId = await seedWhatsAppConversation(
        orgId,
        waAccountId,
        `expired-conv-${Date.now()}`,
        '+15559998888',
        expiredWindow,
      );

      const res = await request(app)
        .post('/api/v1/whatsapp/send')
        .set('Authorization', `Bearer ${ownerToken()}`)
        .send({
          conversationId: expiredConvId,
          accountId: waAccountId,
          text: 'This should fail',
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('allows free-form text when 24h window is open', async () => {
      // Create a conversation with active window
      const activeWindow = new Date(Date.now() + 10 * 60 * 1000);
      const activeConvId = await seedWhatsAppConversation(
        orgId,
        waAccountId,
        `active-conv-${Date.now()}`,
        '+15559997777',
        activeWindow,
      );

      const res = await request(app)
        .post('/api/v1/whatsapp/send')
        .set('Authorization', `Bearer ${ownerToken()}`)
        .send({
          conversationId: activeConvId,
          accountId: waAccountId,
          text: 'This should succeed',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('SENT');
      expect(res.body.data.waMessageId).toBeDefined();
    });

    it('allows template sending even if 24h window is expired/closed', async () => {
      const expiredWindow = new Date(Date.now() - 1000);
      const expiredConvId = await seedWhatsAppConversation(
        orgId,
        waAccountId,
        `expired-conv-template-${Date.now()}`,
        '+15559996666',
        expiredWindow,
      );

      const res = await request(app)
        .post('/api/v1/whatsapp/send')
        .set('Authorization', `Bearer ${ownerToken()}`)
        .send({
          conversationId: expiredConvId,
          accountId: waAccountId,
          templateName: 'hello_world',
          templateLanguage: 'en',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('SENT');
    });
  });
});
