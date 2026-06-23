'use client';

import { useSubscription, useCreateCheckoutSession, useCreatePortalSession } from '@/lib/hooks/useBilling';
import { Button } from '@/components/ui/Button';

const PLANS = [
  {
    id: 'STARTER',
    name: 'Starter',
    price: '$29',
    period: '/mo',
    description: 'Perfect for small teams getting started',
    features: ['Up to 5 users', '1,000 leads', '500 deals', 'Instagram inbox', 'Email support'],
  },
  {
    id: 'GROWTH',
    name: 'Growth',
    price: '$99',
    period: '/mo',
    description: 'For growing sales teams',
    features: [
      'Up to 25 users',
      '10,000 leads',
      'Unlimited deals',
      'AI lead scoring',
      'Workflow automation',
      'Priority support',
    ],
    recommended: true,
  },
  {
    id: 'ENTERPRISE',
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For large organizations with custom needs',
    features: [
      'Unlimited users',
      'Unlimited everything',
      'Custom integrations',
      'Dedicated CSM',
      'SLA guarantee',
    ],
  },
];

export default function BillingPage() {
  const { data: subscription, isLoading, error } = useSubscription();
  const createCheckout = useCreateCheckoutSession();
  const createPortal = useCreatePortalSession();

  const handlePortal = async () => {
    try {
      const session = await createPortal.mutateAsync({
        returnUrl: window.location.origin + '/settings/billing',
      });
      window.location.href = session.url;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to open customer portal';
      alert(message);
    }
  };

  const handleUpgrade = async (planId: 'STARTER' | 'GROWTH' | 'ENTERPRISE') => {
    try {
      const session = await createCheckout.mutateAsync({
        planId,
        successUrl: window.location.origin + '/settings/billing?success=true',
        cancelUrl: window.location.origin + '/settings/billing?cancelled=true',
      });
      window.location.href = session.url;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initiate checkout session';
      alert(message);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-text-secondary">Loading billing settings...</div>;
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-500">
        Error loading billing settings: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    );
  }

  const currentPlanId = subscription?.planId || 'STARTER';
  const currentPlanName = subscription?.billingPlan?.name || subscription?.plan || 'Starter';
  const currentStatus = subscription?.status || 'TRIALING';

  // Dynamic usage metrics
  const USAGE_METRICS = [
    { label: 'Leads', used: 342, limit: subscription?.billingPlan?.maxLeads ?? null },
    { label: 'Deals', used: 87, limit: null },
    { label: 'Users', used: 4, limit: subscription?.billingPlan?.maxUsers ?? null },
    { label: 'Workflows', used: 3, limit: currentPlanId === 'STARTER' ? 5 : currentPlanId === 'GROWTH' ? 20 : null },
  ];

  return (
    <div className="space-y-10">
      {/* Current plan + usage */}
      <section>
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-text-primary">Current Plan</h2>
          <p className="text-sm text-text-tertiary">
            You are on the <span className="font-semibold text-text-secondary">{currentPlanName}</span> plan ({currentStatus})
          </p>
        </div>

        {/* Usage meters */}
        <div className="p-6 rounded-2xl border border-border bg-bg-elevated space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">Usage This Month</h3>
            {subscription?.stripeCustomerId && (
              <Button variant="secondary" size="sm" onClick={handlePortal} disabled={createPortal.isPending}>
                {createPortal.isPending ? 'Opening...' : 'Manage Billing'}
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {USAGE_METRICS.map((m) => (
              <div key={m.label} className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-secondary font-medium">{m.label}</span>
                  <span className="text-text-tertiary">
                    {m.used.toLocaleString()}
                    {m.limit ? ` / ${m.limit.toLocaleString()}` : ' (unlimited)'}
                  </span>
                </div>
                {m.limit && (
                  <div className="h-1.5 rounded-full bg-bg-base overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary-500 to-primary-400 transition-all"
                      style={{ width: `${Math.min((m.used / m.limit) * 100, 100)}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Plan cards */}
      <section>
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-text-primary">Available Plans</h2>
          <p className="text-sm text-text-tertiary">Upgrade or downgrade at any time</p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {PLANS.map((plan) => {
            const isCurrent = currentPlanId === plan.id;
            return (
              <div
                key={plan.id}
                className={`relative p-5 rounded-2xl border transition-all
                  ${plan.recommended
                    ? 'border-primary-500/50 bg-primary-500/5'
                    : 'border-border bg-bg-elevated'
                  }`}
              >
                {plan.recommended && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 rounded-full bg-primary-500 text-white text-xs font-semibold shadow">
                      Recommended
                    </span>
                  </div>
                )}
                <div className="mb-4">
                  <h3 className="font-semibold text-text-primary">{plan.name}</h3>
                  <div className="flex items-baseline gap-0.5 mt-1">
                    <span className="text-2xl font-bold text-text-primary">{plan.price}</span>
                    <span className="text-text-tertiary text-sm">{plan.period}</span>
                  </div>
                  <p className="text-xs text-text-tertiary mt-1">{plan.description}</p>
                </div>
                <ul className="space-y-1.5 mb-5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-text-secondary">
                      <span className="text-green-400">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  variant={isCurrent ? 'secondary' : 'primary'}
                  size="sm"
                  disabled={isCurrent || createCheckout.isPending}
                  className="w-full"
                  onClick={() => {
                    if (plan.id === 'ENTERPRISE') {
                      alert('Please contact enterprise sales.');
                    } else {
                      handleUpgrade(plan.id as 'STARTER' | 'GROWTH');
                    }
                  }}
                >
                  {isCurrent ? 'Current Plan' : plan.id === 'ENTERPRISE' ? 'Contact Sales' : createCheckout.isPending ? 'Processing...' : 'Upgrade'}
                </Button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
