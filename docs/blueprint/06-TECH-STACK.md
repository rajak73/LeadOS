# 06 — Technology Stack

> **⚠ UPDATED per `docs/planning/P0_FIXES.md` (P0-4).** A thin Next.js BFF (route handlers) is adopted as the auth/session proxy so React Server Components can fetch authenticated data without the in-memory access token. See the note added to §6.1. Consolidated architecture: `docs/planning/FINAL_ARCHITECTURE.md`.

---

## Decision Framework

Every technology choice was evaluated against:
1. **Maturity**: Is it production-proven at scale?
2. **Developer Experience**: Can a senior engineer be productive day 1?
3. **Ecosystem**: Strong community, long-term maintenance?
4. **Performance**: Does it meet our NFR targets?
5. **Cost**: TCO within startup budget constraints?

---

## 6.1 Frontend

### Framework: **Next.js 15 (App Router)**
**Rationale:**
- React Server Components reduce client-side JS bundle significantly
- App Router enables nested layouts, streaming, and parallel routes
- Built-in image optimization, font optimization
- Vercel deployment is zero-config and production-grade
- TypeScript-first
- Large ecosystem of compatible libraries

**Architecture Pattern:**
- Server Components for: dashboard data, lead lists, analytics pages
- Client Components for: interactive forms, Kanban drag-drop, real-time inbox
- Server Actions for: form submissions, mutations (reduces API boilerplate)

**Key Decisions:**
- Use `app/` directory (App Router), NOT `pages/` directory
- Layouts: `(auth)/layout.tsx` for public routes, `(dashboard)/layout.tsx` for protected routes
- Avoid `use client` at layout level — push client boundaries down to smallest possible component
- **BFF for authenticated data (P0-4):** the access token lives in client memory and is NOT readable by Server Components. Authenticated data fetching for RSC pages goes through a thin **Next.js BFF** (route handlers on `app.leados.app`) that holds the session (refresh cookie) server-side and proxies to the API. Client components may also call the API directly with the in-memory bearer token. Web and API are served under one registrable domain (`app.`/`api.leados.app`) so the cookie is same-site (doc 19 §19.1).

---

### State Management: **TanStack Query v5 + Zustand**
**TanStack Query (Server State):**
- All API data (leads, contacts, pipelines) managed via TanStack Query
- Automatic background refetching, cache invalidation, optimistic updates
- Infinite scroll via `useInfiniteQuery`
- Mutations with automatic cache updates

**Zustand (Client UI State):**
- Global UI state: sidebar open/closed, selected org, notification panel
- NOT used for server data — TanStack Query owns that
- Persist some state to localStorage (last viewed pipeline, etc.)

**Pattern — No Redux, No Context API for server state.** TanStack Query eliminates the need.

---

### Form Validation: **React Hook Form + Zod**
- React Hook Form: minimal re-renders, uncontrolled inputs
- Zod: schema-first validation, shared schemas between frontend and backend
- Pattern: define Zod schema once, infer TypeScript types, use same schema in frontend (form) and backend (API validation)

---

### UI Component Library: **Shadcn/UI (Radix Primitives)**
**Rationale:**
- Components are copy-paste into your project — you own the code
- Built on Radix UI primitives (accessible, unstyled, production-grade)
- Pairs perfectly with Tailwind CSS
- Not a dependency — no version lock-in
- Growing community, excellent DX

**Custom Design System on Top of Shadcn:**
- Custom color tokens (CSS variables)
- Extended animation variants
- Custom data table, kanban, inbox components (not available in Shadcn)

---

### Animation: **Framer Motion**
- Page transitions
- Kanban card drag animations (combined with @dnd-kit)
- Notification slide-ins
- Micro-interactions (button press, card hover, score badge pulse)
- **Performance rule**: use `transform` and `opacity` only (GPU-accelerated)

---

### Drag & Drop: **@dnd-kit**
- Kanban pipeline drag-and-drop
- Accessible (keyboard navigation built-in)
- Smooth animations when combined with Framer Motion
- Works with virtualized lists (large pipelines)

---

### Real-Time: **Socket.io Client**
- Connect to WebSocket server on login
- Subscribe to org-specific room
- Events: `notification`, `inbox.message`, `lead.updated`, `deal.moved`
- Auto-reconnect with exponential backoff

---

### HTTP Client: **Axios + TanStack Query**
- Axios instance with interceptors:
  - Auto-attach `Authorization: Bearer <token>` header
  - Auto-attach `x-organization-id` header
  - Intercept 401 → auto-refresh token → retry original request
  - Intercept 403 → redirect to "Access Denied" page
  - Global error toast on 500

---

### Routing: **Next.js App Router (native)**
- No additional routing library needed
- Dynamic routes: `[leadId]`, `[dealId]`, `[conversationId]`
- Parallel routes for split-view inbox layout
- Intercepting routes for sheet-based modals

---

## 6.2 Backend

### Framework: **Express.js with TypeScript**
**Rationale:**
- Lightweight, explicit, zero magic — engineers understand every line
- Massive ecosystem of middleware
- Easy to modularize into domain modules
- TypeScript strict mode enforced via tsconfig

**Alternative Considered: Fastify**
- Fastify is faster (~2x) but Express has 10x more documentation, middleware, and community
- At our scale (V1-V2), Express performance is more than adequate
- **Decision: Start with Express, migrate bottleneck routes to Fastify if needed in V3**

**Middleware Stack (in order):**
```
Request
  → cors()               # CORS headers
  → helmet()             # Security headers (CSP, HSTS, etc.)
  → compression()        # gzip response compression
  → rateLimiter()        # Redis-backed per-IP + per-user rate limit
  → requestLogger()      # Log all requests (OpenTelemetry)
  → authMiddleware()     # Verify JWT, attach user to req
  → tenantMiddleware()   # Extract org from JWT, set Prisma context
  → rbacMiddleware()     # Check permissions for route
  → validateBody()       # Zod schema validation
  → controller()         # Business logic
  → errorHandler()       # Global error handler
Response
```

---

### API Pattern: **REST**
- RESTful resource naming
- JSON request/response bodies
- Consistent envelope format:
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 25,
    "total": 347,
    "hasNextPage": true
  }
}
```
- Error format:
```json
{
  "success": false,
  "error": {
    "code": "LEAD_NOT_FOUND",
    "message": "The requested lead does not exist or you don't have access.",
    "statusCode": 404,
    "details": {}
  }
}
```

**GraphQL considered but rejected:**
- Adds complexity (schema, resolvers, DataLoader)
- Over-fetching is not a real problem with well-designed REST + field selection
- GraphQL better suited when we have external API consumers (V3+)

---

### Runtime: **Node.js 20 LTS**
- V8 engine performance improvements in Node 20
- `--watch` mode for development
- Native `fetch` API
- No performance concerns at our scale

---

## 6.3 Database

### Primary Database: **PostgreSQL 15 (Neon)**
**Why PostgreSQL:**
- Best JSON support (JSONB) for storing custom fields and workflow definitions
- Row Level Security (RLS) for multi-tenant isolation
- Full-text search (for lead/contact search)
- Excellent Prisma integration
- ACID compliance critical for billing and audit data

**Why Neon:**
- Serverless PostgreSQL (scales to zero in dev)
- Built-in branching for dev/staging environments (git-like DB branches)
- Point-in-time recovery built-in
- Managed read replicas
- Compatible with standard PostgreSQL drivers

---

### ORM: **Prisma 5**
- Schema-first, generates TypeScript types automatically
- Prisma Client Extensions for:
  - Automatic `organization_id` injection on all reads/writes
  - Soft delete extension
  - Audit log extension (intercepts mutations)
- Prisma Migrate for schema versioning
- Prisma Studio for data inspection in development

---

## 6.4 Caching: **Redis (Upstash)**

**Use cases:**
| Use Case | Data | TTL |
|---|---|---|
| Refresh Token storage | `refresh:{userId}:{tokenId}` → user metadata | 7 days |
| Rate limiting | `rl:{ip}:{endpoint}` → count | 15 min window |
| Session state | `session:{userId}` → org context | 24 hours |
| Hot data cache | Pipeline stages, org settings | 5 min |
| BullMQ backing store | Job queues | N/A (persistent) |
| Pub/Sub | WebSocket room messages | N/A |

**Why Upstash:**
- Serverless Redis (pay per request, scales to zero)
- Global replication for low-latency
- REST API fallback for edge functions

---

## 6.5 Queue: **BullMQ**

**Queues:**
| Queue | Purpose | Concurrency |
|---|---|---|
| `workflow-execution` | Execute automation workflows | 10 |
| `email-delivery` | Send emails via SendGrid | 20 |
| `ai-scoring` | Compute lead AI score | 5 |
| `webhook-processing` | Process incoming webhooks | 30 |
| `notification-delivery` | Send in-app + email notifications | 15 |
| `instagram-send` | Send outbound Instagram DMs | 10 |
| `whatsapp-send` | Send outbound WhatsApp messages | 10 |
| `data-export` | Generate CSV/PDF exports | 3 |

**Job Configuration:**
- All jobs: `attempts: 3, backoff: { type: 'exponential', delay: 2000 }`
- Failed jobs → Dead Letter Queue (DLQ) with full job data
- Job events logged to Sentry on failure

---

## 6.6 File Storage: **Cloudinary (Media) + AWS S3 (Documents)**

**Cloudinary:**
- Profile photos, lead avatars, Instagram media
- Auto-transformation: resize, compress, WebP conversion
- CDN delivery (fast global access)
- Face detection for avatar cropping

**AWS S3:**
- Documents uploaded to deals/contacts (PDFs, contracts)
- Data exports (CSV, PDF reports)
- Backup storage

**Upload Pattern:**
1. Frontend requests presigned upload URL from API
2. API generates presigned URL (S3) or upload signature (Cloudinary)
3. Frontend uploads directly to Cloudinary/S3 (bypasses API server)
4. Frontend notifies API with returned URL
5. API saves URL to database record

---

## 6.7 Messaging

### Email: **SendGrid**
- Transactional emails: auth, notifications, system alerts
- Marketing emails (coming soon updates, newsletters): Separate SendGrid sending domain
- Email open tracking: webhooks from SendGrid → API
- Unsubscribe management: honor SendGrid suppression lists

### Instagram: **Meta Graph API v18+**
- Messaging API for DM send/receive
- Webhooks for real-time message delivery
- Media API for attachments
- User profile API for lead enrichment

### WhatsApp: **WhatsApp Business API (via Cloud API — no BSP required)**
- Meta's Cloud API (hosted by Meta, no cost for hosting)
- Template message sending
- Free-form messages within 24h conversation window
- Webhook for incoming messages

---

## 6.8 AI Layer: **OpenAI API**

| Feature | Model | Rationale |
|---|---|---|
| Lead Scoring | GPT-4o-mini (structured output) | Cost-efficient for frequent scoring |
| Sentiment Analysis | GPT-4o-mini | Low latency, good accuracy |
| Conversation Summary | GPT-4o | Higher quality for summaries |
| Revenue Forecasting | GPT-4o + fine-tuned | Complex reasoning required |
| Follow-up Recommendations | GPT-4o-mini | Fast, contextual |
| Embeddings (semantic search) | text-embedding-3-small | Cheap, fast, good quality |

**Cost Control Strategy:**
- AI scoring: runs async (BullMQ) — not on critical path
- Caching: identical prompts cached in Redis (24h TTL)
- Model routing: cheap model first → escalate to expensive model only if confidence < 0.7
- Rate limiting: max 100 AI calls per org per hour (Starter), 1,000 (Growth), unlimited (Scale)

---

## 6.9 Supporting Infrastructure

| Service | Tool | Purpose |
|---|---|---|
| Error Tracking | Sentry | Frontend + backend error capture |
| Observability | OpenTelemetry + Grafana | Metrics, traces, logs |
| CI/CD | GitHub Actions | Lint, test, build, deploy |
| Container Registry | AWS ECR | Docker images |
| DNS | Cloudflare | DNS + WAF + DDoS protection |
| SSL | Cloudflare (automatic) | TLS certificates |
| Payments | Stripe | Subscription billing |
| Email Verification | Resend (fallback to SendGrid) | Transactional email |
| SMS (future) | Twilio | OTP, SMS notifications |
