# IMPLEMENTATION_PLAN.md

> Strategy for building LeadOS from empty repo → V1 launch → V2/V3, without violating the blueprint.
> Companion docs: `MODULE_DEPENDENCY_GRAPH.md` (what depends on what), `DEVELOPMENT_ROADMAP.md` (sprint-by-sprint).

---

## 1. Guiding Build Principles

1. **Foundation before features.** Tenancy, auth, RBAC, error/envelope, queue, and observability are infrastructure that every module assumes. Build them once, correctly, first.
2. **Vertical slices after the spine.** Once the spine exists, ship each domain as a thin end-to-end slice (DB → repository → service → controller → route → UI) rather than horizontal layers across all modules.
3. **The webhook/async backbone is a first-class subsystem**, not glue. Instagram, AI, and workflows all sit on it; it must exist and be observable before any of them.
4. **Contract-first.** Zod schemas are shared between frontend and backend (doc 06). Define the contract for a slice, then build both sides against it.
5. **Every module ships with its tests, its audit/activity hooks, and its plan-limit checks** — these are not a later "hardening sprint."
6. **Module boundaries are physical.** Enforced via lint rules (no deep imports across modules; cross-module calls go through a module's public service interface or the event bus). This is what makes the V2 service extraction real.

---

## 2. Development Phases (macro)

The blueprint's roadmap (doc 21) defines product phases V1/V2/V3. This plan decomposes **V1 into engineering phases P0–P6**, then maps V2/V3 onto continuations.

```
P0  Foundation & Platform Spine        (weeks 1–3)
P1  Identity, Tenancy, RBAC            (weeks 2–5)   ← overlaps P0 tail
P2  CRM Core: Leads, Contacts, Activity (weeks 5–8)
P3  Pipeline & Deals                    (weeks 7–10)
P4  Async Backbone + Instagram Inbox    (weeks 9–13)
P5  AI Scoring + Workflow Engine (V1 subset) + Notifications (weeks 12–15)
P6  Billing, Analytics, Hardening, Launch (weeks 14–17)
---- V1 LAUNCH (end of Month 4) ----
P7  WhatsApp + Advanced Workflows + AI Expansion   (V2, months 5–7)
P8  Multiple Pipelines + Advanced Analytics + Email/Zapier + Mobile Web (V2, months 7–9)
P9+ Mobile apps, Public API, Email Marketing, Enterprise security, Global (V3, months 10–18)
```

Phases overlap deliberately — they are not strict gates. The gating relationships are governed by `MODULE_DEPENDENCY_GRAPH.md`.

---

## 3. Phase Detail

### P0 — Foundation & Platform Spine
**Goal:** an empty but production-shaped skeleton that everything else plugs into.

- Monorepo layout: `backend/` (Express) + `frontend/` (Next.js) + `packages/shared` (Zod schemas, types, constants like plan limits & permission keys).
- TypeScript strict mode, ESLint (incl. security plugin + module-boundary rules), Prettier, Husky pre-commit (lint+test).
- Backend core scaffolding from doc 05 §5.2: `core/middleware` (cors, helmet, compression, rateLimit, requestLogger, errorHandler), `core/errors` (`AppError`, global handler), response-envelope helper, `core/prisma/client.ts`, `core/redis/client.ts`, `core/queue/queues.ts`, `core/events/eventBus.ts`.
- Prisma project + initial migration scaffolding; Neon dev branch wired; PgBouncer/pooling decision validated.
- BullMQ wired with one trivial queue + worker process to prove the topology (API process vs worker process separation).
- Health endpoints `/health`, `/health/deep` (doc 18 §18.5).
- Observability from day one: Winston JSON logger, OpenTelemetry request middleware, Sentry init (backend + frontend).
- CI/CD: GitHub Actions (lint → typecheck → test → build → deploy preview); Vercel + Railway pipelines; `npm audit` gate.
- Frontend shell: App Router, `(auth)` and `(dashboard)` route groups, Tailwind + design tokens from doc 17, Shadcn baseline, Axios instance with interceptors (doc 06 §6.1), TanStack Query provider, Zustand store, Socket.io client stub.

**Exit criteria:** a request flows browser → API (with envelope + logging + error handling) → Postgres → back; a job can be enqueued and processed by a separate worker; CI is green and deploys previews.

---

### P1 — Identity, Tenancy & RBAC (the load-bearing core)
**Goal:** correct, tested multi-tenant isolation and auth before any tenant data exists.

- Prisma models: `users`, `organizations`, `organization_members`, `roles`, `permissions`, `refresh_tokens` (doc 08, 09).
- Auth module (doc 03 §3.1, doc 19 §19.1–19.2): register (+ org creation flow from doc 07 §7.6), email verification, login (rate-limited, lockout), JWT issue, refresh rotation + family-reuse detection, password reset, sessions list/revoke, `/auth/me`. Google SSO can be deferred within P1 if it threatens the timeline (it's listed but not on the V1 critical path).
- **Tenant middleware + Prisma tenant extension + RLS policies** (doc 07 §7.3–7.4). This is the single most correctness-critical deliverable in the whole project. It ships with:
  - A dedicated cross-tenant isolation test suite (org A cannot read/write org B by id, by filter omission, by webhook spoof).
  - RLS SQL tests independent of the application layer.
  - A performance benchmark of the `SET LOCAL` transaction-wrapping pattern (see R-ARCH-1) before it's adopted everywhere.
- RBAC middleware + permission matrix + role seeding on org creation (doc 11). "Own-only" record filtering plumbed through the service layer.
- Super-admin path (separate JWT claim, bypasses tenant extension, 2FA, time-limited, `platform_audit_logs`).
- Audit-log Prisma extension (before/after JSONB, PII masked) for auditable models.

**Exit criteria:** full auth lifecycle works; a seeded multi-org dataset passes the isolation test suite at both the app and RLS layers; RBAC matrix enforced and unit-tested; tenancy performance benchmark accepted.

---

### P2 — CRM Core: Leads, Contacts, Activity, Tasks, Notes, Custom Fields
**Goal:** the data heart of the product, fully tenant-scoped and RBAC-gated.

- Models: `leads`, `contacts`, `tasks`, `activities`, `notes`, `files` + custom-field handling (JSONB).
- Lead lifecycle (status machine NEW→…→WON/LOST), source tracking, assignment (incl. round-robin hook point), tags, AI-score display field (populated later by P5), duplicate detection, CSV import (async via queue) + export, list view with filter/sort/search (FTS + pg_trgm).
- Contact CRUD + lead→contact conversion.
- Activity feed (immutable) wired to every mutation via service-layer emission; Notes (rich text); Tasks (types/priority/status, my-tasks + manager views, completion → activity).
- Files: presigned-URL upload pattern (doc 06 §6.6) to Cloudinary/S3, direct-to-storage.
- Plan-limit enforcement (lead/contact/custom-field counts) wired through doc 07 §7.7 pattern.
- Frontend: Leads List (Screen 2), Lead Detail (Screen 3), Tasks views, inline editing, saved filter presets.

**Exit criteria:** an org can manage the full lead/contact/task/note/file lifecycle from the UI within plan limits, with activity trails and audit logs, all RBAC-scoped.

---

### P3 — Pipeline & Deals
**Goal:** the Kanban workspace that is the daily home screen for reps.

- Models: `pipelines`, `pipeline_stages`, `deals`.
- Pipeline + stage CRUD (ordering, color, probability, won/lost terminal stages, default seeding on org create — already triggered in P1 onboarding flow, stages defined here).
- Deal CRUD, stage move, won/lost (with reason), forecasting (weighted pipeline = Σ value×probability), deal detail page.
- Kanban API shaped exactly like doc 10 §10.8 (stages with deal counts/totals + embedded deal cards). Performance target: 200 cards without degradation (NFR 4.9) → virtualization + careful `include`/`select`.
- Frontend: Pipeline Kanban (Screen 4) with @dnd-kit + Framer Motion, optimistic moves via TanStack Query, Deal Detail (Screen 5).
- Single pipeline enforced on Starter; multi-pipeline plumbing present but gated (full multi-pipeline UX lands in V2/P8).

**Exit criteria:** drag-drop pipeline works end-to-end with optimistic UI, deal lifecycle + weighted forecast correct, plan-gated.

---

### P4 — Async Backbone + Instagram Inbox (highest-risk slice)
**Goal:** the social-first heart. Start the Meta App Review clock as early as possible.

- **Webhook subsystem** (doc 05 §5.5, doc 14, doc 19 §19.4): `webhook_events` table, HMAC-SHA256 verification with raw-body buffering, persist-then-200, idempotency via `(source, externalEventId)`, worker dequeue + process, DLQ.
- Instagram OAuth connect flow (doc 14 §14.2), encrypted token storage (AES-256-GCM, doc 19 §19.3), webhook subscription, daily token-refresh cron.
- Message receive pipeline (doc 14 §14.4): account→org resolution, conversation upsert, message persist, lead find/create + IG profile enrichment, emit `instagram.message.received` on the event bus, WebSocket push.
- Message send pipeline (doc 14 §14.5) via `instagram-send` queue with Meta rate-limit guard; status webhooks (delivered/read).
- Models: `instagram_accounts`, `instagram_conversations`, `messages` (polymorphic conversation ref), saved replies, conversation labels, SLA `firstResponseAt` tracking.
- Realtime: Socket.io tier with Redis adapter; org rooms; events `inbox.message`, `notification`, `lead.updated`, `deal.moved`.
- Frontend: Social Inbox (Screen 6) three-panel, conversation list (cursor-paginated), thread view, compose, assignment, create-lead-from-conversation, saved replies (`/` shortcut).

**Exit criteria:** a real DM to a connected sandbox account flows end-to-end to a scored-ready lead and a live inbox; replies send; idempotency and signature verification proven. **Meta App Review submitted by end of P4** (it gates public launch).

---

### P5 — AI Scoring + Workflow Engine (V1 subset) + Notifications
**Goal:** the intelligence and automation layers that make the inbox+CRM "smart."

- AI infra (doc 13 §13.8): OpenAI client with timeout/retries, model routing, Redis prompt cache, per-plan usage limits, circuit breaker, graceful "no score" degradation.
- Lead scoring worker (`ai-scoring` queue): triggers on lead create, status change, new message, task complete, weekly refresh; writes `aiScore` + `aiScoreUpdatedAt`; emits `LEAD_SCORE_CHANGED` when ±10.
- **Workflow engine** (doc 12): `workflows`, `workflow_executions`; `TriggerEvaluator` / `ConditionEvaluator` / `ActionExecutor`; variable interpolation; `workflow-execution` queue; WAIT/delay via delayed jobs + resume. **V1 ships the subset from doc 21:** triggers {Lead Created, Deal Won, Instagram Message Received}; actions {Create Task, Create Notification, Send Email}; ≤5 workflows/org. The engine is built general (all operators), but the UI/exposed catalog is the V1 subset.
- Notifications (doc 03 §3.10): `notifications` table, in-app via WebSocket, email digest via SendGrid, per-user/per-type/per-channel preferences, badge count.
- Frontend: AI score badges + recommendation card on lead/deal; Notifications center (Screen 12); minimal workflow UI (list + simple trigger/condition/action config — full visual builder is V2/P7).

**Exit criteria:** new leads get scored async; the three V1 workflows fire reliably with execution logs and retries; notifications deliver in-app + email; nothing AI/workflow blocks a user request.

---

### P6 — Billing, Analytics, Hardening & Launch
**Goal:** monetization, insight, and everything in doc 20.

- Billing (doc 16): `subscriptions`, `invoices`, `payments`; Stripe customer on org create; Checkout (UPI/netbanking/card, INR, GST/Stripe Tax, billing address); Customer Portal; webhook handler (idempotent, all critical events) as the **source of truth** mirrored into LeadOS; subscription state machine; trial lifecycle + read-only mode; dunning; plan upgrade/downgrade with usage guardrails.
- Analytics (doc 03 §3.8, doc 17 Screen 7): dashboard KPIs, lead source breakdown, pipeline health — served from the **read replica**; V1 ships Overview + Leads + basic Pipeline (advanced velocity/forecast/SLA tabs are V2/P8).
- Hardening against doc 20: load test (k6/Artillery, 1k concurrent), EXPLAIN ANALYZE on hot queries, N+1 sweep, Lighthouse ≥90, backup + PITR restore drill, RLS/isolation re-verification, security checklist (headers, audit, secrets in AWS Secrets Manager, dependency audit), DR runbooks, status page, on-call.
- Go-live per doc 20 §20.6 (smoke tests, low-traffic window, 72h watch).

**Exit criteria:** every checkbox in doc 20 §20.1–20.6 signed off; smoke paths green in production.

---

### P7–P9+ — V2/V3 continuations
- **P7 (V2):** WhatsApp Cloud API (embedded signup, 24h window tracking, templates + Meta approval, broadcast); full workflow engine (all 10 triggers/actions, AND/OR, visual React Flow builder, template library); AI expansion (sentiment, follow-up recs, conversation summary, opportunity detection).
- **P8 (V2):** multiple pipelines + pipeline analytics; advanced analytics (velocity, funnel, team, revenue forecast, inbox SLA); email 2-way sync; Zapier; outbound webhooks; responsive mobile web + PWA push.
- **P9+ (V3):** native mobile apps; public REST API + API keys + developer docs; email marketing module; custom roles/teams/shifts; marketplace + migration importers + Meta Ads/Calendly/Shopify; enterprise security (SAML, IP allowlist, SOC 2, HIPAA BAA); global (i18n, multi-currency, EU residency, Telegram).

---

## 4. Module Dependencies (summary; full graph in `MODULE_DEPENDENCY_GRAPH.md`)

```
Platform Spine (core: errors, envelope, prisma, redis, queue, eventBus, observability)
        └─> Identity/Tenancy/RBAC  (gates EVERYTHING tenant-scoped)
                ├─> Leads ─┬─> Pipeline/Deals
                │          └─> Tasks/Activities/Notes/Files
                ├─> Webhook backbone ─> Instagram Inbox ─┐
                │                                        ├─> Workflow Engine
                ├─> AI Layer ────────────────────────────┤   (consumes events from Leads/Deals/Inbox)
                ├─> Notifications  (consumed by Workflow, Inbox, Billing, AI)
                ├─> Billing/Plan-Limits (cross-cuts: gates create-operations everywhere)
                └─> Analytics (read-only consumer of all of the above; read replica)
```

Key takeaways:
- **Tenancy/RBAC is the universal gate** — nothing tenant-scoped is correct until it's done.
- **The async backbone gates Instagram, AI, and Workflows simultaneously** — it's the highest-leverage early investment after tenancy.
- **Plan-limits is a cross-cut**, not a module — every create-path imports it.
- **Analytics only reads** — it can lag and is safely last in V1.

---

## 5. Build Order (linearized, with parallelization notes)

| Order | Work | Can parallelize with | Blocked by |
|---|---|---|---|
| 1 | P0 spine | — | nothing |
| 2 | P1 auth + tenancy + RBAC | frontend shell, design system | P0 |
| 3 | P2 leads/contacts/tasks/activity | Instagram OAuth scaffolding (read-only, behind flag) | P1 |
| 4 | P3 pipeline/deals | inbox UI shell | P2 (leads) |
| 5 | P4 webhook backbone + IG inbox | Meta App Review paperwork (start now) | P1 + async backbone |
| 6 | P5 AI scoring + workflow subset + notifications | analytics scaffolding | P2/P3/P4 events |
| 7 | P6 billing + analytics + hardening | docs/support content | all above |

**Two streams can run concurrently for most of V1:** a *backend/platform* stream (P0→P1→P4 backbone→P5) and a *CRM/UX* stream (design system → P2 → P3 → inbox UI). They converge at P5/P6.

---

## 6. Milestones (engineering, mapped to roadmap doc 21)

| Milestone | When | Definition |
|---|---|---|
| **M0 — Spine green** | end wk 3 | CI/CD, request lifecycle, queue topology, observability live |
| **M1 — Tenancy proven** | end wk 5 | Isolation + RLS test suites pass; auth lifecycle complete |
| **M2 — CRM usable** | end wk 8 | Lead/contact/task/note/file lifecycle in UI, RBAC-scoped |
| **M3 — Pipeline live** | end wk 10 | Kanban drag-drop + deal lifecycle + forecast |
| **M4 — Social inbox live + Meta review submitted** | end wk 13 | Real DM → scored-ready lead → live reply; App Review in flight |
| **M5 — Intelligent + automated** | end wk 15 | AI scoring + 3 workflows + notifications reliable |
| **M6 — V1 Launch-ready** | end wk 17 / Month 4 | Billing + analytics + doc 20 fully signed off → public launch |
| **M7 — V2 channels/automation** | Month 7 | WhatsApp + full workflow builder + AI expansion |
| **M8 — V2 launch** | Month 8–9 | Multi-pipeline, advanced analytics, email/Zapier, mobile web |
| **M9+ — V3** | Month 10–18 | Mobile apps, API platform, enterprise, global, SOC 2 |

Critical-path milestone is **M4**: Meta App Review latency is outside our control and gates public launch. Everything is sequenced to hit M4 as early as defensible.
