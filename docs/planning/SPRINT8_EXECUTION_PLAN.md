# Sprint 8 Execution Plan: Billing & Gating

This document outlines the detailed execution plan for completing **Sprint 8 (Billing, Analytics & Hardening)**, including files to modify, files to create, database migrations, API endpoints, worker tasks, frontend routes, and unit/integration tests.

---

## 1. Files to Modify

### Backend (apps/api)
- [app.ts](file:///Users/rajakumar/lead_os/apps/api/src/app.ts) — Register the billing router `/api/v1/billing`.
- [cron-registry.ts](file:///Users/rajakumar/lead_os/apps/api/src/core/scheduler/cron-registry.ts) — Declare the daily `'billing-reconciliation'` cron task.
- [worker-registry.ts](file:///Users/rajakumar/lead_os/apps/api/src/core/queue/worker-registry.ts) — Wire the `'billing-reconciliation'` job to execute reconciliation.
- [webhook.worker.ts](file:///Users/rajakumar/lead_os/apps/api/src/core/queue/workers/webhook.worker.ts) — Connect the `'STRIPE'` webhook dispatcher to `BillingService.processWebhookEvent()`.
- [check-rls-coverage.ts](file:///Users/rajakumar/lead_os/apps/api/scripts/check-rls-coverage.ts) — Verify that new tables are either RLS-secured or explicitly ignored in the coverage checker script.

### Frontend (apps/web)
- [NavLinks.tsx](file:///Users/rajakumar/lead_os/apps/web/src/components/nav/NavLinks.tsx) — Align side nav highlighting with settings layouts.

---

## 2. Files to Create

### Backend (apps/api)
- `apps/api/src/modules/billing/billing.routes.ts` — Define endpoints for checkout, portals, and subscriptions.
- `apps/api/src/modules/billing/billing.controller.ts` — Handle HTTP controllers for billing actions.
- `apps/api/src/modules/billing/billing.middleware.ts` — Implement `billingGuard` limits-enforcer and `effectiveAccessLevel` checks.
- `apps/api/tests/integration/billing.integration.test.ts` — Multi-tenant integration tests covering checkout generation, portal sessions, idempotent webhooks processing, derived status gating, and nightly synchronization.

### Frontend (apps/web)
- `apps/web/src/app/api/bff/billing/checkout/route.ts` — BFF post proxy for checkout session generation.
- `apps/web/src/app/api/bff/billing/portal/route.ts` — BFF post proxy for customer billing management portal access.
- `apps/web/src/app/api/bff/billing/subscription/route.ts` — BFF get proxy to retrieve subscription metadata.
- `apps/web/src/lib/hooks/useBilling.ts` — React hook fetching active plan bounds.

---

## 3. Database Migrations Required

1. **Migration File:** Create `0022_stripe_billing` to:
   - Create the `billing_plans` table and `BillingPlanId` enum.
   - Create the `stripe_webhook_events` table.
   - Alter `subscriptions` table adding: `planId`, `stripeCurrentPeriodEnd`, `cancelAtPeriodEnd`, `lastStripeEventAt`, `lastSyncedAt`.
   - Add foreign keys linking `subscriptions` to `billing_plans`.
2. **Seeding:** Update database seeds to pre-populate Starter, Growth, and Scale plans.

---

## 4. API Endpoints Mapped

- **`POST /api/v1/billing/checkout`**
  - Starts a Stripe Checkout Session for a requested `planId` and redirects client browser to Stripe.
- **`POST /api/v1/billing/portal`**
  - Generates self-serve Stripe customer portal links.
- **`GET /api/v1/billing/subscription`**
  - Returns current plan details, trial metrics, and limits configuration.

---

## 5. Background Workers & Jobs

- **Stripe Webhook Consumer:** Processes parsed Stripe webhook payloads idempotently using `BillingService.processWebhookEvent()`.
- **Nightly Reconciliation Cron:** Syncs database subscription mirror records with active data fetched from Stripe, resolving discrepancies and logging drift metrics.

---

## 6. Integration Tests Required

- Checkout Session creation and customer record creation checks.
- Signature checking and payload parsing on `/api/webhooks/stripe`.
- Idempotency verification (repeated webhook calls are skipped).
- Access control middleware checks (block database mutations when subscription status is READ_ONLY).
- Cron reconciliation validations comparing Stripe active states against the local database schema.
