# MODULE_DEPENDENCY_GRAPH.md

> What depends on what, and where the critical path runs.
> Modules are the ones defined in doc 05 §5.2 + doc 03 module map. Build order derives from this graph.

---

## 1. Layered View

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ L0  PLATFORM SPINE (no tenant concept)                                        │
│   core/errors · response envelope · prisma client · redis client ·            │
│   queue (BullMQ) · eventBus · middleware (cors/helmet/compression/            │
│   rateLimit/requestLogger/errorHandler) · observability (Winston/OTel/Sentry) │
└─────────────────────────────────────────────────────────────────────────────┘
                                   │  (everything sits on L0)
┌─────────────────────────────────────────────────────────────────────────────┐
│ L1  IDENTITY & TENANCY (the universal gate)                                   │
│   Auth · Org · OrganizationMember · tenantMiddleware + Prisma tenant ext +    │
│   RLS · RBAC (roles/permissions/matrix) · Audit · Super-admin · Plan-Limits*  │
└─────────────────────────────────────────────────────────────────────────────┘
                                   │  (every tenant-scoped module requires L1)
┌──────────────────────────────┬────────────────────────────┬──────────────────┐
│ L2  CRM DOMAIN               │ L2  COMMS BACKBONE         │ L2  MONETIZATION   │
│   Leads ──> Pipeline/Deals   │   Webhook subsystem ─┐     │   Billing/Stripe   │
│   Contacts                   │   Instagram Inbox ◀──┘     │   (+ Plan-Limits*) │
│   Tasks/Activities/Notes/    │   WhatsApp Inbox (V2)      │                    │
│   Files/Custom-fields        │   Realtime (Socket.io)    │                    │
└──────────────────────────────┴────────────────────────────┴──────────────────┘
                                   │
┌──────────────────────────────┬────────────────────────────┐
│ L3  INTELLIGENCE & AUTOMATION │ L3  ENGAGEMENT             │
│   AI Layer (scoring/sentiment │   Notifications            │
│   /forecast/recs/summary)     │   (in-app WS + email)      │
│   Workflow Engine             │                            │
└──────────────────────────────┴────────────────────────────┘
                                   │
┌─────────────────────────────────────────────────────────────────────────────┐
│ L4  INSIGHT (read-only consumer of everything; uses read replica)             │
│   Analytics & Reporting · Forecasting dashboards                              │
└─────────────────────────────────────────────────────────────────────────────┘

* Plan-Limits is drawn at L1 because it is a cross-cutting policy imported by
  every create-path in L2/L3, but its data (subscription/plan) is owned by Billing.
```

---

## 2. Explicit Dependency Table

| Module | Hard-depends on | Consumes events from | Notes |
|---|---|---|---|
| **core/spine (L0)** | — | — | No tenant awareness. Foundation for all. |
| **Auth** | L0 | — | Issues JWT carrying `{userId, orgId, role}`. |
| **Org** | L0, Auth | — | Org created during registration; seeds roles, default pipeline, trial sub. |
| **Tenancy (middleware+ext+RLS)** | L0, Auth, Org, OrgMember | — | **Gates every tenant-scoped query.** Universal hard dependency. |
| **RBAC** | Tenancy, Roles/Permissions | — | Permission check on every protected op; sets `ownOnly`. |
| **Audit** | Tenancy | (Prisma mutation hooks) | Cross-cuts all auditable models. |
| **Plan-Limits** | Tenancy, Billing(subscription data) | — | Imported by Leads/Contacts/Pipelines/Workflows/Team/AI/Inbox create-paths. |
| **Leads** | Tenancy, RBAC, Plan-Limits | (emits LEAD_* events) | Root CRM object; almost everything references it. |
| **Contacts** | Tenancy, RBAC | Leads (conversion) | |
| **Tasks/Activities/Notes/Files** | Tenancy, RBAC, Leads/Contacts/Deals | many (writes Activity) | Activity is the immutable audit-of-record per entity. |
| **Pipeline/Deals** | Tenancy, RBAC, Plan-Limits, Leads, Contacts | (emits DEAL_* events) | Kanban; weighted forecast. |
| **Webhook subsystem** | L0 (queue, redis, eventBus), Tenancy(for org resolution) | Meta/Stripe (external) | persist-then-process, idempotent. Backbone for IG/WA/Stripe. |
| **Instagram Inbox** | Webhook subsystem, Leads, Contacts, Realtime, encrypted-token store | webhook events | Creates leads, emits `INSTAGRAM_MESSAGE_RECEIVED`. |
| **WhatsApp Inbox (V2)** | Webhook subsystem, Leads, Contacts, Realtime, templates | webhook events | 24h window state machine; template approval. |
| **Realtime (Socket.io)** | L0 (redis pub/sub), Auth | Inbox, Notifications, Leads, Deals | Separate scalable tier. |
| **AI Layer** | L0 (queue, redis cache), Plan-Limits, Leads/Deals/Inbox data | LEAD_*, DEAL_*, MESSAGE_* | Always async. Writes scores/insights back; emits LEAD_SCORE_CHANGED. |
| **Workflow Engine** | L0 (queue), Tenancy, Plan-Limits, **action targets** (Email/IG/WA/Task/Lead/Notification) | ALL domain events (triggers) | Highest fan-in of dependencies; effectively orchestrates other modules. |
| **Notifications** | L0 (queue), Realtime, Email(SendGrid) | Workflow, Inbox, Billing, AI, Tasks | Delivery channel consumed by many. |
| **Billing** | Tenancy, Org, Webhook subsystem(Stripe), Email | Stripe events | Source of truth = Stripe; LeadOS mirrors. Owns subscription data Plan-Limits reads. |
| **Analytics** | Tenancy, **read replica**, all domain tables | — (reads only) | Last to build; safely lags; never on write path. |

---

## 3. Critical Path Analysis

### 3.1 The single longest dependency chain (the critical path)

```
L0 spine
  → Auth
    → Org + OrgMember
      → Tenancy (middleware + Prisma extension + RLS)        ★ correctness chokepoint
        → Leads
          → Webhook subsystem + Instagram Inbox              ★ external-dependency chokepoint (Meta App Review)
            → Workflow Engine (depends on Inbox events + action targets)
              → Notifications (workflow action) + AI (scoring on inbound msg)
                → V1 launch readiness (doc 20)
                  → Billing (gates monetization, but parallelizable in P6)
```

**Critical path = Tenancy → Leads → Instagram Inbox → Workflow Engine.** These four, in order, cannot be meaningfully parallelized against each other and each is high-risk:

- **Tenancy** is the correctness chokepoint. A bug here is a cross-tenant data breach. It must be done early, with its own test suites and a performance benchmark of the `SET LOCAL`/transaction pattern.
- **Instagram Inbox** is the external-dependency chokepoint. It cannot fully ship until **Meta App Review** approves messaging permissions — a latency entirely outside engineering control (typically days–weeks, sometimes longer). **Therefore App Review must be initiated the moment the OAuth + webhook flow is demonstrable, not after the inbox UI is polished.** This is the #1 schedule risk for V1.
- **Workflow Engine** has the **highest fan-in**: it can only be fully exercised once its action targets (Email, Create Task, Create Notification for V1; +IG/WA send, lead update, assign, tag, webhook for V2) and its trigger sources (Leads, Deals, Inbox) exist. It is correctly sequenced last in V1's functional set.

### 3.2 Off-critical-path (parallelizable / slack)

These can be built alongside the critical path without blocking it:
- **Contacts, Tasks, Notes, Files** — depend only on Leads/Tenancy; a second engineer can own them while the inbox is being built.
- **Pipeline/Deals** — depends on Leads but not on Inbox/AI/Workflow; parallel to the comms backbone.
- **Design system + frontend shell + Leads List/Detail UI** — parallel to backend tenancy/inbox work.
- **Billing** — depends on Org + Stripe webhook plumbing; can be built in parallel in P6 and only *gates revenue*, not the product's core loop. (It does, however, gate Plan-Limits enforcement values — so the *limits constants* live in `packages/shared` and are usable before Billing is wired.)
- **Analytics** — pure read consumer; maximum slack; safely last.

### 3.3 Cross-cutting concerns (not modules, but block "done")

Each of these must be threaded through **every** module as it's built — retrofitting them is the classic 0→1 trap:
- **Tenant scoping** (every query) — enforced by Tenancy layer + lint.
- **RBAC + own-only filtering** (every protected op).
- **Plan-limit checks** (every create-path).
- **Activity + audit emission** (every mutation of an auditable/timelined entity).
- **Zod validation** (every request boundary) + shared schemas.
- **Observability** (every request, job, external call) + PII redaction.
- **Idempotency** (every webhook + every externally-triggered side effect).

### 3.4 Highest fan-in / fan-out (where a change ripples)

| Module | Fan-in (how many depend on it) | Risk if it changes |
|---|---|---|
| **Tenancy/RBAC** | Maximum — all tenant modules | Any change is a security-review event. Freeze its interface early. |
| **Leads** | Very high — pipeline, tasks, inbox, AI, workflow, analytics all reference leads | Schema/contract changes are expensive; design the Lead model deliberately up front. |
| **eventBus / event names** | High — workflow + AI + notifications subscribe | Event names are a contract; version them. |
| **Plan-Limits constants** | High — every create-path | Keep in `packages/shared`, single source. |
| **Workflow Engine** | High fan-out — calls into many modules | Calls must go through stable module service interfaces, not internals. |

---

## 4. Service-Extraction Seams (for the V2→V3 monolith→services migration, doc 05 §5.1)

The graph predicts exactly where doc 05's planned extractions cut cleanly, **if** module boundaries are respected from day one:

1. **Workflow Execution Engine** → extract first (doc 05 Phase 2). Already async, queue-fed, event-driven. Seam = the event bus + action-target service interfaces. Make those interfaces network-callable and it lifts out.
2. **AI Layer** → extract second. Already async, stateless, external-API-bound, talks to the rest only via queue + DB writes. Cleanest seam in the system.
3. **Webhook Processor** → extract third. Already an isolated ingest→queue boundary.
4. **Per-domain services (CRM/Inbox/Analytics/Billing)** → Phase 3, behind an event bus (Kafka/SNS-SQS).

**Architectural mandate that protects all of this:** modules communicate via in-process function calls through public service interfaces or the event bus — **never** direct DB access across module boundaries. Enforce with ESLint module-boundary rules in P0. If this discipline slips, the "refactorable monolith" promise in doc 05 silently becomes a big ball of mud and the V2 extraction becomes a rewrite. This is the most important non-functional invariant in the entire build.
