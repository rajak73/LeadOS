# Setup & Deployment Manual

> **⚠ UPDATED per `docs/planning/P0_FIXES.md` (P0-4, P0-5).** Web and API MUST be served under one registrable domain so the auth refresh cookie is same-site, and the Instagram webhook path is canonicalized. Consolidated architecture: `docs/planning/FINAL_ARCHITECTURE.md`.

This guide describes how to deploy LeadOS to production using Vercel (for frontend) and Railway (for backend & database).

## Domain Requirement (P0-4 — mandatory)

The frontend and backend must share one registrable domain (eTLD+1) or the `SameSite`
refresh cookie will not be sent and auth will break:
- Frontend: `https://app.leados.app`  → custom domain mapped to the Vercel deployment
- Backend:  `https://api.leados.app`  → custom domain mapped to the Railway service
Do NOT operate the API on the raw `*.up.railway.app` domain in production — it is a
different registrable domain from the Vercel app and breaks cookie auth.

## Prerequisites

- Node.js v20+ and npm installed locally.
- A Neon PostgreSQL database instance (or equivalent PostgreSQL database).
- A Railway account for hosting backend.
- A Vercel account for hosting frontend.

---

## 1. Database Provisioning

1. Create a database instance on Neon PostgreSQL.
2. Retrieve the connection string.
3. Prepare the URL for environment variables (both local `.env` and Railway variables).

---

## 2. Backend Deployment on Railway

Railway reads the custom `backend/Dockerfile` and maps ports automatically.

1. Install Railway CLI:
   ```bash
   npm i -g @railway/cli
   ```
2. Log in and initialize a project:
   ```bash
   railway login
   railway init
   ```
3. Set the required variables in the Railway dashboard:
   - `DATABASE_URL`: Your production Neon PostgreSQL connection string.
   - `JWT_ACCESS_SECRET`: A secure random cryptographic key string.
   - `JWT_REFRESH_SECRET`: A secure random cryptographic key string.
   - `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`: Verification token matching Meta Webhook setup.
4. Deploy the backend workspace:
   ```bash
   railway up
   ```
5. Ensure the service generates public domain URL (e.g. `https://leados-production.up.railway.app`).

---

## 3. Frontend Deployment on Vercel

Vercel hosts Next.js applications seamlessly.

1. Install Vercel CLI (or connect git repo directly to Vercel dashboard):
   ```bash
   npm i -g vercel
   ```
2. Log in and deploy from root `frontend/` workspace:
   ```bash
   cd frontend
   vercel
   ```
3. Configure the environment variables in Vercel project settings:
   - `NEXT_PUBLIC_API_URL`: Your deployed backend URL path with `/api/v1` suffix (e.g. `https://leados-production.up.railway.app/api/v1`).
4. Promote build to production:
   ```bash
   vercel --prod
   ```

---

## 4. Meta webhook activation (Instagram)

1. Register an App on Meta Developers Portal.
2. Add the **Instagram Graph API** product.
3. Configure webhook subscriptions:
   - Callback URL: `https://api.leados.app/api/webhooks/instagram`  ← CANONICAL path (P0-5). The previously-documented `/api/v1/instagram/webhook` is incorrect; use `/api/webhooks/instagram` (unversioned, raw-body for HMAC verification).
   - Verify Token: The value matching `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` env.
4. Subscribe to the `messages` event field on the App panel.

> **P0-5:** The exact OAuth flow, scopes, token type/lifetime, and messaging window must be validated against the current Meta Graph API (see blueprint doc 14 §14.0) before this integration is configured for production.
