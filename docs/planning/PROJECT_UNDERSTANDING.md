# PROJECT_UNDERSTANDING.md

> Authored by: Founding Engineer / Principal Architect
> Source of truth: `docs/blueprint/01..21`
> Status: Living document — reflects my synthesis of the blueprint as of June 2026

---

## 1. Product Summary

**LeadOS is an AI-powered Revenue Operating System built for the social-first business era.**

It collapses six tools that SMBs currently stitch together — CRM, social inbox, automation engine, analytics, AI assistant, and billing — into a single multi-tenant SaaS platform with one data model, one login, and one source of truth per customer relationship.

The defining insight behind the product: for the target market (agencies, real-estate teams, clinics, coaching institutes, insurance advisors — primarily in India), **the first customer touch now happens in an Instagram DM or a WhatsApp message, and response speed determines win/loss.** Legacy CRMs (Salesforce, HubSpot, Pipedrive) were built for email/phone inside-sales and treat social as a bolt-on. Pure social-automation tools (ManyChat) have no CRM underneath. LeadOS is positioned in the empty quadrant: **social-first + AI-native + premium UX + SMB-affordable + billing built-in.**

### What the system actually does (end to end)
1. A prospect DMs a connected Instagram/WhatsApp business account.
2. Meta fires a webhook → LeadOS verifies the signature, persists the raw event idempotently, and returns `200` within Meta's 20s window.
3. A background worker upserts the Contact, finds-or-creates a Lead, stores the Message, and links the conversation.
4. AI lead scoring runs asynchronously (0–100 + factors + recommendation).
5. The active workflows for that org are evaluated (trigger → conditions → actions), which may auto-reply, create tasks, notify, tag, or branch with timed waits.
6. The assigned rep is pushed a real-time notification (WebSocket) and works the lead through a Kanban pipeline.
7. On deal-won, a Contact is created/linked; analytics, forecasting, and billing-usage all reflect the change.

### Primary architectural shape
- **Frontend:** Next.js 15 (App Router, RSC) on Vercel; TanStack Query + Zustand; Shadcn/Radix + Tailwind; @dnd-kit; Framer Motion; Socket.io client. Dark-first, Linear/Attio-inspired design system.
- **Backend:** Express + TypeScript **modular monolith** on Railway/ECS; strict module boundaries (auth, org, team, leads, contacts, pipeline, deals, inbox, workflow, ai, billing, analytics, notifications).
- **Data:** PostgreSQL 15 (Neon) with Prisma 5; shared-schema multi-tenancy with Prisma tenant extension + Postgres RLS as defense-in-depth; Redis (Upstash) for sessions, rate-limits, cache, pub/sub; BullMQ for all async work.
- **External:** Meta Graph API (Instagram), WhatsApp Cloud API, OpenAI, Stripe, SendGrid, Cloudinary/S3, Sentry, OpenTelemetry/Grafana.

---

## 2. Core Business Objectives

| # | Objective | Encoded in blueprint as | Implication for engineering |
|---|---|---|---|
| O1 | **Win the social-first SMB segment** that legacy CRMs ignore | Personas (agency, real estate, clinic, coaching, insurance); competitive matrix | Instagram/WhatsApp inbox must be first-class, not a feature flag. Latency from DM→rep-notified is the core product metric. |
| O2 | **Time-to-value < 10 minutes** | NFR 4.9; onboarding checklist; "first lead in < 5 min" | Self-serve onboarding, opinionated defaults (default pipeline, seeded roles), zero-config trial (no card). |
| O3 | **Convert trial → paid at ≥25%** | Roadmap V1 metrics; trial lifecycle (16-billing) | Activation instrumentation, lifecycle emails, read-only (not destructive) trial expiry, frictionless Stripe checkout (UPI/netbanking/card, INR, GST). |
| O4 | **Scale to 10K orgs / 50M+ records without re-architecture** | NFR 4.2; architecture migration path (05); partitioning (08) | Module boundaries = future service boundaries. Tenant key on every hot table. Partitioning strategy pre-designed. |
| O5 | **Premium, fast, trustworthy UX** | UI/UX doc (17); Core Web Vitals (04) | Dark design system, < 2.5s LCP, < 200ms INP, 200-card Kanban without degradation, keyboard-first. |
| O6 | **AI that removes work, not adds gimmicks** | AI layer (13) | AI is always async, never blocks the request path; outputs are overridable; cost-controlled per plan. |
| O7 | **Revenue targets:** 500 paying orgs / $50K MRR (V1) → 5K / $500K (V2) → 25K / $3M ARR (V3) | Roadmap (21) | Roadmap sequencing is a business contract, not just an eng plan. |

---

## 3. Primary Differentiators

These are the bets the whole build must protect. If a tradeoff threatens one of these, escalate rather than silently compromise.

1. **Social inbox as the primary surface, not a tab.** Conversations drive leads, leads drive deals. The Kommo concept ("conversations as the primary CRM object") executed with a premium design and real CRM depth underneath.
2. **AI-native lead intelligence.** Every lead is scored 0–100 with explainable factors; reps get next-best-action; managers get AI-enhanced forecasts. Built in, not a chatbot bolt-on.
3. **Native no-code automation engine.** Replaces the ManyChat + HubSpot + Zapier stack ($300+/mo) the target customer pays today. JSONB-defined triggers/conditions/actions executed on BullMQ.
4. **SMB-affordable, transparent INR pricing with billing built-in.** ₹2,999 / ₹7,999 / ₹19,999 per month. Every other competitor makes you bolt on a separate billing/subscription tool — LeadOS ships it.
5. **Premium dark-first design system.** Linear/Attio-grade polish in a segment (Kommo, Zoho) where the incumbents look like 2008.
6. **India-first, globally-ready.** INR + GST + UPI from day one; i18n/RTL architecture from day one; data-residency (ap-south-1 primary) baked in.

---

## 4. Key Technical Decisions (and my read on each)

| Decision | Blueprint choice | Why it's right | Risk / where I'd watch it |
|---|---|---|---|
| **App topology** | Modular monolith → extract services at 10K/50K orgs | 80% of microservice org-benefit at 20% of ops cost; boundaries become service seams | Discipline-dependent. Needs enforced import boundaries (no cross-module DB access) from sprint 1, or the "refactorable" promise evaporates. |
| **Multi-tenancy** | Shared schema + Prisma tenant extension + Postgres RLS | Manageable at 10K orgs; defense-in-depth | The tenant extension as written in doc 07 wraps **every** query in a `$transaction` with `SET LOCAL` — correctness-critical and a performance hot spot. See RISK_ANALYSIS R-ARCH-1. |
| **Primary keys** | UUID v4 | Prevents enumeration; needed for partition/merge | UUID v4 hurts index locality at 50M rows; consider UUIDv7/ULID for high-insert tables (leads, messages, activities). Flagged in ARCHITECT_RECOMMENDATIONS. |
| **DB / ORM** | PostgreSQL 15 (Neon) + Prisma 5 | JSONB for custom fields & workflows, RLS, FTS, strong DX | Prisma + RLS + `SET LOCAL` + PgBouncer transaction pooling interact subtly. Must validate early. |
| **API style** | REST `/api/v1`, envelope, offset+cursor pagination | Simple, explicit, no GraphQL complexity for 0→1 | Fine. Field-selection discipline needed to hit NFR latency. |
| **Async** | BullMQ on Redis; 8 named queues; 3 attempts + exp backoff + DLQ | Keeps webhooks/AI/workflows off the request path | Redis is now a hard dependency for correctness (workflows, webhooks), not just cache. Needs its own HA + monitoring. |
| **Realtime** | Socket.io with Redis pub/sub adapter | Inbox/notifications/pipeline live updates | Must be a separate scalable tier with sticky/Redis adapter (noted in NFR scaling). |
| **Auth** | JWT access (15m, in-memory) + opaque refresh (HttpOnly cookie, rotated, family-reuse detection) | Strong, modern, XSS-resistant token model | Cross-site cookie story (app on Vercel, API on Railway/different domain) needs `SameSite`/CORS/credentials carefully solved — see R-SEC-1. |
| **Social** | Meta Graph API (IG) + WhatsApp Cloud API (no BSP) | No BSP markup, full control | Meta App Review + platform deprecations are the single biggest external dependency risk. See RISK_ANALYSIS Meta/Instagram section. |
| **AI** | OpenAI, model routing (4o-mini → 4o), Redis prompt cache, per-plan rate limits | Cost-controlled, async, overridable | External vendor + cost variance; needs circuit breaker and graceful "no score" degradation. |
| **Billing** | Stripe (Checkout + Portal + Billing), webhook-driven state mirror, GST/Stripe Tax | Offloads PCI + dunning + invoicing | Stripe is the system of record; LeadOS mirror must be reconciled, never the source of truth. |
| **Infra (V1)** | Vercel + Railway/ECS + Neon + Upstash | Fast to ship, serverless-friendly, cheap at low scale | Cross-provider networking, cold starts, and connection pooling need validation before launch. |

### Decisions I explicitly agree are load-bearing and must not drift
- **AI never on the critical path.** Any feature that makes a user wait on OpenAI violates the architecture.
- **Workflows are async and actions are independent** (a failed action does not abort the chain).
- **Webhooks: persist-then-process, always idempotent** via `(source, externalEventId)` unique key.
- **Every tenant-scoped query carries `organizationId`; RLS is the backstop, not the primary control.**
- **Soft-delete everywhere except immutable tables** (`activities`, `audit_logs`, `webhook_events`).

### Inconsistencies already spotted in the blueprint (tracked, not yet resolved)
1. **Instagram webhook path mismatch:** API design (doc 10) defines `/api/webhooks/instagram`; SETUP.md (doc root) tells operators to configure `/api/v1/instagram/webhook`. One must be corrected before Meta App Review. → ARCHITECT_RECOMMENDATIONS.
2. **Instagram platform vintage:** Doc 14 is written around the Facebook-Page-linked Graph API v18 flow (`pages_*` scopes). Meta has been migrating to "Instagram API with Instagram Login" and deprecating older messaging paths/versions. The integration must be validated against the **current** Meta API at build time. → R-META-1.
3. **Plan-limit numbers differ between docs:** Multi-tenant (07) lists Starter AI = 500/mo and leads = 500; AI layer (13) lists STARTER hourly AI limit = 200/hr and TRIAL = 50/hr. These are different axes (monthly vs hourly) but must be reconciled into one canonical limits table. → ARCHITECT_RECOMMENDATIONS.
4. **Messaging window for Instagram:** Doc 14 says 7-day free-form window; standard Meta IG messaging has historically been a 24h standard window + a 7-day human-agent tag. Must verify against current policy. → R-META-2.

---

## 5. System Context (one-paragraph mental model to keep in head)

End users (reps/managers/owners) hit a **Next.js app on Vercel** that talks REST to an **Express modular monolith**. The monolith owns a **Neon Postgres** (tenant-isolated by Prisma extension + RLS), a **Redis** (sessions, cache, rate-limit, queues, pub/sub), and a fleet of **BullMQ workers** that do all the slow/external work: webhook processing, AI scoring, workflow execution, email, and outbound IG/WhatsApp sends. **Meta, Stripe, OpenAI, SendGrid, Cloudinary/S3** are external systems reached only from workers or clearly-bounded service adapters, each wrapped in retries + circuit breakers. A **Socket.io tier** (Redis-backed) pushes realtime inbox/notification/pipeline updates. Everything is observed via **Winston/OpenTelemetry → Grafana** and **Sentry**, and gated by the **Production Readiness checklists (doc 20)** before launch.

---

## 6. Definition of "V1 Done" (my interpretation, for alignment)

A new org can: sign up (no card) → verify email → land on an onboarding checklist → connect one Instagram account → receive a real DM that auto-creates a scored lead → reply from the unified inbox → drag the resulting deal across a Kanban pipeline → invite a teammate with a role → have one of three workflows fire → see dashboard KPIs → and upgrade to a paid plan via Stripe — all within the NFR latency/availability targets and passing the launch + security checklists in doc 20.

Everything in `IMPLEMENTATION_PLAN.md`, `MODULE_DEPENDENCY_GRAPH.md`, and `DEVELOPMENT_ROADMAP.md` is sequenced to reach exactly this state, then extend it.
