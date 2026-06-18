# RISK_ANALYSIS.md

> Staff+ risk register for LeadOS. Each risk: ID, description, likelihood × impact, why it matters, and mitigation.
> The blueprint is the source of truth; these are risks **in executing it**, plus assumptions worth challenging.
> Scoring: Likelihood (L/M/H) × Impact (L/M/H). **Critical** = the few that can sink V1.

---

## 1. Technical Risks

### R-TECH-1 — Redis is now a correctness dependency, not just a cache · **L=M I=H · Critical**
BullMQ (workflows, webhooks, AI, email, outbound sends), session/refresh storage, rate-limiting, and Socket.io pub/sub all live on Redis. The blueprint (doc 20 §20.5) optimistically says "Redis failure → degrade gracefully (cache miss → DB hit) → RTO immediate." That's only true for the *cache* role. If Redis is down, **workflows don't run, webhooks aren't processed, messages don't send, and realtime dies** — that is a product outage, not graceful degradation.
- **Mitigation:** Treat Redis as tier-1 infra (Upstash HA / ElastiCache multi-AZ from the start of V2, documented single-point in V1). Webhook events persist to Postgres *before* enqueue (already in design) so nothing is lost — on Redis recovery, a reconciliation job re-enqueues `PENDING` webhook_events. Separate the cache namespace from the queue namespace so a cache flush never touches queues. Alert on Redis availability as a P1.

### R-TECH-2 — Prisma + RLS + `SET LOCAL` + connection pooling interaction · **L=M I=H · Critical**
The tenant extension (doc 07 §7.3) wraps every query in `prisma.$transaction([$executeRaw SET LOCAL ..., query])`. `SET LOCAL` is transaction-scoped, so this is necessary — but (a) it doubles round-trips per query, (b) interacts badly with PgBouncer **transaction-mode** pooling unless every tenant-scoped op is itself a transaction, and (c) Prisma's interactive transactions hold a connection for their duration, shrinking effective pool size under load.
- **Mitigation:** Benchmark this in Sprint 3 *before* building domain modules on it (already gated in the roadmap). Validate against the actual Neon/PgBouncer pooling mode. If latency fails NFR 4.1, fall back to: app-layer `organizationId` injection as the *primary* control (already present in the extension) with RLS enforced via a per-request `SET` on a dedicated transaction, or a session-variable approach scoped correctly. Do not silently drop RLS — it's the defense-in-depth backstop.

### R-TECH-3 — N+1 and over-fetch on the two hottest queries · **L=H I=M**
The lead-list and Kanban-board endpoints are the most-hit in the system and both naturally invite N+1 (lead → assignee → score; pipeline → stages → deals → contacts/assignees). NFR 4.1 demands P95 < 400ms.
- **Mitigation:** Design these two query shapes deliberately with `select`/`include`, paginate deals-per-stage, virtualize the 200-card Kanban, EXPLAIN ANALYZE before prod (doc 20). Add a query-count assertion in integration tests for these endpoints.

### R-TECH-4 — UUID v4 index/write degradation at scale · **L=M I=M**
UUID v4 PKs (doc 08 §8.1) are random → poor B-tree locality and index bloat on high-insert tables (leads, messages, activities, audit_logs) at 50M+ rows. The blueprint's own scale targets (NFR 4.2) reach 1B messages.
- **Mitigation:** Keep UUID v4 for externally-exposed IDs (enumeration protection is real), but adopt **UUIDv7/ULID** for the high-insert tables' physical ordering, or pair the UUID with a monotonic clustering key. Decide before the messages table is partitioned (doc 08 §8.4). Low cost now, very expensive later.

### R-TECH-5 — WebSocket tier statefulness vs horizontal scaling · **L=M I=M**
Socket.io holds connections in-process; doc 20 §20.4 requires the WS server be separate with a Redis adapter. If launched co-located with the API for speed, multi-instance scaling breaks (a message published on instance A won't reach a client on instance B).
- **Mitigation:** Ship the Redis Socket.io adapter from day one even if WS runs in the API process in V1; extract to its own tier in V2 (already planned). Test cross-instance delivery before scaling past one API instance.

### R-TECH-6 — Workflow WAIT/resume reliability & loops · **L=M I=M**
Long delays (doc 12 §12.7: WAIT via delayed BullMQ jobs resuming from saved state) span deploys, redeploys, and Redis restarts. A workflow whose action re-triggers its own trigger (e.g., "on lead update → update lead") can infinite-loop.
- **Mitigation:** Persist execution state in Postgres (`workflow_executions.actionsExecuted`) not just in the job; on resume, re-hydrate from DB. Add loop/recursion guards (max actions per execution, per-entity execution dedup window), and a per-org execution rate cap. Idempotency keys on side-effecting actions.

### R-TECH-7 — Cross-provider V1 infra fragility · **L=M I=M**
Vercel (FE) + Railway (API/workers) + Neon (DB) + Upstash (Redis) is fast to ship but introduces cross-provider latency, four separate failure/billing domains, cold starts, and a non-trivial connection-pooling story (serverless → Postgres).
- **Mitigation:** Acceptable for V1 velocity. Pin the migration to AWS (doc 05 V2 deployment) to a concrete trigger (org count / latency SLO breach), not "someday." Validate Neon connection limits + pooling under the load test before launch.

---

## 2. Architectural Risks

### R-ARCH-1 — Modular-monolith boundary erosion · **L=H I=H · Critical**
Doc 05's entire scaling thesis ("80% of microservice benefit, refactorable later") depends on modules never reaching across boundaries into each other's tables. Under deadline pressure with 3 engineers, this discipline is the *first* thing that slips — and erosion is invisible until the V2 extraction turns into a rewrite.
- **Mitigation:** Make boundaries *physical and enforced* in P0: ESLint `no-restricted-imports` blocking deep cross-module imports; each module exposes a public service interface + DTOs; cross-module communication only via those interfaces or the event bus; CI fails on violation. Architecture review on any PR that adds a cross-module DB query. This is the single highest-ROI governance investment in the project.

### R-ARCH-2 — `messages` polymorphic conversation reference · **L=M I=M**
`messages.conversationId` + `conversationType` (doc 08) points at either `instagram_conversations` or `whatsapp_conversations` with no real FK — a classic polymorphic-association weakness (no referential integrity, awkward joins, partitioning friction).
- **Mitigation:** Acceptable but document the invariant and enforce it in the repository layer. Consider a unified `conversations` table (channel as a column) before WhatsApp lands in V2 — cheaper to unify now than after 10M+ messages. Flag for the V2 inbox design review.

### R-ARCH-3 — Event bus is in-process `EventEmitter` · **L=M I=M**
`core/events/eventBus.ts` (doc 05) is an in-process emitter. It's fine for the monolith, but (a) events are lost on crash between emit and handler, and (b) it's the seam the V2 service extraction depends on.
- **Mitigation:** For durability-critical events (the ones that drive workflows/billing side effects), don't rely on the in-process emitter alone — enqueue to BullMQ (durable) as the workflow trigger path already does. Keep the emitter for soft realtime/UX events. Design the emitter interface to mirror a future message-bus contract so extraction is a swap, not a rewrite.

### R-ARCH-4 — Plan-limits as ambient cross-cut without a single source · **L=M I=M**
Plan limits appear in at least three docs (07, 13, 16) with **non-matching numbers** (e.g., Starter AI 500/mo vs 200/hr). If each module hardcodes its own, enforcement drifts and customers hit inconsistent walls.
- **Mitigation:** One canonical `PLAN_LIMITS` constant in `packages/shared`, imported everywhere; reconcile the doc discrepancies into it (see ARCHITECT_RECOMMENDATIONS). Enforcement via a single `enforceLimit(org, resource)` helper.

### R-ARCH-5 — Analytics on the primary under load · **L=M I=M**
Analytics aggregations are heavy; doc 05 routes them to a read replica, but Neon replica lag + accidental primary routing can both starve OLTP and show stale numbers.
- **Mitigation:** Hard-separate the analytics Prisma client to the replica connection string; accept eventual consistency in analytics UX (show "as of" timestamps); pre-aggregate hot dashboards (materialized views / rollup tables) before V2 scale.

---

## 3. Meta / Instagram / WhatsApp Risks

### R-META-1 — Meta App Review gates public launch and is outside our control · **L=H I=H · Critical**
`instagram_manage_messages` + `pages_messaging` require full App Review with business verification, screen recordings, and a working demo (doc 14 §14.9). Review latency is days→weeks, can bounce on documentation/policy grounds, and the entire social-first value prop is blocked until it passes.
- **Mitigation:** Submit at the earliest demonstrable point (roadmap Sprint 6, not after UI polish). Complete Facebook Business verification *now* (it's slow and a prerequisite). Prepare a flawless demo org + recording. Keep a beta path using test users/sandbox that works pre-approval so the team and design partners aren't blocked. Have the privacy policy/ToS explicitly naming Instagram data usage ready early.

### R-META-2 — Blueprint's Instagram API model may be outdated · **L=H I=M · Critical to verify**
Doc 14 is written around the **Facebook-Page-linked Graph API v18** flow (`pages_show_list`, `pages_read_engagement`, Page Access Tokens). Meta has been migrating to "**Instagram API with Instagram Login**" and deprecating older versions/paths; the 7-day vs 24h messaging window (doc 14 §14.10) also doesn't match the historical standard 24h window + human-agent tag. Building to a deprecated flow wastes a sprint and risks rejection.
- **Mitigation:** **Spike in Sprint 5/6: validate the entire OAuth + webhook + send flow against the *current* Meta API docs and a live test app before committing the implementation.** Treat doc 14's specific endpoints/versions as illustrative, not literal. Pin a Graph API version and a deprecation-tracking task. Also reconcile the webhook path mismatch (doc 10 `/api/webhooks/instagram` vs SETUP.md `/api/v1/instagram/webhook`).

### R-META-3 — Meta API rate limits & messaging-window economics · **L=M I=M**
IG: ~200 calls/hour/page (doc 14 §14.8). WhatsApp: 24h service window, tiered messaging limits, quality-rating-based throttling, per-conversation pricing (doc 15). Profile enrichment + sends + status polling can blow the IG budget; WA template misuse incurs real cost and quality-rating damage that throttles the whole number.
- **Mitigation:** Per-account BullMQ rate-limiters (already designed: IG 150/hr w/ burst). Cache IG profile lookups. For WA: enforce window state before allowing free-form sends, gate template sends behind approval + Manager role + per-hour broadcast caps (doc 15 §15.8), monitor quality rating and alert on downgrade. Surface cost estimates pre-broadcast.

### R-META-4 — Token expiry / revocation breaking live inboxes · **L=M I=M**
Long-lived tokens expire (60d, doc 14 §14.6); password changes / permission revocations kill Page tokens silently. A dead token = a silently broken inbox = lost leads = churn.
- **Mitigation:** Daily refresh cron (designed); proactive owner notification on EXPIRED; clear in-app reconnection UX; health metric per connected account; alert when an org's only IG account goes EXPIRED.

### R-META-5 — Platform policy / data-use compliance · **L=M I=H**
Meta enforces strict data-use policy (no using messages to train models, deletion within 30d of request, no resale — doc 14 §14.9). A violation can revoke app access platform-wide, killing the product for *all* tenants at once.
- **Mitigation:** Encode the data-use policy as hard system constraints (2-year message retention cron, GDPR erasure pipeline, never feeding message content to model training, AI prompt-caching keyed without raw PII where feasible). Annual policy re-review tied to Graph API version bumps.

---

## 4. Billing Risks

### R-BILL-1 — Stripe vs LeadOS state divergence · **L=M I=H · Critical**
Subscription state lives in Stripe but is mirrored into `subscriptions`/`invoices`/`payments` and read by Plan-Limits for access control. A missed/out-of-order/duplicated webhook → an org is locked out while paid, or has full access while unpaid. Webhooks arrive out of order and can be replayed.
- **Mitigation:** Stripe is the **source of truth**; LeadOS mirror is a cache. Idempotent webhook handling (already in `webhook_events`), but also **handle out-of-order events** (compare Stripe object `status`/timestamps, don't blindly apply). Nightly reconciliation job that pulls subscription state from Stripe and corrects drift. On any access-control decision ambiguity, fail toward *not* locking a paying customer out; alert support.

### R-BILL-2 — Trial-expiry & dunning destructive edge cases · **L=M I=M**
Read-only mode on trial/past-due (doc 16 §16.5, §16.11) plus a 30-day soft-delete then purge. Bugs here either nuke a recoverable customer's data or let churned orgs run free.
- **Mitigation:** "Read-only" must be a single, well-tested middleware gate (not scattered per-endpoint checks). Data purge is a separate, audited, reversible-until-executed cron with explicit warnings (doc 16 timeline) and a manual hold flag for support. Test the full TRIALING→EXPIRED→reactivate and ACTIVE→PAST_DUE→UNPAID→CANCELLED→reactivate paths.

### R-BILL-3 — India GST / invoicing correctness · **L=M I=M**
18% GST, GSTIN capture, place-of-supply, HSN/SAC, sequential invoice numbering (doc 16 §16.9). Errors are a compliance/legal problem, not just a bug.
- **Mitigation:** Lean on Stripe Tax for calculation; validate the invoice format with a finance/tax advisor before charging the first real customer; sequential invoice numbers must be gap-free and concurrency-safe (DB sequence, not app counter).

### R-BILL-4 — WhatsApp pass-through cost confusion · **L=L I=M**
Doc 15 says LeadOS doesn't mark up WA costs and the org pays Meta directly — but the platform still must surface usage/cost or customers get surprise Meta bills and blame LeadOS.
- **Mitigation:** Usage dashboard with conversation category breakdown + free-tier proximity warnings (designed); make the billing-relationship explicit in onboarding.

---

## 5. Scaling Risks

### R-SCALE-1 — Partitioning deferred until painful · **L=M I=H**
Doc 08 §8.4 defines partition *triggers* (leads >5M, messages >20M) but partitioning a live, large, RLS-enabled, FK-referenced table with zero downtime is hard. Waiting until the threshold is hit means doing surgery under load.
- **Mitigation:** Decide partition keys and create the partitioned table *structure* early (even with one partition), so growth is "add a partition" not "migrate a 50M-row table." Validate that RLS + partitioning + the tenant extension compose. Rehearse on a staging clone before the threshold.

### R-SCALE-2 — Webhook ingest spikes (seasonal / viral) · **L=M I=M**
NFR 4.2 targets 50→5,000 webhook events/sec. A coaching institute's admissions season or a viral Reel can spike one org's inbound far above steady state, and Meta requires a <20s ack.
- **Mitigation:** The persist-then-200 design already decouples ack from processing — keep ingest dead-simple (verify + insert + enqueue, nothing else). Autoscale webhook workers on queue depth (alert >1000, doc 18). Per-org fairness in the queue so one viral tenant doesn't starve others (per-org rate-limit / weighted consumption).

### R-SCALE-3 — AI cost scaling non-linear with usage · **L=M I=M**
OpenAI cost scales with leads × messages × refreshes. Per-plan hourly caps protect runaway cost, but Scale plan = "unlimited" AI (doc 16) is an unbounded cost commitment, and GPT-4o features (summary/forecast/recs) are 10–30× the cost of 4o-mini scoring.
- **Mitigation:** Aggressive prompt caching (designed, target >60% hit), model routing (cheap→expensive only on low confidence), batch where possible, and a per-org *cost* budget (not just call-count) with internal alerting even on "unlimited" plans. Track cost-per-org as a margin metric; revisit "unlimited" if a whale erodes margin.

### R-SCALE-4 — Connection pool exhaustion · **L=M I=M**
Stateless API + workers + the per-query transaction pattern (R-TECH-2) all draw on a finite Postgres connection budget (NFR: 20/instance). Scaling API/worker instances multiplies connections; Neon/serverless has hard caps.
- **Mitigation:** PgBouncer/Neon pooler mandatory; size pools against the pooler limit, not the raw DB; separate read-replica pool for analytics; load-test connection behavior at target instance count before scaling.

### R-SCALE-5 — `activities`/`audit_logs` immutable-table growth · **L=M I=M**
Immutable, never-soft-deleted, written on *every* mutation (docs 08 §8.5–8.6). They grow fastest and forever (audit 5-year retention).
- **Mitigation:** Range-partition by `createdAt` monthly (already specified) and automate partition rollover + archival of old audit partitions to cold storage. Ensure the audit Prisma extension is async/non-blocking so it never adds latency to the mutation it records.

---

## 6. Product / Execution Risks (non-technical but project-threatening)

### R-EXEC-1 — V1 scope vs 3-engineer capacity · **L=H I=M**
Eight sprints cover auth, tenancy, full CRM, pipeline, IG inbox, AI, workflows, billing, analytics, *and* doc-20 hardening — with 3 engineers and a 20% tech-debt reserve. That is aggressive.
- **Mitigation:** The roadmap already defers the workflow *visual builder*, advanced analytics, and multi-pipeline to V2. Protect those cuts. Use the design-partner beta as a buffer. If slipping, the safest fast-follow cut is reducing P5 workflow polish (keep the 3 triggers/3 actions working, defer UI nicety to V1.1).

### R-EXEC-2 — Blueprint internal inconsistencies treated as literal · **L=M I=M**
The webhook path mismatch, plan-limit number conflicts, and possibly-dated Meta flow (above) are in the "source of truth." Implementing them verbatim ships bugs.
- **Mitigation:** Reconcile each in a short "blueprint errata" pass at the start of the relevant sprint (tracked in ARCHITECT_RECOMMENDATIONS). The blueprint is authoritative on *intent and architecture*; specific endpoint strings/numbers get verified against reality.

### R-EXEC-3 — Compliance scope creep (HIPAA/GDPR) · **L=M I=H**
Clinic persona (doc 01) implies patient data; doc 04 claims "HIPAA-aware"; GDPR right-to-erasure/portability is promised. These are legal commitments, not features, and HIPAA in particular is a large undertaking (BAA, audit, infra controls) deferred to V3.
- **Mitigation:** Be explicit in V1 marketing/ToS about what is and isn't covered (HIPAA BAA is V3 per doc 21). Build the GDPR export/erasure pipeline in V1 (it's promised and relatively contained). Don't let a clinic onboard under a HIPAA expectation the platform can't yet meet.

---

## 7. Risk Heat Map (the few that decide V1)

| ID | Risk | Severity | Earliest sprint to de-risk |
|---|---|---|---|
| R-META-1 | App Review gates launch | 🔴 Critical | Sprint 6 (submit), business verification now |
| R-META-2 | Dated Instagram API flow | 🔴 Critical | Sprint 5 spike |
| R-ARCH-1 | Module boundary erosion | 🔴 Critical | Sprint 1 (lint enforcement) |
| R-TECH-2 | Tenancy/RLS/pooling perf | 🔴 Critical | Sprint 3 benchmark (gate) |
| R-BILL-1 | Stripe state divergence | 🔴 Critical | Sprint 8 + reconciliation job |
| R-TECH-1 | Redis as correctness dep | 🟠 High | Sprint 1 infra posture |
| R-SCALE-1 | Deferred partitioning | 🟠 High | structure early (Sprint 4–6) |
| R-EXEC-3 | Compliance scope | 🟠 High | ToS clarity at launch |

**Bottom line:** V1 success hinges on four things landing: (1) provably-correct, performant tenancy; (2) Meta App Review clearing on a *current* API integration; (3) module boundaries that survive deadline pressure; (4) billing that never locks out a paying customer. The rest are manageable engineering risks with known mitigations.
