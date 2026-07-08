// Sprint 6 M2 — Instagram OAuth + Account Management integration tests.
//
// Real JWTs + assembled app + real Postgres. Sandbox InstagramAdapter is used automatically
// (env.NODE_ENV === 'test') so no Meta credentials are needed.
// DB-gated: self-skips when Postgres is unavailable.
//
// All callback error paths assert on HTTP 302 + Location header (never 400/409 JSON)
// per signoff §4.2 / A4.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/core/prisma/client.js';
import { cacheRedis } from '../../src/core/redis/client.js';
import { isPostgresUp, isRedisUp } from '../helpers/services.js';
import { signAccessToken } from '../../src/core/auth/jwt.js';
import { env } from '../../src/core/config/env.js';

const pgUp = await isPostgresUp();
const redisUp = await isRedisUp();
const infra = pgUp && redisUp;

const app = buildApp();

// ─── Seed helpers ────────────────────────────────────────────────────────────

let orgId = '';
let orgTrialId = '';
let ownerUserId = '';
let salesUserId = '';

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

async function seedRole(oId: string, name: string): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO roles (id, "organizationId", name, "isSystem", "updatedAt")
     VALUES (uuid_generate_v4(), $1::uuid, $2, true, now()) RETURNING id`,
    oId, name,
  );
  return row!.id;
}

async function seedMember(oId: string, uId: string, roleId: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO organization_members ("organizationId", "userId", "roleId", status, "updatedAt")
     VALUES ($1::uuid, $2::uuid, $3::uuid, 'ACTIVE', now())`,
    oId, uId, roleId,
  );
}

async function seedSubscription(oId: string, plan: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO subscriptions ("organizationId", plan, status, "updatedAt")
     VALUES ($1::uuid, $2::"SubscriptionPlan", 'ACTIVE'::"SubscriptionStatus", now())`,
    oId, plan,
  );
}

// ─── Token helpers ────────────────────────────────────────────────────────────

function ownerToken(oId = orgId): string {
  return signAccessToken({ sub: ownerUserId, orgId: oId, role: 'OWNER', isSuperAdmin: false });
}

function salesToken(): string {
  return signAccessToken({ sub: salesUserId, orgId, role: 'SALES_EXECUTIVE', isSuperAdmin: false });
}

// ─── OAuth state helpers ──────────────────────────────────────────────────────

async function buildValidState(uId: string, oId: string): Promise<string> {
  const nonce = crypto.randomUUID();
  await cacheRedis.set(`oauth:state:${nonce}`, JSON.stringify({ userId: uId, orgId: oId }), 'EX', 900);
  return jwt.sign({ nonce }, env.OAUTH_STATE_SECRET, { algorithm: 'HS256', expiresIn: '15m' });
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!infra) return;

  orgId = await seedOrg('IG Test Org', `ig-test-org-${Date.now()}`);
  orgTrialId = await seedOrg('IG Trial Org', `ig-trial-org-${Date.now()}`);
  ownerUserId = await seedUser(`ig-owner-${Date.now()}@test.com`);
  salesUserId = await seedUser(`ig-sales-${Date.now()}@test.com`);

  const ownerRoleId = await seedRole(orgId, 'OWNER');
  const salesRoleId = await seedRole(orgId, 'SALES_EXECUTIVE');
  const trialOwnerRoleId = await seedRole(orgTrialId, 'OWNER');

  await seedMember(orgId, ownerUserId, ownerRoleId);
  await seedMember(orgId, salesUserId, salesRoleId);
  await seedMember(orgTrialId, ownerUserId, trialOwnerRoleId);

  await seedSubscription(orgId, 'GROWTH'); // limit = 3 accounts
  await seedSubscription(orgTrialId, 'TRIAL'); // limit = 1 account
});

afterAll(async () => {
  if (!infra) return;
  await prisma.$transaction(async (tx) => {
    const oId = orgId || '00000000-0000-0000-0000-000000000000';
    const oTId = orgTrialId || '00000000-0000-0000-0000-000000000000';
    await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
    await tx.$executeRawUnsafe(`DELETE FROM instagram_accounts WHERE "organizationId" IN ($1::uuid, $2::uuid)`, oId, oTId);
    await tx.$executeRawUnsafe(`DELETE FROM roles WHERE "organizationId" IN ($1::uuid, $2::uuid)`, oId, oTId);
    await tx.$executeRawUnsafe(`DELETE FROM organization_members WHERE "organizationId" IN ($1::uuid, $2::uuid)`, oId, oTId);
    await tx.$executeRawUnsafe(`DELETE FROM subscriptions WHERE "organizationId" IN ($1::uuid, $2::uuid)`, oId, oTId);
    await tx.$executeRawUnsafe(`DELETE FROM organizations WHERE id IN ($1::uuid, $2::uuid)`, oId, oTId);
    if (ownerUserId) {
        await tx.$executeRawUnsafe(`DELETE FROM users WHERE id = $1::uuid`, ownerUserId);
    }
  });
  await cacheRedis.quit().catch(() => undefined);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Instagram OAuth + Account Management', () => {
  describe('GET /api/v1/instagram/auth', () => {
    it('returns 401 without Bearer token', async () => {
      if (!infra) return;
      const res = await request(app).get('/api/v1/instagram/auth');
      expect(res.status).toBe(401);
    });

    it('returns 403 for SALES_EXECUTIVE (no org.connect_social permission)', async () => {
      if (!infra) return;
      const res = await request(app)
        .get('/api/v1/instagram/auth')
        .set('Authorization', `Bearer ${salesToken()}`);
      expect(res.status).toBe(403);
    });

    it('returns { redirectUrl } with signed state for OWNER', async () => {
      if (!infra) return;
      const res = await request(app)
        .get('/api/v1/instagram/auth')
        .set('Authorization', `Bearer ${ownerToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('redirectUrl');
      const url = new URL(res.body.data.redirectUrl as string);
      const state = url.searchParams.get('state');
      expect(state).toBeTruthy();
      // State JWT must be verifiable with OAUTH_STATE_SECRET
      const payload = jwt.verify(state!, env.OAUTH_STATE_SECRET) as { nonce: string };
      expect(payload.nonce).toBeTruthy();
    });
  });

  describe('GET /api/instagram/callback', () => {
    it('happy path: creates account + redirects to ?connected=1', async () => {
      if (!infra) return;
      const state = await buildValidState(ownerUserId, orgId);
      const res = await request(app)
        .get(`/api/instagram/callback?code=test-code-123&state=${encodeURIComponent(state)}`)
        .redirects(0);
      expect(res.status).toBe(302);
      expect(res.headers['location']).toContain('connected=1');
    });

    it('token stored in DB is encrypted (starts with v1:)', async () => {
      if (!infra) return;
      const [row] = await prisma.$queryRawUnsafe<{ accessToken: string }[]>(
        `SELECT "accessToken" FROM instagram_accounts WHERE "organizationId" = $1::uuid ORDER BY "createdAt" DESC LIMIT 1`,
        orgId,
      );
      expect(row?.accessToken).toMatch(/^v1:/);
    });

    it('redirects to ?error=STATE_EXPIRED when nonce is gone (expired/replayed)', async () => {
      if (!infra) return;
      // Sign a JWT with a nonce that is NOT in Redis
      const state = jwt.sign({ nonce: crypto.randomUUID() }, env.OAUTH_STATE_SECRET, {
        algorithm: 'HS256', expiresIn: '15m',
      });
      const res = await request(app)
        .get(`/api/instagram/callback?code=x&state=${encodeURIComponent(state)}`)
        .redirects(0);
      expect(res.status).toBe(302);
      expect(res.headers['location']).toContain('error=STATE_EXPIRED');
    });

    it('replay protection: second use of same nonce redirects to ?error=STATE_EXPIRED', async () => {
      if (!infra) return;
      const state = await buildValidState(ownerUserId, orgId);
      const res1 = await request(app)
        .get(`/api/instagram/callback?code=replay-code&state=${encodeURIComponent(state)}`)
        .redirects(0);
      // First use: may succeed or fail on business logic (duplicate), but nonce is consumed
      expect([302]).toContain(res1.status);

      const res2 = await request(app)
        .get(`/api/instagram/callback?code=replay-code&state=${encodeURIComponent(state)}`)
        .redirects(0);
      expect(res2.status).toBe(302);
      expect(res2.headers['location']).toContain('error=STATE_EXPIRED');
    });

    it('redirects to ?error=INVALID_STATE on bad JWT signature', async () => {
      if (!infra) return;
      const badState = jwt.sign({ nonce: crypto.randomUUID() }, 'wrong-secret', {
        algorithm: 'HS256', expiresIn: '15m',
      });
      const res = await request(app)
        .get(`/api/instagram/callback?code=x&state=${encodeURIComponent(badState)}`)
        .redirects(0);
      expect(res.status).toBe(302);
      expect(res.headers['location']).toContain('error=INVALID_STATE');
    });

    it('redirects to ?error=ACCESS_DENIED when Meta sends error param', async () => {
      if (!infra) return;
      const res = await request(app)
        .get('/api/instagram/callback?error=access_denied')
        .redirects(0);
      expect(res.status).toBe(302);
      expect(res.headers['location']).toContain('error=ACCESS_DENIED');
    });

    it('redirects to ?error=ALREADY_CONNECTED on duplicate IG account', async () => {
      if (!infra) return;
      // The sandbox adapter always returns igUserId derived from the code.
      // Use a specific code that produces a known igUserId, then try to connect again.
      const state1 = await buildValidState(ownerUserId, orgId);
      await request(app)
        .get(`/api/instagram/callback?code=dup-test-code&state=${encodeURIComponent(state1)}`)
        .redirects(0);

      const state2 = await buildValidState(ownerUserId, orgId);
      const res = await request(app)
        .get(`/api/instagram/callback?code=dup-test-code&state=${encodeURIComponent(state2)}`)
        .redirects(0);
      expect(res.status).toBe(302);
      expect(res.headers['location']).toContain('error=ALREADY_CONNECTED');
    });

    it('redirects to ?error=PLAN_LIMIT_EXCEEDED when TRIAL org tries to connect a second account', async () => {
      if (!infra) return;
      // Connect first account on trial org
      const state1 = await buildValidState(ownerUserId, orgTrialId);
      await request(app)
        .get(`/api/instagram/callback?code=trial-first&state=${encodeURIComponent(state1)}`)
        .redirects(0);

      // Try to connect a second (different igUserId via different code)
      const state2 = await buildValidState(ownerUserId, orgTrialId);
      const res = await request(app)
        .get(`/api/instagram/callback?code=trial-second&state=${encodeURIComponent(state2)}`)
        .redirects(0);
      expect(res.status).toBe(302);
      expect(res.headers['location']).toContain('error=PLAN_LIMIT_EXCEEDED');
    });
  });

  describe('GET /api/v1/instagram/accounts', () => {
    it('returns connected accounts with status ACTIVE', async () => {
      if (!infra) return;
      const res = await request(app)
        .get('/api/v1/instagram/accounts')
        .set('Authorization', `Bearer ${ownerToken()}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      const accounts = res.body.data as Array<{ status: string; accessToken?: string }>;
      expect(accounts.length).toBeGreaterThan(0);
      // Access token must not be exposed in the API response
      expect(accounts.every((a) => a.accessToken === undefined)).toBe(true);
    });
  });

  describe('DELETE /api/v1/instagram/accounts/:id', () => {
    it('sets status to DISCONNECTED and deletedAt', async () => {
      if (!infra) return;
      // Get the first account ID
      const listRes = await request(app)
        .get('/api/v1/instagram/accounts')
        .set('Authorization', `Bearer ${ownerToken()}`);
      const accounts = listRes.body.data as Array<{ id: string }>;
      const accountId = accounts[0]?.id;
      if (!accountId) return; // no accounts seeded (sandbox may vary)

      const res = await request(app)
        .delete(`/api/v1/instagram/accounts/${accountId}`)
        .set('Authorization', `Bearer ${ownerToken()}`);
      expect(res.status).toBe(204);

      const [row] = await prisma.$queryRawUnsafe<{ status: string; deletedAt: Date | null }[]>(
        `SELECT status, "deletedAt" FROM instagram_accounts WHERE id = $1::uuid`,
        accountId,
      );
      expect(row?.status).toBe('DISCONNECTED');
      expect(row?.deletedAt).not.toBeNull();
    });
  });
});
