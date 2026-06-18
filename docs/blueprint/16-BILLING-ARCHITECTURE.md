# 16 — Billing Architecture

> **⚠ UPDATED per `docs/planning/P0_FIXES.md` (P0-6).** Access control must not trust an unguarded Stripe mirror. Added: ordered/idempotent webhook application (§16.7), a nightly Stripe→mirror reconciliation job (§16.7a), and a computed `effectiveAccessLevel` with fail-open-on-ambiguity (§16.4). Stripe is the source of truth; the LeadOS mirror is a cache. Consolidated architecture: `docs/planning/FINAL_ARCHITECTURE.md`.

---

## 16.1 Billing Stack: Stripe

**Why Stripe:**
- Best-in-class subscription management API
- Stripe Checkout: instant hosted checkout (zero frontend work)
- Stripe Customer Portal: self-serve upgrades, downgrades, cancellations
- Stripe Billing: invoices, credit notes, prorations
- Support for INR currency
- UPI, Netbanking, Cards via Stripe's India integration
- PCI DSS compliance (LeadOS never touches card data)

---

## 16.2 Pricing Plans

| Feature | Starter | Growth | Scale |
|---|---|---|---|
| **Monthly Price (INR)** | ₹2,999/month | ₹7,999/month | ₹19,999/month |
| **Annual Price (INR)** | ₹1,999/month (₹23,988/year) | ₹5,999/month (₹71,988/year) | ₹14,999/month (₹1,79,988/year) |
| **Annual Discount** | 33% | 25% | 25% |
| Team Members | 3 | 10 | Unlimited |
| Leads | 500 | 5,000 | Unlimited |
| Contacts | 500 | 10,000 | Unlimited |
| Pipelines | 1 | 5 | Unlimited |
| Active Workflows | 5 | 25 | Unlimited |
| Instagram Accounts | 1 | 3 | 10 |
| WhatsApp Accounts | ❌ | 1 | 5 |
| AI Lead Scoring | 500/month | 5,000/month | Unlimited |
| Analytics | Basic | Advanced | Advanced + Custom |
| API Access | ❌ | ❌ | ✅ |
| Priority Support | ❌ | Email | Email + Phone |
| Data Export | ❌ | ✅ | ✅ |
| Custom Domain | ❌ | ❌ | ✅ |
| SLA | ❌ | ❌ | 99.9% uptime SLA |

### Additional Seats (Growth + Scale)
- Growth: +₹799/seat/month (additional beyond 10)
- Scale: +₹499/seat/month (additional beyond base)

---

## 16.3 Stripe Setup Architecture

### Stripe Objects Created Per Org

| Stripe Object | When Created | Notes |
|---|---|---|
| `Customer` | On org registration | Email = owner email |
| `Subscription` | On plan activation (trial → paid) | `collection_method: charge_automatically` |
| `Price` | Pre-created in Stripe Dashboard | One per plan per billing cycle |
| `Invoice` | Automatically by Stripe each period | Mirrored to LeadOS `invoices` table |
| `PaymentIntent` | Automatically by Stripe | Mirrored to `payments` table |

### Stripe Price IDs (configure in env vars)
```env
STRIPE_PRICE_STARTER_MONTHLY=price_xxx
STRIPE_PRICE_STARTER_ANNUAL=price_xxx
STRIPE_PRICE_GROWTH_MONTHLY=price_xxx
STRIPE_PRICE_GROWTH_ANNUAL=price_xxx
STRIPE_PRICE_SCALE_MONTHLY=price_xxx
STRIPE_PRICE_SCALE_ANNUAL=price_xxx
```

---

## 16.4 Subscription Lifecycle

### State Machine
```
TRIALING
  ├── [Trial expires + payment method added] → ACTIVE
  ├── [Trial expires + no payment method] → TRIAL_EXPIRED (read-only mode)
  └── [Cancelled during trial] → CANCELLED

ACTIVE
  ├── [Payment fails] → PAST_DUE
  ├── [Cancel at end of period] → ACTIVE (with cancelAtPeriodEnd = true)
  └── [Period ends with cancelAtPeriodEnd = true] → CANCELLED

PAST_DUE
  ├── [Stripe retries succeed] → ACTIVE
  ├── [All retries fail (typically 3 attempts over 8 days)] → UNPAID
  └── [Customer manually pays invoice] → ACTIVE

UNPAID
  └── [After configured period (e.g., 30 days)] → CANCELLED

CANCELLED
  ├── [Reactivates] → TRIALING (new 14-day trial for returning customer)
  └── [Data purged after 30 days]

PAUSED
  └── [Resumed] → ACTIVE
```

### Effective Access Level (P0-6 — access decisions never read raw status)
Plan-limits and read-only gating read a **derived** `effectiveAccessLevel`, not the raw
`subscription.status`:
- `FULL` — TRIALING (within trial), ACTIVE, or PAST_DUE within the dunning grace window.
- `READ_ONLY` — TRIAL_EXPIRED, PAST_DUE past grace, UNPAID, PAUSED.
- `SUSPENDED` — CANCELLED past the data-retention window.

**Fail-open on ambiguity:** if the mirror is stale (`lastSyncedAt` older than the
reconciliation threshold) or in an ambiguous transitional state, a previously-paying org
is **NOT** hard-locked — it is granted `FULL` and flagged for support review. Locking out
a paying customer is treated as a worse failure than briefly serving a delinquent one.
The read-only enforcement itself is a single composable middleware (one place to test),
not scattered per-endpoint checks.

---

## 16.5 Trial Flow

```
[1] Org registers → Subscription created (plan: TRIAL, status: TRIALING)
    trialEndsAt = now + 14 days
    No credit card required

[2] Day 3: "Your trial is going well!" email
    "You've created {X} leads and connected Instagram."

[3] Day 7: Feature highlight email
    "Did you know about Workflow Automation?"

[4] Day 10: Trial expiry warning
    "Your trial expires in 4 days. Upgrade to keep your data."

[5] Day 13: Final warning (24h)
    Subject: "🚨 Your LeadOS trial expires tomorrow"

[6] Day 14: Trial expires
    - Subscription status → TRIAL_EXPIRED
    - Platform enters read-only mode (no new leads, no sending messages)
    - Banner shown on every page: "Your trial has expired. Upgrade to continue."
    - Data preserved (not deleted)

[7] If upgrades: Stripe Checkout → subscription activated → full access restored
    - Stripe prorates from trial end to next billing date

[8] If abandoned: data soft-deleted after 30 days (scheduled cron job)
```

---

## 16.6 Checkout Flow

```typescript
// POST /api/v1/billing/checkout

const createCheckoutSession = async (
  orgId: string,
  priceId: string,
  successUrl: string,
  cancelUrl: string
) => {
  // Get or create Stripe customer
  let stripeCustomerId = await getOrgStripeCustomerId(orgId);
  if (!stripeCustomerId) {
    const org = await getOrg(orgId);
    const customer = await stripe.customers.create({
      email: org.ownerEmail,
      name: org.name,
      metadata: { organizationId: orgId }
    });
    stripeCustomerId = customer.id;
    await saveStripeCustomerId(orgId, stripeCustomerId);
  }

  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: 'subscription',
    payment_method_types: ['card', 'upi', 'netbanking'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
    subscription_data: {
      trial_end: 'now', // Override any existing trial
      metadata: { organizationId: orgId }
    },
    allow_promotion_codes: true, // Support coupon codes
    billing_address_collection: 'required', // For GST invoices
    customer_update: { address: 'auto' }
  });

  return session.url;
};
```

---

## 16.7 Stripe Webhook Handler

Stripe webhooks must be processed **idempotently AND in order**. Stripe events arrive
out of order, can be missed, and can be replayed. Rules (P0-6):
- **Idempotency:** each event is recorded in `webhook_events (source='STRIPE', externalEventId=event.id)` with a unique constraint; a duplicate is skipped.
- **Ordering:** before applying a subscription change, compare the event/object timestamp against the mirror's stored `lastStripeEventAt`. Apply only if newer; ignore stale/out-of-order events. Persist `lastStripeEventAt` and `lastSyncedAt` on the subscription.
- **Never blind-apply:** derive the mirror's status from the Stripe object's `status` + `current_period_end`, not from the event type alone.

All critical events:

```typescript
// POST /api/webhooks/stripe

const handleStripeWebhook = async (payload: Buffer, signature: string) => {
  // Verify Stripe signature
  const event = stripe.webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET!
  );

  switch (event.type) {
    case 'checkout.session.completed':
      // Payment succeeded via Checkout
      await activateSubscription(event.data.object);
      break;

    case 'invoice.payment_succeeded':
      // Monthly/annual renewal succeeded
      await recordPaymentSuccess(event.data.object);
      await sendInvoiceEmail(event.data.object);
      break;

    case 'invoice.payment_failed':
      // Payment failed → PAST_DUE
      await handlePaymentFailure(event.data.object);
      await sendPaymentFailedEmail(event.data.object);
      break;

    case 'customer.subscription.updated':
      // Plan change, cancellation scheduled, trial converted
      await syncSubscriptionState(event.data.object);
      break;

    case 'customer.subscription.deleted':
      // Subscription fully cancelled
      await handleSubscriptionCancelled(event.data.object);
      break;

    case 'customer.subscription.trial_will_end':
      // Trial ending in 3 days (Stripe sends this)
      await sendTrialEndingEmail(event.data.object);
      break;
  }

  // Mark webhook event as processed
  return { received: true };
};
```

---

## 16.7a Nightly Stripe Reconciliation (P0-6)

Webhooks alone are not trusted for access control. A scheduled job (single-flight, see
cron registry) runs nightly:
1. List subscriptions from Stripe (the source of truth).
2. Diff each against the LeadOS `subscriptions` mirror.
3. Correct any drift (status, period end, plan, seat quantity) and update `lastSyncedAt`.
4. Emit a `billing_mirror_drift` metric and alert on every mismatch (doc 18 §18.3) — a
   non-zero drift count indicates missed/mis-ordered webhooks to investigate.

This guarantees that a missed `invoice.payment_succeeded` cannot leave a paying org in
read-only, and a missed `payment_failed` cannot leave a delinquent org with full access,
beyond one reconciliation cycle.

---

## 16.8 Plan Upgrade/Downgrade

### Upgrade (e.g., Starter → Growth)
```typescript
// User clicks "Upgrade to Growth" → Stripe Customer Portal or inline upgrade

await stripe.subscriptions.update(subscriptionId, {
  items: [{ id: currentItemId, price: newPriceId }],
  proration_behavior: 'create_prorations' // Charge difference immediately
});

// Stripe handles: 
// - Prorating current period
// - Creating credit/debit invoice
// - Upgrading immediately
```

### Downgrade (e.g., Scale → Growth)
```typescript
await stripe.subscriptions.update(subscriptionId, {
  items: [{ id: currentItemId, price: newPriceId }],
  proration_behavior: 'none', // Apply at next billing date
  billing_cycle_anchor: 'unchanged'
});

// LeadOS UI shows: "Your plan will downgrade to Growth on [date]"
// Before downgrade: check if current usage exceeds Growth limits
// If over limit: show warning "You have 8 pipelines. Growth allows 5. Please reduce before downgrading."
```

---

## 16.9 Invoicing & GST

### GST Compliance (India)
- Collect GSTIN from business customers during checkout
- Apply 18% GST on all B2B invoices (software services)
- Use Stripe Tax feature for automatic GST calculation
- Invoice format: includes company name, GSTIN, place of supply, HSN/SAC code
- Invoice number format: `LOS-2026-001234` (year + sequential)
- Invoices available for download from Billing Settings (PDF from Stripe)

### Invoice Mirroring
Every Stripe invoice is mirrored to LeadOS `invoices` table for:
- Displaying in billing UI
- Support team access
- Analytics and revenue reporting

---

## 16.10 Coupon & Discount System

- Coupons created in Stripe Dashboard (admin-only)
- Coupon types: percentage off (%), fixed amount off
- Supported during Checkout (user enters coupon code)
- Partner discounts: pre-applied via referral links
- Usage limits per coupon configurable in Stripe

---

## 16.11 Dunning Management

**Stripe Retry Schedule (configurable):**
- Attempt 1: Day 0 (invoice created)
- Attempt 2: Day 3
- Attempt 3: Day 5
- Attempt 4: Day 8 → if fails → UNPAID

**LeadOS Communication:**
- Day 1 (after failure): "Payment failed" email + in-app banner
- Day 3 (before retry): "Update payment method" email
- Day 5 (before retry): "Your account will be suspended" email
- Day 8 (final attempt): Last chance email
- Day 9 (UNPAID): Account suspended → read-only mode + banner
- Day 30 (UNPAID with no action): Data purge warning email
- Day 37: Data purged (soft delete on all org records)
