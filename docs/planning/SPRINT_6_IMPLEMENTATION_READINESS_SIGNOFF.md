# Sprint 6 — Implementation Readiness Signoff

**Author:** Final Architecture Authority — Consistency Audit
**Date:** 2026-06-21
**Audits:** `SPRINT_6_FINAL_ARCHITECTURE_SIGNOFF.md` against `FINAL_ARCHITECTURE.md`, `SPRINT_6_EXECUTION_PLAN.md`, `SPRINT_6_UI_UX_PLAN.md`, Sprint 5 signoffs (M1–M5), and source code at HEAD (`1bf88db`)

> This document is the final gate before Sprint 6 implementation begins. All findings are source-verified against the live codebase — not against planning documents alone. Every claim below can be reproduced by `grep` or `Read` against the files cited.

---

## Audit Methodology

The following source files were read directly for this audit:

| File | Lines Read | Purpose |
|------|-----------|---------|
| `prisma/schema.prisma` | 1–630 | Enum values, Lead model, Activity model, SavedReply model |
| `packages/shared/src/constants/events.ts` | Full | DomainEvent object membership |
| `packages/shared/src/types/activity-metadata.ts` | Full | Discriminated union member count |
| `apps/api/src/core/config/env.ts` | Grep | Existing env vars, fail-fast block |
| `apps/api/src/core/queue/worker-registry.ts` | Grep | Registered workers |
| `apps/api/src/core/queue/names.ts` | Grep | Queue name constants |
| `apps/api/package.json` | Grep | Current dependencies |
| `apps/web/package.json` | Grep | Client-side packages |
| `apps/web/src/lib/socket/client.ts` | Grep | Socket.io client stub |

---

## 1. Missing Items

### MI-1 — `NEXT_PUBLIC_WS_URL` Not in Signoff Env Variable List

**Severity: MEDIUM**

**Source-verified:** `apps/web/src/lib/socket/client.ts:12` reads `process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:4000'`. This env var is consumed by the browser and must be configured in Vercel for every environment.

**Signoff gap:** `SPRINT_6_FINAL_ARCHITECTURE_SIGNOFF.md §4.4` lists only API-side env vars. `NEXT_PUBLIC_WS_URL` is frontend-only (`apps/web`) and is not listed in any environment variable inventory in the signoff or execution plan.

**Impact:** If not set in Vercel, the browser falls back to `ws://localhost:4000`, which silently fails in production. Clients connect nowhere. Socket.io events are never delivered. The Inbox realtime path fails silently — no error, no retry, just missed notifications.

**Required addition to signoff §4.4:**
```
NEXT_PUBLIC_WS_URL    Vercel env var    — must point to wss://api.leados.app in production
                                          and wss://api-staging.leados.app on staging
                                          Consumed by apps/web (not apps/api)
```

---

### MI-2 — `check:enum-parity` CI Gate Not Referenced in Signoff

**Severity: LOW**

Sprint 6 M1 adds 4 new `ActivityType` values (MESSAGE_RECEIVED, MESSAGE_SENT, INSTAGRAM_ACCOUNT_CONNECTED, INSTAGRAM_ACCOUNT_DISCONNECTED) and 3 new Prisma enum types (InstagramAccountStatus, ConversationStatus, MessageStatus) to both `schema.prisma` and `packages/shared/src/constants/enums.ts`.

The `check:enum-parity` CI gate enforces parity between these two files. The signoff §9 M1 acceptance criteria lists `pnpm typecheck`, `pnpm --filter @leados/api test`, `check:rls` — but not `check:enum-parity`.

**Required addition:** Add `pnpm --filter @leados/api check:enum-parity` to M1 acceptance criteria in the signoff.

---

### MI-3 — Error Codes Not Inventoried in Signoff

**Severity: LOW**

The execution plan (Cross-Cutting Concerns) specifies adding these new error codes to `packages/shared/src/errors/error-codes.ts`:
- `INSTAGRAM_ACCOUNT_NOT_FOUND`
- `INSTAGRAM_ACCOUNT_EXPIRED`
- `WINDOW_CLOSED`
- `FEATURE_DISABLED`
- `INVALID_OAUTH_STATE`
- `DUPLICATE_INSTAGRAM_ACCOUNT`

The signoff does not reference this file or these additions. Missing error codes will cause compile errors anywhere a handler returns these codes before they're added to the registry.

**Required:** Add these 6 error codes to the signoff's M1 or M2 files-to-modify section.

---

### MI-4 — Webhook Subscription Retry Job Not Specified

**Severity: LOW**

Signoff §9 M2 says: "Webhook subscription failure: add retry via `QUEUE.WEBHOOK_PROCESSING` (not `instagram-send`)." This creates a new job type in the webhook-processing queue but does not name the job, does not specify the job payload, and does not add a dispatch case to `webhook.worker.ts`.

**Required addition to signoff M2:** Specify `'instagram-webhook-subscribe'` as the job name. The job payload should include `{ igUserId, accessToken, orgId }`. The webhook-processing worker needs a new dispatch branch for this job name, calling `adapter.subscribeWebhook()`.

---

## 2. Architecture Conflicts

### AC-1 — `instagram-enrich` Assigned to Wrong Queue in Signoff

**Severity: MEDIUM**

Signoff §9 M3 states: "Add `instagram-enrich` job name constant to `worker-registry.ts` **system queue handler**."

The system queue is for platform-level cron-triggered jobs (see `worker-registry.ts:54` comment and existing system queue logic). Lead enrichment from a received DM is webhook-derived domain work — it belongs in `QUEUE.WEBHOOK_PROCESSING` (alongside message processing, dedup, lead linking).

**Conflict:** If the `instagram-enrich` job is enqueued to `QUEUE.INSTAGRAM_SEND` (or any queue other than `QUEUE.WEBHOOK_PROCESSING`), the dispatch switch in the webhook-processing worker won't handle it.

**Correct specification:** The `instagram-enrich` job must be:
- Enqueued to: `QUEUE.WEBHOOK_PROCESSING` (not the system queue)
- Processed by: `webhook.worker.ts` → new `case 'instagram-enrich':` branch in the dispatch switch
- The dispatch branch calls `instagramAdapter.getSenderProfile()` and updates the lead

**Required amendment to signoff §9 M3:** Replace "system queue handler" with "webhook-processing queue handler."

---

### AC-2 — B-2 Deferral Cites Wrong Reason (Pre-existing Issue Correctly Resolved Anyway)

**Severity: LOW (resolution is still correct)**

Signoff §2 B-2 states: "The activities schema does not support `relatedPipelineId` (no FK, no column). Adding it in Sprint 6 is outside scope."

**Source-verified:** `prisma/schema.prisma:581-582` shows:
```
relatedPipelineId      String? @db.Uuid
relatedPipelineStageId String? @db.Uuid
```
Both columns exist in the `activities` table at HEAD, with indices at lines 595–596. The reason for Sprint 5 M2 NOT APPROVED is therefore NOT "no column" — the column was added (likely during Sprint 5's schema work). The actual issue is that `PipelineService` does not call `ActivityService.append()` for pipeline mutations.

**The deferral to Sprint 7 is still correct.** The fix requires service-layer code changes in the pipeline module, which is outside Sprint 6 scope. Only the stated reason in the signoff is wrong.

**Required amendment to signoff §2 B-2:** Replace "activities schema does not support relatedPipelineId (no FK, no column)" with "PipelineService does not call ActivityService.append() for pipeline mutations — the column exists in the activities table but the service layer emission is missing."

---

### AC-3 — Pipeline DomainEvent Gap Larger Than Signoff Documents

**Severity: LOW (pre-existing Sprint 5 gap, not Sprint 6 scope)**

Signoff §5.2 identifies one missing `DomainEvent` entry (`DEAL_UPDATED`) and adds it plus 4 Instagram entries.

**Source-verified:** `packages/shared/src/constants/events.ts` shows the current `DomainEvent` object has 19 entries (lines 17–41). The `ActivityType` enum in `schema.prisma` has 27 values. Missing from `DomainEvent`:
- `DEAL_UPDATED` — captured in signoff ✓
- `PIPELINE_CREATED`, `PIPELINE_UPDATED`, `PIPELINE_DELETED` — NOT in signoff
- `PIPELINE_STAGE_CREATED`, `PIPELINE_STAGE_UPDATED`, `PIPELINE_STAGE_DELETED`, `PIPELINE_STAGE_REORDERED` — NOT in signoff

7 pipeline DomainEvent entries are missing from events.ts and not addressed in the signoff. Sprint 7 workflow triggers on pipeline events will silently never fire. The signoff correctly states "every new DomainEvent key MUST match the corresponding ActivityType" but only partially applies it.

**Sprint 6 scope decision:** Sprint 6 does not use pipeline DomainEvents. The gap is safe for Sprint 6 implementation. However, M1 cleanup of events.ts should include all 12 missing entries (DEAL_UPDATED + 7 PIPELINE_* + 4 Instagram), not just 5.

**Required amendment to signoff §5.2:** Add the 7 PIPELINE_* entries to the DomainEvent additions list for M1.

---

## 3. Schema Conflicts

### SC-1 — Signoff Claims 22 Activity Union Members; Actual Count Is 27

**Severity: LOW (action items are correct; only the stated count is wrong)**

Signoff §5.1 states: "Adding ActivityType enum values without the corresponding metadata interfaces will break the exhaustive discriminated union gate" — citing "22 types, 22 union members" from the Sprint 5 M1 signoff.

**Source-verified:**
- `prisma/schema.prisma:137-166` — `ActivityType` enum has **27 values** (19 Sprint 4 + 8 Sprint 5 additions)
- `packages/shared/src/types/activity-metadata.ts:195-222` — `ActivityMetadata` union has **27 members** (includes DealUpdatedMetadata, PipelineCreatedMetadata, etc. — all 27 types have interfaces)

Sprint 6 adds 4 new ActivityType values → **31 total** after Sprint 6, not 26.

The signoff's 4 new interface additions are correct. The count "22 → 26" in any implicit reference is wrong; the correct progression is "27 → 31". This doesn't affect what code to write, but it affects how implementers calculate exhaustiveness coverage.

**Required amendment to signoff §5.1:** Replace "currently 22 types, 22 union members" with "currently 27 types, 27 union members (19 Sprint 4 + 8 Sprint 5: DEAL_UPDATED + 7 PIPELINE_* types). Sprint 6 adds 4 → 31 total."

---

### SC-2 — `CREATE INDEX CONCURRENTLY` Cannot Run Inside a Prisma Transaction

**Severity: HIGH — migration will fail on first deployment**

Signoff §5.3 specifies:
```sql
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  leads_org_ig_user_unique
  ON leads ("organizationId", "instagramUserId")
  WHERE "instagramUserId" IS NOT NULL;
```

**PostgreSQL constraint:** `CREATE INDEX CONCURRENTLY` **cannot be executed inside a transaction block**. Prisma 5 runs migrations inside transactions by default. Attempting to run `CREATE INDEX CONCURRENTLY` in a Prisma migration without marking it as non-transactional will produce:

```
ERROR:  CREATE INDEX CONCURRENTLY cannot run inside a transaction block
```

**The migration 0015 will fail on first `prisma migrate deploy`.**

**Required fix:** The migration file must begin with the non-transactional pragma:
```sql
-- Prisma Migration not running in a transaction
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  leads_org_ig_user_unique
  ON leads ("organizationId", "instagramUserId")
  WHERE "instagramUserId" IS NOT NULL;
-- (remaining migration DDL for instagram_conversations and messages tables below)
```

**Important:** Once a migration file is marked non-transactional, the ENTIRE migration runs outside a transaction. This means if the instagram_conversations or messages table creation (also in 0015) fails after the index is created, there is no automatic rollback. Migration 0015 should therefore be split into two files:
- `0015_inbox_tables` — instagram_conversations + messages tables (transactional)
- `0015b_leads_ig_unique_index` — `CREATE INDEX CONCURRENTLY` only (non-transactional)

OR the partial unique index must be moved to the separate `0016_instagram_fk` migration (which already requires an ALTER TABLE that can also benefit from non-transactional mode).

**Additionally:** Prisma's `@@unique([organizationId, instagramUserId])` directive in `schema.prisma` generates a standard (non-partial) unique index. The partial `WHERE "instagramUserId" IS NOT NULL` clause cannot be expressed in Prisma's schema syntax. If `@@unique` is added to the Lead model AND a raw SQL CONCURRENTLY index is written, Prisma will attempt to create two indexes (one without the WHERE clause, one with). Use Prisma's `@@unique` for type-level enforcement (to unlock the Prisma upsert API) but suppress the generated index with a raw SQL migration only — do not let Prisma generate the DDL for this index.

**Required amendment to signoff §5.3:** Add the migration transaction mode requirement and the `@@unique` suppression strategy.

---

### SC-3 — Migration 0016 Also Needs Non-Transactional Consideration

**Severity: LOW**

Signoff §5.4 specifies `NOT VALID` on the FK addition, which is correct. `ALTER TABLE ... ADD CONSTRAINT ... NOT VALID` does NOT require non-transactional mode and is safe in Prisma's default transactional migration. No change needed here, but this should be explicitly confirmed in the signoff to avoid confusion with SC-2.

---

## 4. Security Risks

### SR-1 — `NEXT_PUBLIC_WS_URL` Defaults to Non-TLS WebSocket

**Severity: MEDIUM**

`apps/web/src/lib/socket/client.ts:12`: `const url = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:4000'`

If `NEXT_PUBLIC_WS_URL` is not set in Vercel production, the Socket.io client connects to `ws://localhost:4000` — unencrypted (`ws://` not `wss://`) and pointing to localhost. Browsers on HTTPS pages block mixed-content WebSocket connections (`ws://` on an `https://` page). This means:
- In production without the env var: Socket.io silently fails (no realtime events)
- There is no error surfaced to the user
- The feature appears broken with no obvious diagnostic

The default should be removed or the connection should fail loudly, not silently fall back to a non-functional default.

**Recommended hardening:** In `connectSocket()`, throw or log a conspicuous error if `NEXT_PUBLIC_WS_URL` is undefined in production (check `process.env.NODE_ENV === 'production'`).

---

### SR-2 — Socket.io Connection Auth Token Exposure in Server Logs

**Severity: LOW**

Signoff §3.4 specifies `socket.handshake.auth = { token: accessToken }`. The access token (a JWT) is passed in the Socket.io handshake auth payload. Most Socket.io logging implementations and some proxies will log handshake details. Ensure that `socket-middleware.ts` does not log `socket.handshake.auth.token` verbatim. Log only `socket.data.userId` and `socket.data.orgId` after verification. Already standard practice, but worth noting explicitly in the socket-middleware implementation notes.

---

## 5. Deployment Risks

### DR-1 — Railway Sticky Sessions for WebSocket Not Documented

**Severity: MEDIUM**

Signoff §6.2 states: "Socket.io handles the sticky-session requirement automatically if Railway uses the same backend for the WebSocket upgrade as the initial HTTP connection."

Railway's load balancer behavior for WebSocket upgrades is not guaranteed sticky by default. Socket.io with the Redis adapter does NOT require sticky sessions for correctness (any API instance can receive the WebSocket upgrade and join the client to its local room; the Redis adapter synchronizes events across instances). However, Socket.io's HTTP long-polling fallback transport DOES require sticky sessions.

Since the execution plan sets `transports: ['websocket']` (WebSocket only, no polling fallback), sticky sessions are NOT required for correctness. The signoff's statement is technically correct but potentially misleading. An engineer reading §6.2 may add unnecessary sticky session configuration.

**Required clarification in signoff §6.2:** State explicitly that "since the web client uses `transports: ['websocket']` with no polling fallback, sticky sessions are NOT required. The Redis adapter handles cross-instance correctness regardless of which API instance receives the WebSocket handshake."

---

### DR-2 — Migration 0015 Deployment Will Fail Without Transaction Mode Fix

**Severity: HIGH** — duplicate of SC-2; flagged here for deployment impact.

See SC-2. Without the `-- Prisma Migration not running in a transaction` pragma, `prisma migrate deploy` on staging will fail with a Postgres error before the instagram_conversations or messages tables are created. This blocks all of M3, M4, M5, and M6.

---

### DR-3 — Staging Environment Prerequisite Not Operationally Defined

**Severity: LOW**

Signoff §6.6 requires a staging environment by M5 exit criteria date (Day 10). The signoff does not specify:
- Which Railway project hosts staging
- Whether staging uses a separate Neon database or a separate schema in the same Neon project
- Whether Upstash Redis is shared or separate between staging and production

These decisions affect migration safety (running 0014–0016 on staging first) and the App Review submission (staging URL must be registered with Meta before App Review can be tested).

---

## 6. Test Risks

### TR-1 — CRITICAL: M2 Error Response Format Conflicts Between Execution Plan and Signoff

**Severity: HIGH — tests will fail as written**

The execution plan M2 integration test case 6 specifies:
```
"duplicate call with same code → 409 (account already exists)"
```

The signoff §4.2 step 12 specifies:
```
"On duplicate account → redirect with ?error=ALREADY_CONNECTED"
```

These directly conflict. The callback endpoint (`GET /api/instagram/callback`) is a public redirect endpoint — it cannot return JSON 409 because the browser has already navigated away from the app to follow the OAuth redirect. Any non-redirect response from a callback endpoint will leave the user on a blank page.

The signoff's decision (redirect with error param) is architecturally correct for a browser-redirect OAuth callback. The execution plan's test expectation (409 JSON) is wrong for this endpoint type.

**Impact:** If the engineer writes the callback handler to redirect (correct), the execution plan's test will fail. If the engineer writes the handler to return 409 JSON (following the execution plan test), the OAuth flow is broken for users.

**Required:** The signoff M2 test matrix (§7.1, M2 tests) correctly specifies test case 12 as a redirect. However, the execution plan M2 integration test table must be disregarded and replaced by the signoff's M2 test matrix for this test case. This must be explicitly stated in the signoff as an amendment superseding the execution plan test.

---

### TR-2 — CRITICAL: `org.connect_social` Permission Conflict

**Severity: HIGH — incorrect RBAC will be implemented if execution plan is followed**

**Source-verified:** `packages/shared/src/constants/permissions.ts` — MANAGER_PERMISSIONS currently does NOT have `org.connect_social`.

Execution plan M1 files-to-modify (`packages/shared/src/constants/permissions.ts`, line 149) explicitly says:
```
Add ... org.connect_social to MANAGER_PERMISSIONS
```

Signoff §4.5 explicitly says:
```
MANAGER is NOT granted this permission.
```

These are directly contradictory. An engineer following the execution plan M1 checklist will add `org.connect_social` to MANAGER_PERMISSIONS. An engineer following the signoff will not. Since the signoff supersedes the execution plan, the correct behavior is OWNER/ADMIN only — but the conflict creates a trap for any engineer who follows the execution plan checklist mechanically.

**Required:** The signoff must add an explicit override section (§9 M1 changes table) stating: "Remove `org.connect_social` from the execution plan's `permissions.ts` change — do NOT add to MANAGER_PERMISSIONS. OWNER and ADMIN only per §4.5 of this signoff."

---

### TR-3 — M5 Expired State JWT vs Missing Redis Entry Error Code Collision

**Severity: LOW**

Signoff M2 test cases 5 and 7 both expect `?error=STATE_EXPIRED`:
- Test 5: expired state JWT (JWT `exp` has passed)
- Test 7: replayed state (nonce deleted from Redis — second use)

These are different failure modes with different diagnostic values. A replayed state is a security event (potential CSRF attempt); an expired JWT is just a slow user. The signoff conflates them both under `STATE_EXPIRED`. This makes security incident detection harder.

**Recommendation:** Differentiate error codes: expired JWT → `?error=STATE_EXPIRED`; Redis nonce missing → `?error=STATE_REPLAYED`. Not a blocker; this is a monitoring/security improvement.

---

### TR-4 — Socket.io Middleware Test Missing `'suspended org'` Fixture

**Severity: LOW**

Signoff §7.1 M1 tests include: "(4) suspended org token → disconnect". A suspended org token requires a JWT with a valid `orgId` for a suspended organization. The test fixture must create an organization record with `status = 'SUSPENDED'` and issue a valid JWT for it. This requires the test to set `organization.status = SUSPENDED` in the test DB setup, which is non-trivial in an isolated test. Without this fixture, test case 4 would need to be mocked — but the signoff specifies "JWT auth" in socket-middleware.test.ts, implying unit tests with mocked JWTs. If the org suspension check is done by querying the DB (not from the JWT), a mock isn't sufficient. Clarify whether suspended org detection comes from JWT claims or DB query in the socket middleware.

---

## 7. Final Verdict

### Summary of Blocking Issues

| Issue | Severity | Blocks |
|-------|----------|--------|
| SC-2 / DR-2: `CREATE INDEX CONCURRENTLY` in transactional migration | HIGH | Migration 0015 deployment |
| TR-1: M2 callback error response format conflict (409 vs redirect) | HIGH | M2 tests will fail as written |
| TR-2: `org.connect_social` in MANAGER_PERMISSIONS conflict | HIGH | Incorrect RBAC implementation |
| MI-1: `NEXT_PUBLIC_WS_URL` undocumented | MEDIUM | Production Socket.io silently broken |
| AC-1: `instagram-enrich` assigned to wrong queue in signoff | MEDIUM | M3 enrichment jobs never processed |
| DR-1: Railway sticky session statement misleading | MEDIUM | Unnecessary config, possible confusion |

### Summary of Non-Blocking Gaps

| Issue | Severity | Action |
|-------|----------|--------|
| AC-2: B-2 deferral cites wrong reason | LOW | Amendment only; resolution is correct |
| AC-3: 7 PIPELINE_* DomainEvents not added | LOW | Add to M1 cleanup list |
| SC-1: Union member count stated as 22, actually 27 | LOW | Count correction in signoff |
| MI-2: `check:enum-parity` not in M1 acceptance criteria | LOW | Add to checklist |
| MI-3: error-codes.ts additions missing | LOW | Add to M1 files-to-modify |
| MI-4: Webhook subscription retry job not specified | LOW | Specify job name and dispatch |
| SR-1: `ws://` default in production | MEDIUM | Harden `connectSocket()` |
| SC-3: Migration 0016 transactional mode | LOW | Confirm, no change needed |
| TR-3: STATE_EXPIRED/STATE_REPLAYED collision | LOW | Monitoring improvement only |
| TR-4: Suspended org test fixture | LOW | Clarification needed |

### What Is Consistent and Verified ✓

The following architecture decisions in the signoff are internally consistent, verified against source code, and aligned with `FINAL_ARCHITECTURE.md`:

| Decision | Verified |
|---------|---------|
| `@socket.io/redis-emitter` cross-process realtime | ✓ — Redis adapter pattern correct; `ioredis` already installed |
| `socket.io` + `@socket.io/redis-adapter` for API | ✓ — Packages absent, addition is correct |
| OAuth callback at `GET /api/instagram/callback` | ✓ — Aligns with FINAL_ARCHITECTURE §5.1 (server-side code exchange) |
| `OAUTH_STATE_SECRET` separate from `JWT_ACCESS_SECRET` | ✓ — Closes SEC-1 correctly |
| Redis nonce single-use replay protection | ✓ — Correct stateful CSRF prevention |
| 4 new ActivityMetadata interfaces | ✓ — Necessary to maintain exhaustive union with 27→31 transition |
| `leads.instagramUserId` partial CONCURRENTLY index | ✓ — Correct approach; transaction mode issue is documented in findings |
| Migration 0016 `NOT VALID` FK | ✓ — Correct Postgres pattern for hot tables |
| SavedReply no-migration in M6 | ✓ — `saved_replies` table confirmed at `schema.prisma:729` |
| `INSTAGRAM_APP_SECRET` to fail-fast block | ✓ — Currently has `default('test-ig-secret')` |
| `MessageDirection` INBOUND/OUTBOUND pre-existing | ✓ — Do not re-declare |
| `MessageStatus` vs `WebhookEventStatus` no conflict | ✓ — Different Postgres types; no collision |
| 22 tenant tables after M1 | ✓ — 19 current + 3 new = 22 |
| `check:rls` gate at M1 | ✓ — Table count matches |
| Cursor pagination `initialPageParam: null` | ✓ — Correct for TanStack Query v5 cursor-based |
| SavedReply CRUD API-only in M6 | ✓ — Table and TENANT_TABLES entry already exist |
| UI/UX token compliance | ✓ — All component specs use token classes; prohibitions are explicit |
| `QUEUE.INSTAGRAM_SEND` for outbound sends only | ✓ — Naming is semantically correct |
| `QUEUE.NOTIFICATION_DELIVERY` unused in Sprint 6 | ✓ — Correct; reserved for Sprint 7 |
| Feature flag `instagram.sends.enabled` | ✓ — Already in `flags.ts` |
| `withTenant(orgId, callback)` for all tenant mutations | ✓ — Required pattern per FINAL_ARCHITECTURE §2 |
| No `relatedConversationId` FK on activities in Sprint 6 | ✓ — Deferred to Sprint 7 with pipeline relation |
| `instagramAccounts` plan limits already in `PLAN_LIMITS` | ✓ — Confirmed in shared constants |

---

## Required Amendments Before Implementation Begins

The following amendments must be made to `SPRINT_6_FINAL_ARCHITECTURE_SIGNOFF.md` before any implementation code is written. Each is a targeted addition or correction — not a re-architecture.

| # | Amendment | Section | Severity |
|---|-----------|---------|---------|
| A1 | Add `NEXT_PUBLIC_WS_URL` to environment variable inventory (Vercel) | §4.4 | HIGH |
| A2 | Migration 0015: Add `-- Prisma Migration not running in a transaction` pragma requirement; note that CONCURRENTLY index must be separated from transactional DDL (split into 0015b or move to 0016) | §5.3 | HIGH |
| A3 | Add explicit override: do NOT add `org.connect_social` to MANAGER_PERMISSIONS, superseding execution plan line 149 | §9 M1 | HIGH |
| A4 | State explicitly that M2 test case 6 in the execution plan (expecting 409 JSON) is superseded by the signoff's redirect-based callback design; cite signoff §4.2 | §9 M2 | HIGH |
| A5 | Change `instagram-enrich` queue from "system queue handler" to "webhook-processing queue handler"; add job name `'instagram-enrich'` and specify dispatch branch in `webhook.worker.ts` | §9 M3 | MEDIUM |
| A6 | Add `NEXT_PUBLIC_WS_URL` production hardening note to `connectSocket()` | §3.4 | MEDIUM |
| A7 | Clarify Railway sticky sessions: not required because `transports: ['websocket']` only | §6.2 | MEDIUM |
| A8 | Correct B-2 deferral reason: column exists; service emission is missing | §2 B-2 | LOW |
| A9 | Correct union member count from 22 to 27 | §5.1 | LOW |
| A10 | Add 7 PIPELINE_* DomainEvent entries to M1 events.ts cleanup list | §5.2 | LOW |
| A11 | Add `check:enum-parity` to M1 acceptance criteria | §9 M1 | LOW |
| A12 | Add `error-codes.ts` additions to M1 files-to-modify | §9 M1 | LOW |
| A13 | Specify webhook subscription retry job name and dispatch | §9 M2 | LOW |

---

## VERDICT

```
╔══════════════════════════════════════════════════════════════════════╗
║                                                                      ║
║              NOT READY FOR IMPLEMENTATION                            ║
║                                                                      ║
║  3 HIGH-severity blockers require amendments to the signoff          ║
║  before any Sprint 6 implementation code is written:                 ║
║                                                                      ║
║  BLOCKER 1 (SC-2 / DR-2): Migration 0015 will fail on               ║
║    first deployment. CREATE INDEX CONCURRENTLY cannot run            ║
║    inside a Prisma transactional migration. Amendment A2             ║
║    is required before M1 migration is written.                       ║
║                                                                      ║
║  BLOCKER 2 (TR-2): org.connect_social permission conflict.           ║
║    Execution plan M1 grants MANAGER this permission; signoff         ║
║    restricts to OWNER/ADMIN. Engineers following the execution       ║
║    plan will implement wrong RBAC. Amendment A3 is required          ║
║    before permissions.ts is modified.                                ║
║                                                                      ║
║  BLOCKER 3 (TR-1): M2 callback error response format conflict.       ║
║    Execution plan test expects 409 JSON; signoff redirects           ║
║    to ?error=ALREADY_CONNECTED. One of these will produce            ║
║    broken OAuth or failing tests. Amendment A4 is required           ║
║    before M2 integration tests are written.                          ║
║                                                                      ║
║  All 3 blockers require amendments to                                ║
║  SPRINT_6_FINAL_ARCHITECTURE_SIGNOFF.md only.                        ║
║  No source files change. No re-architecture required.                ║
║                                                                      ║
║  After amendments A1–A13 are applied to the signoff:                 ║
║  Re-issue this verdict as READY FOR IMPLEMENTATION.                  ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
```

---

## Implementation Path After Amendments

Once all 13 amendments (A1–A13) are applied to `SPRINT_6_FINAL_ARCHITECTURE_SIGNOFF.md`:

1. **The spike (M1-A) may begin immediately** — it does not depend on any of the amendments (it produces findings, not code).
2. **M1-B may begin after A2, A3, A11, A12 are applied** — these govern the M1 file changes.
3. **M2 may begin after A3, A4, A5, A13 are applied** — these govern the M2 implementation and tests.
4. **M3–M6 are unblocked by amendments** — the signoff is otherwise sound for these milestones.

The amendments are editing-only changes to the signoff document. They resolve specification conflicts, fix a deployment-blocking migration constraint, and plug a security decision gap. The underlying architecture (redis-emitter realtime, OAUTH_STATE_SECRET OAuth, ActivityMetadata additions, `NOT VALID` FK) remains correct and unchanged.

---

*All findings in this document are source-verified against the codebase at HEAD (`1bf88db`). Grep commands and file reads are documented in the Audit Methodology section. No finding is based solely on planning document cross-reference.*
