'use client';

import { useSubscription } from '@/lib/hooks/useBilling';
import Link from 'next/link';

export function BillingBanner() {
  const { data: subscription } = useSubscription();

  if (!subscription) return null;

  const { status, stripeCurrentPeriodEnd, trialEndsAt } = subscription;

  const isTrialExpired =
    status === 'TRIALING' &&
    trialEndsAt &&
    new Date(trialEndsAt).getTime() < Date.now();

  const isPastDue = status === 'PAST_DUE';
  const isSuspended =
    status === 'CANCELLED' &&
    stripeCurrentPeriodEnd &&
    new Date(stripeCurrentPeriodEnd).getTime() + 30 * 24 * 60 * 60 * 1000 < Date.now();
  const isReadOnlyCancelled = status === 'CANCELLED' && !isSuspended;

  let message = '';
  if (isPastDue) {
    message = 'Your subscription payment is past due. Please resolve outstanding payments to avoid account suspension.';
  } else if (isTrialExpired) {
    message = 'Your free trial has expired. Upgrade your plan to resume full operations.';
  } else if (isReadOnlyCancelled) {
    message = 'Your subscription has been cancelled and is now in read-only mode.';
  } else if (status === 'PAUSED') {
    message = 'Your account is currently paused.';
  } else {
    return null;
  }

  return (
    <div className="mb-4 px-4 py-2.5 rounded-xl border border-red-500/20 bg-red-500/5 text-xs font-medium text-red-500 flex items-center justify-between gap-3 shadow-sm">
      <span>⚠️ {message}</span>
      <Link href="/settings/billing" className="underline font-semibold hover:text-red-400 shrink-0">
        Manage Billing
      </Link>
    </div>
  );
}
