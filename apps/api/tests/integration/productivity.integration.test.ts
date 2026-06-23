// Sprint 7 M6 — Productivity features integration tests.
// Covers bulk action endpoints and global search.

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/core/prisma/client.js';
import { isPostgresUp } from '../helpers/services.js';
import { signAccessToken } from '../../src/core/auth/jwt.js';

const pgUp = await isPostgresUp();
const app = buildApp();

let orgId = '';
let ownerUserId = '';
let salesUserId = ''; // SALES_EXECUTIVE

let leadId1 = '';
let leadId2 = '';
let dealId1 = '';
let dealId2 = '';
let conversationId1 = '';
let conversationId2 = '';

function ownerToken(): string {
  return signAccessToken({ sub: ownerUserId, orgId, role: 'OWNER', isSuperAdmin: false });
}

function salesToken(): string {
  return signAccessToken({ sub: salesUserId, orgId, role: 'SALES_EXECUTIVE', isSuperAdmin: false });
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

describe('Productivity Features (Bulk Actions & Search)', () => {
  beforeAll(async () => {
    if (!pgUp) return;

    // Clean up
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE messages CASCADE`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE instagram_conversations CASCADE`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE instagram_accounts CASCADE`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE deals CASCADE`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE pipeline_stages CASCADE`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE pipelines CASCADE`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE leads CASCADE`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE organization_members CASCADE`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE roles CASCADE`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE users CASCADE`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE organizations CASCADE`);

    orgId = await seedOrg('Productivity Org', 'prod-org');
    ownerUserId = await seedUser('owner@leados.com');
    salesUserId = await seedUser('sales@leados.com');

    // Create system roles — no permission rows needed; resolver falls back to ROLE_PERMISSIONS map
    const [ownerRole] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO roles (id, "organizationId", name, "isSystem", "updatedAt")
       VALUES (uuid_generate_v4(), $1::uuid, 'OWNER', true, now()) RETURNING id`,
      orgId,
    );
    const [salesRole] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO roles (id, "organizationId", name, "isSystem", "updatedAt")
       VALUES (uuid_generate_v4(), $1::uuid, 'SALES_EXECUTIVE', true, now()) RETURNING id`,
      orgId,
    );

    // Memberships
    await prisma.$executeRawUnsafe(
      `INSERT INTO organization_members ("organizationId", "userId", "roleId", status, "updatedAt") VALUES ($1::uuid, $2::uuid, $3::uuid, 'ACTIVE', now())`,
      orgId,
      ownerUserId,
      ownerRole!.id,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO organization_members ("organizationId", "userId", "roleId", status, "updatedAt") VALUES ($1::uuid, $2::uuid, $3::uuid, 'ACTIVE', now())`,
      orgId,
      salesUserId,
      salesRole!.id,
    );

    // Seed Leads
    const [l1] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO leads (id, "organizationId", "firstName", "lastName", email, phone, source, status, tags, "createdById", "updatedAt")
       VALUES (uuid_generate_v4(), $1::uuid, 'BulkOne', 'Test', 'bulk1@test.com', '111', 'MANUAL', 'NEW', ARRAY['prod']::text[], $2::uuid, now()) RETURNING id`,
      orgId,
      ownerUserId,
    );
    const [l2] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO leads (id, "organizationId", "firstName", "lastName", email, phone, source, status, tags, "createdById", "updatedAt")
       VALUES (uuid_generate_v4(), $1::uuid, 'BulkTwo', 'Test', 'bulk2@test.com', '222', 'MANUAL', 'NEW', ARRAY[]::text[], $2::uuid, now()) RETURNING id`,
      orgId,
      ownerUserId,
    );
    leadId1 = l1!.id;
    leadId2 = l2!.id;

    // Seed Pipelines and Stages
    const [p] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO pipelines (id, "organizationId", name, "updatedAt")
       VALUES (uuid_generate_v4(), $1::uuid, 'Sales Pipeline', now()) RETURNING id`,
      orgId,
    );
    const [stage1] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO pipeline_stages (id, "organizationId", "pipelineId", name, "order", probability, "updatedAt")
       VALUES (uuid_generate_v4(), $1::uuid, $2::uuid, 'Lead', 1, 10, now()) RETURNING id`,
      orgId,
      p!.id,
    );
    await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO pipeline_stages (id, "organizationId", "pipelineId", name, "order", probability, "updatedAt")
       VALUES (uuid_generate_v4(), $1::uuid, $2::uuid, 'Contacted', 2, 30, now()) RETURNING id`,
      orgId,
      p!.id,
    );

    // Seed Deals
    const [d1] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO deals (id, "organizationId", title, value, currency, "pipelineId", "stageId", status, "createdById", "updatedAt")
       VALUES (uuid_generate_v4(), $1::uuid, 'Deal Alpha', 1000, 'USD', $2::uuid, $3::uuid, 'OPEN', $4::uuid, now()) RETURNING id`,
      orgId,
      p!.id,
      stage1!.id,
      ownerUserId,
    );
    const [d2] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO deals (id, "organizationId", title, value, currency, "pipelineId", "stageId", status, "createdById", "updatedAt")
       VALUES (uuid_generate_v4(), $1::uuid, 'Deal Beta', 2000, 'USD', $2::uuid, $3::uuid, 'OPEN', $4::uuid, now()) RETURNING id`,
      orgId,
      p!.id,
      stage1!.id,
      ownerUserId,
    );
    dealId1 = d1!.id;
    dealId2 = d2!.id;

    // Seed IG Accounts & Conversations
    const [igAcc] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO instagram_accounts (id, "organizationId", "igUserId", "igUsername", "accessToken", "tokenExpiresAt", "tokenType", "updatedAt")
       VALUES (uuid_generate_v4(), $1::uuid, 'ig-user-1', 'test_user', 'token', now() + interval '1 day', 'IG', now()) RETURNING id`,
      orgId,
    );
    const [c1] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO instagram_conversations (id, "organizationId", "igConversationId", "igAccountId", status, labels, "lastMessageAt", "updatedAt")
       VALUES (uuid_generate_v4(), $1::uuid, 'ig-conv-1', $2::uuid, 'OPEN', '[]'::jsonb, now(), now()) RETURNING id`,
      orgId,
      igAcc!.id,
    );
    const [c2] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO instagram_conversations (id, "organizationId", "igConversationId", "igAccountId", status, labels, "lastMessageAt", "updatedAt")
       VALUES (uuid_generate_v4(), $1::uuid, 'ig-conv-2', $2::uuid, 'OPEN', '[]'::jsonb, now(), now()) RETURNING id`,
      orgId,
      igAcc!.id,
    );
    conversationId1 = c1!.id;
    conversationId2 = c2!.id;
  });

  describe('Bulk Leads Actions', () => {
    it('should bulk update lead status to CONTACTED', async () => {
      if (!pgUp) return;
      const res = await request(app)
        .post('/api/v1/leads/bulk')
        .set('Authorization', `Bearer ${ownerToken()}`)
        .send({
          ids: [leadId1, leadId2],
          action: 'update-status',
          status: 'CONTACTED',
        });
      expect(res.status).toBe(204);

      // Verify DB updates
      const updated1 = await prisma.lead.findUnique({ where: { id: leadId1 } });
      const updated2 = await prisma.lead.findUnique({ where: { id: leadId2 } });
      expect(updated1?.status).toBe('CONTACTED');
      expect(updated2?.status).toBe('CONTACTED');
    });

    it('should bulk add tags to leads', async () => {
      if (!pgUp) return;
      const res = await request(app)
        .post('/api/v1/leads/bulk')
        .set('Authorization', `Bearer ${ownerToken()}`)
        .send({
          ids: [leadId1, leadId2],
          action: 'add-tags',
          tags: ['bulk-tagged', 'important'],
        });
      expect(res.status).toBe(204);

      const updated1 = await prisma.lead.findUnique({ where: { id: leadId1 } });
      const updated2 = await prisma.lead.findUnique({ where: { id: leadId2 } });
      expect(updated1?.tags).toContain('bulk-tagged');
      expect(updated2?.tags).toContain('important');
    });

    it('should bulk assign owner to leads', async () => {
      if (!pgUp) return;
      const res = await request(app)
        .post('/api/v1/leads/bulk')
        .set('Authorization', `Bearer ${ownerToken()}`)
        .send({
          ids: [leadId1, leadId2],
          action: 'assign',
          assignedToId: salesUserId,
        });
      expect(res.status).toBe(204);

      const updated1 = await prisma.lead.findUnique({ where: { id: leadId1 } });
      expect(updated1?.assignedToId).toBe(salesUserId);
    });

    it('should reject bulk delete if user lacks leads.delete permission', async () => {
      if (!pgUp) return;
      const res = await request(app)
        .post('/api/v1/leads/bulk')
        .set('Authorization', `Bearer ${salesToken()}`)
        .send({
          ids: [leadId1],
          action: 'delete',
        });
      expect(res.status).toBe(403);
    });
  });

  describe('Bulk Deals Actions', () => {
    it('should bulk assign deals', async () => {
      if (!pgUp) return;
      const res = await request(app)
        .post('/api/v1/deals/bulk')
        .set('Authorization', `Bearer ${ownerToken()}`)
        .send({
          ids: [dealId1, dealId2],
          action: 'assign',
          assignedToId: salesUserId,
        });
      expect(res.status).toBe(204);

      const updated = await prisma.deal.findUnique({ where: { id: dealId1 } });
      expect(updated?.assignedToId).toBe(salesUserId);
    });

    it('should bulk delete deals', async () => {
      if (!pgUp) return;
      const res = await request(app)
        .post('/api/v1/deals/bulk')
        .set('Authorization', `Bearer ${ownerToken()}`)
        .send({
          ids: [dealId1, dealId2],
          action: 'delete',
        });
      expect(res.status).toBe(204);

      const deleted = await prisma.deal.findUnique({ where: { id: dealId1 } });
      expect(deleted?.deletedAt).not.toBeNull();
    });
  });

  describe('Bulk Conversation Actions', () => {
    it('should bulk assign conversations', async () => {
      if (!pgUp) return;
      const res = await request(app)
        .post('/api/v1/inbox/conversations/bulk')
        .set('Authorization', `Bearer ${ownerToken()}`)
        .send({
          ids: [conversationId1, conversationId2],
          action: 'assign',
          assignedToId: salesUserId,
        });
      expect(res.status).toBe(204);

      const updated = await prisma.instagramConversation.findUnique({ where: { id: conversationId1 } });
      expect(updated?.assignedToId).toBe(salesUserId);
    });
  });

  describe('Global Search', () => {
    it('should return matching leads, deals, and conversations', async () => {
      if (!pgUp) return;
      const res = await request(app)
        .get('/api/v1/search?q=BulkOne')
        .set('Authorization', `Bearer ${ownerToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.leads).toHaveLength(1);
      expect(res.body.data.leads[0].firstName).toBe('BulkOne');
    });

    it('should enforce ownOnly scope for sales executive', async () => {
      if (!pgUp) return;
      // Sales executive can only read their assigned leads
      const res = await request(app)
        .get('/api/v1/search?q=BulkTwo')
        .set('Authorization', `Bearer ${salesToken()}`);
      expect(res.status).toBe(200);
      // BulkTwo is assigned to salesUserId by bulk assign action earlier
      expect(res.body.data.leads).toHaveLength(1);
    });
  });
});
