import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../core/prisma/client.js';
import { AppError } from '../../core/errors/app-error.js';
import { ErrorCode } from '@leados/shared';
import { logger } from '../../core/observability/logger.js';

export type AccessLevel = 'FULL' | 'READ_ONLY' | 'SUSPENDED';

/**
 * Computes the derived access level based on subscription state.
 * Implements "Fail-open on ambiguity" (P0-6): Stale mirrors do not lock out paying customers.
 */
export function getEffectiveAccessLevel(subscription: {
  plan: string;
  status: string;
  trialEndsAt: Date | null;
  stripeCurrentPeriodEnd: Date | null;
  lastSyncedAt: Date | null;
}): AccessLevel {
  const { plan, status, trialEndsAt, stripeCurrentPeriodEnd, lastSyncedAt } = subscription;

  // Fail-open: If the mirror is stale (not synced in > 36 hours) and was previously paying, fail-open to FULL
  const STALE_THRESHOLD_MS = 36 * 60 * 60 * 1000;
  const isStale = lastSyncedAt ? Date.now() - lastSyncedAt.getTime() > STALE_THRESHOLD_MS : true;

  if (isStale && plan !== 'TRIAL') {
    logger.warn({ message: 'Billing mirror is stale or ambiguous, failing open to FULL' });
    return 'FULL';
  }

  // 1. TRIALING
  if (status === 'TRIALING') {
    if (trialEndsAt && trialEndsAt.getTime() > Date.now()) {
      return 'FULL';
    }
    return 'READ_ONLY'; // Trial expired
  }

  // 2. ACTIVE
  if (status === 'ACTIVE') {
    return 'FULL';
  }

  // 3. PAST_DUE
  if (status === 'PAST_DUE') {
    // 8-day grace window after period ends
    const GRACE_PERIOD_MS = 8 * 24 * 60 * 60 * 1000;
    const graceThreshold = stripeCurrentPeriodEnd
      ? stripeCurrentPeriodEnd.getTime() + GRACE_PERIOD_MS
      : 0;

    if (Date.now() < graceThreshold) {
      return 'FULL';
    }
    return 'READ_ONLY';
  }

  // 4. CANCELLED
  if (status === 'CANCELLED') {
    // 30-day retention/data-grace window
    const RETENTION_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
    const retentionThreshold = stripeCurrentPeriodEnd
      ? stripeCurrentPeriodEnd.getTime() + RETENTION_PERIOD_MS
      : 0;

    if (Date.now() < retentionThreshold) {
      return 'READ_ONLY';
    }
    return 'SUSPENDED';
  }

  // 5. PAUSED
  if (status === 'PAUSED') {
    return 'READ_ONLY';
  }

  return 'READ_ONLY';
}

/**
 * Express middleware to enforce subscription-based access gating.
 */
export async function billingGuard(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = req.auth;
    // If not authenticated or tenant is not set, let downstream handlers raise auth errors
    if (!auth?.organizationId) {
      next();
      return;
    }

    // Bypass checks for billing endpoints themselves (so they can upgrade/checkout)
    if (req.path.startsWith('/billing') || req.path.startsWith('/api/v1/billing')) {
      next();
      return;
    }

    // Retrieve subscription record
    const subscription = await prisma.subscription.findUnique({
      where: { organizationId: auth.organizationId },
      select: {
        plan: true,
        status: true,
        trialEndsAt: true,
        stripeCurrentPeriodEnd: true,
        lastSyncedAt: true,
      },
    });

    // Default to trial configuration if no record found (safety fallback)
    const subData = subscription ?? {
      plan: 'TRIAL',
      status: 'TRIALING',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      stripeCurrentPeriodEnd: null,
      lastSyncedAt: new Date(),
    };

    const accessLevel = getEffectiveAccessLevel(subData);

    if (accessLevel === 'SUSPENDED') {
      throw new AppError(
        ErrorCode.PLAN_LIMIT_EXCEEDED,
        'Your subscription is suspended. Please contact support to reactivate your account.'
      );
    }

    // Block mutating operations (write actions) if level is READ_ONLY
    if (accessLevel === 'READ_ONLY') {
      const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
      if (isWrite) {
        throw new AppError(
          ErrorCode.PLAN_LIMIT_EXCEEDED,
          'Your subscription is in read-only mode. Please upgrade your plan or resolve outstanding payments to resume operations.'
        );
      }
    }

    next();
  } catch (err) {
    next(err);
  }
}
