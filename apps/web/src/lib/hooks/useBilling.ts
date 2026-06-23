'use client';

import { useQuery, useMutation } from '@tanstack/react-query';

export interface BillingSubscriptionData {
  id: string;
  organizationId: string;
  plan: 'STARTER' | 'GROWTH' | 'SCALE' | 'TRIAL';
  planId: 'STARTER' | 'GROWTH' | 'ENTERPRISE';
  status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'PAUSED';
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeCurrentPeriodEnd: string | null;
  trialEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  lastSyncedAt: string | null;
  billingPlan?: {
    id: string;
    name: string;
    maxUsers: number | null;
    maxLeads: number | null;
  } | null;
}

export function useSubscription() {
  return useQuery<BillingSubscriptionData>({
    queryKey: ['billing-subscription'],
    queryFn: async () => {
      const res = await fetch('/api/bff/billing/subscription', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error('Failed to fetch subscription details');
      }
      const json = await res.json();
      return json.data;
    },
    staleTime: 30_000,
  });
}

export function useCreateCheckoutSession() {
  return useMutation<{ url: string }, Error, { planId: 'STARTER' | 'GROWTH' | 'ENTERPRISE'; successUrl: string; cancelUrl: string }>({
    mutationFn: async ({ planId, successUrl, cancelUrl }) => {
      const res = await fetch('/api/bff/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ planId, successUrl, cancelUrl }),
      });
      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        throw new Error(errorJson.error?.message || 'Failed to create checkout session');
      }
      const json = await res.json();
      return json.data;
    },
  });
}

export function useCreatePortalSession() {
  return useMutation<{ url: string }, Error, { returnUrl: string }>({
    mutationFn: async ({ returnUrl }) => {
      const res = await fetch('/api/bff/billing/portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ returnUrl }),
      });
      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        throw new Error(errorJson.error?.message || 'Failed to create portal session');
      }
      const json = await res.json();
      return json.data;
    },
  });
}
