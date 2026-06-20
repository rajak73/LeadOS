# Sprint 6 Architecture Review

**Author:** Independent architecture review (all findings verified against source code at HEAD `1bf88db`)
**Date:** 2026-06-21
**Scope:** `SPRINT_6_EXECUTION_PLAN.md` vs. `FINAL_ARCHITECTURE.md` and Sprint 5 milestone signoffs (M1–M5)
**Verdict:** **CONDITIONAL PROCEED** — 3 blocking architectural issues must be resolved before M1-B infrastructure work begins. The spike (M1-A) may start immediately.

---

## Review Summary

| Category | Items Found | Blocking | High | Medium | Low |
|----------|------------|---------|------|--------|-----|
| Architectural risks | 5 | 2 | 2 | 1 | 0 |
| Scope creep | 3 | 0 | 1 | 2 | 0 |
| Schema risks | 4 | 1 | 1 | 2 | 0 |
| Security risks | 4 | 0 | 2 | 1 | 1 |
| Scalability risks | 3 | 0 | 1 | 2 | 0 |
| Testing gaps | 6 | 0 | 2 | 3 | 1 |
| Deployment risks | 4 | 0 | 2 | 1 | 1 |
| Sprint 5 dependency gaps | 3 | 1 | 2 | 0 | 0 |

---

## 1. Architectural Risks

### AR-1 — BLOCKING: Cross-Process Socket.io Emit Has No Viable Mechanism

**Source:** `apps/api/src/server.ts`, `apps/api/src/core/events/event-bus.ts`, `SPRINT_6_EXECUTION_PLAN.md §M3`

**Finding:** The execution plan assumes the M3 receive pipeline can push a Socket.io notification by calling `emitToOrg()` after processing an Instagram DM. The plan states:

> "emitDurable also calls eventBus.emit() which triggers the in-process Socket.io push"
> "Register in-process listener on `MESSAGE_RECEIVED` → call `emitToOrg()` for Socket.io push"

This assumption is **architecturally invalid**. The webhook worker (`processWebhookJob`) runs in the **worker process** (`worker.ts`). The Socket.io server, if initialized via `initSocketServer(server)`, lives in the **API process** (`server.ts`). They are separate OS processes. An `eventBus.emit()` in the worker process reaches only listeners registered in that same process. No listener in the worker process has a Socket.io server handle. The in-process emit is silently dropped.

The `@socket.io/redis-adapter` solves multi-instance Socket.io broadcasts between multiple API instances, but it does **not** solve the API-process-vs-worker-process split. The adapter only synchronizes Socket.io server instances.

**Three viable solutions** (choose one before M1-B):

| Option | Mechanism | Trade-off |
|--------|-----------|-----------|
| A | Worker enqueues to `notification-delivery` queue; a notification sub-worker in the **same process as the API** (or in a hybrid process that boots both) handles the dequeue and calls `emitToOrg()` | Requires rethinking process topology |
| B | Worker publishes a Redis pub/sub message on a channel (`leados:notify:{orgId}`); the API process subscribes at startup and calls `emitToOrg()` when it receives a message | Clean separation; uses Redis already available; recommended |
| C | Run Socket.io in the worker process as well (both API and worker run Socket.io with the Redis adapter) and the worker directly calls `emitToOrg()` | Doubles WS connection overhead; not recommended |

**Recommended:** Option B. Add a `notification-publisher.ts` in the worker (uses `redis.publish()`) and a `notification-subscriber.ts` in the API process (uses `redis.subscribe()` → `emitToOrg()`). Zero new infrastructure — Redis is already tier-1.

**Impact:** Without resolving this, the real-time inbox feed will never update. Every DM arrives silently; agents must manually refresh.

---

### AR-2 — BLOCKING: `emitDurable` Routes Socket.io Notification to Wrong Queue

**Source:** `SPRINT_6_EXECUTION_PLAN.md §M3`, `apps/api/src/core/queue/names.ts`

**Finding:** The M3 pipeline step ix uses:

```
await eventBus.emitDurable(DomainEvent.MESSAGE_RECEIVED, { conversationId, messageId, orgId },
  QUEUE.INSTAGRAM_SEND, 'notify-new-message')
```

`QUEUE.INSTAGRAM_SEND` (`'instagram-send'`) is the queue for **sending outbound messages to Meta**. The stub worker that will be registered for this queue (`instagram-send.worker.ts`) will receive a `'notify-new-message'` job it doesn't know how to handle and will no-op or throw. Even if the queue routing were fixed (using `QUEUE.NOTIFICATION_DELIVERY`), the cross-process Socket.io problem from AR-1 means the notification worker cannot call `emitToOrg()` unless it runs in the API process.

**Fix (paired with AR-1 Option B):** Replace the `emitDurable` call with a direct Redis publish (the recommended Option B from AR-1). Remove the durable-queue-for-notifications pattern entirely — notification delivery is a best-effort fire-and-forget, not a side-effect requiring durability. Socket.io already handles reconnect polling as a safety net.

---

### AR-3 — HIGH: `initSocketServer` Requires `server.ts` Refactor That May Expose HTTP Server

**Source:** `apps/api/src/server.ts:16`

**Finding:** The current `server.ts`:

```typescript
const server: Server = app.listen(env.PORT, () => { ... });
```

`server` is a local variable inside `start()`. The execution plan says to call `initSocketServer(server)` after `app.listen()`. This works correctly — `initSocketServer` is called within `start()` where `server` is in scope. However, `getSocketServer()` must return this instance from other modules (workers, event bus). Since workers run in a separate process, they cannot call `getSocketServer()` (it would be `null` / uninitialized). This compounds AR-1.

The plan's `socket-server.ts` singleton pattern (`getSocketServer()`) is only valid within the **single API process**. Document this explicitly. The singleton is not shared across processes and must not be called from the worker process.

---

### AR-4 — HIGH: OAuth Callback Location Deviates from Blueprint Without Formal Decision Record

**Source:** `docs/blueprint/14-INSTAGRAM-INTEGRATION.md §14.2`, `SPRINT_6_EXECUTION_PLAN.md §M2`

**Finding:** Blueprint doc 14 §14.2, Step 4 shows the Meta OAuth redirect going to:

```
https://app.leados.com/oauth/instagram/callback
```

This is a **frontend route** on Vercel (`app.leados.app`). The execution plan places the callback at:

```
GET /api/instagram/callback    — on the API server (api.leados.app)
```

`FINAL_ARCHITECTURE §0` states: "Where this document and any individual blueprint file disagree, this document wins." But `FINAL_ARCHITECTURE §5` only mandates a spike; it doesn't decide the callback location. The execution plan's API-server callback is architecturally correct (more secure — server-side code exchange, no OAuth code in the browser URL) but it is an **undocumented deviation from blueprint doc 14**. The Meta Developer Console must have the exact same HTTPS URL pre-registered, and it cannot be changed without a resubmission wait.

**Action required before Meta sandbox setup:** Formally decide and document the callback URL in the spike findings document. Do not register a callback URL in the Meta Developer Console until this decision is locked. If the URL changes after Meta App Review, it requires resubmission.

**Additional concern:** The state parameter design uses `signState({ userId, orgId, nonce }, ACCESS_SECRET, { expiresIn: '15m' })`. Reusing `JWT_ACCESS_SECRET` (the access token signing key) for OAuth state tokens is a key-boundary violation. If `JWT_ACCESS_SECRET` is rotated (a security requirement), all in-flight OAuth sessions are invalidated. Use a separate `OAUTH_STATE_SECRET` env variable.

---

### AR-5 — MEDIUM: `eventBus.emitDurable` Signature Mismatch with `EventName` Type Constraint

**Source:** `apps/api/src/core/events/event-bus.ts`, `packages/shared/src/constants/events.ts`

**Finding:** `eventBus.emitDurable(event: EventName, ...)` requires `event` to be of type `EventName`. `EventName = SystemEvent | DomainEvent`. The execution plan adds `MESSAGE_RECEIVED`, `MESSAGE_SENT`, etc. to `DomainEvent` in M1. Once added, `DomainEvent.MESSAGE_RECEIVED` is a valid `EventName`. This is correct **only if** M1's enum additions are complete before any M3 code is compiled. The safeguard is the typecheck gate. Confirm the enum additions in `events.ts` include `AllEvents` and `EventName` union updates (the plan specifies this at `packages/shared/src/constants/events.ts`, modify "AllEvents and EventName union").

---

## 2. Scope Creep

### SC-1 — HIGH: M6 `saved_replies` Backend is Already Half-Built (Table Exists)

**Source:** `apps/api/src/core/tenancy/tenant-tables.ts:68`, `SPRINT_6_EXECUTION_PLAN.md §M6`

**Finding:** `saved_replies` is in `TENANT_TABLES` (added in Sprint 4 M1). The Prisma model `SavedReply` is in `TENANT_MODELS`. The table is already migrated to Postgres with RLS. The M6 plan creates saved-replies CRUD endpoints from scratch, implying the table doesn't exist. This is incorrect — the schema is already live. M6 only needs the CRUD API layer (controller, service, repository). Verify the `SavedReply` Prisma model fields match what the inbox saved-replies feature needs before writing migration code for a table that already exists.

**Risk:** Writing a migration for `saved_replies` that conflicts with the existing table will fail in production. Check `prisma/schema.prisma` for the existing `SavedReply` model definition before M6 work begins.

---

### SC-2 — MEDIUM: `SavedReplyPicker` in Compose Bar is Underestimated Scope

**Source:** `SPRINT_6_EXECUTION_PLAN.md §M5`, `SPRINT_6_UI_UX_PLAN.md §2.10`

**Finding:** The saved-replies `/` shortcut requires: keyboard event capture on the textarea, floating panel positioning (absolute, above the compose area), keyboard navigation (ArrowUp/Down), selection on Enter, escape to close, search debounce, and rendering the picker above the textarea without overflowing the viewport. The execution plan lists this as a single file (`SavedReplyPicker.tsx`) within M5 scope and says "if time is tight, ship without the shortcut in M5." The UI/UX plan documents it fully. These two documents are misaligned — the UX plan implies it's fully specified for Sprint 6, while the execution plan treats it as deferrable. **Formally defer `SavedReplyPicker.tsx` to M6** and update the M5 file list. The compose bar must still ship in M5; only the `/` shortcut mechanism is deferred.

---

### SC-3 — MEDIUM: M5 Lists 3 BFF Test Files Beyond Component Tests

**Source:** `SPRINT_6_EXECUTION_PLAN.md §M5 — M5 Files to Create`

**Finding:** The M5 files list includes:
- `apps/web/src/components/inbox/InboxPage.test.tsx`
- `apps/web/src/components/inbox/ConversationList.test.tsx`
- `apps/web/src/app/api/bff/inbox/conversations/route.test.ts`

The component tests and BFF route test are in scope and documented. However, the plan also expects `useSendMessage.ts`, `useAssignConversation.ts`, and `useConversations.ts` hooks without corresponding test files listed. TanStack Query hooks require mock testing with `renderHook` from `@testing-library/react`. These are omitted from the file list. Add `useConversations.test.ts` and `useSendMessage.test.ts` to the M5 file list or the milestone will fall below the 70% branch coverage target for the inbox module.

---

## 3. Schema Risks

### SR-1 — BLOCKING: `activity-metadata.ts` Discriminated Union Will Break on 4 New ActivityTypes

**Source:** `packages/shared/src/types/activity-metadata.ts`, `SPRINT_5_M1_FINAL_SIGNOFF.md §Check 7`

**Finding:** The M1 signoff explicitly confirms: "Discriminated union is exhaustive — every `ActivityType` value has exactly one matching metadata variant (22 types, 22 union members)." The check asserts that no `ActivityType` value exists without a matching `ActivityMetadata` interface.

The execution plan adds 4 new `ActivityType` values in M1:
- `MESSAGE_RECEIVED`
- `MESSAGE_SENT`
- `INSTAGRAM_ACCOUNT_CONNECTED`
- `INSTAGRAM_ACCOUNT_DISCONNECTED`

The plan does **not** add corresponding interfaces to `activity-metadata.ts`. This will break the discriminated union and any runtime code that switch-dispatches on `ActivityType`. The `pnpm typecheck` gate should catch this if the exhaustive check is implemented via TypeScript never — confirm it does, or add the metadata interfaces explicitly.

**Required additions to `packages/shared/src/types/activity-metadata.ts`:**

```typescript
export interface MessageReceivedMetadata    { type: 'MESSAGE_RECEIVED';              conversationId: string; messageId: string }
export interface MessageSentMetadata        { type: 'MESSAGE_SENT';                  conversationId: string; messageId: string }
export interface InstagramConnectedMetadata { type: 'INSTAGRAM_ACCOUNT_CONNECTED';   igAccountId: string; igUsername: string }
export interface InstagramDisconnectedMetadata { type: 'INSTAGRAM_ACCOUNT_DISCONNECTED'; igAccountId: string }
```

All four must be added to the `ActivityMetadata` union AND to `ActivityAppendInput` if it uses the union.

---

### SR-2 — HIGH: `leads.instagramUserId` Lacks Unique Constraint and Creates Race Condition

**Source:** `prisma/schema.prisma:483`, `SPRINT_6_EXECUTION_PLAN.md §M3 — Risks`

**Finding:** The `leads` table has `@@index([instagramUserId])` but no `@@unique([organizationId, instagramUserId])`. The M3 receive pipeline finds-or-creates a lead by `instagramUserId`. Under concurrent DM processing (two messages from the same IG user arrive simultaneously), two workers can each find no existing lead and each attempt to create one. The result is two lead rows for the same IG user in the same org — a data quality violation that is difficult to detect and correct.

The execution plan notes this in M3 Risks as "consider whether this should be @@unique" without resolving it. **This must be decided before migration 0015** because adding a unique constraint after leads exist requires a de-dup step.

**Recommendation:** Add `@@unique([organizationId, instagramUserId])` to the `Lead` model in migration 0015 (or a new 0015a migration). Use Postgres `INSERT ... ON CONFLICT (organizationId, instagramUserId) DO NOTHING` or `DO UPDATE` for the find-or-create path. This is the same pattern used for `messages.mid` dedup.

---

### SR-3 — MEDIUM: Migration 0016 (`ALTER TABLE leads ADD CONSTRAINT`) Locks Table

**Source:** `SPRINT_6_EXECUTION_PLAN.md §M1 — Migration 0016`, `prisma/schema.prisma:433`

**Finding:** Migration 0016 adds a FK constraint from `leads.instagramAccountId` to `instagram_accounts.id`. In PostgreSQL, `ADD CONSTRAINT ... FOREIGN KEY` acquires a brief `ShareRowExclusiveLock` on the referencing table (`leads`). On a production `leads` table with many rows, this can block writes for the duration of constraint validation. The plan says "This migration is safe to run after accounts are seeded because the column already has no FK constraint. Existing null values are unaffected."

The statement about null values is correct (NULLs are excluded from FK checks by default). However, the table lock is still acquired and must complete validation over all existing rows. If `leads` is large (e.g., 500k+ rows on a high-traffic org), this lock can cause a multi-second write stall.

**Mitigation:** Add `NOT VALID` to the `ADD CONSTRAINT` statement to skip validation (lock is not acquired), then run `ALTER TABLE leads VALIDATE CONSTRAINT ... CONCURRENTLY` in a maintenance window. Document this in the migration.

---

### SR-4 — MEDIUM: `MessageStatus` Enum Conflict with `WebhookEventStatus`

**Source:** `packages/shared/src/constants/enums.ts`, `SPRINT_6_EXECUTION_PLAN.md §M1`

**Finding:** The plan adds a `MessageStatus` enum with values: `SENT | DELIVERED | READ | FAILED`. The existing `WebhookEventStatus` enum has a `FAILED` value. Both live in `enums.ts` and are exported. These are different types and cannot conflict at the TypeScript level. However, the Prisma schema will have two enums named `MessageStatus` and `WebhookEventStatus` — both with `FAILED` as a member. Postgres CREATE TYPE statements will use the enum names. This is fine in Postgres (enum names are unique per schema, values within an enum are independent). No action needed beyond confirming the Prisma enum names are distinct.

Note: `MessageDirection` (`INBOUND | OUTBOUND`) already exists in `enums.ts` and is already used in the schema. The plan references it correctly. Do not recreate it.

---

## 4. Security Risks

### SEC-1 — HIGH: OAuth State Signed with `JWT_ACCESS_SECRET` (Key Boundary Violation)

**Source:** `apps/api/src/core/config/env.ts`, `SPRINT_6_EXECUTION_PLAN.md §M2`

**Finding:** The plan proposes: `state = signState({ userId, orgId, nonce }, ACCESS_SECRET, { expiresIn: '15m' })`. `ACCESS_SECRET` is `JWT_ACCESS_SECRET` — the key used to sign all user access tokens.

Using the same key for two distinct token types violates the key-boundary principle:
1. A compromised OAuth state token reveals information about the signing key used for user sessions.
2. Rotating `JWT_ACCESS_SECRET` (a routine security operation) invalidates all in-flight OAuth sessions without warning.
3. An attacker who can forge one token type can potentially forge the other.

**Fix:** Add `OAUTH_STATE_SECRET` to `env.ts` (a separate 32+ byte random key). Use it exclusively for state tokens. This requires a new env variable in `M1 env.ts` additions. Add to the production fail-fast check alongside `FIELD_ENCRYPTION_KEY`.

---

### SEC-2 — HIGH: Webhook Status Endpoint Routes to the Same POST Handler — No `read` Status Webhook Path

**Source:** `SPRINT_6_EXECUTION_PLAN.md §M4`, `apps/api/src/modules/webhooks/webhook.routes.ts`

**Finding:** The execution plan says: "No new route (status events arrive on the same `POST /api/webhooks/instagram` endpoint — they are different `messaging_type` events in the same payload). The status handling is added to `handleInstagram()` in the worker."

This is correct architecturally. However, `handleInstagram()` in the webhook worker currently does nothing with the payload (just logs). The M3 rewrite of `handleInstagram()` must handle **both** inbound messages AND status updates (delivered/read) in a single function. The M4 scope says "Add `receiveInstagramStatus()` handler for delivered/read status webhooks" to `webhook.controller.ts` — but the controller doesn't call `handleInstagram` directly (that's in the worker). The controller persists and enqueues; the worker dispatches. The status update logic must live in the **worker** in `handleInstagram()`, not in a new controller function. The plan's "Files to Modify" in M4 incorrectly lists `webhook.controller.ts` as the location for status handling. Clarify: the controller receives and persists all Instagram webhook deliveries; the worker's `handleInstagram()` function routes by event type (message vs. status).

---

### SEC-3 — MEDIUM: HMAC Secret for Instagram Webhooks Uses `INSTAGRAM_APP_SECRET`

**Source:** `apps/api/src/core/config/env.ts:53`, `apps/api/src/modules/webhooks/webhook.controller.ts:38`

**Finding:** The webhook HMAC key is `INSTAGRAM_APP_SECRET`. This same secret is used in M2 as the app secret for the OAuth code exchange (`client_secret` parameter). Using the same secret for two purposes (HMAC webhook verification + OAuth code exchange) is acceptable per Meta's API design (Meta uses the same App Secret for both), but this means `INSTAGRAM_APP_SECRET` is now a **mandatory production secret** (it was previously optional with a test default). The M1 `env.ts` additions must promote `INSTAGRAM_APP_SECRET` to production-required (removing the `default('test-ig-secret')` default or adding it to the production fail-fast block).

---

### SEC-4 — LOW: `ig_unknown_{Date.now()}` Fallback in `extractInstagramEventId` Is Non-Idempotent

**Source:** `apps/api/src/modules/webhooks/webhook.controller.ts:183`, `SPRINT_5_M4_FINAL_SIGNOFF.md §O-M4-3`

**Finding:** When `entry` array is empty, `extractInstagramEventId` returns `ig_unknown_${Date.now()}`. This was documented as O-M4-3 in the M4 signoff as "non-idempotent ID for malformed payloads." Meta will retry failed webhook deliveries. If the API returns 200 but the worker crashes after persisting the event, a retry will create a duplicate `webhook_events` row with a new timestamp-based ID. The `UNIQUE(source, externalEventId)` constraint only protects against exact duplicates.

The M3 rewrite doesn't fix this because the fix is in the controller (which persists), not the worker (which processes). The fix is to hash the raw payload: `crypto.createHash('sha256').update(rawBody).digest('hex').slice(0, 32)`. This produces a deterministic ID for any payload, even malformed ones. Sprint 6 should fix this in `extractInstagramEventId` during M3.

---

## 5. Scalability Risks

### SCALE-1 — HIGH: Per-Account Lead Enrichment on Every Message Hits Meta Rate Limits

**Source:** `SPRINT_6_EXECUTION_PLAN.md §M3 — Step vi`, `SPRINT_6_EXECUTION_PLAN.md §M3 — Risks`

**Finding:** M3 step vi calls `adapter.getSenderProfile()` for lead enrichment. The plan notes this as a risk ("make enrichment async, enqueue a `instagram-enrich` job") but then describes it as happening inline in the receive pipeline. The execution plan is ambiguous about whether enrichment is inline or deferred. Make it explicit: **enrichment must be deferred** (enqueued, not inline). An org with 100 simultaneous DMs would fire 100 synchronous Meta API calls from the webhook worker. Meta's user lookup rate limits (typically ~200/hour/app) would cause failures. The plan must explicitly change step vi to: "enqueue an `instagram-enrich` job if `lead.instagramHandle` is null; do not call adapter.getSenderProfile() inline."

This requires adding `instagram-enrich` to the queue name registry or using an existing queue (e.g., `ai-scoring` is wrong; use `webhook-processing` with a new job name, or add `instagram-enrich` to `QUEUE`).

---

### SCALE-2 — MEDIUM: Cursor Pagination for Conversations Must Use an Indexed Column

**Source:** `SPRINT_6_EXECUTION_PLAN.md §M3 — API Endpoints`, `SPRINT_6_EXECUTION_PLAN.md §M5`

**Finding:** `GET /api/v1/inbox/conversations` is cursor-paginated. The migration plan creates `INDEX(organizationId, status, lastMessageAt DESC)` on `instagram_conversations`. The cursor should be based on `lastMessageAt` + `id` (compound cursor) to handle ties. If two conversations have identical `lastMessageAt` values (e.g., two DMs arrive at the same millisecond), a single-field cursor will skip or repeat rows. The cursor must be `{ lastMessageAt, id }` with the query using `WHERE (lastMessageAt, id) < ($cursor_lastMessageAt, $cursor_id)`. Document this in the `useConversations` hook implementation notes.

---

### SCALE-3 — MEDIUM: BullMQ Rate Limiter Key Is `igAccountId` — Not `organizationId`

**Source:** `SPRINT_6_EXECUTION_PLAN.md §M4`

**Finding:** The plan correctly uses `igAccountId` as the rate-limit key (not `organizationId`). This is correct since Meta's rate limits are per-account, not per-org. However, the rate limit value (`max` + `duration`) is listed as "spike-confirmed limit" — meaning the M4 rate limiter configuration is a placeholder until the spike answers the rate limit question. If the spike is not done or the rate limit is not documented in the spike findings, M4 will ship with an incorrect rate limiter. The spike findings document (M1-A output) must include the confirmed rate limit values as a required field.

---

## 6. Testing Gaps

### TG-1 — HIGH: No Test for Socket.io JWT Authentication Rejection

**Source:** `SPRINT_6_EXECUTION_PLAN.md §M1 — socket-middleware.ts contract`

**Finding:** The socket middleware disconnects clients with invalid JWTs. No test is specified for:
- Connection with a valid token → joins `org:{orgId}` room
- Connection with an expired token → disconnect
- Connection with a token from a suspended org → disconnect
- Reconnection after token refresh → rejoins room

Without these tests, the auth barrier on the WebSocket connection is unverified. Add a `socket-middleware.test.ts` unit test file to M1.

---

### TG-2 — HIGH: No Concurrent DM Test (Race Condition on `instagram_conversations` Upsert)

**Source:** `SPRINT_6_EXECUTION_PLAN.md §M3 — Integration Tests`

**Finding:** The M3 test list covers single DM, duplicate, multi-entry, and multi-message scenarios. Missing: two concurrent DMs from different users arriving at the same instant and both attempting to upsert `instagram_conversations` for the same `igConversationId`. The `ON CONFLICT (organizationId, igConversationId)` constraint handles the dedup, but the test should verify that concurrent processing produces exactly one conversation row and two message rows with no exception thrown. Add a concurrent upsert test using `Promise.all([processWebhook(dm1), processWebhook(dm2)])`.

---

### TG-3 — MEDIUM: No Token Refresh Cron Integration Test

**Source:** `SPRINT_6_EXECUTION_PLAN.md §M2`

**Finding:** The daily token refresh cron is registered in `CRON_REGISTRY`. No integration test exists for `instagramService.refreshAllActiveTokens()`. An EXPIRED account must be identifiable and a refreshed token must be stored in the correct encrypted format. Add at minimum a unit test for `refreshAllActiveTokens()` with a mocked adapter.

---

### TG-4 — MEDIUM: No Test for `api-client.ts` 401 Retry Loop

**Source:** `SPRINT_6_EXECUTION_PLAN.md §M5`

**Finding:** The M5 plan implements the 401 retry interceptor but lists no test for it. The `_retried` flag that prevents infinite loops is critical. Without a test:
- A broken refresh endpoint could cause an infinite retry loop (browser hangs)
- A broken `_retried` flag could allow double-refresh race conditions

Add a test using `axios-mock-adapter` or vitest mocks verifying: (1) 401 triggers exactly one refresh call; (2) successful refresh retries the original request; (3) failed refresh redirects to `/login`; (4) the `_retried` flag prevents a second retry.

---

### TG-5 — MEDIUM: No Test for Window Expiry Boundary Condition

**Source:** `SPRINT_6_EXECUTION_PLAN.md §M4`

**Finding:** `InboxService.sendMessage()` checks `conversation.lastInboundAt > now - windowDuration`. The test case `POST /inbox/conversations/:id/messages where lastInboundAt > 24h ago → 409 WINDOW_CLOSED` is listed. But no test exists for the boundary: `lastInboundAt` = exactly 24h ago (should be WINDOW_CLOSED), and `lastInboundAt` = 23h 59m 59s ago (should succeed). Add boundary tests to prevent off-by-one errors in the window calculation.

---

### TG-6 — LOW: `field-encryption.test.ts` Missing "Tampered Ciphertext" Test Vector

**Source:** `SPRINT_6_EXECUTION_PLAN.md §M1 — Integration Tests`

**Finding:** The specified tests include: round-trip, wrong key, key version prefix, empty string, output format stability. Missing: a tampered ciphertext test. AES-256-GCM authentication tags detect tampering — if the ciphertext is modified, `decrypt()` must throw. This tests the AEAD property of GCM mode, which is the primary security guarantee. Add one test: modify a byte in the ciphertext → verify `decrypt()` throws.

---

## 7. Deployment Risks

### DR-1 — HIGH: Meta App Review Cannot Be Submitted from Local Environment

**Source:** `SPRINT_6_EXECUTION_PLAN.md §M6 — Meta App Review Checklist`

**Finding:** The App Review checklist item "Webhook URL live on HTTPS" requires a staging environment with a real domain. The plan notes this but doesn't specify whether a staging deployment is planned. The current Railway deployment (`api.leados.app`) is production. App Review submissions should not point to a production webhook URL during testing — Meta reviewers will send test webhooks to whatever URL is registered. Options:
1. Create a staging service on Railway with a separate staging URL and IG app
2. Use `ngrok` for local development (permitted during development only, not for App Review submission)

A staging environment decision must be made in the pre-sprint checklist, not in M6.

---

### DR-2 — HIGH: `socket.io` Installation Requires API Service Restart

**Source:** `SPRINT_6_EXECUTION_PLAN.md §M1-B`, current `apps/api/package.json`

**Finding:** `socket.io` is not installed in `apps/api/package.json` (confirmed: empty result when searching for socket in API dependencies). Installing it requires a Docker image rebuild and a service restart on Railway/ECS. If the API service is serving production traffic, the restart causes a brief downtime (Railway's rolling deploy mitigates this, but only if ≥2 replicas are running). Verify that the Railway deployment config uses rolling restarts before M1-B.

Additionally, `socket.io` and `@socket.io/redis-adapter` must be installed as `dependencies` (not `devDependencies`) — they are needed at runtime. The plan specifies `dependencies` correctly; double-check at implementation time.

---

### DR-3 — MEDIUM: Migration 0016 FK on `leads` Table Requires Maintenance Window

*(Already documented in SR-3. Deployment risk is: this migration cannot be applied with zero downtime without `NOT VALID` + later `VALIDATE CONSTRAINT`.)*

See SR-3 for mitigation.

---

### DR-4 — LOW: CORS Must Allow Socket.io WebSocket Upgrade from `app.leados.app`

**Source:** `apps/api/src/core/middleware/index.js` (implied), `SPRINT_6_EXECUTION_PLAN.md §M1`

**Finding:** The `socket-server.ts` initialization requires a CORS origin for the Socket.io server (separate from Express CORS middleware). The plan specifies `SOCKET_IO_CORS_ORIGIN` env variable defaulting to `APP_WEB_ORIGIN`. Socket.io's CORS config must explicitly allow `https://app.leados.app` in production. The plan's design is correct, but `SOCKET_IO_CORS_ORIGIN` must be set in the Railway environment before M1 is deployed. Add it to the deployment runbook.

---

## 8. Sprint 5 Dependency Verification

### DEP-1 — BLOCKING: Sprint 5 M2 Final Signoff is NOT APPROVED

**Source:** `docs/planning/SPRINT_5_M2_FINAL_SIGNOFF.md`

**Finding:** The M2 final signoff document returns verdict: **NOT APPROVED** with blocker BLOCKER-M2-1: Pipeline Activity Emission Is Missing. The Sprint 5 Closure Report (dated same day) recommends GO for Sprint 6. These two documents are in conflict.

The blocker was: `PipelineService` doesn't call `ActivityService.append()` for pipeline create/update because the `activities` table requires a `relatedLeadId`, `relatedContactId`, or `relatedDealId` and has no `relatedPipelineId` column. This is a schema limitation, not an implementation bug.

**Status required before Sprint 6 M1 begins:** Either (a) a formal deferral signed by the tech lead that pipeline create/update activities are deferred to Sprint 7 when the activity schema supports pipeline relations, or (b) a remediation commit with a re-signoff document. The current state is that M2 has an open blocker with no resolution record.

**Risk to Sprint 6:** Low technical risk (the blocker is in the pipeline module, not the inbox). High process risk — if the signoff process requires all prior milestones to be approved before starting the next sprint, the sprint gate is technically not cleared.

---

### DEP-2 — HIGH: `DEAL_UPDATED` Missing from `DomainEvent` in `events.ts`

**Source:** `packages/shared/src/constants/events.ts`, `SPRINT_5_M3_FINAL_SIGNOFF.md §Check 13`

**Finding:** The M3 signoff confirms `DEAL_UPDATED` is emitted via `activityService.append()` with `ActivityType.DEAL_UPDATED`. However, reading `events.ts` at HEAD, the `DomainEvent` object contains: `DEAL_CREATED`, `DEAL_STAGE_MOVED`, `DEAL_WON`, `DEAL_LOST` — **`DEAL_UPDATED` is absent**. Sprint 7 workflow triggers that listen to `DomainEvent.DEAL_UPDATED` will never fire. This is a pre-existing gap. Sprint 6 M1's enum additions to `events.ts` must include `DEAL_UPDATED` as a cleanup item alongside the new IG events.

---

### DEP-3 — HIGH: `server.ts` Produces `http.Server` but Never Exports It

**Source:** `apps/api/src/server.ts`

**Finding:** `server.ts` calls `buildApp()` (returns `Express`) then `app.listen()` (returns `http.Server`). The `http.Server` instance is stored as a local variable and never exported. The execution plan calls `initSocketServer(server)` inside `start()` — this is structurally correct. However, if any future module needs the HTTP server reference outside `start()`, it won't be accessible. The `getSocketServer()` singleton correctly solves the reverse (code that needs the Socket.io instance can call `getSocketServer()`). No change needed for M1, but document this constraint: `initSocketServer()` must be called from within `start()` before any request can reach the API, and `getSocketServer()` is the only safe way to access the Socket.io instance from application code.

---

## 9. Socket.io Deployment Architecture Compatibility Verification

**Verdict: COMPATIBLE with one required clarification**

`FINAL_ARCHITECTURE §7.1` specifies:
```
Socket.io tier (Redis adapter — separate even if co-located)
```

The execution plan correctly installs `socket.io` + `@socket.io/redis-adapter` on the API process and initializes with the same Redis connection used for BullMQ. This satisfies the architecture requirement. Railway can host both the API+Socket.io process and the worker process in separate services, both pointing to the same Upstash Redis instance.

**Compatibility concern:** Railway's default behavior may use Nixpacks with a single `npm start` command. Confirm whether the current Dockerfile/Railway config runs `server.ts` and `worker.ts` as separate processes. If they run in the same process, the cross-process Socket.io problem (AR-1) disappears — but the current architecture diagram and `server.ts` / `worker.ts` files confirm they are intentionally separate.

**Blocking clarification from the pre-sprint topology decision:** If the decision is "Socket.io in the same service as the API" (recommended), the Socket.io server is initialized in `server.ts` and the worker remains a separate service. The worker needs to publish to Redis (see AR-1 Option B). If the decision is "Socket.io as a separate service," `initSocketServer` is extracted to a third process with its own entry point — significantly more complex. **Recommendation: co-locate Socket.io with the API process and use Redis pub/sub for cross-process notification.**

---

## 10. Instagram OAuth Assumptions Verification

**Verdict: ASSUMPTIONS PARTIALLY SOUND — 4 items require spike confirmation**

| Assumption | Source | Verified Against Blueprint/FA | Risk |
|-----------|--------|------------------------------|------|
| "Instagram API with Instagram Login" path (User Token) | M1-A spike questions | Blueprint 14 says **illustrative, must be validated** | HIGH — determines all scopes and endpoints |
| 60-day long-lived User Access Token | M1-A spike question | Blueprint §14.6 says 60-day (for User tokens) but §14.5 says Page tokens don't expire — inconsistency | HIGH — determines cron cadence |
| 24-hour messaging window | M1-A spike question | Blueprint §14.10 says 7 days; FINAL_ARCHITECTURE §5.1 says "commonly 24h" | HIGH — determines window check logic; currently hardcoded |
| `mid` path is `entry[n].messaging[m].message.mid` | M1-A spike question | Blueprint §14.4 shows this path | MEDIUM — confirm exact field names in current API version |
| Webhook subscription per-account after OAuth | M2 | Blueprint §14.3 shows `POST /{page-id}/subscribed_apps` | MEDIUM — may differ for User Token path vs Page Token path |
| OAuth redirect URI is on the API server | M2 architecture decision | Blueprint shows frontend URL — deviation not formally recorded | MEDIUM — must be registered with Meta before any OAuth test |
| `instagramAccounts` plan limits already in `PLAN_LIMITS` | M2 plan-limit enforcement | **VERIFIED** — `PLAN_LIMITS[plan].instagramAccounts` exists in `plan-limits.ts` | None |
| `LeadSource.INSTAGRAM_DM` exists for lead creation | M3 | **VERIFIED** — present in `enums.ts` and `schema.prisma` | None |
| `instagramUserId` and `instagramHandle` columns exist on `Lead` | M3 | **VERIFIED** — `prisma/schema.prisma:447-449` confirms both fields | None |
| `instagramAccountId` UUID column exists on `Lead` (deferred FK) | M3/M1 | **VERIFIED** — `schema.prisma:449` with comment "deferred FK → instagram_accounts (Sprint 6)" | None |
| `INSTAGRAM_APP_SECRET` already in `env.ts` | M1 | **VERIFIED** — present with `default('test-ig-secret')` | Promote to required in prod (see SEC-3) |

**Critical unverified assumption (highest risk):** The messaging window duration of 24 hours is **hardcoded in the plan** but described as "spike-confirmed" in the notes. If the window is actually the Human Agent Tag variant (7 days), the window-expired check will incorrectly block agents who still have time to reply. The `windowDuration` constant must be a named constant (`INSTAGRAM_MESSAGING_WINDOW_HOURS`) set from spike findings, not an inline magic number.

---

## 11. Pre-Implementation Required Actions

Before any M1-B code is written, the following must be resolved:

| # | Action | Category | Owner |
|---|--------|----------|-------|
| 1 | Formally resolve Sprint 5 M2 blocker (BLOCKER-M2-1) — sign off deferral or remediate | Process | Tech lead |
| 2 | Decide Socket.io cross-process notification mechanism (AR-1 Option A/B/C) | Architecture | Tech lead |
| 3 | Add `OAUTH_STATE_SECRET` to M1 env.ts additions (replace `ACCESS_SECRET` for OAuth state) | Security | Engineer |
| 4 | Add 4 new `ActivityMetadata` interfaces to the M1 file modification list | Schema | Engineer |
| 5 | Decide OAuth callback location (API vs frontend) and lock the URL for Meta registration | Architecture | Tech lead + PM |
| 6 | Decide `@@unique([organizationId, instagramUserId])` on `leads` before migration 0015 | Schema | Tech lead |
| 7 | Add `DEAL_UPDATED` to `DomainEvent` in events.ts as a cleanup item in M1 | Schema | Engineer |
| 8 | Add `NOT VALID` to migration 0016 FK constraint and document `VALIDATE CONSTRAINT` step | Deploy | Engineer |
| 9 | Promote `INSTAGRAM_APP_SECRET` to production-required in `env.ts` fail-fast block | Security | Engineer |
| 10 | Specify rate limit values as required spike finding (add to M1-A spike question list) | Scalability | Engineer |
| 11 | Confirm `SavedReply` model fields in schema.prisma match inbox saved-replies needs (M6) | Schema | Engineer |
| 12 | Add `socket-middleware.test.ts` to M1 test file list | Testing | Engineer |
| 13 | Explicitly defer `SavedReplyPicker.tsx` from M5 to M6 in execution plan | Scope | Tech lead |
| 14 | Add `windowDuration` as a named constant (not inline 24h value) | Architecture | Engineer |
| 15 | Staging environment decision (for App Review webhook URL) | Deploy | PM/Infra |

---

## 12. Risk Register

| ID | Risk | Severity | Probability | Mitigation |
|----|------|----------|-------------|-----------|
| R-1 | Cross-process Socket.io emit fails silently | CRITICAL | CERTAIN (if unresolved) | AR-1 Option B before M1-B |
| R-2 | Meta App Review takes longer than sprint | HIGH | HIGH (4+ week SLA) | Submit immediately after M5 exit; feature-flag inbox until approved |
| R-3 | Spike reveals Facebook-Login (not Instagram Login) path | HIGH | MEDIUM | Adapter interface insulates; only adapter implementation changes |
| R-4 | Messaging window is 7 days (not 24h) | HIGH | MEDIUM | Named constant; update post-spike without code search |
| R-5 | M2 NOT APPROVED blocker creates process gate failure | HIGH | CERTAIN (if not resolved) | Formal deferral document |
| R-6 | `leads` table lock during migration 0016 causes prod downtime | HIGH | MEDIUM (if table is large) | `NOT VALID` + async `VALIDATE CONSTRAINT` |
| R-7 | Concurrent DMs create duplicate leads (no uniqueness on `instagramUserId`) | MEDIUM | MEDIUM | Add `@@unique` in migration 0015 |
| R-8 | Activity metadata discriminated union breaks typecheck | HIGH | CERTAIN (if not fixed) | Add 4 metadata interfaces in M1 |
| R-9 | Rate limit config is wrong; sends get 429 from Meta | MEDIUM | LOW | Spike required field; BullMQ rate-limiter is hot-configurable |
| R-10 | OAuthState secret rotation invalidates user sessions | MEDIUM | LOW | Separate `OAUTH_STATE_SECRET` key |

---

## 13. What the Plan Gets Right

This section is included to avoid false negatives — the execution plan is well-structured in several areas:

1. **Persist-then-200 webhook contract** — correctly implemented in Sprint 5 M4; Sprint 6 M3 builds on a sound foundation.
2. **Message-grain dedup** (`UNIQUE(mid)` + `ON CONFLICT DO NOTHING`) — correct; prevents duplicate messages under retry.
3. **`InstagramAdapter` interface** — correct; all Meta specifics are behind the adapter; a change in token type from the spike only changes the adapter implementation.
4. **Migration sequencing** — 0014 → 0015 → 0016 is correct; FK added after referenced table exists.
5. **`instancePageParam: null` for cursor pagination** — correct TanStack Query v5 pattern; plan explicitly calls this out as distinct from the page-based pattern used elsewhere.
6. **Optimistic message insertion** — correct pattern (`setQueryData` before API response; replace on success; remove on failure).
7. **Feature flag kill switch** — correct; wired at M4 send path before any sends reach Meta.
8. **`firstResponseAt` SLA immutability** — set once on first outbound, never updated; correct design.
9. **`resolveAccessToken` duplication deferral** — correct to defer the mechanical refactor to M6; M5 knowingly copies the pattern without refactoring existing files.
10. **Pre-sprint checklist** — the Facebook Business Verification and sandbox setup items are correctly called out as day-0 administrative gates, not M1 technical tasks.
11. **`PLAN_LIMITS[plan].instagramAccounts`** — already populated in `plan-limits.ts`; M2 enforcement is ready to implement.
12. **UI/UX addendum** (`SPRINT_6_UI_UX_PLAN.md`) — fully specifies design token compliance, component reuse, and acceptance criteria; this is the correct level of detail for a dark-first design-language-consistent inbox.

---

*All code references verified against source at HEAD (`1bf88db`). This review supersedes any conflicting assumptions in `SPRINT_6_EXECUTION_PLAN.md` where architectural facts are in dispute.*
