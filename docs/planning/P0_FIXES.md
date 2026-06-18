# P0_FIXES.md

> **Owner:** Principal Architect, LeadOS
> **Scope:** ONLY the P0 (launch-blocker) findings from `docs/planning/ARCHITECTURE_REVIEW.md`, cross-referenced against `docs/planning/IMPLEMENTATION_PLAN.md`.
> **Mandate:** These must be resolved in the blueprint **before implementation of the affected modules begins** (tenancy in Sprint 3, auth in Sprint 2, Instagram in Sprint 6, billing in Sprint 8). No application code is written here — only corrected architecture, document deltas, and impact analysis. Illustrative database DDL / RLS policy is shown as schema configuration, not application logic.

## P0 Index

| Fix | Review IDs | Title | Affected phase |
|---|---|---|---|
| **P0-1** | AR-1, MT-1, MT-3 | Tenant RLS context is set on the wrong connection | P1 / Sprint 3 |
| **P0-2** | AR-2, MT-1 | App-layer org scoping omits writes & aggregates | P1 / Sprint 3 |
| **P0-3** | AR-3 | Per-query transactions prevent atomic multi-write units of work | P1 / Sprint 3 |
| **P0-4** | SEC-1 | Cross-site refresh cookie cannot be sent in the deployed topology | P1 / Sprint 2 |
| **P0-5** | IG-1 | Instagram integration targets a possibly-deprecated Meta flow | P4 / Sprint 6 (spike now) |
| **P0-6** | BL-1 | Billing access control trusts a Stripe mirror that drifts | P6 / Sprint 8 |
| **P0-7** | SEC-4 | "Email/phone encrypted at rest" contradicts the search/dedup indexes | P1–P2 / Sprint 4 |

> **P0-1, P0-2, P0-3 share one corrected design** (the Tenancy Model below). They are listed separately because each must be independently verified, but they are fixed together. MT-1 (isolation incorrect) is fully subsumed by P0-1+P0-2; MT-3 (super-admin vs RLS) is resolved inside P0-1.

---

# Shared Corrected Design: The Tenancy Model (resolves P0-1, P0-2, P0-3)

Because the three tenancy P0s are symptoms of one broken mechanism, here is the single corrected model they all reference.

**Principle:** tenant context is established **once per unit of work**, inside **one transaction**, on **one pinned connection**, and *both* the RLS GUC and every Prisma operation for that unit of work execute on that same connection.

**Mechanism (replaces doc 07 §7.3):**
1. A **unit of work** = a request handler's service call (or a smaller atomic operation). It runs inside a single Prisma interactive transaction.
2. The **first statement** of that transaction sets the tenant GUC using the function form of `SET LOCAL`, which is transaction-scoped and therefore pinned to the transaction's connection:
   - `SELECT set_config('app.current_organization_id', $orgId, true)` — the `true` makes it `LOCAL` (transaction-scoped).
3. All subsequent reads/writes run on **the transaction client** (`tx`), so they share the connection that has the GUC set. RLS now sees the correct org on every statement.
4. A Prisma **client extension** provides defense-in-depth app-layer scoping on **every** operation (see P0-2), and is applied to the `tx` client so injection and the GUC always travel together.
5. **RLS policy** uses the missing-safe form so an unset GUC denies rather than errors:
   - `USING (organization_id = current_setting('app.current_organization_id', true)::uuid)` — `true` = "missing ok" → returns NULL when unset → row fails the predicate (deny-by-default).
6. **Super admin (MT-3):** the platform-admin database role is granted `BYPASSRLS` and is strictly separate from the application role. Super-admin code paths use this role explicitly and write to `platform_audit_logs`. The application role never has `BYPASSRLS`.
7. **Pooling:** PgBouncer/Neon must run in **transaction pooling mode**, which is compatible with per-transaction `set_config(..., true)`. This is validated in the Sprint-3 benchmark before any domain module is built on top (already gated in the implementation plan).

This single model makes RLS actually enforce (P0-1), makes app-layer scoping total (P0-2), and gives service methods a real transaction to compose multiple writes atomically (P0-3).

---

## P0-1 · Tenant RLS context is set on the wrong connection (AR-1, MT-3)

### 1. Why the current design is incorrect
Doc 07 §7.3 wraps each query as `prisma.$transaction([ prisma.$executeRaw\`SET LOCAL app.current_organization_id = ...\`, query(args) ])`. Two defects:
- It invokes `prisma.$transaction` on the **base** client, while `query(args)` is the operation from the **extended** client. There is no guarantee — and under a connection pooler, no likelihood — that the raw `SET LOCAL` and the real query run on the same pooled connection/transaction. `SET LOCAL` is connection- and transaction-scoped, so when the query lands on a different connection the GUC is unset.
- With the GUC unset, the RLS policy `organization_id = current_setting('app.current_organization_id')::uuid` either raises (`unrecognized configuration parameter`) or evaluates against NULL. Either way RLS stops being a backstop. Isolation then rests entirely on app-layer injection, which itself is incomplete (P0-2).

### 2. Corrected architecture
Adopt the **Tenancy Model** above: set the GUC as the first statement of a per-unit-of-work interactive transaction using `set_config('app.current_organization_id', $org, true)`, run all queries on that transaction client, and use the missing-safe `current_setting(..., true)` form in policies so an unset context denies. Grant `BYPASSRLS` only to a separate super-admin role.

### 3. Blueprint document updates
- **07-MULTI-TENANT.md §7.3** — replace the extension/`$transaction` example with the per-unit-of-work transaction + `set_config(...,true)` pattern; correct the RLS policy to the missing-safe form (`current_setting('app.current_organization_id', true)`).
- **07-MULTI-TENANT.md §7.5** — specify the separate `BYPASSRLS` super-admin DB role instead of "raw Prisma client (no tenant extension)," which would otherwise be blocked by RLS.
- **05-ARCHITECTURE.md §5.2 (`core/prisma`)** — note the request-transaction/connection-pinning responsibility and that the tenant extension binds to the transaction client.
- **20-PRODUCTION-READINESS.md §20.1 (Multi-Tenancy)** — add an explicit check: "RLS denies a query whose GUC is deliberately unset/incorrect," tested at the DB layer.

### 4. Implementation impact
Localized to the `core/prisma` layer + `tenantMiddleware`, but it changes the calling convention: services receive a transaction-scoped client per unit of work rather than calling a globally-extended client ad hoc. Because this is fixed in **Sprint 3 before domain modules exist**, no domain code is rewritten — this is the entire reason the plan gates tenancy first. Adds the Sprint-3 pooling/performance benchmark as a hard go/no-go.

### 5. Database changes required
**Yes (configuration, not table shape):**
- RLS policies on all tenant tables rewritten to the missing-safe `current_setting(..., true)` form.
- Create/confirm two distinct DB roles: application role (RLS-enforced, no bypass) and platform-admin role (`BYPASSRLS`).
- Confirm pooler is in transaction mode.
No table/column shape changes.

### 6. API changes required
**No.** External REST contract is unchanged; this is internal data-access plumbing.

### 7. Migration risks
- **Low for V1** (fixed before tenant data exists). The risk is *not* fixing it: any later change is a security-sensitive migration touching every table's policy under load.
- Pooler-mode change must be validated against Neon's connection limits; mis-set pooling (session vs transaction) silently breaks GUC scoping — covered by the Sprint-3 isolation + benchmark gate.

---

## P0-2 · App-layer org scoping omits writes & aggregates (AR-2, MT-1)

### 1. Why the current design is incorrect
The doc 07 §7.3 extension injects `organizationId` only for `create/createMany` and `findMany/findFirst/findUnique/count`. It does **not** scope `update`, `updateMany`, `delete`, `deleteMany`, `upsert`, `aggregate`, `groupBy`, or the `*OrThrow` variants. So `db.lead.update({ where: { id } })` and `db.lead.deleteMany({ where })` run **unscoped**. Combined with P0-1 (RLS unreliable), this is a cross-tenant write/delete path and aggregate/groupBy leaks cross-tenant sums into analytics — the most severe class of multi-tenant defect.

### 2. Corrected architecture
The tenant extension is **deny-by-default for tenant-scoped models** and scopes **every** operation:
- Writes with a `where` (`update`, `updateMany`, `delete`, `deleteMany`, `upsert`, `*OrThrow`): inject `organizationId` into `where` (and into `create`/`update` payloads for `upsert`).
- Writes without a `where` (`createMany`): inject `organizationId` into each `data` row.
- Read/aggregate (`aggregate`, `groupBy`, `count`, all `find*`): inject `organizationId` into `where`.
- Any operation on a tenant-scoped model that cannot be safely scoped is rejected, not passed through.
- RLS (now functional via P0-1) remains the backstop, so a missed injection is caught at the database rather than leaking.

### 3. Blueprint document updates
- **07-MULTI-TENANT.md §7.3** — expand the operation list to the full set above; state the deny-by-default rule for tenant-scoped models; show injection for write/aggregate operations, not just create/read.
- **07-MULTI-TENANT.md §7.5 (Cross-Tenant Security table)** — add rows for "update/delete by guessed id" and "aggregate leakage," prevented by both extension scoping and RLS.
- **20-PRODUCTION-READINESS.md §20.1 (Multi-Tenancy)** — the isolation test must explicitly cover `update`, `delete`, `upsert`, `aggregate`, `groupBy`, not just reads/creates.

### 4. Implementation impact
Contained in the extension. The high-value deliverable is the **cross-tenant isolation test suite** (already the headline Sprint-3 asset): it must enumerate every Prisma operation × every tenant model and assert org A cannot touch org B. This suite becomes a permanent regression gate.

### 5. Database changes required
**No table changes.** RLS (from P0-1) is the only DB-side element and is already covered there.

### 6. API changes required
**No.** Internal only.

### 7. Migration risks
- **Low for V1.** Fixed before domain modules. Risk is shipping with the partial extension and discovering it via a breach.
- Watch: introducing scoping on `aggregate`/`groupBy` must not break analytics queries that legitimately span an org — they already run within one org, so injection is consistent; verify the analytics replica client uses the same extension.

---

## P0-3 · Per-query transactions prevent atomic multi-write units of work (AR-3)

### 1. Why the current design is incorrect
Because doc 07 §7.3 wraps **every** query in its own `$transaction`, a service operation that must be atomic cannot be. Examples that *require* atomicity:
- **Registration/onboarding** (doc 07 §7.6): create user → org → member(OWNER) → subscription → default pipeline + stages → seeded roles — six+ writes that must all succeed or all roll back.
- **Lead → Contact conversion** (FR-LEAD-008): create/link contact + set `lead.convertedToContactId` + write activity.
- **Deal won** (doc 03): update deal + create/link contact + write activity + (enqueue) workflow.
Wrapping these in an outer transaction nests against the per-query transactions; Prisma rejects nested interactive transactions, or atomicity is silently lost, leaving partial state (an org with no subscription; a lead marked converted with no contact).

### 2. Corrected architecture
The **Tenancy Model** makes the unit of work *itself* the transaction. A service method opens one interactive transaction, sets the tenant GUC as its first statement, and performs all its writes on that transaction client — atomic by construction, and RLS-correct because all statements share the connection. Single-statement reads use a lightweight equivalent (one short transaction or a scoped read path). No nesting, because the GUC is set at the transaction boundary, not per query.

### 3. Blueprint document updates
- **07-MULTI-TENANT.md §7.6 (Tenant Onboarding Flow)** — state explicitly that steps [2]–[7] execute in a single transaction with tenant context set once.
- **05-ARCHITECTURE.md §5.5 (Data Flow)** — note that multi-write flows (lead capture, conversion, deal-won) are single units of work / transactions.
- **08-DATABASE-DESIGN.md §8.6 (Audit Strategy)** — clarify that audit/activity writes participate in (or are enqueued from) the same unit of work, not separate uncoordinated transactions.

### 4. Implementation impact
Defines the **service-layer transaction convention** every module follows from Sprint 4 onward: services accept/operate within a unit-of-work transaction; repositories use the transaction client. Setting this convention in Sprint 3 (before CRM in Sprint 4) is what prevents rework. Long-running external calls (Meta/OpenAI/Stripe) must stay **outside** DB transactions — they belong on queues — so transactions remain short.

### 5. Database changes required
**No schema changes.** It is a transaction-usage convention enabled by the P0-1 connection model.

### 6. API changes required
**No.**

### 7. Migration risks
- **Low for V1.** Convention set before domain code.
- Anti-pattern to guard against: wrapping an *entire HTTP request* (including external API calls) in one DB transaction → connection starvation. Mitigation: unit-of-work = the smallest atomic service operation; externals on queues. Add a lint/review rule against awaiting network calls inside a DB transaction.

---

## P0-4 · Cross-site refresh cookie cannot be sent in the deployed topology (SEC-1)

### 1. Why the current design is incorrect
Doc 19 §19.1 sets the refresh token cookie as `HttpOnly; Secure; SameSite=Strict`. The implementation plan / SETUP.md deploy the web app on Vercel and the API on a `*.up.railway.app` domain — **different registrable domains (eTLD+1)**. A `SameSite=Strict`/`Lax` cookie is not sent on cross-site requests, so the browser sends *no* refresh cookie to the API → the refresh call fails → silent logout loop. This only manifests in the real cross-domain deploy, i.e. at launch, not on localhost. (Doc 19 §19.7 already *lists* `api.leados.com`, implying the intended fix was never reconciled with SETUP.md.)

### 2. Corrected architecture
Make the web origin and the API origin **same-site** (shared registrable domain), so the refresh cookie is first-party and `SameSite` permits it:
- Web: `app.leados.app` · API: `api.leados.app` (shared eTLD+1 `leados.app`). Requests between them are **same-site**, so `SameSite=Strict` (or `Lax`) cookies are sent; CORS still needs `credentials: true` + explicit origin allow-list (already in doc 19 §19.7).
- Refresh cookie: `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth` scoped to the API subdomain. Keep the **access token in memory** (bearer header) as designed.
- **CSRF:** because the refresh endpoint relies on a cookie, add an origin/referer check and a custom-header requirement on `/auth/refresh` (defense in depth even under SameSite=Strict).
- **Recommended alternative (also fixes AR-4, the P1 RSC/token contradiction):** a **BFF** — Next.js route handlers hold the session cookie first-party to `app.leados.app` and proxy to the API server-side. This removes the cross-domain coupling entirely and lets RSC fetch authenticated data. If the team co-locates domains *and* adopts the BFF, both SEC-1 (P0) and AR-4 (P1) are closed together.
- If, and only if, domains genuinely cannot be co-located, fall back to `SameSite=None; Secure` **with mandatory CSRF tokens** — less preferable.

### 3. Blueprint document updates
- **19-SECURITY.md §19.1** — specify same-site domain requirement, the exact cookie attributes, and CSRF protection on the refresh endpoint; note the BFF option.
- **19-SECURITY.md §19.7 (CORS)** — reconcile to the final `app.`/`api.leados.app` origins; remove the railway.app assumption.
- **05-ARCHITECTURE.md §5.3 (Deployment)** — record that web and API are served under one registrable domain (custom domains in front of Vercel/Railway), and optionally the BFF layer.
- **06-TECH-STACK.md §6.1** — if BFF adopted, document Next.js route handlers as the auth/session proxy; resolve the RSC data-fetch story.
- **root `docs/SETUP.md`** — replace the `*.up.railway.app` webhook/API URLs with the custom-domain configuration; align the Instagram webhook path (E1) at the same time.
- **10-API-DESIGN.md §10.7 (Auth)** — clarify the refresh endpoint's cookie + CSRF-header contract.

### 4. Implementation impact
Primarily **infrastructure/DNS + auth middleware config**, addressed in **Sprint 2** when auth first ships. If the BFF is chosen, it adds a Next.js proxy layer (a few route handlers) and shifts data fetching — a larger but strategically cleaner change that should be decided in Sprint 1–2, not retrofitted.

### 5. Database changes required
**No.**

### 6. API changes required
**Minor/contractual:** the `/auth/refresh` endpoint's documented cookie attributes and an added CSRF-header expectation. Endpoint paths and payloads are otherwise unchanged. If BFF: the browser talks to Next.js route handlers instead of the API directly (origin change, not contract change).

### 7. Migration risks
- **Low (pre-launch)** but **must be validated in a real cross-domain staging deploy**, not localhost — the failure is invisible locally.
- Cookie `Domain`/`Path` and CORS `credentials` misconfiguration are easy to get subtly wrong; add an automated end-to-end refresh test against the staging domains to the Sprint-2 exit criteria and the doc-20 go-live smoke tests.

---

## P0-5 · Instagram integration targets a possibly-deprecated Meta flow (IG-1)

### 1. Why the current design is incorrect
Doc 14 is written around the Facebook-Page-linked Graph API v18 flow (`pages_show_list`, `pages_read_engagement`, Page Access Tokens) and asserts a 7-day messaging window (§14.10). Meta has been moving to "Instagram API with Instagram Login" and deprecating older versions/paths; the standard messaging window is historically 24h (+ a human-agent tag). Building to the wrong model wastes the Sprint-6 build and risks **App Review rejection** — and App Review gates public launch (the single longest pole in V1). The token model is also internally inconsistent (Page token "never expires" vs a 60-day refresh cron — IG-3), which is a downstream symptom of the same unvalidated assumption.

### 2. Corrected architecture
- **Pre-build validation spike (do now, before Sprint 6 build):** validate, against a live Meta test app on the **current** API, the exact OAuth flow ("Instagram API with Instagram Login" vs Facebook-Login/Page-linked), required scopes, token type(s) used for messaging and their true lifetimes, the real messaging-window duration, and current webhook field names/payload shapes.
- **Channel-adapter abstraction:** encapsulate all Meta specifics behind an Instagram adapter interface (connect, subscribe-webhook, receive, send, refresh-token, fetch-profile) so the concrete API version/flow is swappable and the inbox/workflow layers don't bind to Meta's wire format. Pin a Graph API version and add a deprecation-tracking task.
- **Reconcile the webhook path (E1):** one canonical path (recommend `/api/webhooks/instagram`), corrected in both doc 10 and SETUP.md, configured in Meta before review.
- **Submit App Review at the earliest demonstrable point**; complete Facebook Business verification now (slow prerequisite); keep a sandbox/test-user path usable pre-approval so the team/beta aren't blocked.

### 3. Blueprint document updates
- **14-INSTAGRAM-INTEGRATION.md** — major revision: replace §14.2 OAuth flow, §14.3 webhook subscription, §14.5 send, §14.6 token refresh, and §14.10 window with the spike-validated reality; resolve the Page-token vs refresh-cron inconsistency (IG-3).
- **10-API-DESIGN.md §10.7 (Webhooks)** and **root `docs/SETUP.md` §4** — canonicalize the Instagram webhook path (E1).
- **08-DATABASE-DESIGN.md (`instagram_accounts`)** and **09-PRISMA-SCHEMA.md** — adjust stored fields to the chosen flow (e.g., token type discriminator, the specific long-lived/page token actually used, IG account id vs page id optionality, true `accessTokenExpiresAt` semantics).
- **20-PRODUCTION-READINESS.md §20.1 (Instagram)** — keep "App Review approved" as a hard launch gate and add "integration validated against current Graph API version."

### 4. Implementation impact
The spike is **2–3 engineer-days now** and de-risks the most schedule-threatening item. The adapter abstraction is modest extra structure in Sprint 6 that pays for itself when Meta next changes the API. Build of the inbox is **blocked on the spike outcome**, by design.

### 5. Database changes required
**Possibly yes (pre-build):** `instagram_accounts` fields may change based on the validated flow (token type, expiry semantics, id fields). Because this is decided before Sprint 6, it's a schema *definition* change, not a data migration.

### 6. API changes required
**Yes (internal/edge):** canonical webhook path; the OAuth connect/callback payloads (`/api/v1/social/instagram/*`) may change shape to match the chosen flow. The user-facing inbox API is unaffected.

### 7. Migration risks
- **Low if done before Sprint 6; high if discovered after build** (rework + re-review delay). The dependency on Meta App Review latency is the dominant schedule risk and is outside engineering control — mitigated only by submitting early.
- Encrypted token storage format (P0-adjacent) must accommodate whichever token type is chosen; pair with the field-encryption key-versioning recommendation so token format can evolve.

---

## P0-6 · Billing access control trusts a Stripe mirror that drifts (BL-1)

### 1. Why the current design is incorrect
Doc 16 mirrors Stripe state into `subscriptions`/`invoices`/`payments`, and Plan-Limits + read-only gating read the **mirror**. Stripe webhooks arrive **out of order**, can be **missed**, and can be **replayed**. The handler (doc 16 §16.7) switches on event type but does nothing about ordering or reconciliation. A dropped `invoice.payment_succeeded` leaves a paying org in read-only (churn + support fire); a dropped `payment_failed`/`subscription.updated` gives a delinquent org free access. Both are launch-grade incidents.

### 2. Corrected architecture
Treat **Stripe as the source of truth** and the mirror as a cache, with three safeguards:
- **Ordered application:** persist the Stripe event timestamp and the subscription object's `status` + `current_period_end` on the mirror; apply an event only if it is **newer** than what is stored (guard against out-of-order/replay). Idempotency is already provided by `webhook_events (source, externalEventId)` using the Stripe event id.
- **Nightly reconciliation job:** list subscriptions from Stripe, diff against the mirror, correct drift, and alert on mismatch (catches missed webhooks).
- **Computed effective access, fail-open on ambiguity:** access decisions read a derived `effectiveAccessLevel` (full / read-only / suspended) computed from status + grace windows (the dunning timeline in doc 16 §16.11), not raw status. If the mirror is stale (last sync older than a threshold) or in an ambiguous transitional state, **do not hard-lock a previously-paying org** — flag for support instead. Pair with the single read-only gate middleware (BL-4, P1).

### 3. Blueprint document updates
- **16-BILLING-ARCHITECTURE.md §16.7** — add ordered/idempotent application rules and the explicit handling for out-of-order/replayed events.
- **16-BILLING-ARCHITECTURE.md (new subsection)** — define the nightly Stripe→mirror reconciliation job and alerting.
- **16-BILLING-ARCHITECTURE.md §16.4/§16.5/§16.11** — define `effectiveAccessLevel` derivation and the fail-open-on-ambiguity rule for access decisions.
- **08-DATABASE-DESIGN.md (`subscriptions`)** and **09-PRISMA-SCHEMA.md** — add fields to support ordering + reconciliation (e.g., `lastStripeEventAt` / `lastSyncedAt`, and any grace-window timestamps used by the gate).
- **18-OBSERVABILITY.md §18.3** — add a "billing mirror drift" metric/alert.
- **20-PRODUCTION-READINESS.md §20.1 (Billing)** — add: ordered webhook handling, reconciliation job verified, "missed webhook does not lock out a paying org" tested.

### 4. Implementation impact
Confined to the billing module + a scheduled job + the access-gate middleware, in **Sprint 8**. The reconciliation job and the "effective access" abstraction are modest additions; the discipline change is that access logic never reads raw `subscription.status` directly.

### 5. Database changes required
**Yes (additive):** new columns on `subscriptions` for ordering/reconciliation (`lastStripeEventAt`, `lastSyncedAt`) and any grace-window timestamps. Additive and backward-compatible.

### 6. API changes required
**No external change.** Internally: the Stripe webhook handler logic, a new internal reconciliation job, and possibly a support-only endpoint to place/lift a billing hold (operability).

### 7. Migration risks
- **Low (additive columns).** New columns default safely; reconciliation can backfill `lastSyncedAt`.
- Risk of an overly-aggressive gate during the transition (e.g., treating "never synced" as no-access) — mitigate with fail-open default and a one-time reconciliation before enabling enforcement.
- Test the full state machine (TRIALING→EXPIRED→reactivate; ACTIVE→PAST_DUE→UNPAID→CANCELLED→reactivate) in Stripe test mode before launch (doc 20).

---

## P0-7 · "Email/phone encrypted at rest" contradicts the search/dedup indexes (SEC-4)

### 1. Why the current design is incorrect
Doc 04 §4.4 and doc 19 §19.9 (A02) assert phone/email are AES-256 **field-encrypted**. Doc 08 indexes `email`/`phone` for dedup, builds a **GIN full-text index** over `email`, and filters/searches by them (doc 10 §10.4–10.5). Application-level encryption makes equality dedup, FTS, and trigram/`LIKE` search impossible. Doc 19 §19.3 in fact only app-encrypts the two OAuth tokens and relies on Neon volume encryption for the rest. So either the security claim is false (a compliance misrepresentation) or the core lead dedup/search features break.

### 2. Corrected architecture
**Decide explicitly and align the docs. Recommended for V1 — Option A:**
- **Option A (recommended):** rely on **storage-layer encryption at rest** (Neon volume, AES-256, already true) for email/phone. Columns remain plaintext at the column level → dedup, FTS, trigram search all work. App-level field encryption stays limited to the two OAuth tokens. Correct doc 04 §4.4 and doc 19 A02 so the security posture is truthful: "all data encrypted at rest at the storage layer; OAuth tokens additionally encrypted at the application layer (AES-256-GCM)." Audit-log PII masking (doc 08 §8.6) and PII-out-of-logs (doc 18) remain unchanged.
- **Option B (only if a regulation forces column-level encryption of email/phone):** keep ciphertext columns **plus deterministic blind-index columns** (`emailHash`, `phoneHash` = HMAC-SHA256 under a separate key) for equality/dedup, and accept loss of substring/FTS search (or build tokenized search). This is a significant complexity and storage change and should not be taken without a concrete compliance driver.

### 3. Blueprint document updates
- **04-NON-FUNCTIONAL-REQUIREMENTS.md §4.4 (Data Protection)** — restate the encryption posture (storage-at-rest for PII; app-level only for tokens). Remove the implication that email/phone are app-level field-encrypted (Option A).
- **19-SECURITY.md §19.3 and §19.9 (A02)** — align "field encryption" scope to tokens only; describe storage-layer encryption for PII.
- **08-DATABASE-DESIGN.md** — confirm email/phone remain indexable columns (Option A: no change). If Option B is mandated: add `emailHash`/`phoneHash` columns + indexes and document the search limitations.
- **09-PRISMA-SCHEMA.md** — matches doc 08 (no change for Option A; add hash fields for Option B).
- **20-PRODUCTION-READINESS.md §20.2 (Data Security)** — replace the line implying email/phone are app-level encrypted; clarify PII-at-rest is storage-level and only tokens are AES-256-GCM app-encrypted.

### 4. Implementation impact
**Option A:** documentation-only correction, no engineering work — encryption already only covers tokens. Resolved by **Sprint 4** when lead dedup/search is built, so the team builds against the correct model. **Option B:** non-trivial — new columns, HMAC keying/rotation, dedup logic against hashes, search redesign — and would need its own sprint.

### 5. Database changes required
- **Option A: none.**
- **Option B: yes** — add `emailHash`/`phoneHash` columns + indexes; potentially change `email`/`phone` to opaque storage.

### 6. API changes required
**No.** (Option B would change internal dedup/search implementation but not the REST contract.)

### 7. Migration risks
- **Option A: essentially none** (no code currently encrypts these; pre-launch). Risk is *reputational/compliance* if the inaccurate claim ships in ToS/marketing — fix the docs before any compliance statement is published.
- **Option B:** backfilling hashes over existing PII, key management/rotation for the HMAC key, and permanent loss of substring search — all reasons to avoid unless legally required.

---

## P0 Resolution Sequencing (against the implementation plan)

| Fix | Resolve in | Gate it blocks |
|---|---|---|
| P0-4 (auth cookie) | Sprint 1–2 (decide domain/BFF), validate Sprint 2 | M1 auth lifecycle; doc-20 go-live smoke |
| P0-1, P0-2, P0-3 (tenancy) | **Sprint 3 (hard gate)** before any domain module | M1 "tenancy proven"; all of P2+ |
| P0-7 (encryption) | Doc fix immediately; aligned by Sprint 4 | Lead dedup/search (Sprint 4) |
| P0-5 (Instagram) | **Spike now**, build Sprint 6 | M4 + Meta App Review (gates public launch) |
| P0-6 (billing) | Sprint 8 | M6 launch readiness (doc 20 Billing) |

All seven must be **green on the doc-20 P0 launch gate** (see ARCHITECTURE_REVIEW §11) before public launch.

---

# Blueprint Changes Required

Every document that must be modified **before implementation of the affected module begins**. (Planning docs in `docs/planning/` are analysis, not source of truth, and are not listed.)

| # | Document | Sections to change | Driven by | Change summary |
|---|---|---|---|---|
| 1 | **04-NON-FUNCTIONAL-REQUIREMENTS.md** | §4.4 (Data Protection) | P0-7 | Restate encryption posture: storage-layer encryption for PII (email/phone); app-level field encryption limited to OAuth tokens. Remove implication that email/phone are app-encrypted. |
| 2 | **05-ARCHITECTURE.md** | §5.2 (`core/prisma`), §5.3 (Deployment), §5.5 (Data Flow) | P0-1, P0-3, P0-4 | Document per-unit-of-work transaction + tenant-GUC binding; multi-write flows are single transactions; web+API under one registrable domain (and optional BFF). |
| 3 | **06-TECH-STACK.md** | §6.1 (Frontend / auth) | P0-4 | If BFF adopted: Next.js route handlers as auth/session proxy; resolve RSC data-fetch story. (Skip if domain co-location alone is chosen.) |
| 4 | **07-MULTI-TENANT.md** | §7.3 (RLS + extension), §7.4 (middleware), §7.5 (super-admin), §7.6 (onboarding txn) | P0-1, P0-2, P0-3 | **Core rewrite of the tenancy mechanism:** `set_config(...,true)` in a per-unit-of-work transaction; missing-safe RLS policy; extension scopes ALL operations (writes+aggregates), deny-by-default; super-admin via separate `BYPASSRLS` role; onboarding as one transaction. |
| 5 | **08-DATABASE-DESIGN.md** | `subscriptions`, `instagram_accounts`, (Option B only) `leads`/`contacts`; §8.6 | P0-5, P0-6, P0-7 | Add `subscriptions` ordering/reconciliation columns; adjust `instagram_accounts` token fields to validated Meta flow; (Option B) add `emailHash`/`phoneHash`; clarify audit/activity participate in unit-of-work. |
| 6 | **09-PRISMA-SCHEMA.md** | models mirroring doc 08 | P0-5, P0-6, P0-7 | Apply the same field changes (subscriptions, instagram_accounts; optional hash fields) to the Prisma schema. |
| 7 | **10-API-DESIGN.md** | §10.7 (Auth + Webhooks) | P0-4, P0-5 | Canonicalize the Instagram webhook path; document refresh-cookie + CSRF-header contract; reflect any OAuth connect/callback shape changes. |
| 8 | **14-INSTAGRAM-INTEGRATION.md** | §14.2, §14.3, §14.5, §14.6, §14.10 | P0-5 | Major revision to the spike-validated current Meta flow: OAuth, scopes, token type/lifetime (resolve Page-token vs refresh-cron), messaging window, webhook fields; pin Graph API version; adapter abstraction. |
| 9 | **16-BILLING-ARCHITECTURE.md** | §16.4, §16.5, §16.7, §16.11 + new reconciliation subsection | P0-6 | Ordered/idempotent webhook application; nightly Stripe reconciliation; `effectiveAccessLevel` derivation with fail-open-on-ambiguity. |
| 10 | **18-OBSERVABILITY.md** | §18.3 (Metrics/Alerts) | P0-6 | Add billing-mirror-drift metric + alert. |
| 11 | **19-SECURITY.md** | §19.1 (cookie/SameSite/CSRF), §19.3 + §19.9 A02 (encryption scope), §19.7 (CORS origins) | P0-4, P0-7 | Same-site cookie + CSRF on refresh; correct encryption scope to tokens-only/PII-at-rest; reconcile CORS to final domains. |
| 12 | **20-PRODUCTION-READINESS.md** | §20.1 (Multi-Tenancy, Instagram, Billing), §20.2 (Data Security) | P0-1, P0-2, P0-5, P0-6, P0-7 | Add launch-gate checks: RLS denies on unset GUC; isolation covers writes/aggregates; integration validated vs current Graph API; ordered webhooks + reconciliation + "missed webhook doesn't lock a paying org"; corrected encryption posture. |
| 13 | **docs/SETUP.md** (root) | §2 (domains/env), §4 (IG webhook) | P0-4, P0-5 | Replace `*.up.railway.app` with custom same-site domains; canonical Instagram webhook path; env for shared-domain cookies. |

**Documents with no required P0 change:** 01, 02, 03, 11, 12, 13, 15, 17, 21 (these carry P1/P2 items tracked elsewhere, but nothing launch-blocking). The root `docs/ARCHITECTURE.md`, `API.md`, `DATABASE.md`, `ENV.md`, `BLUEPRINT.md` should be re-checked for the same contradictions (webhook path, encryption claim, domains) and aligned, but the authoritative changes live in the numbered blueprint files above.

**Recommended order of blueprint edits:** 07 → 05 → 19 → 04 (tenancy + auth + encryption: unblock Sprints 2–4) → 14 → 10 → 08/09 (Instagram: unblock Sprint 6) → 16 → 18 (billing: unblock Sprint 8) → 20 → SETUP.md (continuously). No module implementation should start until its corresponding blueprint sections above are updated.
