# MARKETING IMPLEMENTATION PLAN

## Overview
- **Feature Completion %**: Marketing & Onboarding is ~40% complete. Auth and base onboarding exist, but deep marketing pages (Pricing, Features) and Email Verification are missing.
- **Duplication Risk %**: HIGH. There is significant risk of accidentally rebuilding login, signup, or onboarding steps since they already exist in a functional state. Strict adherence to reusing `(auth)` and `onboarding` routes is required.

## File Strategy

### Files To Reuse
- `apps/web/src/app/(auth)/login/page.tsx`
- `apps/web/src/app/(auth)/signup/page.tsx`
- `apps/api/src/modules/auth/*` (All Auth APIs)
- `apps/web/src/app/api/auth/*` (BFF Auth handlers)
- `apps/web/src/app/layout.tsx`

### Files To Extend
- `apps/web/src/app/(marketing)/page.tsx`: Enhance the hero section, add customer story highlights, and add navigation links to new routes.
- `apps/web/src/app/(marketing)/layout.tsx`: Add a robust public header (navigation) and footer.
- `apps/web/src/app/onboarding/page.tsx`: Add a new `billing` step for Plan Selection before the `import` step.

### Files To Create
- `apps/web/src/app/(marketing)/pricing/page.tsx`: Public pricing tiers.
- `apps/web/src/app/(marketing)/features/page.tsx`: Deep-dive into product features.
- `apps/web/src/app/(auth)/verify-email/page.tsx`: Route to handle `?token=XYZ` from verification emails.
- `apps/web/src/components/marketing/PricingTable.tsx`: UI component for pricing plans.

## Route Structure
```
(marketing)/
  page.tsx (Extended)
  layout.tsx (Extended)
  pricing/page.tsx (New)
  features/page.tsx (New)
(auth)/
  login/page.tsx (Reuse)
  signup/page.tsx (Reuse)
  verify-email/page.tsx (New)
onboarding/
  page.tsx (Extended with Billing Selection)
```

## Architecture

### Marketing Architecture
Static and Server-Side Rendered (SSR) Next.js React Server Components within the `(marketing)` route group. Uses standard Tailwind CSS + Framer motion for animations. No authenticated state required. Shared layout for navigation/footer.

### Onboarding Architecture
A client-side wizard (`onboarding/page.tsx`) managing its own state. It will be extended to include a step for billing selection. It communicates with the BFF (`/api/v1/organizations` and potentially `/api/v1/billing`) to mutate the org state before finally redirecting to `/dashboard`.

### Auth Architecture
Zero changes to backend. The web layer relies on the existing `(auth)` routes, adding only a `verify-email` page to catch the token from the email, proxy it to the BFF, and display success/failure before redirecting to login.
