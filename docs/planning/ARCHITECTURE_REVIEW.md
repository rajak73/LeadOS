# ARCHITECTURE_REVIEW.md

> **Design review — Principal Engineer**
> Subject: LeadOS blueprint (`docs/blueprint/01..21`) + implementation plan (`docs/planning/*`)
> Posture: adversarial. The goal is to find what breaks at launch and what breaks at scale, not to validate.
> Severity: **P0** = launch blocker · **P1** = must fix before scale · **P2** = future improvement.
> No code is written here; findings reference blueprint sections and describe mechanisms.

---

## How to read this

I re-examined the actual *mechanisms* in the blueprint — the Prisma tenant extension (doc 07 §7.3), the workflow evaluators (doc 12 §12.6), the auth/cookie model (doc 19 §19.1), and the DB schema (doc 08) — rather than the prose. Several designs are not merely risky, they are **functionally incorrect as specified** and would fail the first integration test or, worse, pass tests while leaking data. Those are P0.

Each finding: **ID · Severity · Finding · Impact · Recommendation.**

---

## 1. Architecture Flaws

### AR-1 · **P0** · The tenant Prisma extension runs `SET LOCAL` on a different connection than the query it protects
Doc 07 §7.3 implements the extension as `prisma.$transaction([ prisma.$executeRaw\`SET LOCAL app.current_organization_id = ...\`, query(args) ])`. Two defects compound:
1. It calls `prisma.$transaction` on the **base** client while `query(args)` is the intercepted operation from the **extended** client. `SET LOCAL` is connection- and transaction-scoped; there is no guarantee (in fact it's unlikely) that the raw `SET` and the actual query execute on the same pooled connection/transaction. The RLS GUC is therefore frequently unset when the real query runs.
2. With the GUC unset, the RLS policy `organization_id = current_setting('app.current_organization_id')::uuid` either errors or returns nothing — so RLS is either broken or silently a no-op.
- **Impact:** The "defense-in-depth" backstop (doc 07's entire premise) is non-functional as written. Isolation rests *entirely* on app-layer injection (AR-2), which itself has holes. This is a cross-tenant data-integrity hazard.
- **Recommendation:** Set the tenant GUC **per request, once, at the start of an explicit transaction/connection checkout**, not per-query. Use a single interactive transaction per request (or a connection-pinned `SET`), validated against the actual Neon/PgBouncer pooling mode. Make the Sprint-3 isolation suite assert RLS blocks a query when the GUC is deliberately wrong.

### AR-2 · **P0** · App-layer tenant injection covers only create/read — not update/delete/upsert/aggregate
The extension in doc 07 §7.3 injects `organizationId` for `create/createMany` and `findMany/findFirst/findUnique/count`. It does **not** touch `update`, `updateMany`, `delete`, `deleteMany`, `upsert`, `aggregate`, or `groupBy`.
- **Impact:** `db.lead.update({ where: { id } })` or `db.lead.deleteMany({ where: {...} })` execute with **no org scope**. Combined with AR-1 (RLS not reliably active), a bug or a crafted id allows cross-tenant writes/deletes — the worst class of multi-tenant failure. Aggregate/groupBy leak cross-tenant counts/sums into analytics.
- **Recommendation:** The extension must scope **every** operation that accepts a `where` and inject org on every write variant. Treat the model allow-list as deny-by-default. Add isolation tests for update/delete/upsert/aggregate specifically — they are the ones most likely to ship unguarded.

### AR-3 · **P0/P1** · Per-query transaction wrapping makes atomic multi-write service operations impossible
Because the extension wraps *each* query in its own transaction, a service method that must be atomic — e.g. "convert lead → create contact + update lead.convertedToContactId + write activity" (FR-LEAD-008) or "register → create user + org + member + subscription + pipeline + roles" (doc 07 §7.6) — cannot run as one transaction. Wrapping those in an outer `$transaction` nests against the per-query transactions (Prisma rejects nested interactive transactions, or atomicity is lost).
- **Impact:** Partial failures leave inconsistent state (a lead marked converted with no contact; an org with no subscription). Onboarding and conversion are exactly the flows where partial state is most damaging.
- **Recommendation:** Resolve together with AR-1: set tenant context once per request-transaction, then let service methods compose multiple writes inside that single transaction. This is a structural decision that must be made before any multi-write service is built (P0 to decide; the data-integrity exposure is P1 once isolation is fixed).

### AR-4 · **P1** · RSC data-fetching contradicts the in-memory access-token model
Doc 06 §6.1 mandates React Server Components for "dashboard data, lead lists, analytics pages." Doc 19 §19.1 stores the access token **in memory (React state), not in cookies/localStorage**. RSC executes on the server and has no access to client memory, so server components cannot authenticate to the API. The only credential available server-side is the HttpOnly refresh cookie — which is a refresh token, not an access token, and is scoped to the API domain.
- **Impact:** Either the "RSC for data pages" strategy or the "token in memory" strategy is unworkable as stated; teams discover this mid-build and improvise (often by weakening token storage). 
- **Recommendation:** Pick one coherent model: (a) client-component data fetching with in-memory bearer tokens (simplest, loses RSC streaming), or (b) a BFF/route-handler layer in Next.js that holds the session server-side and proxies to the API using the cookie. Decide in P1 before the dashboard is built.

### AR-5 · **P1** · Crons have no leader election / single-flight guard across instances
Multiple implied crons (IG token refresh doc 14 §14.6, weekly AI re-score, trial-lifecycle emails doc 16, soft-delete purge, execution cleanup) will run on **every** API/worker instance unless coordinated. With ≥2 instances (the V1 deployment is 2× API + 2× workers, doc 05 §5.3), each cron fires N times.
- **Impact:** Duplicate token refreshes, duplicate "trial expiring" emails to customers, duplicate purge attempts.
- **Recommendation:** Single scheduler (BullMQ repeatable jobs with a unique job id is single-flight by design) or a Redis lock per cron. Maintain the cron registry recommended in `ARCHITECT_RECOMMENDATIONS.md` M4.

### AR-6 · **P1** · In-process EventEmitter loses durability for side-effect-driving events
Doc 05 §5.2/§5.4 routes internal events through an in-process `EventEmitter`. The Instagram→Workflow path is described as emitting an event that the WorkflowModule turns into a queued job — but if the process crashes between emit and enqueue, the trigger is lost with no trace.
- **Impact:** Silently dropped workflow triggers and AI jobs under crash/restart; impossible to reconcile because nothing was persisted.
- **Recommendation:** For events that drive side effects (workflows, billing, AI), enqueue to BullMQ directly from the source transaction (transactional outbox), not via the soft in-process emitter. Reserve the emitter for ephemeral UX/realtime fan-out.

---

## 2. Multi-Tenant Risks

### MT-1 · **P0** · See AR-1 + AR-2 — isolation is not correct as specified
The two findings above are *the* multi-tenant risk. Restated for the launch gate: **the cross-tenant isolation suite must pass at both the app layer and the RLS layer before launch (doc 20 §20.1 already lists this; it is currently un-meetable against the doc-07 code).**

### MT-2 · **P1** · 5-minute membership cache delays permission/role revocation
Doc 07 §7.4 caches `organization_member` (including role + permissions) in Redis for 300s. Doc 19 §19.1 access tokens live 15 min and carry `role`. A removed/demoted user retains effective permissions for **up to 15 minutes** (token) on top of **up to 5 minutes** (cache) for membership-derived checks.
- **Impact:** Off-boarding a malicious/compromised user is not immediate; a suspended user keeps acting. Fails the spirit of FR-TEAM-002 (suspend "blocks login") and §3.1 session revocation.
- **Recommendation:** On role change / suspend / remove, actively invalidate the Redis membership key and add the user/session to a short denylist checked in auth middleware. Consider dropping role out of the JWT and resolving it from the (invalidatable) cache only.

### MT-3 · **P1** · Super-admin uses "raw Prisma, no tenant extension" → RLS will reject its queries
Doc 07 §7.5 says super admin "bypasses tenant middleware — uses raw Prisma client (no tenant extension)." But if RLS is enabled on tenant tables (doc 07 §7.3), a connection that never sets `app.current_organization_id` is blocked by the policy.
- **Impact:** Super-admin/support tooling silently returns empty sets or errors; teams "fix" it by disabling RLS or running as a superuser role — re-opening the isolation hole.
- **Recommendation:** Give the platform-admin DB role explicit `BYPASSRLS` (or a dedicated permissive policy), strictly separated from the application role, and log every access to `platform_audit_logs` (already specified).

### MT-4 · **P2** · `req.context.db = prisma.$extends(...)` builds a new extended client per request
Constructing an extended client on every request is wasteful and, combined with AR-1, multiplies transaction overhead.
- **Recommendation:** Memoize extended clients per `organizationId`, or (preferred) set context via the single request-transaction approach from AR-1/AR-3.

---

## 3. Security Gaps

### SEC-1 · **P0** · Cross-site refresh cookie cannot work with `SameSite=Strict` across Vercel↔Railway domains
Doc 19 §19.1 sets the refresh token as `HttpOnly; Secure; SameSite=Strict`. The frontend (Vercel, `app.leados.com`) and API (SETUP.md uses a `*.up.railway.app` domain) are **different sites**. A `SameSite=Strict`/`Lax` cookie is **not sent on cross-site requests**, so the refresh call carries no cookie → silent logout loop. The blueprint's own CORS config (doc 19 §19.7) lists `api.leados.com`, implying intent to co-locate under `leados.app`, but SETUP.md does not.
- **Impact:** Auth simply does not work in the documented deployment topology. This surfaces only in a real cross-domain deploy, not in localhost testing — i.e. at launch.
- **Recommendation:** Serve API and app under a shared parent domain (`api.leados.app` + `app.leados.app`) and use `SameSite=None; Secure` with explicit CSRF defense (double-submit token / origin check), **or** adopt the BFF model (AR-4) so the cookie is first-party to the Next.js origin. Fix SETUP.md/E1 path + domain together before Meta App Review and launch.

### SEC-2 · **P1** · Workflow `WEBHOOK` action is a server-side SSRF vector that contradicts the stated A10 control
Doc 12 §12.2/§12.6 defines a `WEBHOOK` action that POSTs to a user-supplied URL from the server. Doc 19 §19.9 claims A10:SSRF is mitigated by "no user-controlled URLs in server-side fetches." These directly contradict. A tenant can target `http://169.254.169.254/...` (cloud metadata), internal service IPs, or `localhost` admin ports.
- **Impact:** Cloud credential theft / internal network access. **P0 the moment the WEBHOOK action ships (V2/P7); not in the V1 action set (Create Task / Notification / Email), so P1 now with a hard P0 gate before V2.**
- **Recommendation:** Egress allowlist + block RFC1918/link-local/loopback, resolve-and-pin DNS (prevent rebinding), require HTTPS, sign outbound payloads, and run workflow egress through a constrained proxy. Build this *before* enabling the action.

### SEC-3 · **P1** · `SEND_EMAIL` workflow action with interpolated recipient can be weaponized for spam from your sending domain
The V1 `SEND_EMAIL` action (doc 12, doc 21 V1) interpolates `to` from data. A workflow can be configured to send to arbitrary addresses via your SendGrid reputation.
- **Impact:** Domain reputation damage, deliverability collapse (which also breaks auth emails — SEC adjacent to activation funnel).
- **Recommendation:** Restrict workflow email recipients to records inside the tenant (lead/contact/team member), not free-text addresses; rate-cap per org; honor suppression lists.

### SEC-4 · **P1** · Email/phone "encrypted at rest (AES-256)" is incompatible with the indexes the DB design requires — and is currently unimplemented
Doc 04 §4.4 and doc 19 §19.9 (A02) assert phone/email are AES-256 field-encrypted. Doc 08 indexes `email`/`phone` for dedup, builds a **GIN full-text index** on `email`, and filters/searches by them (doc 10 §10.4–10.5). Application-level encryption makes equality-dedup, FTS, and `LIKE`/trigram search **impossible**. Doc 19 §19.3 in fact only app-encrypts the two OAuth tokens and relies on Neon volume encryption for everything else.
- **Impact:** Either the security claim is false (a compliance misrepresentation in ToS/marketing) or the core lead dedup/search features break. This is a launch-affecting contradiction.
- **Recommendation:** Decide explicitly: rely on **storage-volume encryption** (Neon, AES-256) for email/phone at rest and **correct the NFR/security docs** to stop claiming app-level field encryption for them. If regulatorily required to app-encrypt, add HMAC **blind indexes** for equality/dedup and accept loss of substring/FTS search — a significant design change to scope now, not discover later.

### SEC-5 · **P1** · Raw-body capture for HMAC verification conflicts with global JSON body parsing
Doc 14 §14.7 / doc 19 §19.4 verify Instagram/Stripe webhooks over `req.rawBody`. The middleware stack (doc 06 §6.2) applies `express.json()` globally before routing. If JSON parsing consumes the stream first, `rawBody` is unavailable and **every** webhook signature check fails.
- **Impact:** All webhooks rejected (or, if "fixed" by skipping verification, unauthenticated webhook injection). Classic, easy-to-miss launch bug on the most security-sensitive endpoints.
- **Recommendation:** Mount `express.raw()` on the webhook routes *before* the global JSON parser, or use a verify-callback to stash the raw buffer. Add an explicit signature-rejection test.

### SEC-6 · **P2** · Password-reset / email-verification tokens — storage and enumeration not specified
Doc 03 §3.1 specifies single-use, time-limited reset/verify tokens but not that they're stored hashed (refresh tokens are; these aren't mentioned). `forgot-password` enumeration behavior is unspecified.
- **Recommendation:** Hash reset/verify tokens at rest like refresh tokens; return a generic response regardless of email existence.

### SEC-7 · **P2** · CSP allows `'unsafe-inline'` styles
Doc 19 §19.5 permits `styleSrc 'unsafe-inline'`. Minor XSS surface (style-based exfiltration/clickjacking aids).
- **Recommendation:** Move to nonce/hash-based styles when the design system stabilizes.

---

## 4. Database Issues

### DB-1 · **P1** · Soft delete + plain `UNIQUE` constraints will block legitimate re-use of slugs/emails/memberships
Doc 08 §8.5 soft-deletes via `deletedAt`, but unique constraints are plain (`organizations.slug` UNIQUE, `(organizationId,userId)` on members, user `email` UNIQUE). A soft-deleted org named `acme` permanently blocks a new `acme`; a removed-then-re-invited member collides.
- **Impact:** Churned/deleted records sterilize identifiers for 30 days (or forever); confusing failures on re-signup/re-invite.
- **Recommendation:** Use **partial unique indexes** `WHERE deleted_at IS NULL` on every soft-deletable uniquely-constrained column (some lead indexes already do this; apply consistently to slug/email/member).

### DB-2 · **P1** · Write amplification: every mutation writes the row + an activity + an audit_log
Doc 08 §8.5–8.6: `activities` (immutable) and `audit_logs` (immutable, 5-yr) are both written on mutations to core entities. A single lead edit = 3 writes; an inbound DM cascades into message + conversation update + lead upsert + activity + (async) score update + workflow execution rows.
- **Impact:** At the doc-04 targets (1B messages, 50M leads), the immutable tables become the dominant write and storage load and the throughput bottleneck.
- **Recommendation:** Make audit writes asynchronous (queue) so they never add latency to the mutation; range-partition `activities`/`audit_logs` by month from the start (one partition initially); archive aged audit partitions to cold storage. Confirm there isn't double-recording between `activities` and `audit_logs` for the same change.

### DB-3 · **P1** · `messages` polymorphic `conversationId` + `conversationType` has no referential integrity and complicates partitioning
Doc 08: `messages.conversationId` points to either `instagram_conversations` or `whatsapp_conversations` with no FK.
- **Impact:** Orphaned messages, awkward joins on the inbox hot path, and friction when partitioning `messages` (doc 08 §8.4) by org hash.
- **Recommendation:** Unify into one `conversations` table with a `channel` enum **before** WhatsApp lands and before the table grows (cheap now, migration surgery later). Tracked as I1 in recommendations; elevating to P1 because it intersects partitioning.

### DB-4 · **P1** · Offset pagination with `meta.total` requires `COUNT(*)` over large filtered tenant sets
Doc 10 §10.3 defaults lists to offset pagination returning `meta.total`. `COUNT(*)` over millions of filtered leads/deals per query is slow and worsens with deep offsets.
- **Impact:** List endpoints miss the NFR P95 < 400ms (doc 04 §4.1) for large tenants; deep pages degrade further.
- **Recommendation:** Cursor pagination for large lists (already used for inbox); approximate or cached counts for `total`; cap maximum offset.

### DB-5 · **P1** · Multi-currency is modeled but never reconciled in aggregation/forecasting
`deals.currency`, `pipelines.currency`, `organizations.currency` all exist (doc 08), and forecasting sums `value × probability` (doc 13 §13.7) — but summing mixed-currency deals is meaningless and no conversion/base-currency is defined.
- **Impact:** Wrong forecast/revenue numbers the moment an org uses >1 currency (a Scale/global V3 promise, doc 21).
- **Recommendation:** Define an org base currency + FX snapshot at deal close; aggregate in base currency. Acceptable to defer enforcement to V2/V3 (V1 is INR-only) but the schema/decision should be made now to avoid a backfill. **P1 at the point multi-currency is enabled; P2 for V1.**

### DB-6 · **P1** · UUID v4 PKs on the highest-insert tables degrade index locality at the stated scale
Doc 08 §8.1 uses UUID v4 everywhere. Fine for low-insert tables; harmful for `messages`/`activities`/`audit_logs`/`leads` at 50M–1B rows (random insert → B-tree fragmentation, cache churn).
- **Recommendation:** Keep UUID v4 for externally-exposed ids; switch physical ordering to UUIDv7/ULID on the high-insert tables before partitioning. (Recommendations I3.)

### DB-7 · **P2** · Connection-pool math is under-specified for the multi-process topology
Doc 04 §4.1 sets pool = 20/instance; doc 05 runs 2× API + 2× workers + a WS tier, plus the read replica, plus the per-query-transaction pattern (AR-1) holding connections longer. Neon/serverless has hard connection caps.
- **Recommendation:** Mandate PgBouncer/Neon pooler; size against the pooler ceiling, not raw DB; dedicate a replica pool for analytics; load-test connection saturation at target instance count.

---

## 5. API Issues

### API-1 · **P1** · Per-org rate limit of 100 req/min is too low for legitimate collaborative use
Doc 10 §10.9 / doc 19 §19.6 cap authenticated traffic at 100 req/min per org. A pipeline with several reps dragging cards (each move = PATCH + optimistic refetch), using the inbox, and polling notifications will exceed this in normal use.
- **Impact:** Active teams get 429s during ordinary work — a visible product defect, especially on the Kanban (the daily home screen).
- **Recommendation:** Rate-limit **per user** (and per IP), not only per org; raise the authenticated ceiling substantially; exempt idempotent reads or budget them separately. Keep the strict per-IP limits on auth endpoints.

### API-2 · **P1** · Kanban endpoint embeds *all* deals per stage with no inner pagination
Doc 10 §10.8 returns each stage with an embedded `deals` array. A stage with thousands of open deals returns them all in one payload.
- **Impact:** Huge responses, slow board load, violates the "200 cards without degradation" usability target (doc 04 §4.9) for big tenants.
- **Recommendation:** Paginate/virtualize deals per stage (return first N + count + cursor); lazy-load on scroll within a column.

### API-3 · **P2** · No idempotency keys on user-facing POSTs (create lead/deal/contact)
Inbound webhooks are idempotent (doc 19 §19.4) but user mutations are not. Double-clicks / retried requests create duplicates.
- **Recommendation:** Accept an `Idempotency-Key` header on create endpoints; dedupe in Redis for a short window.

### API-4 · **P2** · CSV import (≤10,000 rows, FR-LEAD-006) collides with Starter's 500-lead plan limit, and import limit enforcement is unspecified
- **Recommendation:** Enforce plan limits transactionally during import with a clear partial-import result; reject/stop at the cap with a precise error.

---

## 6. Workflow Engine Risks

### WF-1 · **P1** · Boolean logic has no grouping/precedence — conditions evaluate strictly left-to-right
Doc 12 §12.6 folds conditions left-to-right using each item's `logicalOperator`. `A AND B OR C AND D` evaluates as `(((A AND B) OR C) AND D)` — not what any user means.
- **Impact:** Workflows silently behave incorrectly; users can't express `(A AND B) OR (C AND D)`. Erodes trust in automation (a core differentiator).
- **Recommendation:** Adopt a grouped condition tree (nested AND/OR groups) or at minimum AND-of-ORs normal form, with the builder enforcing structure.

### WF-2 · **P1** · Async AI scoring races the `LEAD_CREATED` trigger — score-based conditions are null at evaluation time
AI scoring runs async "within 60 seconds" (doc 13 §13.2) while `LEAD_CREATED` fires immediately (doc 12 §12.3). A workflow triggered on lead creation with a condition `lead.aiScore GREATER_THAN 70` sees `aiScore = null` and the condition is always false.
- **Impact:** The flagship "Hot Lead Alert" template (doc 12 §12.8) and similar score-gated automations don't work as users expect.
- **Recommendation:** Either gate score-dependent workflows on the `LEAD_SCORE_CHANGED` trigger, or make scoring on creation a synchronous-enough prerequisite for score-conditioned workflows, or re-evaluate workflows when the score lands. Document the trigger/score ordering explicitly.

### WF-3 · **P1** · No recursion/loop guard; an action can re-fire a trigger
`UPDATE_LEAD_FIELD` / `ASSIGN_LEAD` / `MOVE_DEAL_STAGE` mutate entities, which emit `LEAD_STATUS_CHANGED` / `DEAL_STAGE_CHANGED`, which can trigger the same or another workflow → cascades/loops.
- **Impact:** Runaway executions, duplicate customer messages, queue saturation, cost (AI/Meta).
- **Recommendation:** Per-execution action cap, per-entity execution dedup window, max cascade depth, and a per-org workflow-execution rate limit. Idempotency keys on side-effecting actions.

### WF-4 · **P1** · WAIT/resume holds no version of the workflow definition
Doc 12 §12.7 resumes a delayed execution "from the action after the WAIT," reading the live workflow. If the workflow is edited/deleted/deactivated during a multi-day wait, the resume runs stale, missing, or mismatched actions.
- **Impact:** Half-executed sequences with wrong steps; deletes orphan in-flight jobs.
- **Recommendation:** Snapshot the workflow definition (or a version id) into `workflow_executions` at trigger time; resume against the snapshot; define behavior when a workflow is deactivated mid-flight.

### WF-5 · **P1** · No per-org execution concurrency control → burst sends violate Meta/email limits
A lead-import or viral DM burst can trigger many parallel executions, each sending DMs/emails, blowing IG's 200/hr/page (doc 14 §14.8) and harming sender/quality reputation.
- **Recommendation:** Serialize or rate-limit executions per org and per outbound channel; share the same per-account limiter the inbox send path uses.

### WF-6 · **P2** · `findMatchingWorkflows` loads all active workflows per event
Doc 12 §12.6 queries all active workflows for the org on every event and filters in memory.
- **Recommendation:** Cache active workflows per org (invalidate on edit); index/registry by trigger type.

---

## 7. Instagram Integration Risks

### IG-1 · **P0 (verify-or-block)** · The integration is specified against a Meta API flow that may be deprecated
Doc 14 builds on Facebook-Page-linked Graph API v18 + `pages_*` scopes + Page Access Tokens, and states a 7-day messaging window (§14.10). Meta has migrated toward "Instagram API with Instagram Login" and the standard messaging window is historically 24h (+ human-agent tag). Building to the wrong model wastes a sprint and risks App Review rejection.
- **Impact:** The social-first core may not function and **public launch is gated on Meta App Review** (doc 14 §14.9) — the single longest pole in V1.
- **Recommendation:** Run the 2–3 day pre-build Meta spike (ARCHITECT_RECOMMENDATIONS §4) to validate scopes/tokens/window/webhook fields against the **current** API; patch doc 14 to reality; submit App Review at the earliest demonstrable point. Block detailed inbox build until validated.

### IG-2 · **P1** · Webhook idempotency granularity (`message.mid`) doesn't match the `webhook_events` dedup key (`source, externalEventId`)
Doc 14 §14.4 dedups by `message.mid`, but a single webhook `entry` can batch multiple messaging events, and `webhook_events` uniqueness is `(source, externalEventId)` (doc 08) — there is no single event id per IG webhook delivery.
- **Impact:** Either duplicate processing (double leads/messages) or dropped events depending on which key wins.
- **Recommendation:** Dedup at the **message** grain using `mid` as the idempotency key for message creation, independent of the coarse `webhook_events` envelope record; make the envelope record store-and-forward only.

### IG-3 · **P1** · Token model is internally inconsistent (Page token "never expires" vs 60-day refresh cron)
Doc 14 §14.5 sends via Page Access Token (described as non-expiring), while §14.6 runs a daily cron refreshing 60-day long-lived **user** tokens and marks accounts `EXPIRED` on failure.
- **Impact:** Either unnecessary refresh churn or, if messaging actually depends on the user token, silent inbox breakage when it lapses. Ambiguity = a class of "inbox stopped working" incidents.
- **Recommendation:** Resolve in the IG-1 spike: define exactly which token messaging uses, its true lifetime, and the precise reconnection trigger + owner notification UX.

### IG-4 · **P1** · Per-message profile enrichment + sends can exhaust the 200 calls/hour/page budget
Doc 14 §14.4 fetches the IG profile on message receipt; combined with sends and status handling, a busy conversation burns the limit (mitigated only partially by the 150/hr limiter in §14.8).
- **Recommendation:** Cache profile lookups per IGSID (long TTL), enrich lazily/once, and budget the limiter across receive+send+enrich, with backpressure surfaced to agents.

### IG-5 · **P2** · Out-of-window send failures must be made visible, not silent
Replying after the messaging window closes fails (doc 14 §14.8 / §14.10). If surfaced only as a `FAILED` message status, agents lose leads without understanding why.
- **Recommendation:** Explicit UI state ("window expired — cannot free-form reply") mirroring the WhatsApp window UX.

---

## 8. Billing Risks

### BL-1 · **P0** · Access control reads a mirror of Stripe that can diverge — and a missed event can lock out a paying customer or free a delinquent one
Doc 16 mirrors Stripe state into `subscriptions` and Plan-Limits/read-only gating reads the mirror. Stripe webhooks arrive out of order, can be missed, and can be replayed. The webhook handler (doc 16 §16.7) switches on event type but does not address ordering or reconciliation.
- **Impact:** A dropped `invoice.payment_succeeded` leaves a paying org in read-only (churn + support fire); a dropped `payment_failed` gives a delinquent org free access. Either is a launch-grade incident class.
- **Recommendation:** Treat Stripe as source of truth; apply events by comparing object `status`/timestamps (don't blind-apply); add a **nightly reconciliation** pulling subscription state from Stripe; on ambiguous access decisions, fail toward *not* locking paying customers and alert support. (Idempotency via `webhook_events` already present.)

### BL-2 · **P1** · Downgrade and direct-Portal changes can leave an org over its new plan limits with no enforcement
Doc 16 §16.8 shows a warning *in the app*, but a customer can downgrade directly in the Stripe Customer Portal; the resulting `customer.subscription.updated` webhook syncs the plan but nothing reconciles existing usage (8 pipelines on a 5-pipeline plan).
- **Impact:** Orgs persist in an over-limit state; limit checks only block *new* creates, never existing excess — confusing and exploitable.
- **Recommendation:** On downgrade webhook, compute over-limit resources and apply a defined policy (grace period + read-only on excess, or block downgrade via Portal configuration). Define the canonical behavior.

### BL-3 · **P1** · Seat-based add-on pricing can drift from actual member count
Growth/Scale charge per extra seat (doc 16 §16.2) and `subscriptions.seatCount` exists, but nothing ties Stripe subscription quantity to the live count of active members (FR-TEAM-003).
- **Impact:** Revenue leakage (more members than paid seats) or over-charging (members removed, quantity not decremented).
- **Recommendation:** Update Stripe subscription quantity on member add/suspend/remove (or report usage via metered billing); reconcile in the nightly job.

### BL-4 · **P1** · Read-only / trial-expired / past-due gating must be one tested middleware, not scattered checks
Multiple states (TRIAL_EXPIRED, PAST_DUE→read-only day 9, UNPAID, paused — doc 16 §16.4/§16.11) imply blocking writes. Implemented per-endpoint, gaps are inevitable (some write slips through).
- **Recommendation:** Single composable "billing state gate" middleware on all state-changing routes; exhaustively test the TRIALING→EXPIRED→reactivate and ACTIVE→PAST_DUE→UNPAID→CANCELLED→reactivate paths.

### BL-5 · **P2** · Disputes/refunds/chargebacks absent from the webhook handler; GST/invoice-number correctness needs validation
Doc 16 §16.7 handles payments/subscriptions but not `charge.dispute.*` / refunds; §16.9 GST + gap-free sequential invoice numbers need concurrency-safe generation and tax-advisor sign-off.
- **Recommendation:** Add dispute/refund handling; generate invoice numbers from a DB sequence (not an app counter); validate GST format with finance before first live charge.

---

## 9. Scalability Risks (cross-cutting)

### SC-1 · **P1** · Single write-primary is the hard ceiling; partitioning is deferred until it's painful
All writes hit one Neon primary (doc 05 §5.3); read replica serves analytics only; partitioning triggers at 5M/20M rows (doc 08 §8.4) but partitioning a live RLS-enabled, FK-referenced table is surgery.
- **Recommendation:** Create partitioned table *structures* early (single partition), validate RLS+tenant-extension+partitioning compose, and rehearse partition addition on a staging clone before the threshold (also DB-2/DB-3/DB-6 intersect here).

### SC-2 · **P1** · Webhook worker concurrency (30) is far below the 5,000 events/sec V3 target and lacks per-org fairness
Doc 06 §6.5 sets `webhook-processing` concurrency 30; doc 04 §4.2 targets up to 5,000/sec. One viral/seasonal tenant can monopolize workers (doc 01 coaching "admissions season" persona).
- **Recommendation:** Autoscale webhook workers on queue depth (alert >1000, doc 18 §18.3); weighted/per-org consumption so no tenant starves others; keep ingest minimal (verify+insert+enqueue).

### SC-3 · **P1** · WebSocket fan-out and the "separate WS tier with Redis adapter" must exist before multi-instance scaling
Doc 20 §20.4 requires it; if WS launches co-located with the API for speed, cross-instance delivery breaks and large-org room broadcasts (100 reps) amplify.
- **Recommendation:** Ship the Redis Socket.io adapter from day one even if co-located; extract the tier in V2; test cross-instance delivery before scaling past one API instance.

### SC-4 · **P1** · Live analytics aggregation on the replica won't hold the latency NFR at scale
Doc 04 §4.1 allows analytics P95 < 1.5s, but live multi-join aggregations over millions of rows (even on a replica) won't sustain it, and replica lag shows stale numbers.
- **Recommendation:** Pre-aggregate via materialized views / rollup tables refreshed on schedule; show "as of" timestamps; reserve the replica connection pool.

### SC-5 · **P2** · "Unlimited" AI on the Scale plan is an unbounded cost/throughput commitment
Doc 16 §16.2 + doc 13 §13.8 (`SCALE: Infinity`). A single heavy tenant can erode margin and saturate the `ai-scoring` queue (concurrency 5).
- **Recommendation:** Per-org *cost* budget + alerting even on "unlimited"; track cost-per-org as a margin metric; size AI worker concurrency to real load.

---

## 10. Severity Scorecard

| ID | Area | Finding (short) | Severity |
|---|---|---|---|
| AR-1 | Architecture/Tenancy | `SET LOCAL` not on the query's connection → RLS broken | **P0** |
| AR-2 | Architecture/Tenancy | Org not injected on update/delete/upsert/aggregate | **P0** |
| AR-3 | Architecture | Per-query transactions block atomic multi-write ops | **P0** |
| AR-4 | Architecture | RSC data-fetch vs in-memory token contradiction | P1 |
| AR-5 | Architecture | Crons lack single-flight across instances | P1 |
| AR-6 | Architecture | In-process event bus loses side-effect events on crash | P1 |
| MT-1 | Multi-tenant | Isolation not correct as specified (AR-1/AR-2) | **P0** |
| MT-2 | Multi-tenant | Up to 15-min stale permissions on revoke | P1 |
| MT-3 | Multi-tenant | Super-admin raw client blocked by RLS | P1 |
| MT-4 | Multi-tenant | New extended client per request | P2 |
| SEC-1 | Security | Cross-site refresh cookie won't send (`SameSite=Strict`) | **P0** |
| SEC-2 | Security | Workflow WEBHOOK action = SSRF (P0 when shipped, V2) | P1→P0@V2 |
| SEC-3 | Security | SEND_EMAIL action enables spam from sending domain | P1 |
| SEC-4 | Security/DB | Email/phone "field-encrypted" contradicts indexes/search | P1 |
| SEC-5 | Security | Raw-body vs global JSON parser breaks webhook HMAC | P1 |
| SEC-6 | Security | Reset/verify token hashing + enumeration unspecified | P2 |
| SEC-7 | Security | CSP allows `'unsafe-inline'` styles | P2 |
| DB-1 | Database | Soft delete + plain UNIQUE blocks slug/email/member reuse | P1 |
| DB-2 | Database | Write amplification on immutable activity/audit tables | P1 |
| DB-3 | Database | Polymorphic `messages.conversationId`, no FK | P1 |
| DB-4 | Database | Offset `COUNT(*)` pagination too slow at scale | P1 |
| DB-5 | Database | Multi-currency aggregation/forecast unreconciled | P1@enable / P2 V1 |
| DB-6 | Database | UUID v4 on high-insert tables hurts locality | P1 |
| DB-7 | Database | Connection-pool math under-specified | P2 |
| API-1 | API | 100 req/min per-org rate limit too low for teams | P1 |
| API-2 | API | Kanban embeds all deals per stage, no inner paging | P1 |
| API-3 | API | No idempotency keys on user POSTs | P2 |
| API-4 | API | Import size vs plan-limit enforcement unspecified | P2 |
| WF-1 | Workflow | No boolean grouping/precedence in conditions | P1 |
| WF-2 | Workflow | Async score races LEAD_CREATED → score conditions null | P1 |
| WF-3 | Workflow | No recursion/loop guard on actions re-firing triggers | P1 |
| WF-4 | Workflow | WAIT/resume runs against un-versioned definition | P1 |
| WF-5 | Workflow | No per-org execution concurrency → burst send limits | P1 |
| WF-6 | Workflow | Loads all workflows per event | P2 |
| IG-1 | Instagram | API flow may be deprecated; gates App Review/launch | **P0 (verify)** |
| IG-2 | Instagram | mid vs (source,eventId) dedup granularity mismatch | P1 |
| IG-3 | Instagram | Page-token vs 60-day-refresh inconsistency | P1 |
| IG-4 | Instagram | Per-message enrichment exhausts 200/hr budget | P1 |
| IG-5 | Instagram | Out-of-window send failures must be visible | P2 |
| BL-1 | Billing | Mirror divergence locks out paying / frees delinquent | **P0** |
| BL-2 | Billing | Downgrade/Portal leaves org over-limit, unenforced | P1 |
| BL-3 | Billing | Seat quantity drifts from member count | P1 |
| BL-4 | Billing | Read-only gating scattered vs single middleware | P1 |
| BL-5 | Billing | Disputes/refunds absent; GST/invoice-number safety | P2 |
| SC-1 | Scale | Single write-primary; partitioning deferred | P1 |
| SC-2 | Scale | Webhook concurrency low; no per-org fairness | P1 |
| SC-3 | Scale | WS tier/Redis adapter required before multi-instance | P1 |
| SC-4 | Scale | Live analytics aggregation misses latency NFR | P1 |
| SC-5 | Scale | "Unlimited" AI is unbounded cost | P2 |

**Totals:** P0 = 7 (AR-1, AR-2, AR-3, SEC-1, IG-1, BL-1, plus MT-1 which restates AR-1/AR-2) · P1 = 28 · P2 = 11.

---

## 11. P0 Launch Gate (must be green before public launch)

1. **Tenancy correctness (AR-1, AR-2, AR-3 / MT-1):** redesign tenant-context setting to a single per-request transaction; scope *all* write/read operations; prove isolation at app **and** RLS layers, including update/delete/aggregate, in the Sprint-3 suite. *This is non-negotiable — it is a data-breach class of bug.*
2. **Auth works in the real topology (SEC-1):** shared parent domain + `SameSite=None; Secure` + CSRF (or BFF). Fix the webhook path/domain (E1) at the same time.
3. **Webhook signature verification actually runs (SEC-5):** raw-body capture before JSON parsing, with a rejection test.
4. **Instagram API validated against current Meta (IG-1):** pre-build spike done, doc 14 patched, App Review submitted early.
5. **Billing can't lock out a paying customer (BL-1):** ordered/idempotent event application + nightly reconciliation + fail-open-on-ambiguity for access.
6. **Encryption claim reconciled (SEC-4):** decide volume-vs-field encryption for email/phone; correct the docs so the security posture is truthful and search/dedup work.

Everything marked P1 should be scheduled against the "before scale" milestones in `DEVELOPMENT_ROADMAP.md` (most map to Sprints 3–8 hardening or the V2 entry); P2 items belong in the 20% tech-debt reserve.

---

## 12. Reviewer's Bottom Line

The blueprint is architecturally sound at the level of *strategy* — modular monolith, async backbone, social-first, defense-in-depth tenancy are the right calls. The danger is in the *mechanisms*: the single most important security control in the product (the tenant isolation extension) is **incorrect as written** and would either break RLS or leak cross-tenant writes; the auth cookie model **cannot function** in the documented deployment; the workflow engine has **correct-looking but wrong** boolean logic and a score/trigger race; and billing access-control trusts a mirror that **will** drift. None of these are exotic — they are the exact places 0→1 SaaS products get breached or embarrassed. Fix the seven P0s before launch and the platform is in good shape; ship them as-specified and the first security researcher or the first out-of-order Stripe webhook finds them for you.
