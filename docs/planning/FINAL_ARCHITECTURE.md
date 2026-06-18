# FINAL_ARCHITECTURE.md

> **STATUS: SOURCE OF TRUTH FOR IMPLEMENTATION.**
> This document consolidates the LeadOS blueprint (`docs/blueprint/01..21`) with all P0 remediations from `docs/planning/P0_FIXES.md` already applied to the blueprint. Where this document and any individual blueprint file disagree, **this document wins**, and the blueprint file should be reconciled to it.
> Two architectural forks raised in P0_FIXES are now **decided**: (a) auth uses **same-site domains + a Next.js BFF**; (b) PII uses **storage-layer encryption (Option A)**.
> No application code appears here — only architecture, contracts, and gates.

---

## 0. Document Control

| | |
|---|---|
| Supersedes | the original mechanisms in blueprint docs 04, 05, 06, 07, 08, 09, 10, 14, 16, 18, 19, 20 and root SETUP.md |
| Driven by | `ARCHITECTURE_REVIEW.md` (7 P0s) → `P0_FIXES.md` (remediations) |
| Unchanged from blueprint | product scope (01–03), functional requirements (03), RBAC (11), workflow engine semantics (12), AI layer (13), WhatsApp (15), UI/UX (17), roadmap (21) — these carry P1/P2 items tracked in `RISK_ANALYSIS.md`, none launch-blocking |
| Resolved forks | Auth = same-site domains + BFF · PII = storage-layer encryption (Option A) |

---

## 1. Final Approved Architecture

**Shape:** a **modular monolith** (Express + TypeScript) behind a **Next.js 15** web app, on **PostgreSQL 15 (Neon)** via **Prisma 5**, with **Redis** and **BullMQ** for all async work, evolving to extracted services (Workflow → AI → Webhook) at the 10K/50K-org thresholds. Module boundaries are physical (enforced by lint) so they become service seams without a rewrite.

```
[Browser]
   │  HTTPS (same registrable domain: leados.app)
   ▼
[app.leados.app — Next.js 15 on Vercel]
   ├── React Server Components (data pages)  ──┐ authenticated fetch
   ├── Client Components (Kanban, inbox)       │ via BFF (server-side session)
   └── Next.js BFF route handlers ─────────────┘
          │  HTTPS/REST (Authorization: Bearer <access token>)
          ▼
[api.leados.app — Express modular monolith on Railway/ECS]
   core spine: errors · envelope · prisma(tenant) · redis · queue · eventBus · observability
   modules:    auth · org · team · leads · contacts · pipeline · deals · inbox ·
               workflow · ai · billing · analytics · notifications
          │            │             │                 │
          ▼            ▼             ▼                 ▼
   [Neon Postgres]  [Redis]   [BullMQ workers]   [Socket.io tier]
   primary + RLS    sessions  webhook/AI/wf/      (Redis adapter,
   + read replica   cache     email/send/notify   org rooms)
                    queue
                    pub/sub
          │
   external (from workers/adapters only, each with retry + circuit breaker):
   Meta Graph API (IG) · WhatsApp Cloud API · OpenAI · Stripe · SendGrid · Cloudinary/S3 · Sentry
```

**Load-bearing invariants (must never be violated):**
1. Tenant context is set once per unit-of-work transaction; RLS is the DB backstop (§2).
2. AI, webhooks, workflows, and outbound sends are **always async** — never on the request path.
3. Webhooks are **persist-then-process** and **idempotent**; signature-verified over the raw body.
4. Multi-write operations are **atomic** (single transaction); external calls live outside transactions, on queues.
5. Modules talk via public service interfaces or the event bus — **never** cross-module DB access.
6. Billing access decisions read a derived `effectiveAccessLevel`, never raw Stripe-mirror status.

---

## 2. Final Tenancy Model (P0-1, P0-2, P0-3 resolved)

**Model:** shared database, shared schema, row-level isolation with three enforcement layers — **application injection + per-unit-of-work transaction GUC + PostgreSQL RLS**.

### 2.1 The mechanism (authoritative — replaces blueprint doc 07 §7.3 original code)
- A **unit of work** = one service operation, run inside a **single Prisma interactive transaction**.
- The transaction's **first statement** runs `set_config('app.current_organization_id', <orgId>, true)` — the transaction-scoped (`SET LOCAL`) form — so the GUC is pinned to the same connection every subsequent statement uses.
- A **Prisma client extension** (bound to the transaction client) injects `organizationId` on **every** operation for tenant-scoped models — `create`, `createMany`, `update`, `updateMany`, `delete`, `deleteMany`, `upsert`, `find*`, `*OrThrow`, `count`, `aggregate`, `groupBy` — **deny-by-default** (unscopeable op on a tenant model is rejected).
- **RLS policy** (all tenant tables) uses the missing-safe form: `USING (organization_id = current_setting('app.current_organization_id', true)::uuid)` → unset GUC returns NULL → row denied. RLS catches any missed app-layer injection.
- **Pooling:** PgBouncer/Neon pooler in **transaction mode** (compatible with per-transaction `set_config`). Validated by the Sprint-3 benchmark before any domain module is built.

### 2.2 Why each P0 is closed
- **P0-1** — GUC and query now share one pinned connection → RLS actually enforces.
- **P0-2** — every operation (incl. writes/aggregates) is scoped → no cross-tenant update/delete/leak.
- **P0-3** — the unit of work *is* a transaction → multi-write operations (onboarding, lead→contact, deal-won) are atomic; no nested-transaction conflict.

### 2.3 Super admin (MT-3)
Two distinct DB roles: `leados_app` (RLS-enforced, **no** bypass) for all tenant traffic; `leados_platform_admin` (**`BYPASSRLS`**) for platform/support paths only, every action written to `platform_audit_logs`, 2FA, 2-hour non-refreshable session.

### 2.4 Tenant resolution (unchanged, with cache caveat)
JWT carries `{userId, organizationId, role}`; `tenantMiddleware` validates membership (Redis-cached 5 min) and sets request context. **Permission/role revocation actively invalidates the membership cache** (closes the up-to-15-min staleness of MT-2, a P1) — on suspend/remove/role-change the cache key is purged and the session denylisted.

---

## 3. Final Authentication Model (P0-4 resolved)

### 3.1 Topology (mandatory)
Web `app.leados.app` (Vercel) and API `api.leados.app` (Railway/ECS) share registrable domain **`leados.app`** → requests are **same-site**. The `*.up.railway.app` split is prohibited (it breaks the cookie).

### 3.2 Tokens
- **Access token:** JWT HS256, 15 min, payload `{sub, orgId, role, iat, exp}`, held **in client memory** (not localStorage/cookie), sent as `Authorization: Bearer`.
- **Refresh token:** opaque 48-byte random, `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`, stored as SHA-256 hash in `refresh_tokens`, **rotated every use** with **token-family reuse detection** (revoke family + alert on replay).

### 3.3 BFF for authenticated RSC (closes AR-4)
React Server Components cannot read the in-memory token. A thin **Next.js BFF** (route handlers on `app.leados.app`) holds the session server-side (refresh cookie, first-party) and proxies authenticated data fetches to the API. Client components may call the API directly with the in-memory bearer token.

### 3.4 CSRF
`/auth/refresh` is cookie-driven → requires an **Origin/Referer check + custom request header** (defense in depth even under SameSite=Strict). Bearer-token requests are not cookie-driven → not CSRF-exposed.

### 3.5 Other auth (unchanged)
bcrypt cost 12; password policy (8+, mixed classes, not-equal-email); login rate-limit 5/15min per IP+email + lockout; email verification before access; password reset single-use 1h (token hashed at rest); sessions list/revoke; revoke-all on password change; Google SSO deferrable within V1.

---

## 4. Final Billing Architecture (P0-6 resolved)

**Stripe is the source of truth; the LeadOS `subscriptions`/`invoices`/`payments` tables are a cache.** Access control never trusts the cache blindly.

### 4.1 Webhook application (idempotent + ordered)
- Idempotency: `webhook_events (source='STRIPE', externalEventId=event.id)` unique constraint → duplicates skipped.
- Ordering: apply a change only if its event/object timestamp is newer than the stored `subscriptions.lastStripeEventAt`; ignore stale/out-of-order events.
- Derive mirror status from the Stripe object's `status` + `current_period_end`, never from event type alone.

### 4.2 Nightly reconciliation
A single-flight job lists subscriptions from Stripe, diffs the mirror, corrects drift (status, period, plan, **seat quantity** — closes BL-3), updates `lastSyncedAt`, and emits `leados_billing_mirror_drift` (alert on any non-zero — doc 18).

### 4.3 Effective access (fail-open)
Plan-limits and read-only gating read a derived **`effectiveAccessLevel` ∈ {FULL, READ_ONLY, SUSPENDED}**, computed from status + dunning grace windows, via a **single composable middleware** (closes BL-4). **Fail-open on ambiguity:** a stale (`lastSyncedAt` too old) or transitional state for a previously-paying org grants `FULL` and flags support — never hard-locks a paying customer.

### 4.4 New schema fields
`subscriptions.lastStripeEventAt`, `subscriptions.lastSyncedAt` (additive, backfilled by first reconciliation).

### 4.5 Unchanged
Stripe Checkout (UPI/netbanking/card, INR, GST via Stripe Tax, billing address), Customer Portal, plan tiers/limits (doc 16 §16.2), trial lifecycle → read-only (non-destructive), dunning timeline, 30-day reversible purge. Downgrade/over-limit reconciliation policy on `subscription.updated` (BL-2) is a P1 to define before V2 Portal exposure.

---

## 5. Final Instagram Architecture (P0-5 resolved)

### 5.1 Validation-first
The blueprint's Page-linked Graph API v18 / `pages_*` / Page-token / 7-day-window flow is **illustrative and must be validated** by a **2–3 day pre-build spike** against the current Meta API before the Sprint-6 build. The spike fixes: OAuth flow ("Instagram API with Instagram Login" vs Facebook-Login), scopes, **token type + true lifetime** (resolving the Page-token-vs-60-day-refresh inconsistency IG-3), **real messaging-window duration** (commonly 24h + human-agent tag, not 7 days), and current webhook field names + message-level idempotency key.

### 5.2 Adapter abstraction
All Meta specifics sit behind an `InstagramAdapter` interface (connect, subscribe-webhook, receive, send, refresh-token, fetch-profile). The Graph API version is pinned and deprecation-tracked; the inbox/workflow layers never bind to Meta's wire format.

### 5.3 Webhook contract
- **Canonical path:** `POST/GET /api/webhooks/instagram` (unversioned, unauthenticated). The SETUP.md `/api/v1/instagram/webhook` variant is corrected.
- `express.raw()` mounts **before** the global JSON parser so HMAC-SHA256 verification reads the raw body (closes SEC-5, P1).
- Persist-then-200 within Meta's ack window; process async; dedup at the **message** grain (`mid`) independent of the coarse `webhook_events` envelope (closes IG-2, P1).

### 5.4 Tokens & resilience
Encrypted at rest AES-256-GCM **with a key-version prefix** (rotatable without big-bang re-encrypt); per-account refresh per the spike-confirmed token; account `EXPIRED` → owner notification + reconnect UX; per-account BullMQ rate-limiter budgeted across receive+send+enrich; out-of-window send failures surfaced explicitly in the UI (IG-5).

### 5.5 Launch dependency
Facebook Business verification started immediately (slow prerequisite); App Review submitted at the earliest demonstrable point — **it gates public launch** and is the dominant schedule risk.

---

## 6. Final Security Model

### 6.1 Encryption (P0-7 resolved — Option A)
- **At rest:** all data encrypted at the **storage layer** (Neon volume AES-256), including PII.
- **Application-level field encryption:** limited to **OAuth tokens** (`InstagramAccount.accessToken`, `WhatsAppAccount.accessToken`), AES-256-GCM, key-versioned.
- **PII (email/phone):** stored as **plaintext, indexable columns** so dedup, full-text, and trigram search work; masked in logs and audit before/after snapshots. *No application-level encryption of email/phone* — the original NFR claim was a contradiction and is corrected.

### 6.2 Authorization
RBAC matrix (doc 11) enforced on every protected op; "own-only" record filtering in the service layer; tenant scoping + RLS (§2); super-admin via `BYPASSRLS` role (§2.3).

### 6.3 Webhooks
HMAC-SHA256 (Instagram) and Stripe signature verification over the **raw body** with timing-safe comparison; idempotency via `webhook_events (source, externalEventId)`.

### 6.4 Transport & headers
TLS 1.2+ (1.3 preferred); Helmet (CSP, HSTS preload, X-Frame-Options DENY, noSniff); CORS allow-list = `https://app.leados.app`, `https://www.leados.app`, `credentials: true`.

### 6.5 Other (unchanged)
Rate limiting (auth per IP+email; **API per-user + per-org** — API-1 P1 raises the per-org-only ceiling); Prisma parameterized queries (no raw SQL); Zod validation at every boundary; secrets in AWS Secrets Manager with quarterly rotation; Dependabot + `npm audit` gate; OWASP Top-10 mapping (A02 corrected per §6.1; A10 SSRF note: the workflow `WEBHOOK` action — V2 — requires an egress allow-list + RFC1918/link-local block, SEC-2).

---

## 7. Final Deployment Architecture

### 7.1 V1 (launch)
```
[Cloudflare DNS/WAF/TLS]  (registrable domain: leados.app)
   ├── app.leados.app  → Vercel (Next.js 15 + BFF route handlers), CDN-distributed
   └── api.leados.app  → Railway/ECS:
                          ├── Express API  ×2 (stateless)
                          ├── BullMQ workers ×2 (separate processes)
                          └── Socket.io tier (Redis adapter — separate even if co-located)
[Neon PostgreSQL] primary + read replica (analytics) · RLS · transaction-mode pooler
[Upstash Redis]   sessions · cache · rate-limit · queues · pub/sub  (tier-1, HA-tracked)
[Cloudinary + S3] media + documents (direct-to-storage presigned uploads)
[Sentry · OpenTelemetry→Grafana] observability
```
**Same-site domains are mandatory** (§3.1). Web and API both behind `leados.app`.

### 7.2 V2/V3 scale path (doc 05 §5.3, unchanged intent)
AWS ALB + Fargate; Aurora Postgres Multi-AZ (1 write + 2 read); ElastiCache cluster; SQS+Lambda webhook processing; CloudFront. Service extraction order **Workflow → AI → Webhook** (clean seams from the event bus + adapter interfaces).

### 7.3 Cross-cutting operational requirements
Single-flight cron scheduler + cron registry (AR-5, P1); Redis treated as **tier-1 correctness infra** with `PENDING` webhook_events re-enqueue on recovery (R-TECH-1); partitioned table structures created early for `leads`/`messages`/`activities`/`audit_logs` (SC-1/DB-2); WS Redis adapter from day one (SC-3).

---

## 8. Final Technology Stack

| Layer | Choice | Notes (post-P0) |
|---|---|---|
| Web | Next.js 15 App Router, TS strict | RSC for data pages **via BFF**; client components for Kanban/inbox |
| Web state | TanStack Query + Zustand | server state vs UI state |
| UI | Shadcn/Radix + Tailwind + design tokens (doc 17) + Framer Motion + @dnd-kit | dark-first |
| Realtime | Socket.io client | Redis adapter on server, org rooms |
| BFF | Next.js route handlers | holds session cookie, proxies to API (P0-4) |
| API | Express + TypeScript (strict) | modular monolith; middleware order per doc 06 §6.2 with **`express.raw()` before JSON on webhook routes** |
| Runtime | Node.js 20 LTS | API + worker processes |
| DB | PostgreSQL 15 (Neon) | RLS missing-safe policies; **transaction-mode pooler**; read replica for analytics |
| ORM | Prisma 5 | tenant extension scopes **all** ops; per-unit-of-work transaction sets GUC |
| Cache/Queue | Redis (Upstash) + BullMQ | tier-1 infra; 8 named queues; DLQ; 3 attempts + exp backoff |
| Auth | JWT (in-memory access) + opaque rotating refresh cookie (same-site) | family-reuse detection; CSRF on refresh |
| Files | Cloudinary (media) + S3 (docs) | presigned direct-to-storage |
| Email | SendGrid | domain auth (SPF/DKIM/DMARC) + bounce handling required (M3) |
| AI | OpenAI (4o-mini→4o routing) | async only; Redis prompt cache; per-plan + per-cost caps; circuit breaker |
| Billing | Stripe (Checkout/Portal/Billing/Tax) | source of truth; mirror + reconciliation (§4) |
| Social | Meta Graph API (IG, spike-validated, adapter) + WhatsApp Cloud API (V2) | encrypted key-versioned tokens |
| Observability | Winston/OpenTelemetry → Grafana + Sentry | PII redacted; tenant id in logs/traces, **not** metric labels (I8) |
| Infra | Vercel + Railway/ECS + Neon + Upstash + Cloudflare + AWS Secrets Manager | same-site custom domains mandatory |

Encoded constants live in `packages/shared`: one canonical `PLAN_LIMITS` (reconciling the doc 07/13/16 discrepancies — monthly quota **and** hourly burst), permission keys, Zod schemas (also the OpenAPI source, M6).

---

## 9. Final Launch Gates

Public launch requires **all** of the following green (mirrors blueprint doc 20 §20.0 + §20.1–20.6).

### 9.1 P0 gate (blocking)
1. **Tenant isolation (P0-1/2):** cross-tenant suite passes at app **and** RLS layers across `update/delete/upsert/aggregate/groupBy`; RLS denies on an unset/incorrect GUC.
2. **Tenancy perf (P0-1):** Sprint-3 benchmark of the unit-of-work-transaction + `set_config` pattern accepted on transaction-mode pooling.
3. **Atomicity (P0-3):** onboarding and lead→contact conversion proven all-or-nothing.
4. **Auth topology (P0-4):** end-to-end refresh verified on real same-site staging domains; CSRF on `/auth/refresh` verified.
5. **Instagram (P0-5):** validated against current Meta API; App Review approved; webhook HMAC over raw body verified.
6. **Billing (P0-6):** ordered+idempotent webhooks; nightly reconciliation live; proven a missed webhook neither locks a paying org (fail-open) nor frees a delinquent org beyond one cycle.
7. **Encryption posture (P0-7):** docs corrected; email/phone indexable/searchable; only tokens app-encrypted; no false compliance claim ships.

### 9.2 Standard gate (doc 20)
Auth/RBAC, API (validation, sanitized errors, rate limits, health checks), DB (migrations + rollback, backups + PITR restore drill, indexes via EXPLAIN ANALYZE), security checklist (headers, secrets, `npm audit` 0 high/critical, OWASP ZAP), performance (P95 < 400ms under 1k-concurrent load test, Lighthouse ≥90), DR runbooks + RTO/RPO, status page + on-call, GDPR export/erasure pipeline live (M2), and the doc 20 §20.6 go-live smoke tests during a low-traffic window with a 72-hour watch.

### 9.3 Recommended pre-launch
Beta with 50 design partners on production infrastructure for ~1 week; public launch only if beta error rate < 2%; Meta-incident kill switch (feature flag) ready; core product metric instrumented (DM→rep-notified latency, time-to-first-lead).

---

## 10. What Implementation Starts From

- **This document is the contract.** Build against §2–§9, not the pre-P0 mechanisms.
- **Sequencing** follows `DEVELOPMENT_ROADMAP.md`; **dependencies** follow `MODULE_DEPENDENCY_GRAPH.md`; **open P1/P2 risks** are tracked in `RISK_ANALYSIS.md` and `ARCHITECTURE_REVIEW.md`.
- **Blueprint edit order already applied:** 07 → 05 → 19 → 04 → 14 → 10 → 08/09 → 16 → 18 → 20 → SETUP. Each affected blueprint file now carries an "UPDATED per P0_FIXES" banner pointing here.
- **No module may begin** until its corresponding section here (and its blueprint sections) are understood; the tenancy model (§2) and auth topology (§3) are prerequisites for everything tenant-scoped and must land first (Sprints 2–3).

---

### Appendix A — P0 → Resolution → Documents Changed

| P0 | Resolution (this doc) | Blueprint docs updated |
|---|---|---|
| AR-1 tenant GUC connection | §2.1 unit-of-work txn + `set_config(...,true)` + missing-safe RLS | 07, 05, 08, 09 |
| AR-2 partial scoping | §2.1 extension scopes all ops, deny-by-default | 07, 20 |
| AR-3 atomicity | §2.1 unit of work = transaction | 07, 05, 08 |
| SEC-1 cross-site cookie | §3 same-site domains + BFF + CSRF | 19, 05, 06, 10, SETUP |
| IG-1 Meta API vintage | §5 validation spike + adapter + canonical webhook | 14, 10, 08, 09, SETUP, 20 |
| BL-1 Stripe mirror drift | §4 ordered/idempotent + reconciliation + effective access | 16, 08, 09, 18, 20 |
| SEC-4 PII encryption | §6.1 Option A storage-layer; tokens-only app-encrypt | 04, 19, 08, 09, 20 |
