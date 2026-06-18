# ARCHITECT_RECOMMENDATIONS.md

> Principal architect's recommendations on top of the blueprint. The blueprint is the source of truth; nothing here changes its architecture. These are **gaps to fill, improvements to consider, and launch-gating advice** — framed so the team can accept, defer, or reject each with eyes open.
> Format: each item is **Recommendation → Rationale → Suggested action / when.**

---

## 1. Blueprint Errata to Reconcile Before Implementation (cheap, high-value)

These are internal inconsistencies in the source docs. Resolve each in a 1-hour "errata" pass at the start of the relevant sprint — implementing them verbatim ships bugs.

| # | Issue | Where | Suggested resolution |
|---|---|---|---|
| E1 | **Instagram webhook path mismatch** | doc 10 → `/api/webhooks/instagram`; SETUP.md → `/api/v1/instagram/webhook` | Pick one canonical path (recommend `/api/webhooks/instagram`, outside the versioned/auth'd API surface), fix the other doc, configure Meta to match. **Must be correct before App Review.** |
| E2 | **Plan-limit numbers conflict** | AI: doc 07 §7.7 Starter=500/mo vs doc 13 §13.8 STARTER=200/hr, TRIAL=50/hr | Define both axes explicitly (monthly quota *and* hourly burst) in one `PLAN_LIMITS` constant; reconcile the intended numbers with product. |
| E3 | **Instagram messaging window** | doc 14 §14.10 says 7-day free-form | Verify against current Meta policy (historically 24h standard window + 7-day human-agent tag). Encode whatever is *currently* true. |
| E4 | **Instagram API vintage** | doc 14 uses Page-linked Graph API v18 + `pages_*` scopes | Validate against "Instagram API with Instagram Login" before building (see §4). Treat doc 14 endpoints as illustrative. |
| E5 | **`tasks` permissions absent from matrix** | doc 11 matrix omits `tasks.*` though MANAGER/SALES roles reference them in seeding (§11.5) | Add `tasks` resource rows to the permission matrix for completeness. |

---

## 2. Missing Areas (present in intent, absent or thin in the blueprint)

### M1 — Idempotency & outbox for *outbound* side effects
The blueprint nails *inbound* webhook idempotency but says little about outbound idempotency. A retried `instagram-send` or `email-delivery` job can double-send a DM or email to a customer.
→ **Add idempotency keys to all outbound-message jobs** and a transactional-outbox pattern for "DB write + external send" pairs so a crash between them doesn't double-fire or silently drop. (Sprint 6/7.)

### M2 — GDPR data-export & erasure pipeline
Doc 19 §19.10 promises right-to-access (JSON export in 30d) and right-to-erasure (hard delete PII in 30d), and Meta's data-use policy *requires* deletion within 30d of request — but no module owns this. It's also legally binding, not optional.
→ **Make it a first-class V1 deliverable:** a per-org/per-data-subject export job + an erasure job that hard-deletes PII across leads/contacts/messages/activities while preserving anonymized audit integrity. (V1, fits in P6.)

### M3 — Email deliverability / sender infrastructure
Transactional email (SendGrid) is named but domain auth (SPF/DKIM/DMARC), bounce/complaint handling, and suppression-list honoring aren't specified. Poor setup = verification/reset emails land in spam = broken activation funnel (kills O3).
→ **Specify and verify domain auth + bounce webhooks in Sprint 2** when SendGrid first goes live; monitor deliverability as a launch metric.

### M4 — Background job scheduling (cron) inventory
Multiple crons are implied (IG token refresh, weekly AI re-score, workflow-execution cleanup >90d, trial lifecycle emails, soft-delete purge >30d, audit partition rollover, backup-restore drills) but there's no single scheduler design.
→ **Define one scheduling mechanism** (BullMQ repeatable jobs or a dedicated scheduler) and maintain a **cron registry** (job, cadence, owner, idempotency, what breaks if it doesn't run). (P0 stub, populated per module.)

### M5 — Feature flags & gradual rollout
For a 0→1 product hitting Product Hunt, there's no flagging mechanism to dark-launch, kill-switch a misbehaving integration, or gate plan features cleanly.
→ **Add a lightweight feature-flag layer** (even env/DB-backed) in P0. Doubles as the plan-feature gate and the "disable Instagram sends during a Meta incident" kill switch.

### M6 — API contract artifact (OpenAPI) actually generated
Doc 10 describes REST thoroughly and NFR 4.7 requires "API changes require OpenAPI spec update," but there's no generation strategy. Hand-maintained specs rot.
→ **Generate OpenAPI from the Zod schemas** (single source of truth, doc 06) so the spec can never drift from validation. Powers the V3 public API + Swagger UI for free.

### M7 — Testing strategy specifics
NFR targets 80% service coverage + integration tests for critical journeys, and doc 21 forbids shipping <70% per module — but there's no test-architecture (fixtures, multi-tenant test harness, external-API mocking for Meta/Stripe/OpenAI, seed factories).
→ **Build a tenant-aware test harness + external-API mock layer in P0/P1** so every later module inherits it. The cross-tenant isolation suite (Sprint 3) is the highest-value test asset in the project.

### M8 — Secrets & field-encryption key management / rotation
Doc 19 specifies AES-256-GCM field encryption and 90-day JWT rotation, but key *rotation* for the field-encryption key (which would require re-encrypting stored tokens) isn't designed.
→ **Add a key-version prefix to encrypted fields** so the field-encryption key can be rotated without a big-bang re-encrypt (decrypt-on-read with old key, re-encrypt-on-write with new). (Sprint 6 when token encryption lands.)

### M9 — `lastActivityAt` / denormalized hot fields
The Kanban deal card and lead list both show "last activity," and conversations sort by `lastMessageAt`. Computing "last activity" by scanning the immutable activities table per card is a performance trap at scale.
→ **Denormalize `lastActivityAt` onto lead/deal/conversation** (updated on activity write). Cheap now, essential for the 200-card Kanban NFR.

### M10 — Customer-facing status & support tooling
Doc 18 mentions `status.leados.com` and doc 20 a support queue, but there's no internal admin/support console for the CS team beyond super-admin raw access.
→ **Plan a minimal internal support console** (impersonate-with-audit, view org usage/health, manual billing holds) — the health-score model (doc 01 §1.6) needs somewhere to live. (V1.1 / early V2.)

---

## 3. Improvements (architecture stays; these strengthen it)

### I1 — Unify conversations table before WhatsApp
Merge `instagram_conversations` + `whatsapp_conversations` into one `conversations` table with a `channel` enum, eliminating the `messages` polymorphic FK weakness (R-ARCH-2). Far cheaper before V2 WhatsApp + before millions of messages.
→ Decide at the V2 inbox design review; ideally refactor in early P7.

### I2 — Durable events for side-effect-driving triggers
The in-process `EventEmitter` (R-ARCH-3) loses events on crash. For events that drive workflows/billing/AI, route through BullMQ (durable) and reserve the emitter for soft UX events. Keep the emitter interface shaped like a future message bus so the V2 service extraction is a swap.

### I3 — UUIDv7/ULID for high-insert tables
Keep UUID v4 for enumeration-sensitive external IDs, but use time-ordered IDs for leads/messages/activities/audit_logs to preserve index locality at the 50M–1B row targets (R-TECH-4). Decide before partitioning.

### I4 — Pre-aggregated analytics
Materialized views / rollup tables for dashboard KPIs and pipeline analytics, refreshed on a schedule, instead of live aggregation on the replica. Protects OLTP and hits the analytics latency NFR (P95 < 1.5s) at scale.

### I5 — Single `read-only mode` and `plan-feature` gate
Implement trial-expired/past-due read-only and plan-feature gating as **two small composable middlewares**, not per-endpoint conditionals (R-BILL-2). One place to test, one place to reason about access.

### I6 — Per-org fairness in queues
Weighted/round-robin consumption so one viral or seasonal tenant can't starve webhook/workflow/AI processing for everyone (R-SCALE-2). Important before the first admissions-season spike.

### I7 — Stripe reconciliation job
Nightly pull-from-Stripe to correct mirror drift (R-BILL-1), plus out-of-order webhook handling by comparing object status/timestamps rather than blind-applying. Fail access decisions toward *not* locking out paying customers.

### I8 — Observability cardinality discipline
`organizationId`/`userId` on every log/metric is great for debugging but high-cardinality labels on Prometheus metrics will explode storage. Keep tenant IDs in *logs/traces*, not as metric *labels*; aggregate metrics by plan/route/status instead.

---

## 4. Critical Pre-Build Spike: Validate the Meta Integration (do this first)

Before committing Sprint 5/6, run a **2–3 day spike** that does the full Instagram connect → webhook receive → send round-trip against a live Meta test app on the *current* API:
- Confirm whether the flow is Page-linked Graph API or "Instagram API with Instagram Login," which scopes/tokens apply, the actual messaging window, and the current webhook field names.
- Confirm WhatsApp Embedded Signup prerequisites (Business verification, System User tokens).
- Output: an "errata patch" to docs 14/15 reflecting reality, and confidence that App Review can clear.

This single spike de-risks the two most schedule-threatening items (R-META-1, R-META-2) for a few engineer-days. **It is the highest-priority pre-build action.**

---

## 5. Launch Recommendations (V1)

1. **Submit Meta App Review the moment the connect+webhook+send demo works** — not after the inbox UI is polished. Complete Facebook Business verification *now* (slow prerequisite). This is the long pole; everything else can finish while it's in review.
2. **Gate public launch on the doc-20 checklists *and* three additional must-pass items:** the cross-tenant isolation suite is green, the tenancy performance benchmark is accepted, and the Stripe full lifecycle (trial→paid→fail→dunning→reactivate) passes in test mode.
3. **Beta with the 50 design partners on production infrastructure** (not a separate staging) for ~1 week before public launch, with the activation funnel and NPS instrumented. Public-launch only if beta error rate < 2% (doc 20 standby threshold).
4. **Launch read-only-safe:** trial expiry and dunning must degrade to read-only, never destructive, and the 30-day purge must be reversible-until-executed with a support hold flag.
5. **Ship the GDPR export/erasure pipeline before onboarding any EU or clinic customer**, and be explicit in ToS that HIPAA BAA is a V3 capability (don't let a clinic onboard under a false compliance expectation).
6. **Instrument the core product metric from day one:** DM-received → rep-notified latency, and time-to-first-lead. These *are* the product's value proposition (O1, O2); if they regress, the differentiator is gone.
7. **Have the Meta-incident kill switch ready** (feature flag M5) so a Meta outage or policy action can be contained to "Instagram sending disabled, inbox read-only" rather than cascading failures across the app.
8. **Lock the module-boundary lint rules before the second engineer writes the second module.** Boundary erosion (R-ARCH-1) is unrecoverable cheaply; preventing it costs an afternoon in P0.

---

## 6. Sequencing of These Recommendations

| When | Items |
|---|---|
| **Before any code (now)** | §4 Meta spike; E1–E5 errata triage; M5 flags + M7 test harness decided; R-ARCH-1 lint rules; complete FB Business verification |
| **P0 (Sprint 1)** | M4 cron registry stub, M5 flags, M6 OpenAPI-from-Zod, M7 harness, I8 metrics discipline |
| **P1 (Sprint 2–3)** | M3 email auth, M8 key-versioning design, tenancy benchmark (R-TECH-2), isolation suite |
| **P2–P4 (Sprint 4–6)** | M9 `lastActivityAt`, M1 outbound idempotency/outbox, I3 ID strategy decision, partition structure (R-SCALE-1) |
| **P5–P6 (Sprint 7–8)** | M2 GDPR pipeline, I5 read-only gate, I7 Stripe reconciliation, M8 key-versioning impl |
| **V2 entry (P7)** | I1 unified conversations, I2 durable events, I4 pre-aggregated analytics, I6 queue fairness, M10 support console |

---

## 7. What I Explicitly Endorse (don't second-guess these)

To be clear that this is targeted critique, not wholesale redesign — these blueprint decisions are correct and should be defended against drift:
- Modular monolith with a real extraction path. ✅
- Shared-schema multi-tenancy with app-layer scoping *and* RLS defense-in-depth. ✅
- Async-everything backbone (webhooks/AI/workflows off the request path). ✅
- AI as overridable, cached, cost-capped, never-blocking enrichment. ✅
- Stripe as billing source-of-truth; persist-then-process idempotent webhooks. ✅
- Dark-first, Linear/Attio-grade design system as a genuine differentiator. ✅
- India-first (INR/GST/UPI) with i18n/RTL architecture from day one. ✅
- The V1→V2→V3 sequencing and the 20% tech-debt reserve policy. ✅

The blueprint is a genuinely strong, implementable plan. The recommendations above are the difference between *implementing it* and *implementing it without the three or four mistakes that would otherwise surface at the worst possible time.*
