// Sprint 8 — Stripe Billing Service.
//
// Provides customer creation, checkout session, customer portal, subscription lookup.
// Webhook processing is idempotent via StripeWebhookEvent dedup table.

import Stripe from 'stripe';
import type { PrismaClient, Prisma } from '@prisma/client';
import { AppError } from '../../core/errors/app-error.js';
import { logger } from '../../core/observability/logger.js';
import { ErrorCode } from '@leados/shared';

function buildStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: '2025-02-24.acacia' });
}

const stripe = buildStripe();

function requireStripe(): Stripe {
  if (!stripe) throw new AppError(ErrorCode.INTERNAL_ERROR, 'Stripe is not configured');
  return stripe;
}

export const PLAN_PRICE_MAP: Record<string, string | undefined> = {
  STARTER: process.env.STRIPE_PRICE_STARTER,
  GROWTH: process.env.STRIPE_PRICE_GROWTH,
  ENTERPRISE: process.env.STRIPE_PRICE_ENTERPRISE,
};

export class BillingService {
  constructor(private readonly db: PrismaClient) {}

  /** Ensure an org has a Stripe customer — idempotent. */
  async ensureCustomer(organizationId: string, email: string, orgName: string): Promise<string> {
    const sub = await this.db.subscription.findUnique({
      where: { organizationId },
      select: { stripeCustomerId: true },
    });
    if (sub?.stripeCustomerId) return sub.stripeCustomerId;

    const customer = await requireStripe().customers.create({
      email,
      name: orgName,
      metadata: { organizationId },
    });

    // Upsert subscription record (might already exist from trial start)
    await this.db.subscription.upsert({
      where: { organizationId },
      create: {
        organizationId,
        plan: 'STARTER',
        planId: 'STARTER',
        stripeCustomerId: customer.id,
        status: 'TRIALING',
      },
      update: { stripeCustomerId: customer.id },
    });

    logger.info('Created Stripe customer', { organizationId, customerId: customer.id });
    return customer.id;
  }

  /** Create a Stripe Checkout session for the given plan. */
  async createCheckoutSession(
    organizationId: string,
    planId: 'STARTER' | 'GROWTH' | 'ENTERPRISE',
    successUrl: string,
    cancelUrl: string,
    customerId: string,
  ): Promise<{ url: string }> {
    const priceId = PLAN_PRICE_MAP[planId];
    if (!priceId) throw AppError.validation(`No Stripe price configured for plan ${planId}`);

    const session = await requireStripe().checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { organizationId, planId },
    });

    if (!session.url) throw new AppError(ErrorCode.INTERNAL_ERROR, 'No checkout URL returned from Stripe');
    return { url: session.url };
  }

  /** Return a Stripe Customer Portal URL for managing billing. */
  async createPortalSession(
    organizationId: string,
    returnUrl: string,
  ): Promise<{ url: string }> {
    const sub = await this.db.subscription.findUnique({
      where: { organizationId },
      select: { stripeCustomerId: true },
    });
    if (!sub?.stripeCustomerId) {
      throw AppError.validation('No billing account found for this organization');
    }

    const session = await requireStripe().billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: returnUrl,
    });
    return { url: session.url };
  }

  /** Get the current subscription for an org. */
  async getSubscription(organizationId: string) {
    return this.db.subscription.findUnique({
      where: { organizationId },
      include: { billingPlan: true },
    });
  }

  /** Process a parsed Stripe event directly — idempotent. Returns true if newly processed. */
  async processStripeEvent(event: Stripe.Event): Promise<boolean> {
    // Idempotency: skip if already processed
    const existing = await this.db.stripeWebhookEvent.findUnique({ where: { id: event.id } });
    if (existing) {
      logger.debug('Stripe webhook already processed — skipping', { eventId: event.id });
      return false;
    }

    // Record the event first (before processing) for idempotency
    await this.db.stripeWebhookEvent.create({
      data: {
        id: event.id,
        type: event.type,
        payload: event.data as unknown as Prisma.InputJsonValue,
      },
    });

    await this.handleStripeEvent(event);
    return true;
  }

  /** Process a Stripe webhook event — idempotent. Returns true if newly processed. */
  async processWebhookEvent(
    rawBody: Buffer,
    signature: string,
  ): Promise<boolean> {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) throw new AppError(ErrorCode.INTERNAL_ERROR, 'STRIPE_WEBHOOK_SECRET not configured');

    let event: Stripe.Event;
    try {
      event = requireStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      logger.warn('Stripe webhook signature verification failed', { err });
      throw AppError.forbidden('Invalid webhook signature');
    }

    // Idempotency: skip if already processed
    const existing = await this.db.stripeWebhookEvent.findUnique({ where: { id: event.id } });
    if (existing) {
      logger.debug('Stripe webhook already processed — skipping', { eventId: event.id });
      return false;
    }

    // Record the event first (before processing) for idempotency
    await this.db.stripeWebhookEvent.create({
      data: { id: event.id, type: event.type, payload: event.data as unknown as Prisma.InputJsonValue },
    });

    await this.handleStripeEvent(event);
    return true;
  }

  private async handleStripeEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await this.handleCheckoutCompleted(session);
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await this.handleSubscriptionChange(subscription);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await this.handlePaymentFailed(invoice);
        break;
      }
      default:
        logger.debug('Unhandled Stripe event type', { type: event.type });
    }
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const organizationId = session.metadata?.organizationId;
    const planId = session.metadata?.planId as 'STARTER' | 'GROWTH' | 'ENTERPRISE' | undefined;
    if (!organizationId || !planId) return;

    const stripeSubscriptionId = typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id;

    if (!stripeSubscriptionId) return;

    // Fetch full subscription from Stripe for period end
    const stripeSub = await requireStripe().subscriptions.retrieve(stripeSubscriptionId);

    const subscriptionPlan = planId === 'ENTERPRISE' ? 'SCALE' : planId;

    await this.db.subscription.upsert({
      where: { organizationId },
      create: {
        organizationId,
        plan: subscriptionPlan,
        planId,
        stripeCustomerId: session.customer as string,
        stripeSubscriptionId,
        stripeCurrentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
        status: 'ACTIVE',
      },
      update: {
        plan: subscriptionPlan,
        planId,
        stripeSubscriptionId,
        stripeCurrentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
        status: 'ACTIVE',
      },
    });

    logger.info('Checkout completed — subscription activated', { organizationId, planId });
  }

  private async handleSubscriptionChange(stripeSub: Stripe.Subscription): Promise<void> {
    const customerId = typeof stripeSub.customer === 'string'
      ? stripeSub.customer
      : stripeSub.customer.id;

    const sub = await this.db.subscription.findFirst({
      where: { stripeCustomerId: customerId },
      select: { organizationId: true },
    });
    if (!sub) return;

    const statusMap: Record<string, 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'PAUSED'> = {
      trialing: 'TRIALING',
      active: 'ACTIVE',
      past_due: 'PAST_DUE',
      canceled: 'CANCELLED',
      unpaid: 'PAST_DUE',
      paused: 'PAUSED',
    };

    await this.db.subscription.update({
      where: { organizationId: sub.organizationId },
      data: {
        status: statusMap[stripeSub.status] ?? 'ACTIVE',
        stripeCurrentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
        cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      },
    });
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
    if (!customerId) return;

    await this.db.subscription.updateMany({
      where: { stripeCustomerId: customerId },
      data: { status: 'PAST_DUE' },
    });
    logger.warn('Payment failed — subscription marked PAST_DUE', { customerId });
  }

  /** Reconcile all subscriptions against Stripe to correct drift. */
  async reconcileSubscriptions(): Promise<{ checked: number; updated: number }> {
    if (!stripe) {
      logger.warn('Stripe is not configured. Skipping reconciliation.');
      return { checked: 0, updated: 0 };
    }

    const subscriptions = await this.db.subscription.findMany({
      where: {
        stripeCustomerId: { not: null },
      },
    });

    let checked = 0;
    let updated = 0;

    const statusMap: Record<string, 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'PAUSED'> = {
      trialing: 'TRIALING',
      active: 'ACTIVE',
      past_due: 'PAST_DUE',
      canceled: 'CANCELLED',
      unpaid: 'PAST_DUE',
      paused: 'PAUSED',
    };

    for (const sub of subscriptions) {
      if (!sub.stripeSubscriptionId) continue;
      try {
        checked++;
        const stripeSub = await requireStripe().subscriptions.retrieve(sub.stripeSubscriptionId);
        const mappedStatus = statusMap[stripeSub.status] ?? 'ACTIVE';

        const stripePeriodEnd = new Date(stripeSub.current_period_end * 1000);
        const needsUpdate =
          sub.status !== mappedStatus ||
          sub.stripeCurrentPeriodEnd?.getTime() !== stripePeriodEnd.getTime() ||
          sub.cancelAtPeriodEnd !== stripeSub.cancel_at_period_end;

        if (needsUpdate) {
          updated++;
          logger.warn('Detected billing mirror drift, reconciling', {
            organizationId: sub.organizationId,
            prevStatus: sub.status,
            newStatus: mappedStatus,
            prevPeriodEnd: sub.stripeCurrentPeriodEnd,
            newPeriodEnd: stripePeriodEnd,
          });

          await this.db.subscription.update({
            where: { organizationId: sub.organizationId },
            data: {
              status: mappedStatus,
              stripeCurrentPeriodEnd: stripePeriodEnd,
              cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
              lastSyncedAt: new Date(),
            },
          });
        } else {
          await this.db.subscription.update({
            where: { organizationId: sub.organizationId },
            data: {
              lastSyncedAt: new Date(),
            },
          });
        }
      } catch (err: unknown) {
        logger.error('Failed to reconcile subscription for org', {
          organizationId: sub.organizationId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info('Reconciliation completed', { checked, updated });
    return { checked, updated };
  }
}
