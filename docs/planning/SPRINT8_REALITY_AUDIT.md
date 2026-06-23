# Sprint 8 Reality Audit: Billing, Analytics & Hardening

This audit details the implementation status, database models, missing features, and requirements for **Sprint 8 (Billing, Analytics & Hardening)** of the LeadOS application.

---

## 1. Overview & Current Status

* **Status:** 20% Complete
* **Prisma Schema State:** Consolidated models and enums are defined (`BillingPlan`, `Subscription`, `StripeWebhookEvent`), but not deployed in migrations.
* **Core Code:** Stripe Billing service `billing.service.ts` is implemented, but remains completely un-integrated with API endpoints, BFF proxies, and background queue workers.

---

## 2. Feature Breakdown

### Implemented Features
- **Stripe Service Methods:** `BillingService` provides customer creation, Checkout Session link generation, Customer Portal link generation, and base signature verification hooks.
- **Database Schema Models:** Models `BillingPlan`, `Subscription` and `StripeWebhookEvent` are declared in `prisma/schema.prisma`.
- **Frontend Layout:** Static pricing comparison grids and basic usage dashboards exist under `settings/billing/page.tsx`.
- **Ad-hoc DB Scripts:** `apply-billing-db.ts` exists to apply initial schema adjustments and plan seed entries.

### Missing Features
- **API Billing Routes:** Endpoints `POST /api/v1/billing/checkout` (initiate checkout) and `POST /api/v1/billing/portal` (billing management portal) are completely missing.
- **BFF Proxy Handlers:** No server-side BFF handlers exist on the Next.js client for routing billing queries.
- **Live Webhook Worker Integration:** The webhook worker `webhook.worker.ts` has a stub `handleStripe` that merely logs incoming events and does not apply subscription state updates.
- **Nightly Stripe Reconciliation Job:** Cron task to poll Stripe subscriptions, diff state drift, and reconcile database records (P0-6 requirement) is missing.
- **Access Gating Middleware:** Derived `effectiveAccessLevel` gating (checking active/read-only/suspended statuses) and limits-enforcement middleware are missing.
- **Database Migrations:** No migration file has been created to apply Sprint 8 schemas to PostgreSQL.

### Broken Features
- **Frontend Settings Interaction:** Clicking "Upgrade" or "Manage Billing" on the frontend triggers mock alert dialogues instead of redirecting the user to Stripe Checkout.

---

## 3. Tech Stack Requirements

### Database Requirements
- Generate and apply a migration `0022_stripe_billing` defining `billing_plans`, `stripe_webhook_events`, and altering the `subscriptions` table.
- Seed Starter, Growth, and Enterprise plans with real price IDs within the production seeder context.

### API Requirements
- Create `billing.controller.ts` and `billing.routes.ts` in `apps/api/src/modules/billing` and mount them at `/api/v1/billing` in `app.ts`.
- Implement `effectiveAccessLevel` checks and `billingGuard` middleware that switches the platform to READ_ONLY for expired trials or PAST_DUE subscriptions.

### Frontend Requirements
- Create `useBilling` TanStack Query hook under `apps/web/src/lib/hooks/useBilling.ts`.
- Replace static pricing metrics with dynamic usage bounds fetched from the BFF.
- Display a sticky banner across the React app when a trial is near expiration or has entered a READ_ONLY state.

### Worker Requirements
- Connect `BillingService.processWebhookEvent()` to the Stripe dispatcher in `webhook.worker.ts`.
- Implement and register the nightly reconciliation cron job inside the scheduler.

---

## 4. Security & RLS Review

* **HMAC Verification:** Implemented timing-safe webhook challenge comparison to prevent timing attacks.
* **Webhook Idempotency:** Managed via the unique constraint `stripe_webhook_events_pkey`.
* **RLS Coverage:** `subscriptions` has `organizationId` and is RLS-isolated. `billing_plans` is a global read-only table and does not require RLS. Need to ensure `stripe_webhook_events` is handled by system workers outside tenant contexts.

---

## 5. Technical Debt

1. **Stripe Price Mocks:** No automated mock suite for the Stripe Client exists for the integration tests.
2. **Node Version Compatibility:** Must run on Node 20.x exclusively.
