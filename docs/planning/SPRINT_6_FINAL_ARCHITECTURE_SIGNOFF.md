# Sprint 6 — Final Architecture Signoff

**Author:** Principal Engineer / Final Architecture Authority
**Date:** 2026-06-21
**Supersedes:** `SPRINT_6_EXECUTION_PLAN.md` wherever the two conflict
**Status:** FINAL — this document is the implementation contract for Sprint 6

> All decisions herein are binding. Any deviation during implementation requires a written amendment to this document before the code is merged. Implementers cite this document, not the execution plan, when architecture questions arise.

---

## 1. Executive Summary

The Sprint 6 Execution Plan is architecturally sound in its milestone structure, API design, database schema design, and UI/UX strategy. Three blocking issues were identified in the architecture review and are resolved in this document:

1. **Cross-process Socket.io emit** — The plan's `emitDurable` / in-process event bus approach cannot bridge the API and Worker OS processes. Final decision: use `@socket.io/redis-emitter` in the Worker process.
2. **Sprint 5 M2 open blocker** — BLOCKER-M2-1 (pipeline activity emission) is formally deferred to Sprint 7. M2 is re-graded as APPROVED WITH ACCEPTED DEVIATION.
3. **OAuth state secret boundary violation** — The plan reused `JWT_ACCESS_SECRET` for OAuth state tokens. Final decision: a dedicated `OAUTH_STATE_SECRET` env variable.

Additionally, five medium-severity schema risks are resolved with final decisions in §5.

**Overall Sprint 6 verdict: GO** with the architectural corrections in this document applied to all milestone implementations.

---

## 2. Blocking Issues Resolved

### B-1 (AR-1, AR-2): Cross-Process Socket.io Emit

**Status: RESOLVED** — see §3 for the complete design.

**Root cause:** `eventBus.emit()` in the Worker process (`worker.ts`) is in-process only and cannot reach Socket.io listeners in the API process (`server.ts`). The plan routed Socket.io notifications through `QUEUE.INSTAGRAM_SEND` which is the outbound Meta message queue — a semantic mismatch.

**Resolution:** `@socket.io/redis-emitter` in the Worker process. The Worker publishes Socket.io events to Redis using the Socket.io adapter wire format. All API instances with `@socket.io/redis-adapter` receive the message and broadcast to their locally connected clients. Zero new infrastructure. Full multi-instance compatibility.

---

### B-2 (DEP-1): Sprint 5 M2 NOT APPROVED Blocker

**Status: FORMALLY DEFERRED**

BLOCKER-M2-1 in `SPRINT_5_M2_FINAL_SIGNOFF.md` is: `PipelineService` does not call `ActivityService.append()` for pipeline create/update mutations — the service-layer emission code is missing.

> **A8 — Correction from readiness audit:** The original signoff stated the deferral reason as "activities table has no relatedPipelineId FK / column." This is factually wrong. Source-verified at HEAD (`prisma/schema.prisma:581-582`): `relatedPipelineId String? @db.Uuid` and `relatedPipelineStageId String? @db.Uuid` both exist in the `Activity` model, with covering indices. The schema is ready. The missing piece is service code only.

**Formal deferral decision:**

Pipeline CRUD activity emission is deferred to Sprint 7. Rationale:
- `PipelineService` does not call `ActivityService.append()` for pipeline mutations. This is a service-layer omission, not a schema limitation.
- Pipeline mutations DO produce audit log rows (confirmed in M2 signoff: check 12 PASS). The audit trail is intact.
- The missing activity rows affect the "pipeline created/updated" timeline view in a future UX feature, not any current production path.
- Sprint 6 does not modify the pipeline module.

**Sprint 5 M2 is re-graded: APPROVED WITH ACCEPTED DEVIATION.** The accepted deviation (no pipeline activity rows) is documented in the Sprint 5 closure report addendum. Sprint 7 M1 will add the emission call to `PipelineService` — no schema migration required.

---

### B-3 (AR-4, SEC-1): OAuth State Secret Boundary Violation

**Status: RESOLVED** — see §4 for the complete OAuth design.

**Root cause:** Plan used `JWT_ACCESS_SECRET` to sign OAuth state tokens. Key boundary violation: rotating access secrets invalidates OAuth sessions.

**Resolution:** New `OAUTH_STATE_SECRET` env variable (min 64 hex chars). Added to M1 `env.ts` additions and production fail-fast block. OAuth state tokens are signed exclusively with this key.

---

## 3. Final Realtime Architecture

### 3.1 Process Topology

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Railway / ECS                                                               │
│                                                                              │
│  ┌─────────────────────────┐    ┌─────────────────────────┐                │
│  │  API Process (×N)        │    │  Worker Process (×M)     │               │
│  │  server.ts               │    │  worker.ts               │               │
│  │                          │    │                          │               │
│  │  Express HTTP            │    │  BullMQ Consumers        │               │
│  │  Socket.io Server        │    │  - webhook-processing    │               │
│  │  + Redis Adapter         │    │  - instagram-send        │               │
│  │                          │    │  - lead-import/export    │               │
│  │  initSocketServer(http)  │    │  - system                │               │
│  │  getSocketServer()       │    │                          │               │
│  │  emitToOrg()             │    │  RedisEmitter (startup)  │               │
│  │                          │    │  notificationPublisher   │               │
│  └────────────┬─────────────┘    └──────────┬───────────────┘               │
│               │                             │                                │
│               │  Socket.io Redis Adapter    │  @socket.io/redis-emitter     │
│               │  (subscribe + broadcast)    │  (publish only)               │
│               └─────────────────┬───────────┘                                │
│                                 │                                            │
└─────────────────────────────────┼────────────────────────────────────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │  Upstash Redis              │
                    │                             │
                    │  BullMQ queues (persistent) │
                    │  Socket.io adapter channel  │
                    │  (ephemeral pub/sub)         │
                    │  OAuth state nonces (TTL)   │
                    │  Session cache              │
                    └─────────────────────────────┘
```

### 3.2 Package Requirements

| Package | Process | Location |
|---------|---------|----------|
| `socket.io` | API | `apps/api/package.json` → `dependencies` |
| `@socket.io/redis-adapter` | API | `apps/api/package.json` → `dependencies` |
| `@socket.io/redis-emitter` | Worker | `apps/api/package.json` → `dependencies` |

`ioredis ^5.4.1` is already in `apps/api/package.json`. All three new packages use the existing Redis client infrastructure. No new Redis connection pooling needed.

---

### 3.3 How Worker → API Realtime Communication Works

The `@socket.io/redis-emitter` is not a Socket.io server. It is a thin Redis publisher that writes events to the **same Redis channel** that the Socket.io Redis adapter reads from. When the Worker publishes via the emitter, every API instance's Socket.io Redis adapter receives the message and broadcasts to its locally connected clients.

```
Worker Process
  │
  ├── processWebhookJob() → handleInstagram() → message saved, lead linked
  │
  └── notificationPublisher.notifyOrg(orgId, 'instagram:message', { conversationId, messageId })
        │
        └── redisEmitter.to(`org:${orgId}`).emit('instagram:message', data)
              │   [writes to Redis in Socket.io adapter wire format]
              ▼
           Redis (Upstash)
              │
              ├── API Instance 1 (Socket.io Redis Adapter receives)
              │     └── io.to(`org:${orgId}`).emit('instagram:message', data)
              │           → delivered to all clients in room 'org:{orgId}' on this instance
              │
              ├── API Instance 2 (same)
              │     └── delivered to clients connected to instance 2
              │
              └── API Instance N (same)
```

### 3.4 How Socket.io Events Reach Browser Clients

```
Browser (app.leados.app)
  │
  ├── After login: connectSocket(accessToken)
  │     └── socket.io-client connects to NEXT_PUBLIC_WS_URL (e.g. wss://api.leados.app)
  │           └── socket.handshake.auth = { token: accessToken }
  │
  └── Socket.io Server (API Process)
        └── socket-middleware.ts on 'connection':
              1. Verify JWT (token from handshake.auth)
              2. If valid: socket.join(`org:${decoded.orgId}`)
                           socket.data.userId = decoded.sub
                           socket.data.orgId  = decoded.orgId
              3. If invalid: socket.disconnect(true)

When an 'instagram:message' event arrives from Redis:
  API process → io.to(`org:${orgId}`).emit('instagram:message', data)
  → Socket.io delivers to all sockets in that room on this API instance
  → Client receives the event
  → React: useSocketEvent('instagram:message', handler)
           handler: queryClient.invalidateQueries({ queryKey: ['conversations'] })
```

> **A6 — Production hardening (NEXT_PUBLIC_WS_URL):** `apps/web/src/lib/socket/client.ts` falls back to `ws://localhost:4000` if `NEXT_PUBLIC_WS_URL` is unset. On HTTPS pages, browsers block mixed-content `ws://` connections silently. `connectSocket()` must throw (or log a fatal error) if `NODE_ENV === 'production'` and `NEXT_PUBLIC_WS_URL` is not set. Required Vercel env var: `NEXT_PUBLIC_WS_URL=wss://api.leados.app` (production) and `wss://api-staging.leados.app` (staging). This is a frontend env var — it is NOT in `apps/api/src/core/config/env.ts`.

### 3.5 Why This Works Across Multiple API Instances

Each browser WebSocket connection is stateful — it stays connected to exactly one API instance. The Socket.io Redis adapter ensures that an `emit` call on any API instance is forwarded to all other instances. The Worker, via `redis-emitter`, publishes once. Each API instance receives once. Each API instance broadcasts only to its locally connected clients. No duplication, no missed delivery.

**Multi-instance correctness proof:**
- 3 API instances: A, B, C
- 100 clients: 40 on A, 35 on B, 25 on C
- All 100 clients are in `org:xyz` room
- Worker publishes 1 event via redis-emitter
- Redis adapter delivers to A, B, C (each receives once)
- A broadcasts to its 40 clients, B to its 35, C to its 25
- All 100 clients receive the event exactly once ✓

### 3.6 New Files Required for Realtime (Adds to M1 Infrastructure)

| File | Process | Interface |
|------|---------|-----------|
| `apps/api/src/core/realtime/socket-server.ts` | API | `initSocketServer(http)`, `getSocketServer()`, `emitToOrg()` |
| `apps/api/src/core/realtime/socket-middleware.ts` | API | JWT auth + room join on connect |
| `apps/api/src/core/realtime/notification-publisher.ts` | Worker | `initNotificationPublisher()`, `notifyOrg(orgId, event, data)` |

`notification-publisher.ts` is a **new file not in the original M1 plan**. It initializes a `RedisEmitter` singleton at worker startup and exposes `notifyOrg()` for use by `handleInstagram()` and future workers.

`worker.ts` startup: calls `initNotificationPublisher()` (creates the `RedisEmitter` with the existing Redis URL).

`handleInstagram()` in M3: calls `notifyOrg(orgId, 'instagram:message', { conversationId, messageId })` — **replaces** the `eventBus.emitDurable` call entirely.

### 3.7 EventBus Role in Sprint 6

The in-process `eventBus` is **not used for cross-process Socket.io notification** in Sprint 6. Its role remains:
- In-process event coordination within a single process (API process only)
- No cross-process use

The M3 pipeline step ix becomes:
```
ix. Notify connected clients:
    await notifyOrg(orgId, 'instagram:message', { conversationId, messageId });
    // Direct Redis publish via @socket.io/redis-emitter
    // No BullMQ involvement; no eventBus involvement
    // Fire-and-forget: if Redis is unreachable, log warning and continue
    //   (Socket.io reconnect will trigger cache invalidation on reconnect)
```

The removed `emitDurable` to `QUEUE.INSTAGRAM_SEND` is also removed. The `instagram-send` queue is used only for outbound Meta API calls. The `notification-delivery` queue is not used for Socket.io notifications in Sprint 6 (it remains empty; reserved for email/push in Sprint 7).

### 3.8 Token Expiry and Reconnect

When the browser's access token expires, the Socket.io connection is dropped (the server calls `socket.disconnect(true)` on the next ping/message). The client-side socket must handle the `disconnect` event:
1. On `disconnect`: call the existing `POST /api/auth/refresh` flow
2. On successful refresh: call `disconnectSocket()` then `connectSocket(newToken)`

The `useSocketEvent` hook must register a `disconnect` listener that triggers the auth refresh. Document this in the `socket/client.ts` implementation notes. This is a required addition to the M5 socket wiring scope.

---

## 4. Final OAuth Architecture

### 4.1 Decision: Backend (API Server) Callback

**Final decision: `GET /api/instagram/callback` on the API server.**

Rationale:
- The auth code exchange requires `INSTAGRAM_APP_SECRET`. This must never traverse the browser.
- Blueprint doc 14 §14.2 shows a frontend-initiated flow, but the code exchange (steps 6–11) was always server-side. The disagreement is only about whether the browser collects the code first.
- The backend callback eliminates the browser as a relay for the auth code. This removes one attack vector (code leakage via referrer headers, browser history, intermediary proxies).
- `FINAL_ARCHITECTURE §0` states FINAL_ARCHITECTURE supersedes blueprint docs where they conflict. The FINAL_ARCHITECTURE §5 mandates the spike but does not constrain the callback location. This document, as the implementation contract, makes the final binding decision.

**Meta Developer Console registration:** The pre-registered OAuth redirect URI must be `https://api.leados.app/api/instagram/callback`. This must be set before any Meta sandbox testing. Do not register the frontend URL.

### 4.2 Final OAuth Flow

```
Step 1 — Initiation (authenticated, OWNER/ADMIN only)
─────────────────────────────────────────────────────
Browser → GET /api/v1/instagram/auth (Bearer token, requires org.connect_social)
  API:
    1. requireTenantContext() → { userId, orgId }
    2. nonce = crypto.randomUUID()
    3. redis.set(`oauth:state:${nonce}`, JSON.stringify({ userId, orgId }), 'EX', 900)
       [15-minute TTL; single Redis SET, not a JWT]
    4. state = jwt.sign({ nonce }, env.OAUTH_STATE_SECRET, { expiresIn: '15m' })
       [JWT wraps only the nonce — userId/orgId live in Redis, not in the browser-visible state param]
    5. redirectUrl = buildMetaOAuthUrl({ appId, redirectUri, scopes, state })
    6. Return { redirectUrl }

Browser → navigates to redirectUrl (leaves app.leados.app, goes to Meta)

Step 2 — Meta Auth
──────────────────
User approves → Meta redirects to:
  https://api.leados.app/api/instagram/callback?code={AUTH_CODE}&state={STATE_JWT}

Step 3 — Callback (public, no Bearer token)
────────────────────────────────────────────
GET /api/instagram/callback?code=...&state=...
  API:
    1. If ?error=access_denied (or any Meta error param) →
          redirect to https://app.leados.app/settings/integrations/instagram?error=ACCESS_DENIED
    2. Verify state JWT signature (OAUTH_STATE_SECRET) → if invalid/expired →
          redirect with ?error=INVALID_STATE
    3. Extract nonce from JWT payload
    4. stateData = redis.get(`oauth:state:${nonce}`) → if null (expired or replayed) →
          redirect with ?error=STATE_EXPIRED
    5. redis.del(`oauth:state:${nonce}`)  [single-use: delete immediately]
    6. { userId, orgId } = JSON.parse(stateData)
    7. Exchange code for short-lived token:
          GET /oauth/access_token?client_id=&client_secret=&redirect_uri=&code=
    8. Exchange short-lived for long-lived token (spike-confirmed exchange URL)
    9. Fetch IG user profile (igUserId, username, profilePictureUrl)
    10. withTenant(orgId, async (db) => {
            Check plan limit (PLAN_LIMITS[plan].instagramAccounts)
            INSERT INTO instagram_accounts ... ON CONFLICT (organizationId, igUserId) DO NOTHING
            Subscribe webhook
            Emit INSTAGRAM_ACCOUNT_CONNECTED activity
        })
    11. On plan limit exceeded → redirect with ?error=PLAN_LIMIT_EXCEEDED
    12. On duplicate account → redirect with ?error=ALREADY_CONNECTED (idempotent)
    13. On success → redirect to https://app.leados.app/settings/integrations/instagram?connected=1

Step 4 — Frontend Response
──────────────────────────
Frontend /settings/integrations/instagram page:
  - Reads ?connected=1 via useSearchParams() → shows success toast (useToast)
  - Reads ?error=... → shows error toast with human-readable message
  - Calls queryClient.invalidateQueries({ queryKey: ['instagram-accounts'] })
```

### 4.3 State Token Security Design

| Concern | Mechanism |
|---------|-----------|
| Signature forgery | JWT signed with `OAUTH_STATE_SECRET` (min 64 hex chars, separate from access token key) |
| Token replay | `nonce` stored in Redis with TTL; deleted on first use; second use finds no entry → rejected |
| Token expiry | JWT `exp` (15m) + Redis TTL (900s) — both must pass; JWT expiry is the primary check |
| Secret rotation | Rotating `OAUTH_STATE_SECRET` only invalidates pending OAuth sessions (≤15m window), not user sessions |
| State data in browser | Only the `nonce` is in the browser-visible state param (inside a JWT); `userId`/`orgId` are in Redis |
| CSRF | State param binds the callback to the initiating user; nonce is single-use |

### 4.4 New env.ts Variables (Final List for M1)

```
INSTAGRAM_APP_ID              z.string().min(1)     — required in production
INSTAGRAM_OAUTH_REDIRECT_URI  z.string().url()      — required in production; must match Meta console
FIELD_ENCRYPTION_KEY          z.string().min(64)    — hex-encoded 32-byte key; required in production
SOCKET_IO_CORS_ORIGIN         z.string().optional() — defaults to APP_WEB_ORIGIN
OAUTH_STATE_SECRET            z.string().min(64)    — hex-encoded 32-byte key; required in production
```

**A1 — Frontend env var (Vercel / `apps/web`, NOT `apps/api`):**

```
NEXT_PUBLIC_WS_URL            Vercel env var — wss://api.leados.app (production)
                                               wss://api-staging.leados.app (staging)
                                               ws://localhost:4000 (local dev, default)
```

This variable is consumed by `apps/web/src/lib/socket/client.ts`. It is NOT a Node.js/API env var. It must be set in the Vercel project settings for each environment. If unset in production, the browser silently falls back to `ws://localhost:4000`, which fails with a mixed-content error on HTTPS pages and produces no realtime events with no user-facing error.

**Note:** `INSTAGRAM_APP_SECRET` is already in `env.ts` with a dev default. It must be added to the production fail-fast block (alongside the new keys above and the existing JWT secrets).

**Production fail-fast block (extended):**
```typescript
if (env.NODE_ENV === 'production') {
  const required = [
    [env.JWT_ACCESS_SECRET,             'dev-access-secret-change-me',    'JWT_ACCESS_SECRET'],
    [env.JWT_REFRESH_PEPPER,            'dev-refresh-pepper-change-me',   'JWT_REFRESH_PEPPER'],
    [env.INSTAGRAM_APP_SECRET,          'test-ig-secret',                 'INSTAGRAM_APP_SECRET'],
    [env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN,'test-verify-token',              'INSTAGRAM_WEBHOOK_VERIFY_TOKEN'],
  ];
  // Plus: INSTAGRAM_APP_ID, INSTAGRAM_OAUTH_REDIRECT_URI, FIELD_ENCRYPTION_KEY,
  //       OAUTH_STATE_SECRET — these have no default, so z.string().min(1) suffices;
  //       missing will throw at schema validation before this block.
}
```

### 4.5 `org.connect_social` Permission — Final Decision

**Decision:** `org.connect_social` remains OWNER and ADMIN only. MANAGER is NOT granted this permission.

Rationale: Connecting an Instagram account creates a persistent integration that affects all agents in the org. This is an administrator-level action, not a manager-level one. The M1 plan's "confirm with PM" note is resolved here. `MANAGER_PERMISSIONS` is not modified for `org.connect_social`. The permission exists in `PERMISSION_CATALOG` and is granted via OWNER/ADMIN (which already receive all permissions).

**If PM later decides MANAGER should connect accounts:** add `org.connect_social` to `MANAGER_PERMISSIONS` in a future sprint. This is a one-line change.

---

## 5. Final Database Architecture

### 5.1 ActivityMetadata Discriminated Union — Final Additions

Four new interfaces must be added to `packages/shared/src/types/activity-metadata.ts` **as part of M1**, before any M3 service code is written. Adding `ActivityType` enum values without the corresponding metadata interfaces will break the exhaustive discriminated union gate.

> **A9 — Count correction:** Source-verified at HEAD: `prisma/schema.prisma` has **27** `ActivityType` values (19 Sprint 4 + 8 Sprint 5: DEAL_UPDATED + PIPELINE_CREATED/UPDATED/DELETED + PIPELINE_STAGE_CREATED/UPDATED/DELETED/REORDERED). `activity-metadata.ts` has **27** union members — all 27 types have corresponding interfaces. Sprint 6 adds 4 → **31 total** after Sprint 6. Any reference to "22 types" in prior documents reflects the count at Sprint 5 M1 approval and is superseded by this correction.

**Required additions:**

```typescript
// Instagram messaging events (Sprint 6)
export interface MessageReceivedMetadata {
  type: 'MESSAGE_RECEIVED';
  conversationId: string;
  messageId: string;
  igHandle?: string;        // sender's IG handle, if enriched
}

export interface MessageSentMetadata {
  type: 'MESSAGE_SENT';
  conversationId: string;
  messageId: string;
}

export interface InstagramAccountConnectedMetadata {
  type: 'INSTAGRAM_ACCOUNT_CONNECTED';
  igAccountId: string;
  igUsername: string;
}

export interface InstagramAccountDisconnectedMetadata {
  type: 'INSTAGRAM_ACCOUNT_DISCONNECTED';
  igAccountId: string;
  igUsername: string;
}
```

All four must be added to the `ActivityMetadata` union type.

**ActivityAppendInput — no change required.** Conversation-linked activities use the lead relation (`relatedLeadId`) with the `conversationId` stored in the metadata JSON. No `relatedConversationId` FK is added to the `activities` table in Sprint 6. This defers the conversation→activity relation to Sprint 7 alongside the pipeline relation.

### 5.2 `DEAL_UPDATED` Missing from `DomainEvent` — Cleanup Required in M1

**Confirmed gap:** `packages/shared/src/constants/events.ts` does not contain `DEAL_UPDATED` in the `DomainEvent` object (verified at HEAD). The `ActivityType` enum in `enums.ts` has `DEAL_UPDATED` at line 148. The Sprint 5 M3 signoff confirms it is emitted.

**Resolution:** Add `DEAL_UPDATED: 'DEAL_UPDATED'` to `DomainEvent` in `events.ts` as a cleanup item in M1 alongside the new Instagram event additions. Update `AllEvents` and `EventName` union. This closes a pre-existing gap that would cause Sprint 7 workflow triggers on deal updates to silently fail.

**Complete DomainEvent additions for M1 (events.ts):**

> **A10 — Expanded from readiness audit:** Source-verified: `events.ts` has 19 DomainEvent entries. `schema.prisma` has 27 ActivityType values. All 8 Sprint 5 additions are missing from DomainEvent. All must be added in M1 alongside the 4 Instagram events, as they are required for Sprint 7 workflow trigger conditions.

```
DEAL_UPDATED: 'DEAL_UPDATED'                               ← cleanup Sprint 5 gap
PIPELINE_CREATED: 'PIPELINE_CREATED'                       ← cleanup Sprint 5 gap
PIPELINE_UPDATED: 'PIPELINE_UPDATED'                       ← cleanup Sprint 5 gap
PIPELINE_DELETED: 'PIPELINE_DELETED'                       ← cleanup Sprint 5 gap
PIPELINE_STAGE_CREATED: 'PIPELINE_STAGE_CREATED'           ← cleanup Sprint 5 gap
PIPELINE_STAGE_UPDATED: 'PIPELINE_STAGE_UPDATED'           ← cleanup Sprint 5 gap
PIPELINE_STAGE_DELETED: 'PIPELINE_STAGE_DELETED'           ← cleanup Sprint 5 gap
PIPELINE_STAGE_REORDERED: 'PIPELINE_STAGE_REORDERED'       ← cleanup Sprint 5 gap
MESSAGE_RECEIVED: 'MESSAGE_RECEIVED'                       ← new Sprint 6
MESSAGE_SENT: 'MESSAGE_SENT'                               ← new Sprint 6
INSTAGRAM_ACCOUNT_CONNECTED: 'INSTAGRAM_ACCOUNT_CONNECTED'         ← new Sprint 6
INSTAGRAM_ACCOUNT_DISCONNECTED: 'INSTAGRAM_ACCOUNT_DISCONNECTED'   ← new Sprint 6
```

After these additions: `DomainEvent` will have 31 entries, matching the 31 `ActivityType` values (27 existing + 4 new). `AllEvents` and `EventName` union must include all 31.

### 5.3 `leads.instagramUserId` Uniqueness — Final Decision

**Decision: Add `@@unique([organizationId, instagramUserId])` to the Lead Prisma model.**

This constraint is added to `prisma/schema.prisma` and enforced via a new database index in migration 0015 (the inbox tables migration) as a secondary `CREATE UNIQUE INDEX` statement:

```sql
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  leads_org_ig_user_unique
  ON leads ("organizationId", "instagramUserId")
  WHERE "instagramUserId" IS NOT NULL;
```

**Why `CONCURRENTLY`:** The `leads` table is populated; a regular `CREATE UNIQUE INDEX` would lock the table. `CONCURRENTLY` builds without a write lock. Prisma's `@@unique` generates a non-concurrent index, so this must be written as raw SQL in the migration file, not via Prisma's schema syntax alone.

**Why `WHERE instagramUserId IS NOT NULL`:** PostgreSQL treats NULL as distinct in unique constraints (two NULLs don't violate a unique index). However, the partial index makes the intent explicit and avoids any question about null-handling behaviour. Existing leads without an IG account are unaffected.

> **A2 — Critical migration transaction mode requirement (from readiness audit):**
>
> `CREATE INDEX CONCURRENTLY` **cannot execute inside a PostgreSQL transaction block.** Prisma 5 runs migrations transactionally by default. Placing this statement inside migration 0015 (with the instagram_conversations and messages DDL) will produce:
> ```
> ERROR:  CREATE INDEX CONCURRENTLY cannot run inside a transaction block
> ```
>
> **Required migration split:**
>
> - `0015_inbox_tables` — creates `instagram_conversations` and `messages` tables (standard transactional migration — no pragma needed)
> - `0015b_leads_ig_unique_index` — contains ONLY the `CREATE UNIQUE INDEX CONCURRENTLY` statement; **must begin with the non-transactional pragma:**
>   ```sql
>   -- Prisma Migration not running in a transaction
>   CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
>     leads_org_ig_user_unique
>     ON leads ("organizationId", "instagramUserId")
>     WHERE "instagramUserId" IS NOT NULL;
>   ```
>   Because this migration runs non-transactionally, any failure leaves the index in an invalid state and requires manual cleanup (`DROP INDEX leads_org_ig_user_unique` before retrying). The index creation is idempotent (`IF NOT EXISTS`) so a retry after cleanup is safe.
>
> **Prisma schema `@@unique` handling:** Add `@@unique([organizationId, instagramUserId])` to the `Lead` model in `schema.prisma` for TypeScript type enforcement (enables the Prisma upsert API). Prisma will attempt to generate a non-partial unique index. In migration 0015b, replace Prisma's generated `CREATE UNIQUE INDEX` with the `CONCURRENTLY` + `WHERE` version shown above. Do not let Prisma execute its auto-generated DDL for this specific index.
>
> **Sequence for engineers:**
> 1. Run `prisma migrate dev --name inbox_tables` → generates 0015_inbox_tables (instagram_conversations + messages only; @@unique on Lead is NOT included here)
> 2. Manually create `0015b_leads_ig_unique_index` with the non-transactional pragma and CONCURRENTLY SQL
> 3. Run `prisma migrate resolve --applied 0015b_leads_ig_unique_index` if Prisma doesn't auto-detect it, OR let `prisma migrate deploy` handle it — the pragma ensures it runs non-transactionally

**M3 lead find-or-create pattern:** The `InstagramService` (or `InboxService`) uses Prisma's `upsert` on `{ organizationId_instagramUserId: { organizationId, instagramUserId } }` unique compound key, OR uses a SELECT → CREATE inside a `withTenant` transaction with the unique constraint as the DB-level guard against concurrent creation. On constraint violation: catch Prisma `P2002` error and re-query to find the existing lead. This is the standard create-or-find pattern.

### 5.4 Migration 0016 FK — Final Strategy

Migration 0016 adds:
```sql
ALTER TABLE leads
  ADD CONSTRAINT leads_instagram_account_id_fkey
  FOREIGN KEY ("instagramAccountId") REFERENCES instagram_accounts(id)
  ON DELETE SET NULL
  NOT VALID;
```

**`NOT VALID` is mandatory.** This prevents a full table scan for constraint validation (which would acquire a `ShareRowExclusiveLock` and block writes on a busy `leads` table). The constraint is enforced for new writes immediately; existing rows are not validated at migration time.

**Validation step** (separate, run in a low-traffic window after migration 0016 is deployed):
```sql
ALTER TABLE leads VALIDATE CONSTRAINT leads_instagram_account_id_fkey;
```
This step acquires only `ShareUpdateExclusiveLock` (doesn't block writes). It can be run via a separate `prisma migrate` step or directly via psql.

Add a comment in migration 0016: `-- VALIDATE CONSTRAINT must be run separately in a low-traffic window`.

### 5.5 SavedReply Table — Pre-Existing Schema Confirmed

**`saved_replies` table already exists** in production (confirmed: `SavedReply` model at `prisma/schema.prisma:729-744`, in `TENANT_TABLES` since Sprint 4 M1). The existing schema has all required fields: `id`, `organizationId`, `title`, `content`, `shortcut`, `isGlobal`, `createdById`, `createdAt`, `updatedAt`, `deletedAt`.

**M6 work for saved replies is API-layer only.** No new migration is needed. The `inbox.service.ts` and `inbox.routes.ts` files create the CRUD HTTP layer over the existing schema. Explicitly: do not write a migration for `saved_replies` in Sprint 6.

The `SavedReply` model fields are compatible with the Sprint 6 inbox saved-replies feature (title, content, shortcut are exactly the needed fields).

### 5.6 MessageStatus Enum — No Conflict

`MessageStatus` (`SENT | DELIVERED | READ | FAILED`) is a new Postgres enum type. `WebhookEventStatus` (`PENDING | PROCESSING | DONE | FAILED | SKIPPED`) is an existing enum type. Both have `FAILED` as a value name, but they are different Postgres types. No conflict at the DB or TypeScript level. No action required.

`MessageDirection` (`INBOUND | OUTBOUND`) already exists in `enums.ts` and `schema.prisma`. Do not re-declare it. Reference the existing enum in the new models.

### 5.7 Final New Prisma Enum Summary (M1)

```
InstagramAccountStatus  { ACTIVE, EXPIRED, DISCONNECTED }          — new
ConversationStatus      { OPEN, CLOSED }                           — new
MessageStatus           { SENT, DELIVERED, READ, FAILED }          — new
ActivityType            ADD VALUE 'MESSAGE_RECEIVED'               — additive
ActivityType            ADD VALUE 'MESSAGE_SENT'                   — additive
ActivityType            ADD VALUE 'INSTAGRAM_ACCOUNT_CONNECTED'    — additive
ActivityType            ADD VALUE 'INSTAGRAM_ACCOUNT_DISCONNECTED' — additive
```

`MessageDirection` is already present (`INBOUND | OUTBOUND`). Do not re-add.

### 5.8 Messaging Window Duration — Named Constant Required

The 24-hour window check in M4 `InboxService.sendMessage()` must use a named constant:

```typescript
// In packages/shared/src/constants/instagram.ts (new file in M1)
export const INSTAGRAM_MESSAGING_WINDOW_HOURS = 24; // spike-confirmed; update if spike finds differently
export const INSTAGRAM_MESSAGING_WINDOW_MS = INSTAGRAM_MESSAGING_WINDOW_HOURS * 60 * 60 * 1000;
```

The window check: `conversation.lastInboundAt.getTime() > Date.now() - INSTAGRAM_MESSAGING_WINDOW_MS`.

If the spike confirms the window is 7 days (or another duration), only this constant changes. No search-and-replace across the codebase.

---

## 6. Final Deployment Architecture

### 6.1 Service Topology

```
Cloudflare DNS/WAF
  ├── app.leados.app  → Vercel (Next.js 15 + BFF route handlers)
  └── api.leados.app  → Railway
        ├── API Service (×N replicas)
        │     Runs: node dist/server.js
        │     Starts: Express HTTP + Socket.io + Redis Adapter
        │
        └── Worker Service (×M replicas)
              Runs: node dist/worker.js
              Starts: BullMQ consumers + RedisEmitter
```

**Package additions to `apps/api/package.json → dependencies`:**
- `socket.io` — for the API process Socket.io server
- `@socket.io/redis-adapter` — for multi-instance Socket.io via Redis
- `@socket.io/redis-emitter` — for the Worker process to emit Socket.io events

All three use the existing `ioredis` client. No new Redis connection configuration.

### 6.2 Behaviour with N API Replicas

**WebSocket connection:** Each browser client connects to exactly one API instance via Railway's load balancer.

> **A7 — Sticky session clarification:** Since the web client configures `transports: ['websocket']` only (no HTTP long-polling fallback), **sticky sessions are NOT required for correctness.** The WebSocket upgrade is a single HTTP request followed by a persistent TCP connection; there is no subsequent HTTP polling that needs to reach the same instance. The Socket.io Redis adapter handles cross-instance event fan-out regardless of which API instance holds the WebSocket connection. Do not add sticky session configuration to Railway — it is unnecessary and adds complexity.

**Emit from any instance:** When any API instance receives a Redis notification (from the worker via `redis-emitter`) via the Redis adapter, it emits to its locally connected clients. All other instances also receive the Redis message and emit to their clients. This is the intended Socket.io Redis adapter behaviour.

**No shared state between API instances** is required. Each instance independently:
- Verifies JWTs on WebSocket connect
- Joins clients to `org:{orgId}` rooms
- Receives Redis adapter messages and emits to local clients

### 6.3 Behaviour with M Worker Replicas

BullMQ provides atomic job locking — exactly one worker picks up each job. When worker instance W1 processes a DM:
1. W1 calls `notifyOrg(orgId, 'instagram:message', data)`
2. W1's `RedisEmitter` publishes once to Redis
3. All N API instances receive once and broadcast to their clients

**No duplicate notifications:** Each DM job is processed by exactly one worker (BullMQ lock). One processing = one publish = one delivery per connected client.

### 6.4 Socket.io CORS Configuration

The Socket.io server `initSocketServer()` must set:
```
cors: {
  origin: env.SOCKET_IO_CORS_ORIGIN ?? env.APP_WEB_ORIGIN,
  methods: ['GET', 'POST'],
  credentials: true
}
```

Railway deployment: set `SOCKET_IO_CORS_ORIGIN=https://app.leados.app` in the API service environment variables before M1 is deployed.

### 6.5 Railway Rolling Deploy

Before M1 infrastructure is deployed, confirm Railway API service has ≥2 replicas configured for rolling restarts. The `socket.io` package installation requires a Docker rebuild. Rolling restarts ensure zero downtime: Railway takes down one old instance only after the new one passes health checks.

### 6.6 Staging Environment Requirement

A staging environment (separate Railway service, separate Meta app) is required before App Review submission. The staging OAuth redirect URI (`https://api-staging.leados.app/api/instagram/callback`) must be registered with a separate Meta sandbox app. Production and staging must use separate `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET` values.

**Timeline:** Staging environment must exist by M5 exit criteria date (Day 10). Meta App Review submission happens on Day 10 or after.

---

## 7. Final Testing Strategy

### 7.1 Required Test Matrix

#### M1 Tests

| File | Type | Tests Required |
|------|------|----------------|
| `core/crypto/field-encryption.test.ts` | Unit | (1) encrypt→decrypt round-trip; (2) wrong key throws; (3) key version prefix `v1:` in output; (4) empty string input; (5) output format stability (parse `v{n}:{iv}:{tag}:{ct}`); (6) **tampered ciphertext throws** (AEAD assertion) |
| `core/realtime/socket-middleware.test.ts` | Unit | (1) valid JWT → joins `org:{orgId}` room; (2) expired JWT → disconnect; (3) malformed JWT → disconnect; (4) suspended org token → disconnect; (5) socket.data populated correctly |
| `core/realtime/notification-publisher.test.ts` | Unit | (1) `notifyOrg` publishes to Redis; (2) init required before publish (throws if not init'd) |

#### M2 Tests

| File | Type | Tests Required |
|------|------|----------------|
| `tests/integration/instagram-oauth.integration.test.ts` | Integration | (1) `GET /api/v1/instagram/auth` → 401 without token; (2) → 403 with SALES_EXECUTIVE; (3) → 200 with OWNER, returns `redirectUrl` with state param; (4) `GET /api/instagram/callback` with valid state → account created, token encrypted `v1:...`; (5) expired state JWT → redirect `?error=STATE_EXPIRED`; (6) invalid state signature → redirect `?error=INVALID_STATE`; (7) replayed state (second call same nonce, nonce deleted from Redis) → redirect `?error=STATE_EXPIRED`; (8) `GET /api/v1/instagram/accounts` → returns account with status ACTIVE; (9) `DELETE /api/v1/instagram/accounts/:id` → status DISCONNECTED; (10) TRIAL plan + 2nd account → redirect `?error=PLAN_LIMIT_EXCEEDED`; (11) **token plaintext not in DB** (query raw column, assert starts with `v1:`) |

#### M3 Tests

| File | Type | Tests Required |
|------|------|----------------|
| `tests/integration/inbox-receive.integration.test.ts` | Integration | (1) single DM → message + conversation + lead created; (2) duplicate DM (same mid) → no-op (1 row); (3) unknown recipientId → no error, batch continues; (4) multi-entry (2 entries × 1 message) → 2 rows; (5) multi-message single entry (1 entry × 2 messaging events) → 2 rows; (6) existing lead matched by instagramUserId → conversation linked to existing lead; (7) concurrent DMs same conversation (`Promise.all([processWebhook(dm1), processWebhook(dm2)])`) → 1 conversation, 2 messages, no exception; (8) cross-org RLS: org A cannot see org B conversations; (9) `GET /inbox/conversations` → returns conversations with correct pagination; (10) `GET /inbox/conversations` with `inbox.read_own` + unassigned → 0 results; (11) `GET /inbox/conversations/:id/messages` → messages in sentAt DESC order |

#### M4 Tests

| File | Type | Tests Required |
|------|------|----------------|
| `tests/integration/inbox-send.integration.test.ts` | Integration | (1) `POST /inbox/conversations/:id/messages` → 201, messages row created with status SENT; (2) `lastInboundAt > WINDOW` → 409 WINDOW_CLOSED; (3) `lastInboundAt = WINDOW boundary` → 409 (boundary test); (4) `lastInboundAt < WINDOW` → 201 (just-inside-window); (5) feature flag disabled → 503 FEATURE_DISABLED; (6) `inbox.reply_own` on unassigned conversation → 403; (7) status webhook delivered → `messages.status = DELIVERED`, `deliveredAt` set; (8) status webhook read → `messages.status = READ`, `readAt` set; (9) first outbound → `conversation.firstResponseAt` set; (10) second outbound → `conversation.firstResponseAt` NOT updated (SLA immutability) |

#### M5 Tests

| File | Type | Tests Required |
|------|------|----------------|
| `api-client.test.ts` (unit) | Unit | (1) 401 triggers one refresh call; (2) refresh success → retry original request with new token; (3) refresh fails → redirect to /login; (4) `_retried` flag prevents infinite loop (no second retry); (5) non-401 errors are not retried |
| `InboxPage.test.tsx` | Component | (1) three-panel layout renders; (2) selecting a conversation loads thread; (3) window-expired conversation shows banner (not compose bar) |
| `ConversationList.test.tsx` | Component | (1) renders provided conversations; (2) unread dot visible on unread; (3) active conversation is highlighted |
| `ConversationItem.test.tsx` | Component | (1) shows name, preview, timestamp; (2) unread dot presence/absence |
| `ComposeBar.test.tsx` | Component | (1) calls onSend with text on Cmd+Enter; (2) send button disabled when empty; (3) window expired → shows WindowExpiredBanner, not textarea |
| `MessageBubble.test.tsx` | Component | (1) INBOUND aligns left; (2) OUTBOUND aligns right; (3) failed status shows retry |
| `useConversations.test.ts` | Hook | (1) cursor=null initial page; (2) getNextPageParam returns nextCursor; (3) filter params passed to API |
| `useSendMessage.test.ts` | Hook | (1) optimistic insert on mutate; (2) rollback on error; (3) invalidates conversations query on success |
| `bff/inbox/conversations/route.test.ts` | BFF | (1) no cookie → 401; (2) valid cookie → proxies GET to API; (3) POST proxies and returns 201 |

#### M6 Tests

| File | Type | Tests Required |
|------|------|----------------|
| `bff-auth.test.ts` | Unit | (1) `resolveAccessToken` returns token from valid cookie; (2) returns null when cookie missing; (3) handles refresh failure gracefully |
| `tests/integration/inbox-saved-replies.integration.test.ts` | Integration | (1) `GET /saved-replies` → returns list; (2) `GET /saved-replies?q=shortcut` → filters by shortcut; (3) `POST /saved-replies` → creates; (4) `PATCH /saved-replies/:id` → updates; (5) `DELETE /saved-replies/:id` → soft-deletes; (6) cross-org isolation |

#### Cross-Milestone Security/RLS Tests

| Test | What |
|------|------|
| `check:rls` after M1 | 22 tables (19 existing + 3 new: instagram_accounts, instagram_conversations, messages) |
| Cross-org message access | GET /inbox/conversations from org B → 0 results for org A's conversations |
| Cross-org account access | GET /api/v1/instagram/accounts from org B → 0 results for org A's accounts |
| RLS on `messages` table | SELECT on messages table with wrong GUC → 0 rows |
| Token not plaintext | Raw DB query on `instagram_accounts.accessToken` → starts with `v1:`, never with `EAAxx` (Meta token prefix) |

### 7.2 Coverage Requirements

| Module | Minimum Branch Coverage |
|--------|------------------------|
| `core/crypto/field-encryption.ts` | 100% |
| `core/realtime/socket-server.ts` | 80% |
| `core/realtime/socket-middleware.ts` | 90% |
| `modules/instagram/` | 70% |
| `modules/inbox/` | 70% |
| `workers/instagram-send.worker.ts` | 70% |

Global threshold remains 60% (not regressed from Sprint 5).

---

## 8. UI/UX Compliance Report

**Audit against `SPRINT_6_UI_UX_PLAN.md`**

### 8.1 Design System Compliance — APPROVED

The `SPRINT_6_UI_UX_PLAN.md` is source-code verified and complete. All new Sprint 6 components are specified using tokens-only Tailwind classes. No new color palette is introduced.

| Requirement | Status | Evidence |
|------------|--------|---------|
| Dark-first theme preserved | COMPLIANT | All component specs use `bg-bg-*`, `text-text-*`, `border-*` token classes |
| No hardcoded hex values | COMPLIANT | §4 explicitly prohibits hex in component files; §7 acceptance criterion 1 |
| No new design system | COMPLIANT | §2 maps every new component to an existing component source |
| Reuse Button, Modal, Tabs, Badge, Select, Spinner, Toast | COMPLIANT | §3 component-to-pattern mapping table; §4 prohibition list |
| Existing spacing and typography | COMPLIANT | §1.5 form patterns; §1.3 layout patterns identical to existing pages |
| No new icon library | COMPLIANT | §4 explicit prohibition; plan uses emoji and plain text characters |
| No skeleton loaders | COMPLIANT | §4 explicit prohibition; Spinner only |
| No `transition-all` | COMPLIANT | §4 explicit prohibition; only `transition-colors` |

### 8.2 Component Inventory — Verified

| Component | Pattern Source | Status |
|-----------|---------------|--------|
| `InboxPage.tsx` | `DealDetailPage.tsx` two-panel → extended to 3-panel | COMPLIANT |
| `ConversationList.tsx` | `LeadFilters.tsx` + `LeadTable.tsx` | COMPLIANT |
| `ConversationItem.tsx` | `LinkedDealsPanel.tsx` link-card row | COMPLIANT |
| `ThreadView.tsx` | `LeadActivityFeed.tsx` scroll + sentinel | COMPLIANT |
| `MessageBubble.tsx` (INBOUND) | `DealCard.tsx` card anatomy | COMPLIANT |
| `MessageBubble.tsx` (OUTBOUND) | `Button variant="primary"` bg-primary-600 | COMPLIANT |
| `ComposeBar.tsx` | `LeadNotesList.tsx` textarea + button row | COMPLIANT |
| `WindowExpiredBanner.tsx` | `Badge variant="stale"` warning glass `bg-yellow-500/15` | COMPLIANT |
| `ConversationHeader.tsx` | `DealDetailPage.tsx` header row | COMPLIANT |
| `InstagramAccountCard.tsx` | `LinkedDealsPanel.tsx` deal row | COMPLIANT |
| `CreateLeadModal.tsx` | `AddDealModal.tsx` form in Modal | COMPLIANT |
| Sidebar Inbox nav entry | Existing nav item pattern (`DashboardLayout`) | COMPLIANT |
| Settings `/settings/integrations/instagram` | `LeadListPage.tsx` page structure | COMPLIANT |

### 8.3 Potential Violations — All Addressed

| Risk | Addressed In |
|------|-------------|
| Inbox viewport-filling escapes `p-6` padding | §6 of UI/UX plan documents `-m-6` override; this is a layout exception, not a design system violation |
| `SavedReplyPicker.tsx` floating panel | §2.10 specifies it using existing Select content aesthetic; deferred to M6 (no implementation risk in M5) |
| Unread count badge in sidebar nav | §2.1 specifies using `bg-primary-500/15 text-primary-400 border border-primary-500/30` — the existing glass pattern |
| Message bubble OUTBOUND uses `bg-primary-600` | §2.6 documents this as `Button variant="primary"` colour applied to bubble; intentional brand extension, not a new colour |

### 8.4 UI/UX Acceptance Gate

Milestone M5 cannot be signed off unless ALL of the following pass:

1. `grep -r '"#\|'"'"'#' apps/web/src/components/inbox/` returns zero results
2. All `ui/` primitives are imported from `@/components/ui/` (not reimplemented inline)
3. Page heading uses `text-xl font-semibold text-text-primary` exclusively
4. Inbox page degrades to single-column on `< lg` screens (screenshot required)
5. Active nav state uses `bg-bg-subtle text-text-primary` (same as existing nav items)
6. No skeleton loaders in any new component (use `<Spinner>` only)

---

## 9. Sprint-by-Sprint Approval Matrix

### M1 — Meta API Spike + Infrastructure + Schema

**Verdict: APPROVED WITH CHANGES**

Original M1 is correct in scope and sequencing. The following changes are mandatory:

| Change | Why |
|--------|-----|
| Add `notification-publisher.ts` to M1 files-to-create | Required for cross-process Socket.io notification (AR-1 resolution) |
| Add `@socket.io/redis-emitter` to M1 new packages | Worker needs this to publish events to Redis |
| Replace `OAUTH_STATE_SECRET` for env.ts additions (remove `ACCESS_SECRET` usage) | B-3 resolution |
| Add 4 `ActivityMetadata` interfaces to `activity-metadata.ts` modifications | SR-1 resolution |
| Add all 12 missing DomainEvent entries to events.ts (DEAL_UPDATED + 7 PIPELINE_* + 4 Instagram) | A10: complete event bus coverage for Sprint 7 workflow triggers |
| Add `instagramAccounts.ts` constants file to `packages/shared/src/constants/` | Named window constant |
| Add `socket-middleware.test.ts` to M1 test file list | TG-1 resolution |
| `INSTAGRAM_APP_SECRET` moved to production fail-fast block | SEC-3 resolution |
| `INSTAGRAM_APP_ID`, `INSTAGRAM_OAUTH_REDIRECT_URI`, `FIELD_ENCRYPTION_KEY`, `OAUTH_STATE_SECRET` added to production fail-fast | Security hardening |
| `notification-publisher.test.ts` added to M1 test file list | TG coverage |
| **A3 — OVERRIDE:** Do NOT add `org.connect_social` to `MANAGER_PERMISSIONS`. The execution plan M1 files-to-modify (permissions.ts line) includes this — it is **superseded by §4.5 of this signoff**. Only OWNER and ADMIN may connect Instagram accounts. MANAGER_PERMISSIONS must NOT receive `org.connect_social`. | Security/RBAC decision per §4.5 |
| Add `pnpm --filter @leados/api check:enum-parity` to M1 acceptance criteria (alongside existing `check:rls`) | A11: CI gate enforces enums.ts ↔ schema.prisma parity after new ActivityType and InstagramAccountStatus/ConversationStatus/MessageStatus additions |
| Add `packages/shared/src/errors/error-codes.ts` to M1 files-to-modify: add `INSTAGRAM_ACCOUNT_NOT_FOUND`, `INSTAGRAM_ACCOUNT_EXPIRED`, `WINDOW_CLOSED`, `FEATURE_DISABLED`, `INVALID_OAUTH_STATE`, `DUPLICATE_INSTAGRAM_ACCOUNT` | A12: required before any handler returns these codes |

No M2 code is written before the spike findings document is signed off. M1-B infrastructure and schema work can proceed in parallel with the spike.

---

### M2 — Instagram OAuth + Account Management

**Verdict: APPROVED WITH CHANGES**

| Change | Why |
|--------|-----|
| OAuth state uses Redis nonce + OAUTH_STATE_SECRET JWT (not ACCESS_SECRET) | B-3, SEC-1 resolution |
| OAuth callback at `GET /api/instagram/callback` (API server, confirmed) | AR-4 resolution |
| **All callback error responses are browser redirects** — `?error=STATE_EXPIRED`, `?error=INVALID_STATE`, `?error=ALREADY_CONNECTED`, `?error=PLAN_LIMIT_EXCEEDED`, `?error=ACCESS_DENIED`. **Zero JSON error responses from the callback endpoint.** The execution plan M2 test cases 5–6 expect JSON 400/409 — these are superseded by the redirect design in §4.2. Integration tests must assert `res.headers.location` contains the error param, not assert HTTP status 400/409. | A4: BLOCKER 3 resolution |
| Replay protection: delete nonce from Redis on first use; second use → redirect `?error=STATE_EXPIRED` | SEC-1 hardening |
| `org.connect_social` granted only to OWNER/ADMIN (not MANAGER) — see A3 override in M1 | §4.5 of this document |
| Add replay-attack test (seventh test case in M2 integration test list) | TG resolution |
| Webhook subscription failure: retry via `QUEUE.WEBHOOK_PROCESSING` with job name `'instagram-webhook-subscribe'`; payload `{ igUserId, accessToken, orgId }`; add dispatch branch to `webhook.worker.ts` | A13: not `instagram-send` queue; specifies job name |

---

### M3 — Receive Pipeline

**Verdict: APPROVED WITH CHANGES**

| Change | Why |
|--------|-----|
| Replace step ix `eventBus.emitDurable(QUEUE.INSTAGRAM_SEND, 'notify-new-message')` with `notifyOrg(orgId, 'instagram:message', ...)` | AR-1, AR-2 resolution |
| Lead enrichment (step vi) is **always deferred** — enqueue to a new `instagram-enrich` job in `QUEUE.WEBHOOK_PROCESSING` | SCALE-1 resolution |
| `instagramUserId` unique constraint: use `@@unique([organizationId, instagramUserId])` in Prisma schema + partial index in **migration 0015b** (non-transactional, CONCURRENTLY — see §5.3 A2) | SR-2 resolution |
| Lead find-or-create: Prisma upsert on the unique compound key; catch P2002 and re-query | SR-2 resolution |
| **A5 — CORRECTION:** `instagram-enrich` job goes to **`QUEUE.WEBHOOK_PROCESSING`** (NOT the system queue). Add a new dispatch case `'instagram-enrich':` in `webhook.worker.ts`. Enqueue from `handleInstagram()` after saving the message: `await enqueue(QUEUE.WEBHOOK_PROCESSING, 'instagram-enrich', { conversationId, senderIgUserId, leadId, orgId, igAccountId })`. The system queue is for platform-level cron jobs only. | A5: fixes wrong queue assignment from original M3 |
| Add concurrent DM test (`Promise.all`) | TG-2 resolution |
| `extractInstagramEventId` hash fallback: replace `Date.now()` with SHA-256 of raw payload body | SEC-4 resolution |

**Note on `extractInstagramEventId` fix (SEC-4):** The fix belongs in `webhook.controller.ts` (controller layer, before persist). The M3 rewrite of `handleInstagram()` does NOT fix this — the controller is where dedup IDs are generated. The fix: pass `rawBody: Buffer` reference to `extractInstagramEventId` and use `crypto.createHash('sha256').update(rawBody).digest('hex').slice(0, 32)` as fallback for empty/malformed entries. Add this to M3's files-to-modify list for `webhook.controller.ts`.

---

### M4 — Send Pipeline + Status Webhooks

**Verdict: APPROVED WITH CHANGES**

| Change | Why |
|--------|-----|
| Status webhook handling lives in `webhook.worker.ts:handleInstagram()`, NOT in `webhook.controller.ts` | SEC-2 clarification |
| `webhook.controller.ts` does not need a new handler for status webhooks — same controller, same endpoint, different message types in the worker | SEC-2 |
| M4 files-to-modify: remove `webhook.controller.ts` from M4 list; add `webhook.worker.ts` as the location for status handling | SEC-2 |
| Rate limit config: treat as required spike output — the `max` and `duration` values for BullMQ rate limiter must come from `SPRINT_6_M1_SPIKE_FINDINGS.md` | SCALE-3 |
| Window duration uses `INSTAGRAM_MESSAGING_WINDOW_MS` from `packages/shared/src/constants/instagram.ts` | SR in §5.8 |
| Add boundary-condition tests for window expiry | TG-5 resolution |

---

### M5 — Social Inbox Frontend

**Verdict: APPROVED WITH CHANGES**

| Change | Why |
|--------|-----|
| `SavedReplyPicker.tsx` is **deferred to M6** — removed from M5 files-to-create | SC-2 resolution |
| Add `useConversations.test.ts` and `useSendMessage.test.ts` to M5 files-to-create | SC-3 resolution |
| Add `api-client.test.ts` to M5 test list | TG-4 resolution |
| Socket disconnect handler: when socket disconnects, trigger token refresh and reconnect with new token | §3.8 of this document |
| Cursor pagination: cursor = `{ lastMessageAt, id }` compound (not single-field) | SCALE-2 resolution |
| `connectSocket()` and `disconnectSocket()` wired in auth store (not just after login); socket wires to `'connect'` event → invalidate `['conversations']` query on reconnect | §3.8 |
| UI/UX acceptance gate (Section 8.4 of this document) must pass before M5 can be signed off | UI compliance |

---

### M6 — Hardening + App Review Prep

**Verdict: APPROVED WITH CHANGES**

| Change | Why |
|--------|-----|
| Saved replies: **no new migration** — table already exists with correct schema | SC-1 resolution |
| M6 saved replies work: create `inbox.service.ts` methods for saved replies CRUD using existing `SavedReply` Prisma model | SC-1 |
| Add `SavedReplyPicker.tsx` to M6 (moved from M5) | SC-2 resolution |
| Wire `SavedReplyPicker` in M6's `ComposeBar.tsx` modification | SC-2 |
| `check:rls` after M6: still 22 tables (no new tables in M6) | Verification |
| Staging environment confirmed live before M6 App Review checklist items | DR-1 |

---

## 10. Go / No-Go Decision

### Pre-Conditions Assessment

| Gate | Status |
|------|--------|
| Sprint 5 M1 APPROVED | ✓ PASS |
| Sprint 5 M2 NOT APPROVED → formally re-graded | ✓ RESOLVED (deferral in §2 of this document) |
| Sprint 5 M3 APPROVED | ✓ PASS |
| Sprint 5 M4 APPROVED | ✓ PASS |
| Sprint 5 M5 APPROVED | ✓ PASS |
| Sprint 5 M6 APPROVED (via M6 review doc) | ✓ PASS |
| Cross-process realtime architecture resolved | ✓ RESOLVED (§3) |
| OAuth callback URL decided and documented | ✓ RESOLVED (§4) |
| OAuth state secret boundary violation fixed | ✓ RESOLVED (§4.3) |
| Activity metadata discriminated union additions listed | ✓ RESOLVED (§5.1) |
| `DEAL_UPDATED` DomainEvent gap addressed | ✓ RESOLVED (§5.2) |
| `leads.instagramUserId` uniqueness decided | ✓ RESOLVED (§5.3) |
| Migration 0016 `NOT VALID` strategy documented | ✓ RESOLVED (§5.4) |
| SavedReply pre-existing schema confirmed (no migration needed in M6) | ✓ RESOLVED (§5.5) |
| Messaging window as named constant | ✓ RESOLVED (§5.8) |
| Deployment topology decided (co-located Socket.io + API) | ✓ RESOLVED (§6) |
| Railway CORS config for Socket.io documented | ✓ RESOLVED (§6.4) |
| Full test matrix defined | ✓ RESOLVED (§7) |
| UI/UX compliance verified and acceptance gate defined | ✓ RESOLVED (§8) |
| Facebook Business Verification: started (pre-sprint gate) | EXTERNAL — must be confirmed by PM |
| Sandbox Meta app created | EXTERNAL — must be confirmed by engineer |
| Staging environment plan exists | EXTERNAL — must be confirmed by infra |

### Hard Blockers Before M1-B Begins

The spike (M1-A) may begin immediately. The following must be resolved before M1-B infrastructure code is written:

1. ✅ Cross-process notification: use `@socket.io/redis-emitter` (decided in §3)
2. ✅ OAuth state secret: use `OAUTH_STATE_SECRET` (decided in §4)
3. ✅ Sprint 5 M2 deferral: formally documented (§2)
4. ☐ Facebook Business Verification initiated (external — PM action)
5. ☐ Meta sandbox app created with `api.leados.app/api/instagram/callback` registered as OAuth redirect URI
6. ☐ Staging environment path decided (DR-1)

Items 4–6 are external/administrative gates; they do not block M1-B technical implementation but do block any actual Meta API testing and the App Review submission.

---

## VERDICT

```
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║                           G O                                    ║
║                                                                  ║
║  Sprint 6 is approved to begin implementation.                   ║
║                                                                  ║
║  All three blocking architectural issues are resolved in this    ║
║  document. All schema risks have final decisions. The testing    ║
║  matrix is complete. UI/UX compliance is verified.               ║
║                                                                  ║
║  Implementation must follow this document, not the execution     ║
║  plan, where the two conflict.                                   ║
║                                                                  ║
║  The spike (M1-A) begins immediately.                            ║
║  M1-B begins after spike sign-off AND after the external         ║
║  administrative gates (items 4–6 above) are confirmed.           ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

---

*Architecture authority: all implementation decisions in Sprint 6 derive from this document. Questions about architecture during implementation are resolved by the Principal Engineer against this document, not by re-reading the execution plan.*
