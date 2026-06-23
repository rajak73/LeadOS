import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { isPostgresUp } from '../helpers/services.js';

process.env.STRIPE_SECRET_KEY = 'test-stripe-secret';
process.env.STRIPE_PRICE_STARTER = 'price_starter_123';
process.env.STRIPE_PRICE_GROWTH = 'price_growth_123';
process.env.STRIPE_PRICE_ENTERPRISE = 'price_enterprise_123';

// Mock Stripe SDK
vi.mock('stripe', () => {
  const mockStripeInstance = {
    customers: {
      create: vi.fn().mockResolvedValue({ id: 'cus_mock123' }),
    },
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          id: 'cs_mock123',
          url: 'https://checkout.stripe.com/pay/cs_mock123',
          customer: 'cus_mock123',
          subscription: 'sub_mock123',
        }),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn().mockResolvedValue({ url: 'https://billing.stripe.com/p/session/portal_mock123' }),
      },
    },
    subscriptions: {
      retrieve: vi.fn().mockResolvedValue({
        id: 'sub_mock123',
        status: 'active',
        current_period_end: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000),
        cancel_at_period_end: false,
      }),
    },
  };

  return {
    default: vi.fn().mockImplementation(() => mockStripeInstance),
  };
});

const { buildApp } = await import('../../src/app.js');
const { prisma } = await import('../../src/core/prisma/client.js');
const { signAccessToken } = await import('../../src/core/auth/jwt.js');
const { BillingService } = await import('../../src/modules/billing/billing.service.js');

const pgUp = await isPostgresUp();
const app = buildApp();

async function seedOrg(name: string): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO organizations (name, slug, "updatedAt") VALUES ($1, $2, now()) RETURNING id`,
    name,
    `${name.toLowerCase().replace(/\s/g, '-')}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

let orgId = '';
let userId = '';
let token = '';

beforeAll(async () => {
  if (!pgUp) return;
  orgId = await seedOrg('Billing Test Org');
  userId = await seedUser(`billing-user-${Date.now()}@test.com`);
  const roleId = await seedRole(orgId, 'OWNER');
  await seedMember(orgId, userId, roleId);
  token = signAccessToken({ sub: userId, orgId, role: 'OWNER', isSuperAdmin: false });
});

afterAll(async () => {
  if (!pgUp) return;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
    await tx.$executeRawUnsafe(`DELETE FROM subscriptions WHERE "organizationId" = $1::uuid`, orgId);
    await tx.$executeRawUnsafe(`DELETE FROM organization_members WHERE "organizationId" = $1::uuid`, orgId);
    await tx.$executeRawUnsafe(`DELETE FROM roles WHERE "organizationId" = $1::uuid`, orgId);
    await tx.$executeRawUnsafe(`DELETE FROM organizations WHERE id = $1::uuid`, orgId);
    await tx.$executeRawUnsafe(`DELETE FROM users WHERE id = $1::uuid`, userId);
    await tx.$executeRawUnsafe(`DELETE FROM stripe_webhook_events WHERE id LIKE 'evt_test_billing_%'`);
  });
});

describe.skipIf(!pgUp)('Billing, Access Gating & Webhooks Integration Tests', () => {
  it('POST /api/v1/billing/checkout -> starts checkout session and links organization customer', async () => {
    const res = await request(app)
      .post('/api/v1/billing/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({
        planId: 'GROWTH',
        successUrl: 'https://localhost/success',
        cancelUrl: 'https://localhost/cancel',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.url).toContain('checkout.stripe.com');

    // Subscription should exist and be set up with customer ID
    const sub = await prisma.subscription.findUnique({ where: { organizationId: orgId } });
    expect(sub).not.toBeNull();
    expect(sub!.stripeCustomerId).toBe('cus_mock123');
    expect(sub!.status).toBe('TRIALING');
  });

  it('POST /api/v1/billing/portal -> retrieves customer billing portal session URL', async () => {
    const res = await request(app)
      .post('/api/v1/billing/portal')
      .set('Authorization', `Bearer ${token}`)
      .send({
        returnUrl: 'https://localhost/settings',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.url).toContain('billing.stripe.com');
  });

  it('GET /api/v1/billing/subscription -> retrieves organization subscription metrics', async () => {
    const res = await request(app)
      .get('/api/v1/billing/subscription')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.stripeCustomerId).toBe('cus_mock123');
  });

  it('Access level gating (billingGuard) -> blocks writes when status is PAST_DUE and grace is expired', async () => {
    // 1. Set subscription status to PAST_DUE, period end 15 days ago (expired grace period of 8 days)
    await prisma.subscription.update({
      where: { organizationId: orgId },
      data: {
        status: 'PAST_DUE',
        stripeCurrentPeriodEnd: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        lastSyncedAt: new Date(),
      },
    });

    // 2. Querying should succeed (read actions are allowed)
    const readRes = await request(app)
      .get('/api/v1/billing/subscription')
      .set('Authorization', `Bearer ${token}`);
    expect(readRes.status).toBe(200);

    // 3. Mutating should fail (write actions are blocked)
    const writeRes = await request(app)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({
        firstName: 'Blocked',
        lastName: 'Lead',
        status: 'NEW',
        source: 'MANUAL',
      });

    expect(writeRes.status).toBe(402); // PLAN_LIMIT_EXCEEDED
    expect(writeRes.body.error.code).toBe('PLAN_LIMIT_EXCEEDED');
  });

  it('Access level gating (billingGuard) -> blocks everything when status is SUSPENDED', async () => {
    // 1. Set subscription status to CANCELLED, period end 40 days ago (data retention/grace of 30 days is expired)
    await prisma.subscription.update({
      where: { organizationId: orgId },
      data: {
        status: 'CANCELLED',
        stripeCurrentPeriodEnd: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        lastSyncedAt: new Date(),
      },
    });

    // 2. Querying should fail (all actions blocked except billing itself)
    const readRes = await request(app)
      .get('/api/v1/leads')
      .set('Authorization', `Bearer ${token}`);
    expect(readRes.status).toBe(402);
    expect(readRes.body.error.code).toBe('PLAN_LIMIT_EXCEEDED');
  });

  it('Webhook processing (idempotency) -> updates subscription status and ignores duplicate event IDs', async () => {
    // Restore trial status
    await prisma.subscription.update({
      where: { organizationId: orgId },
      data: {
        status: 'TRIALING',
        stripeCurrentPeriodEnd: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        lastSyncedAt: new Date(),
      },
    });

    const billingService = new BillingService(prisma);

    // Create a mock checkout.session.completed event payload
    const eventPayload: any = {
      id: 'evt_test_billing_checkout_001',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_mock123',
          customer: 'cus_mock123',
          subscription: 'sub_mock123',
          metadata: {
            organizationId: orgId,
            planId: 'GROWTH',
          },
        },
      },
    };

    // 1. Process the event the first time
    const firstResult = await billingService.processStripeEvent(eventPayload);
    expect(firstResult).toBe(true);

    const sub = await prisma.subscription.findUnique({ where: { organizationId: orgId } });
    expect(sub!.status).toBe('ACTIVE');
    expect(sub!.planId).toBe('GROWTH');

    // 2. Process the same event again — should return false (skipped/idempotent)
    const secondResult = await billingService.processStripeEvent(eventPayload);
    expect(secondResult).toBe(false);
  });

  it('Nightly subscription drift reconciliation -> syncs data with Stripe', async () => {
    // 1. Manually drift the database subscription status to PAST_DUE
    await prisma.subscription.update({
      where: { organizationId: orgId },
      data: {
        status: 'PAST_DUE',
      },
    });

    const billingService = new BillingService(prisma);

    // 2. Run reconciliation
    const result = await billingService.reconcileSubscriptions();
    expect(result.checked).toBeGreaterThan(0);
    expect(result.updated).toBeGreaterThan(0);

    // 3. Confirm that status is restored to ACTIVE
    const sub = await prisma.subscription.findUnique({ where: { organizationId: orgId } });
    expect(sub!.status).toBe('ACTIVE');
  });
});
