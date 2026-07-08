# Phase 12C — Billing & AI Readiness Audit

## 1. Approved Scope
The goal of this phase was to audit the readiness of the Billing and AI modules, identifying existing components, database schemas, environment variables, and missing pieces, without executing real integrations or editing `.env`.

## 2. Current Project Status
- The core CRM modules are polished and demo-ready (Phase 12B completed).
- Tenant isolation and multi-organization workflows are solid.
- The project is prepared to enforce business rules (Billing) and add smart capabilities (AI).

## 3. Meta Blocker Status
- **Phase 11C (Meta Integration)** remains STRICTLY BLOCKED. The Meta Developer account setup is pending from the founder.

## 4. Files Reviewed
- `prisma/schema.prisma`
- `apps/api/src/modules/billing/*`
- `apps/api/src/modules/ai/*`
- `apps/api/src/modules/webhooks/webhook.controller.ts`
- `apps/api/src/core/config/env.ts`
- `apps/web/src/app/(dashboard)/settings/billing/page.tsx`
- `apps/web/src/app/(dashboard)/tasks/page.tsx`
- `apps/web/src/lib/hooks/useBilling.ts`
- `apps/web/src/lib/hooks/useTasks.ts`

## 5. Existing Billing Inventory
- **Schema:** `Subscription`, `BillingPlan`, and `StripeWebhookEvent` models exist.
- **Backend:** `billing.service.ts` is fully implemented to create Stripe customers, checkout sessions, and portal sessions. `webhook.controller.ts` natively handles and dedupes Stripe webhook events.
- **Frontend:** A polished `BillingPage` (`/settings/billing`) exists with pricing tiers (Starter, Growth, Enterprise). `useBilling.ts` hooks are fully wired to the BFF.

## 6. Existing AI Inventory
- **Schema:** `AiUsageCounter` model tracks token/call limits per tenant per month.
- **Backend:** `AiAdapter` interface exists with `MockAiAdapter`, `OpenAiAdapter`, and `GeminiAdapter`. The `GeminiAdapter` has an implementation for `scoreLead`.
- **Frontend:** "💡 AI Draft" buttons are present in Tasks and Inbox. `useFollowupSuggestion` is wired up to the BFF.

## 7. Reusable Billing Work
- The entire `billing.service.ts` Stripe integration is reusable.
- The idempotent Stripe webhook handling (`StripeWebhookEvent` deduping) is production-grade.
- The frontend pricing UI is beautiful and fully reusable.

## 8. Reusable AI Work
- The AI adapter pattern gracefully falls back to `MockAiAdapter` if keys are missing.
- The UI modal and clipboard copy logic for AI drafts are fully complete.

## 9. Duplicate Code Risks
- None detected. Both modules use centralized services and controllers.

## 10. Billing Gaps
- Usage metrics on the `BillingPage` (e.g., "Leads used: 342") are currently hardcoded placeholders.
- Quota enforcement (blocking Lead/User creation if over plan limits) is missing in the core controllers.
- Real Stripe Products/Prices need to be created in a Stripe Dashboard to get the Price IDs.

## 11. AI Gaps
- `OpenAiAdapter` is entirely unimplemented (throws "not implemented yet").
- `GeminiAdapter` lacks the `draftFollowup` implementation.
- Feature flag handling exists in `env.ts` but the UI doesn't fully disable the AI buttons if AI is disabled system-wide.

## 12. Required Billing Env Variable Names Only
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_STARTER`
- `STRIPE_PRICE_GROWTH`
- `STRIPE_PRICE_ENTERPRISE`

## 13. Required AI Env Variable Names Only
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `FLAG_AI_SCORING_ENABLED`

## 14. Security / Privacy Risks
- **AI Privacy:** Sending `LeadContext` (including names and potential PII) to external LLMs must be bounded by a privacy policy.
- **Billing Security:** The Stripe webhook secret must be securely handled. Currently, it is correctly verified via `stripe.webhooks.constructEvent`.

## 15. Recommended Next Phase
**Option C: Phase 12D — AI Draft Backend Wiring With Feature Flag**
*Why:* This is the safest and most immediately useful step that is entirely code-based. We can complete the `draftFollowup` methods in the AI adapters using prompt engineering, without needing the founder to register for Stripe keys immediately. 

## 16. What Not To Implement Yet
- Do not configure real Stripe accounts or call Stripe APIs yet.
- Do not implement Meta integrations (still blocked).

## 17. Founder Decisions Needed
- Confirm whether to proceed with Option C (AI wiring) or Option A (Billing enforcement).
- Decide which AI provider (OpenAI vs Gemini) will be the primary production model.

## 18. PASS/FAIL Readiness Verdict
**VERDICT: PASS.** The architecture natively supports both Stripe billing and multi-provider AI via clean, decoupled adapters and services.
