# Project Analysis: LeadOS Architecture and Technical Blueprint

This document provides a comprehensive, highly technical analysis of the LeadOS repository, outlining its system-wide architectures, design patterns, load-bearing invariants, and security posture. It is a synthesis of the project's frontend and backend components, database structure, authentication workflows, integration mechanisms, and deployment configurations.

---

## 1. Executive Summary

**LeadOS** is a high-performance, multi-tenant CRM and messaging platform designed to consolidate lead acquisition, conversational workflows, pipeline management, and AI-driven automation. 

### Core Architectural Paradigm
- **Topology:** A **modular monolith** backend (Express + TypeScript) interacting with a **Next.js 15** frontend web app.
- **Data Layer:** **PostgreSQL 15 (Neon)** accessed via **Prisma 5**, utilizing a shared-database, shared-schema tenancy model reinforced by PostgreSQL **Row-Level Security (RLS)** and app-layer query extensions.
- **Async Execution:** An event-driven architecture using **Upstash Redis** and **BullMQ** for out-of-request processing (AI scoring, webhooks, notification delivery, email, and social messaging).
- **Communication Tier:** Real-time bi-directional synchronization via **Socket.io** using a Redis adapter to coordinate org-scoped rooms.

---

## 2. Frontend Architecture (`apps/web`)

The LeadOS frontend is built as a unified Next.js 15 application designed for security, responsiveness, and rich interactive experiences (e.g., Kanban boards, live social chat).

### 2.1 Component & Rendering Strategy
Next.js 15 App Router splits responsibilities cleanly between server and client:
- **React Server Components (RSC):** Utilized for initial data fetching and page layout. RSCs make server-to-server calls to the backend via a secure **Backend-For-Frontend (BFF)** proxy layer to preserve session context without exposing access tokens to client-side storage.
- **Client Components:** Power the heavy interactive features of the CRM:
  - **Kanban Board (`/pipeline`):** Uses `@dnd-kit/core` and `@dnd-kit/sortable` for fluid drag-and-drop actions across pipeline columns, coupled with `framer-motion` for micro-animations.
  - **Social Inbox (`/inbox`):** A responsive split-pane messenger for real-time Instagram and WhatsApp direct message threading.
  - **Interactive Modals & Selectors:** Built using headless accessibility primitives from `@radix-ui/react-*` and styled using Tailwind CSS tokens.

### 2.2 Client-Side State Management
- **UI & Global Layout State:** Managed using lightweight **Zustand** stores (`apps/web/src/lib/store/`), ensuring immediate response times for UI toggles, active filter presets, and socket connectivity states.
- **Server Data State:** Managed via **TanStack Query (React Query) v5** to coordinate caching, deduplication, optimistic updates (such as deal drag-and-drops), and background revalidation.

### 2.3 API Client & Token Management
Client-side network requests are executed via a custom Axios client (`apps/web/src/lib/api-client.ts`) configured with strict security hooks:
- **In-Memory Access Token:** Access tokens are kept strictly in-memory (`apps/web/src/lib/auth/token-store.ts`) and never saved to `localStorage`, `sessionStorage`, or cookies, preventing token theft via Cross-Site Scripting (XSS).
- **Silent Refresh Interceptor:** Axios registers a response interceptor that catches `401 Unauthorized` errors. If an access token expires, the client makes a silent POST fetch to the local Next.js BFF endpoint `/api/auth/refresh`. The BFF swaps the client’s HttpOnly session cookie for a new access token, which is stored in memory, and the original request is seamlessly retried.
- **Cross-Site Request Forgery (CSRF) Mitigation:** Cookie-driven BFF endpoints include standard Origin checks and mandatory custom headers (`X-CSRF-Token: 1`) to satisfy backend CSRF guards.

---

## 3. Backend Architecture (`apps/api`)

The backend is structured as a **modular monolith** in Express and TypeScript, emphasizing clean boundary separation, deterministic request/response pipelines, and async resiliency.

```
[Request] ──► Security Headers ──► CORS ──► Compression ──► Request Logger
                  │
                  ▼
          [Health & Metrics] (Exempt)
                  │
                  ▼
          [Raw-Body Parser] (Webhooks raw bytes for HMAC verification)
                  │
                  ▼
          [Global JSON Parser] (Limit 1mb)
                  │
                  ▼
          [Rate Limiter] (apiRateLimit)
                  │
                  ▼
          [Auth Middleware] (Bearer Token Parsing)
                  │
                  ▼
          [Tenant Middleware] (Active Membership Verification + ALS context)
                  │
                  ▼
          [RBAC Router Guards] (requirePermission)
                  │
                  ▼
          [Domain Controllers] ──► JSON Envelope ──► [Response]
```

### 3.1 Global Middleware Sequence
To maintain bulletproof system integrity, the Express application assembly (`apps/api/src/app.ts`) strictly enforces the following middleware execution order:
1. **Security & Shielding:** `securityHeaders` (Helmet-configured CSP, HSTS, X-Frame DENY) and `corsMiddleware` (strictly limiting allowed origins with credentials enabled).
2. **Performance:** `compressionMiddleware` and standard `requestLogger` with OpenTelemetry tracing identifiers.
3. **Probes & Metrics:** Unauthenticated health checkers (`/health`, `/metrics`) mount early to bypass downstream overhead.
4. **Raw-Body Webhooks:** `/api/webhooks` matches first to capture raw bytes *before* the JSON body parser runs, which is critical for HMAC signature verification.
5. **Rate Limiting:** `apiRateLimit` (IP + Org/User-scoped) to shield resources from volumetric abuse.
6. **Authentication:** `authMiddleware` validates JWT access tokens (`Authorization: Bearer <JWT>`) and populates `req.auth`.
7. **Tenancy Context:** `tenantMiddleware` validates that the user is an active organization member and runs downstream operations in an `AsyncLocalStorage` block.
8. **Authorization (RBAC):** Mounted as route-level guards (`requirePermission`) to restrict endpoints to approved permissions.

### 3.2 Asynchronous Tasks & Queue Topology
All heavy, non-blocking, or third-party operations are processed out-of-request using **BullMQ** workers (`apps/api/src/core/queue/workers/`).
- **Worker Registry:** Workers are separated into distinct runtime processes (`apps/api/src/worker.ts`), preventing I/O-heavy operations (like AI analysis or export generation) from starving the Express request loop.
- **Job Reliability:** Jobs are configured with exponential backoff retry policies (3 attempts with 10s base delay).
- **Queue Manifest:**
  1. `ai-scoring`: Routes leads through OpenAI's `4o-mini` and `4o` engines to determine interest scoring.
  2. `email-delivery`: Coordinates outbound transaction emails via SendGrid.
  3. `webhook-processing`: Processes inbound third-party webhooks in a "persist-then-process" flow.
  4. `instagram-send`: Governs rate-limited outbound Meta Graph API requests.
  5. `notification-delivery`: Executes multi-channel user alerts (in-app, email, push).
  6. `lead-export` & `lead-import`: Orchestrates chunked CSV streaming for bulk migrations.

### 3.3 Real-Time Infrastructure
A Socket.io engine (`apps/api/src/core/realtime/socket-server.ts`) is configured with a Redis adapter. Rooms are scoped strictly at the organization/tenant boundary (`org:<organizationId>`). This prevents message leakage across tenants and ensures live events (such as new leads, status updates, and inbox messages) reach active member sessions instantly.

---

## 4. Multi-Tenancy & Database Schema

The system implements a rigorous **shared-database, shared-schema isolation model** that ensures zero data leakage between organizations (tenants).

### 4.1 Tri-Layer Isolation Strategy
1. **App-Layer Prisma Extension (`apps/api/src/core/tenancy/tenant-extension.ts`):**
   - Intercepts **every** operation targeting a tenant-scoped model (such as `Lead`, `Contact`, `Deal`, `Task`, `Message`).
   - Dynamically injects `organizationId = <activeOrgId>` on reads (`find*`, `count`, `aggregate`, `groupBy`) and writes (`create`, `update`, `delete`).
   - If a developer attempts an un-scoped operation against a tenant model, the extension throws a fatal `TenantScopeError` (deny-by-default).
2. **Transaction-Scoped Database GUC:**
   - Multi-write operations (such as lead onboarding or conversions) are wrapped in a single Prisma interactive transaction.
   - The transaction's first statement executes a Postgres-scoped session variable configuration:
     `SELECT set_config('app.current_organization_id', <orgId>, true)`
   - Because Neon Postgres utilizes transaction-mode pooling (via PgBouncer), using `true` (LOCAL-scoped) guarantees the connection remains pinned to that organization *only* for the lifetime of that specific transaction.
3. **Database-Level Row-Level Security (RLS):**
   - As a safety backstop, all tenant tables are configured with PostgreSQL RLS.
   - Policies evaluate the active connection's GUC using a missing-safe expression:
     `USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)`
   - If the app layer fails to set the GUC, the expression yields `NULL` and PostgreSQL denies the row operation immediately.

### 4.2 Database Verification & Tooling
- **RLS Coverage Audit (`apps/api/scripts/check-rls-coverage.ts`):** Automated test-gate script that inspects DB system tables to assert RLS is enabled on all tenant-owned schemas.
- **Tenancy Benchmarking (`apps/api/scripts/tenancy-bench.ts`):** Evaluates multi-tenant performance under pooling, verifying transaction GUC performance and safety.
- **Enum Parity Gate (`scripts/check-enum-parity.mjs`):** Script that asserts exact, element-for-element parity between enums declared in `packages/shared/src/constants/enums.ts` and models within `prisma/schema.prisma`.

### 4.3 Database Model Inventory (32 Tables)
The system schema (`prisma/schema.prisma`) represents a complete, normalized CRM blueprint:

| Model | Classification | Description |
|---|---|---|
| `HealthCheck` | Infrastructure | Used strictly for read-write verification on deep health checks. |
| `User` | Core Domain | Stores account credentials, email, password hashes, and platform-level flags. |
| `Organization` | Tenancy | Represents the customer organization (tenant); holds plan tier and status. |
| `OrganizationMember` | Tenancy Link | Maps `User` to `Organization` with unique roles and status fields. |
| `Role` | Security/RBAC | Contains keys and names for custom or static organization roles. |
| `Permission` | Security/RBAC | Declares functional capability codes (e.g., `leads.create`, `deals.delete`). |
| `RefreshToken` | Auth | Contains SHA-256 hashed refresh tokens and family grouping IDs. |
| `VerificationToken` | Auth | Manages single-use verification tokens for signup and password resets. |
| `Subscription` | Billing | Local mirror of Stripe subscription objects, track active dates and quantities. |
| `AuditLog` | Observability | Tenant-scoped history tracking for record changes (partitioned by range). |
| `PlatformAuditLog` | Observability | System-wide platform activity log for Super Admin support actions. |
| `Lead` | CRM Domain | The core lead object; links to owners, pipelines, and contact nodes. |
| `Contact` | CRM Domain | Represents individual customers with plaintext, indexable email/phone fields. |
| `Task` | CRM Domain | Action items (call, email, demo) with priority levels, linked to leads/deals. |
| `Activity` | CRM Domain | System feed entries capturing CRM state mutations (partitioned by range). |
| `Notification` | Communication | Real-time and offline alerts routed to active members. |
| `NotificationPreference` | Communication | Multi-channel subscription controls mapped per user. |
| `Note` | CRM Domain | Text-rich commentary modules attached to lead or contact files. |
| `File` | Storage | References S3-hosted assets linked to CRM leads or deals. |
| `AiScore` | CRM Intelligence | Holds AI-generated grading matrices, interest scores, and reasoning text. |
| `CustomFieldDefinition` | CRM Domain | Declares custom attribute schemas (string, number, boolean) for entities. |
| `TeamInvite` | Tenancy | Tracks pending, active, and expired organization invitations. |
| `SavedReply` | Communication | Formatted template shortcuts for messenger and email agents. |
| `Pipeline` | CRM Domain | Represents sales cycles (e.g., "Inbound Sales", "Enterprise Dev"). |
| `PipelineStage` | CRM Domain | Pipeline stages with ordered indexes (e.g., "Contacted", "Proposal"). |
| `Deal` | CRM Domain | Sales opportunities mapped to pipeline stages with currency/values. |
| `WebhookEvent` | Infrastructure | Captures incoming webhook metadata (Stripe, Meta) to guarantee idempotency. |
| `InstagramAccount` | Social | Stores Meta credentials, Page links, and encryption key-versioned tokens. |
| `InstagramConversation` | Social | Direct message chat rooms generated from incoming Meta webhooks. |
| `Message` | Social | Granular inbox logs capturing incoming/outgoing messenger contents. |
| `AiUsageCounter` | Intelligence | Audits token consumption rates to track and block excessive usage. |

---

## 5. Authentication & Authorization Flows

LeadOS implements a rigorous security boundary utilizing a state-of-the-art token topology and a strict same-site proxy gateway.

```
                  [SAME registrable domain: leados.app]
                  
 [Browser Client] ──────────────────────────────────────────┐
   │                                                        │
   │ 1. POST /login (Credentials)                           │ 4. GET /v1/deals (Direct)
   ▼                                                        │    (Auth: Bearer ACCESS_TOKEN)
 [Next.js BFF (app.leados.app)]                             │
   │                                                        │
   │ 2. Proxies /api/v1/auth/login to API                   │
   ▼                                                        ▼
 [Express Monolith (api.leados.app)]                 [Express Monolith (api.leados.app)]
   │                                                        │
   │ 3. Generates Access Token & Opaque Refresh             │ 5. Validates Access Token
   │    Rotates Session Refresh Cookie                      │    Sets Tenant ALS Context
   ▼                                                        ▼
 [Set-Cookie: SESSION_COOKIE (HttpOnly)]              [Neon Database (RLS Backstop)]
```

### 5.1 Same-Site BFF Token Flow
The Next.js BFF (`app.leados.app`) and the Express API (`api.leados.app`) are hosted under the same registrable domain (`leados.app`). This makes all sessions **same-site** and blocks Cross-Site Request Forgery (CSRF) vectors out-of-the-box.

1. **User Authentication:** 
   - The user enters credentials at `/login` on the client.
   - The Next.js BFF server proxies the request to the API `/api/v1/auth/login` carrying same-site headers.
2. **Token Issuance:**
   - The backend validates the password (using `bcrypt` with cost factor 12) and returns:
     - An **Access Token:** Short-lived, 15-minute JWT signed with `HS256`. It carries identity claims (`sub` = userId, `orgId`, `role`, `isSuperAdmin`).
     - A **Refresh Token:** An opaque 48-byte cryptographically secure random string.
   - The refresh token is saved as a SHA-256 hash in the `refresh_tokens` database table. It is returned as an `HttpOnly; Secure; SameSite=Strict` cookie bound to the path `/api/v1/auth`.
3. **Subsequent API Invocations:**
   - The browser client holds the access token strictly in-memory.
   - Requests made from React components to the API contain the `Authorization: Bearer <access_token>` header.
4. **Token Family Rotation & Reuse Detection:**
   - On refresh, the BFF swaps the HttpOnly cookie for a new one.
   - The API rotates both the access token and the opaque refresh token.
   - If an old refresh token is reused (indicating a token theft attempt), the backend instantly revokes the entire **token family**, forces logout for all devices in that family, and fires a high-severity security alert.

### 5.2 RBAC Permission Resolution
Authorization checks are handled at the controller and route layer using the RBAC module (`apps/api/src/modules/rbac/`).
- **Hierarchy:** Super Admin (platform-wide, RLS bypass) -> Owner (org-wide, billing/transfer capabilities) -> Admin (org setup, user management) -> Manager (unrestricted CRM read/writes) -> Sales Executive (restricted to assigned leads, contacts, deals, and inbox threads).
- **Resolver Logic (`apps/api/src/modules/rbac/permission-resolver.ts`):** Evaluates permission claims (such as `leads.create` or `deals.delete`) against the user's role.
- **"Own-Only" Filters:** If the permission resolver returns "own-only" (e.g. Sales Executive reading leads), the database query automatically appends an additional where constraint: `ownerId: userId`.

---

## 6. Integration Layers

The application connects to Stripe (for billing) and the Meta Graph API (for social DM threads) through robust, asynchronous integration patterns.

### 6.1 Stripe Billing Subsystem (BL-1 & BL-3 Resolved)
The local database acts as a cached mirror of Stripe subscription states, protected by strict data safety features:
- **Webhook Idempotency:** Webhook requests (`POST /api/webhooks`) are parsed using raw byte structures. Signature checking uses HMAC-SHA256. Webhooks are immediately written to `webhook_events`. A unique database constraint on `(source, externalEventId)` automatically ignores duplicate event deliveries.
- **Ordered Operations:** Events are processed sequentially. If a late webhook arrives out-of-order, its event timestamp is compared against `subscriptions.lastStripeEventAt`. Stale updates are ignored.
- **Nightly Reconciliation:** A nightly BullMQ cron job fetches current subscription data from Stripe, reconciles seat counts, corrects local mirror drifts, and updates `subscriptions.lastSyncedAt`.
- **Fail-Open Effective Access:** Gate checking reads a derived `effectiveAccessLevel` (Full, Read-Only, Suspended). If Stripe is unreachable or local state is transitional, the gate **fails open** to ensure paying users are never locked out of their accounts during payment gateway hiccups.

### 6.2 Instagram Social Inbox (IG-1 & IG-2 Resolved)
Meta Graph API DMs are routed through an isolated abstraction layer:
- **Instagram Adapter:** All Meta API schemas are isolated behind the `InstagramAdapter` class. The inbox and workflow layers interact with this generic interface, protecting LeadOS from upstream API changes or version deprecations.
- **Out-of-Window Send Queue:** Meta restricts outbound messages to a 24-hour window (plus specific agent tags). Outbound messages are placed in the `instagram-send` queue. Out-of-window violations are gracefully handled, updating the UI with clear delivery failure statuses.
- **Key-Versioned Token Encryption:** Credentials are encrypted at rest using AES-256-GCM. The database field is prefixed with a key-version identifier (`v1:ciphertext`), allowing for zero-downtime key rotation.

---

## 7. Deployment & CI/CD Pipelines

LeadOS is configured for automated builds, deep integration checking, and elastic multi-host container scheduling.

```
                      [Cloudflare DNS / WAF / TLS]
                        │                    │
          app.leados.app│                    │api.leados.app
                        ▼                    ▼
                [Vercel Serverless]   [Railway App Containers]
                (Next.js BFF / CDN)   (Express API - Stateless Cluster)
                                             │
                                             ├─► [BullMQ Workers] (Separate processes)
                                             ├─► [Socket.io Tier] (WS Redis adapter)
                                             │
                                             ▼
                                     [Neon Serverless Postgres] ◄── [Prisma Studio]
                                     (Primary + RLS + Read Replica)
                                             │
                                             ▼
                                     [Upstash Redis (HA Cluster)]
                                     (Sessions, Queues, Pub/Sub, Cache)
```

### 7.1 Infrastructure Topology
- **Web Layer:** Next.js BFF is hosted on Vercel (`app.leados.app`), utilizing Vercel's edge network for asset delivery and API proxying.
- **Application Containers:** The Express API, BullMQ workers, and Socket.io servers run on Railway inside dedicated Docker environments (`infra/docker/api.Dockerfile` and `infra/docker/worker.Dockerfile`).
- **Database & Cache Infrastructure:** 
  - Neon Serverless PostgreSQL 15 manages the transaction database with autoscaling connection pools.
  - Upstash Redis manages low-latency sessions, shared BullMQ state, rate-limit keys, and pub/sub message distribution.
- **Static Assets:** Hosted on AWS S3 and Cloudinary using direct presigned upload URLs.

### 7.2 Observability Stack
- **Logging:** Structured Winston logs capture tenant contexts (`organizationId`, `userId`) while redacting sensitive Personally Identifiable Information (PII) like email, phone, and password hashes.
- **Tracing & Monitoring:** OpenTelemetry exports spans directly to Grafana and Sentry for distributed trace auditing and live error capturing.
- **Metrics:** A custom `/metrics` endpoint exports Prometheus-compatible rates on request latencies, active queues, and system resource metrics.

### 7.3 CI/CD GitHub Workflows
- **CI Remediation & Linters (`ci.yml`):** Runs workspace-wide code formatting checks via Prettier, TypeScript checks, and ESLint rules.
- **Integration Test Isolation (`isolation.yml`):** Runs the vitest isolation suite (`npm run test:isolation`), asserting that RLS schemas, tenant context tables, and RBAC rules are fully verified in mock execution runs.
- **API Deployment (`deploy-api.yml`):** Automatically builds Docker images for both the Express API and workers upon pushes to the `main` branch, then triggers a rolling deploy to Railway gated by target `/health` checks.
- **Web Deployment (`deploy-web.yml`):** Deploys Next.js server resources directly to Vercel production upon passing active CI test runs.

---

## 8. Architectural Invariants

To prevent regressions, the following invariants must be preserved:

1. **Async Out-of-Request Loop:** Never invoke external third-party I/O (such as OpenAI, SendGrid, Meta Graph API, or Stripe API) directly inside an HTTP request-response loop. These must be scheduled as background BullMQ jobs.
2. **Transaction Integrity:** Database updates across multiple entities (e.g., creating a lead and an activity, or converting a lead to a contact) must use database transactions. The transaction must start with a LOCAL GUC organization configuration setting.
3. **No Cross-Module Database Access:** Code modules must interact via public services or the Event Bus — they must never execute direct queries on tables owned by another module.
4. **Tenant Check Fail-Safe:** Every tenant-scoped model in the database must be audited under RLS. If a developer accidentally disables or bypasses Prisma client tenant extensions, RLS must deny database row access.
5. **No Suppression Hacks:** Do not suppress or bypass typescript typing or linters. Use explicit type guards and standard composition patterns.

---

## 9. Conclusion

The LeadOS repository is a masterpiece of modern, secure, and resilient SaaS design. By leveraging Next.js 15 BFF on the frontend, enforcing a modular monolith structure on the backend, and implementing a three-layer tenant isolation strategy at the database layer, LeadOS achieves enterprise-grade security and reliability. The integration of BullMQ for async processes and Socket.io for real-time events ensures the platform remains highly performant and scalable as user traffic grows.
