# MARKETING REALITY AUDIT

## Architecture Review
Based on `docs/planning/FINAL_ARCHITECTURE.md`, the architecture mandates a Next.js App Router setup with a Next.js BFF for authentication (holding secure, HTTP-only refresh cookies). The API is an Express modular monolith using Prisma with row-level security (RLS). This means the Web App handles all the presentation and the BFF proxies to the Express backend. Auth APIs, organization creation, and JWT issuance are already fully implemented on the backend.

## Duplication Audit

### Already Exists
* **Login**: Exists at `apps/web/src/app/(auth)/login/page.tsx`.
* **Signup**: Exists at `apps/web/src/app/(auth)/signup/page.tsx`.
* **Organization Creation**: Exists via the Auth API (which scaffolds the initial org upon user registration) and the onboarding flow which updates it.
* **Industry / Team Size Selection**: Exists in the wizard at `apps/web/src/app/onboarding/page.tsx`.
* **Dashboard Redirect**: Exists in the onboarding and auth flows (`router.replace('/dashboard')`).
* **Auth & Org APIs**: Already exist in `apps/api/src/modules/auth` and `apps/api/src/modules/organizations`.
* **BFF Routes**: Exist at `apps/web/src/app/api/auth` & `apps/web/src/app/api/bff`.

### Partially Exists
* **Landing Page**: Exists at `apps/web/src/app/(marketing)/page.tsx`, but it is currently a single static page with basic hero and feature sections. Needs extension rather than recreation.
* **Workspace Creation Journey**: Intertwined with signup and onboarding flows. 

### Missing
* **Pricing Page**: No route exists.
* **Features Page**: No route exists.
* **Resources Page**: No route exists.
* **Customer Stories Page**: No route exists.
* **AI Agents Info Page**: No route exists.
* **Email Verification Page**: No route exists in the web app to handle the verification token link.
* **Billing Selection**: Missing from the onboarding wizard (users are skipped straight to data import / channel connection).

---

## Proposed Files & Justification

### 1. `apps/web/src/app/(marketing)/pricing/page.tsx`
* **Why existing file cannot be reused:** No pricing page exists in the repository.
* **Why existing file cannot be extended:** The main landing page is getting too long; pricing deserves its own dedicated route and SEO footprint.
* **Why new file is required:** To display public pricing plans and tier structures before users sign up.

### 2. `apps/web/src/app/(marketing)/features/page.tsx`
* **Why existing file cannot be reused:** No features page exists.
* **Why existing file cannot be extended:** High-level features are on the landing page, but detailed deep-dives require a dedicated space.
* **Why new file is required:** For deep-dive explanations of CRM, Inbox, and AI Agent capabilities.

### 3. `apps/web/src/app/(auth)/verify-email/page.tsx`
* **Why existing file cannot be reused:** The web app has no route to receive and process the verification token sent via email.
* **Why existing file cannot be extended:** Login and Signup pages serve distinct purposes and should not handle token verification states.
* **Why new file is required:** To complete the signup loop required by the backend Auth module.

### 4. `apps/web/src/components/marketing/PricingTable.tsx`
* **Why existing file cannot be reused:** No pricing components exist.
* **Why existing file cannot be extended:** N/A.
* **Why new file is required:** A reusable component to render pricing cards on both the public site and inside the billing dashboard.

### 5. Extend: `apps/web/src/app/onboarding/page.tsx`
* **Why existing file cannot be reused/extended:** We CAN and MUST extend this file.
* **Why new file is NOT required:** We will inject the `Billing Selection` step into the existing `Step` union state rather than creating a duplicate onboarding flow.

### 6. Extend: `apps/web/src/app/(marketing)/page.tsx`
* **Why existing file cannot be reused/extended:** We CAN and MUST extend this file.
* **Why new file is NOT required:** We will append sections for AI Agents and Customer Stories directly into the existing landing page or extract them to dedicated routes if they grow too large.
