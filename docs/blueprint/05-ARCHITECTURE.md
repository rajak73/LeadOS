# 05 — Architecture Design

> **⚠ UPDATED per `docs/planning/P0_FIXES.md` (P0-1, P0-3, P0-4).** See new §5.6 for the corrected data-access (unit-of-work transaction + tenant GUC), deployment-domain, and BFF clarifications. Consolidated architecture: `docs/planning/FINAL_ARCHITECTURE.md`.

---

## 5.1 Architecture Decision: Monolith vs Microservices

### Options Considered

| Option | Pros | Cons |
|---|---|---|
| Pure Monolith | Simplest to build, deploy, debug | Hard to scale specific bottlenecks; risk of "big ball of mud" |
| Pure Microservices | Maximum scalability, team autonomy | Massive operational complexity, premature for 0→1 |
| **Modular Monolith** | **Domain isolation, simple ops, refactorable** | **Needs discipline to maintain module boundaries** |

### Final Recommendation: Modular Monolith → Microservices Migration Path

**Phase 1 (0–10K orgs):** Modular Monolith
- Single deployable backend with strict internal module boundaries
- Modules communicate via in-process function calls, never direct DB access across modules
- Shared infrastructure: single PostgreSQL, single Redis, single BullMQ

**Phase 2 (10K–50K orgs):** Extract High-Load Services
- Extract: Workflow Execution Engine → standalone service
- Extract: AI Layer → standalone service
- Extract: Webhook Processor → standalone service
- Core CRM monolith remains

**Phase 3 (50K+ orgs):** Full Domain Services
- Each domain (CRM, Inbox, Analytics, Billing) becomes an independent service
- Shared event bus (Apache Kafka or AWS SNS/SQS)
- Service mesh (Istio or AWS App Mesh)

**Rationale:** The modular monolith gives us 80% of microservices' organizational benefits at 20% of the operational cost. Module boundaries defined now will be the service boundaries later — no rewrite required.

---

## 5.2 C4 Architecture Model

### Level 1: System Context Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                           LeadOS Platform                           │
│                                                                     │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────────────────┐ │
│  │   Web App   │   │ Backend API  │   │    Background Workers     │ │
│  │  (Next.js)  │◄──►  (Express)  │◄──►   (BullMQ + Workflow)    │ │
│  └─────────────┘   └──────────────┘   └──────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
         │                  │                        │
         ▼                  ▼                        ▼
    [End Users]      [External Systems]        [AI Services]
    - Sales Reps     - Instagram Graph API     - OpenAI GPT-4
    - Managers       - WhatsApp Business API   - OpenAI Embeddings
    - Owners         - Stripe Payments
                     - SendGrid Email
                     - Cloudinary / S3
                     - Sentry Error Tracking
```

### Level 2: Container Diagram

```
┌────────────────── LeadOS System ──────────────────────────────────────┐
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  Web Application (Next.js 15, App Router, TypeScript)            │ │
│  │  - React Server Components for data-heavy pages                  │ │
│  │  - Client Components for interactive UI                          │ │
│  │  - TanStack Query for client-side state                          │ │
│  │  - Zustand for global UI state                                   │ │
│  │  Deployed: Vercel (CDN-distributed globally)                     │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                          │ HTTPS / REST                                │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  API Server (Express.js + TypeScript)                            │ │
│  │  Modules:                                                        │ │
│  │  ├── Auth Module         ├── Lead Module                        │ │
│  │  ├── Org Module          ├── Deal Module                        │ │
│  │  ├── Team Module         ├── Pipeline Module                    │ │
│  │  ├── Inbox Module        ├── Workflow Module                    │ │
│  │  ├── Analytics Module    ├── AI Module                         │ │
│  │  ├── Billing Module      └── Notification Module               │ │
│  │  Deployed: Railway / AWS ECS Fargate                           │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│        │              │              │              │                  │
│        ▼              ▼              ▼              ▼                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐ │
│  │PostgreSQL│  │  Redis   │  │ BullMQ   │  │  WebSocket Server    │ │
│  │ (Neon)   │  │ (Upstash)│  │ Workers  │  │  (Socket.io)         │ │
│  │ Primary  │  │- Sessions│  │- Workflow│  │  - Notifications     │ │
│  │ DB + RLS │  │- Cache   │  │- Email   │  │  - Inbox updates     │ │
│  │ Read     │  │- RateLimit│ │- AI jobs │  │  - Pipeline changes  │ │
│  │ Replicas │  │- Queue   │  │- Webhooks│  └──────────────────────┘ │
│  └──────────┘  └──────────┘  └──────────┘                            │
└────────────────────────────────────────────────────────────────────────┘
```

### Level 3: Component Diagram (API Server)

```
API Server
├── /src
│   ├── core/
│   │   ├── middleware/
│   │   │   ├── authMiddleware.ts       # JWT verification
│   │   │   ├── tenantMiddleware.ts     # Extract + validate org context
│   │   │   ├── rbacMiddleware.ts       # Permission enforcement
│   │   │   ├── rateLimitMiddleware.ts  # Redis-backed rate limiting
│   │   │   └── validationMiddleware.ts # Zod schema validation
│   │   ├── prisma/
│   │   │   ├── client.ts               # Prisma client singleton + RLS extension
│   │   │   └── extensions/
│   │   │       ├── tenantExtension.ts  # Auto-apply org_id to all queries
│   │   │       └── softDeleteExtension.ts
│   │   ├── redis/
│   │   │   └── client.ts               # Redis connection singleton
│   │   ├── queue/
│   │   │   ├── queues.ts               # Queue definitions
│   │   │   └── workers/
│   │   │       ├── workflowWorker.ts
│   │   │       ├── emailWorker.ts
│   │   │       ├── aiScoringWorker.ts
│   │   │       └── webhookWorker.ts
│   │   ├── events/
│   │   │   └── eventBus.ts             # Internal event system (EventEmitter)
│   │   └── errors/
│   │       ├── AppError.ts
│   │       └── errorHandler.ts
│   │
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.routes.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   └── auth.dto.ts
│   │   ├── leads/
│   │   │   ├── leads.routes.ts
│   │   │   ├── leads.controller.ts
│   │   │   ├── leads.service.ts
│   │   │   ├── leads.repository.ts     # All DB access for leads
│   │   │   └── leads.dto.ts
│   │   ├── pipeline/
│   │   ├── inbox/
│   │   ├── workflow/
│   │   │   ├── engine/
│   │   │   │   ├── triggerEvaluator.ts
│   │   │   │   ├── conditionEvaluator.ts
│   │   │   │   └── actionExecutor.ts
│   │   │   └── workflow.service.ts
│   │   ├── ai/
│   │   │   ├── scoring/
│   │   │   │   └── leadScoringService.ts
│   │   │   ├── sentiment/
│   │   │   └── forecast/
│   │   ├── billing/
│   │   ├── analytics/
│   │   └── notifications/
│   │
│   └── server.ts
```

---

## 5.3 Deployment Diagram

### V1 Deployment (Launch)
```
[Users]
   │ HTTPS
   ▼
[Vercel Edge Network] ─── Next.js Web App (auto-scaled)
   │
   │ HTTPS/REST
   ▼
[Railway / AWS ECS] ─── Express.js API (2x containers)
   │           │               │
   ▼           ▼               ▼
[Neon DB]  [Upstash Redis]  [BullMQ Workers]
(PostgreSQL) (managed)      (2x containers)
   │
   ▼
[Neon Read Replica] ─── Analytics queries only
```

### V2 Deployment (Scale)
```
[Cloudflare] ─── [WAF + DDoS Protection]
   │
[AWS ALB] ─── HTTPS
   │
   ├── [ECS Fargate: API Server] ×4 containers
   ├── [ECS Fargate: Workflow Engine] ×2 containers
   ├── [ECS Fargate: WebSocket Server] ×2 containers
   │
[AWS RDS Aurora PostgreSQL] (Multi-AZ, 1 write + 2 read replicas)
[AWS ElastiCache Redis] (Cluster mode, 3 shards)
[AWS SQS + Lambda] (Webhook processing, auto-scaled)
[AWS S3] (File storage, versioned)
[CloudFront] (CDN for S3 files)
```

---

## 5.4 Network & Communication Architecture

### Synchronous Communication
- Web App → API: REST over HTTPS
- API → Database: PgBouncer connection pool → PostgreSQL
- API → Redis: ioredis with TLS

### Asynchronous Communication
- API → BullMQ → Workers: Job queue for background processing
- Instagram → API Webhook: HTTPS POST from Meta servers
- WhatsApp → API Webhook: HTTPS POST from Meta servers
- Stripe → API Webhook: HTTPS POST from Stripe
- API → WebSocket Clients: Real-time push for notifications

### Internal Event Flow
```
[API receives Instagram webhook]
  → validates HMAC signature
  → emits InternalEvent: "instagram.message.received"
  → EventBus routes to: InboxModule + WorkflowModule
  → InboxModule: saves message to DB, emits WebSocket to assigned user
  → WorkflowModule: enqueues workflow evaluation job
  → WorkflowWorker: evaluates triggers + conditions → executes actions
```

---

## 5.5 Data Flow Architecture

### Lead Capture Flow
```
Instagram DM
  [1] Meta sends HTTPS POST to /api/webhooks/instagram
  [2] Webhook middleware verifies X-Hub-Signature-256
  [3] WebhookController parses and validates payload
  [4] Job enqueued: processInstagramMessage
  [5] Worker: upsert Contact, create/find Lead, save Message
  [6] Worker: trigger LeadCreated event
  [7] Worker: enqueue AI scoring job
  [8] AI worker: compute score, save to Lead.aiScore
  [9] WorkflowWorker: evaluate all active workflows for this org
  [10] Matching workflows execute their actions
  [11] WebSocket push: assigned agent notified
```

### Multi-Region Data Strategy
- Primary PostgreSQL: all writes
- Read Replica: analytics queries, report generation
- Redis: session tokens, rate limits, real-time pub/sub
- Cloudinary/S3: file storage (images, documents)
- Backups: S3 cross-region replication

---

## 5.6 Data-Access, Transaction & Deployment Corrections (P0 remediation)

### Data access (supersedes the original `core/prisma` tenant mechanism)
- The `core/prisma` layer establishes tenant context **once per unit of work** inside a
  single interactive transaction. The transaction's first statement runs
  `set_config('app.current_organization_id', <orgId>, true)` so the RLS GUC and every
  query share one pinned connection (full mechanism: doc 07 §7.3, corrected).
- A Prisma client extension injects `organizationId` on **all** operations (reads, writes,
  upserts, aggregates) for tenant-scoped models, deny-by-default. RLS is the backstop.
- **Multi-write flows are single units of work / transactions** — lead capture (doc 5.5),
  lead→contact conversion, deal-won, and org onboarding (doc 07 §7.6) either fully succeed
  or fully roll back. External calls (Meta/OpenAI/Stripe) run on queues, **outside** the
  transaction, so transactions stay short.

### Deployment topology (auth correctness)
- Web (`app.leados.app`, Vercel) and API (`api.leados.app`, Railway/ECS) are served under
  one registrable domain (`leados.app`) so the refresh cookie is same-site (doc 19 §19.1).
- A thin **Next.js BFF** (route handlers on the web origin) holds the session server-side
  and proxies authenticated data fetches for React Server Components, which cannot read the
  in-memory access token.
