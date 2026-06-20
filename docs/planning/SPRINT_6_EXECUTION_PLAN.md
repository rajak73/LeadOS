# Sprint 6 Execution Plan — Instagram Inbox

**Author:** Principal Engineer audit
**Date:** 2026-06-21
**Sprint:** Weeks 11–12
**Based on:** SPRINT_6_READINESS_REVIEW.md findings, verified against source code at HEAD (`1bf88db`)
**Status:** PLAN — do not begin implementation until M1 spike is complete

---

## How to Read This Plan

Each milestone lists scope, files to create, files to modify, migrations, endpoints, tests, risks, acceptance criteria, and exit criteria. The plan is prescriptive at the file level because ambiguity at the planning stage creates architecture drift at implementation time.

**Implementation order is not negotiable:** M2 must not start until the spike document from M1 is signed off. Every other sequential dependency is noted explicitly. Where parallelism is safe it is called out.

---

## Pre-Sprint Checklist (Complete Before Day 1)

These are not "M1 tasks" — they are administrative gates that block the sprint from starting.

| Gate | Owner | Blocking |
|------|-------|---------|
| Facebook Business Verification initiated with Meta | PM/Founder | Unblocks App Review submission (external 1–4 week process, start immediately) |
| Meta sandbox test app created (Instagram API with Instagram Login) | Engineer | Required for spike to proceed |
| Sandbox Instagram account created for receiving/sending test DMs | Engineer | Required for spike |
| `INSTAGRAM_APP_ID` + `INSTAGRAM_APP_SECRET` from sandbox app in dev `.env` | Engineer | Required for OAuth spike |
| Decision on deploy topology: is Socket.io in the same Railway service as the API or separate? | Tech lead | Determines `socket-server.ts` initialization pattern |

---

## Readiness Review Findings: Classification

The following table classifies every finding from `SPRINT_6_READINESS_REVIEW.md` before the plan addresses each one.

| Finding | Real blocker? | Risk class | Addressed in |
|---------|--------------|------------|-------------|
| No Meta API validation spike | Yes — code built on wrong assumptions is a rewrite | P0 | M1 |
| `socket.io` not installed in API | Yes — realtime tier is the inbox's core value | P0 | M1 |
| No AES-256-GCM utility | Yes — cannot store OAuth tokens without it | P0 | M1 |
| `env.ts` missing IG vars + `FIELD_ENCRYPTION_KEY` | Yes — processes start silently broken | P0 | M1 |
| `CRON_REGISTRY` empty | Yes — token refresh will never run | P1 | M2 |
| Webhook `[0]`-only message extraction | Yes — multi-message batches drop messages | P1 | M3 |
| `instagram-send` worker not implemented | Yes — send is impossible without it | P1 | M4 |
| 401 retry placeholder in `api-client.ts` | Yes — Inbox sessions are long; 401s are certain | P1 | M5 |
| Missing inbox DB tables (accounts/conversations/messages) | Yes — every feature depends on schema | P0 | M1 |
| `resolveAccessToken` duplicated × 8 BFF handlers | No — medium tech debt, not a blocker | P2 | M6 |
| MANAGER/SALES_EXECUTIVE missing `inbox.reply/assign/close` permissions | Yes — users cannot act on conversations | P1 | M1 (shared enums) |
| ActivityType missing `MESSAGE_RECEIVED`, `MESSAGE_SENT`, `INSTAGRAM_ACCOUNT_CONNECTED` | Yes — audit trail and workflow triggers require these | P1 | M1 (shared enums) |
| DomainEvent missing `MESSAGE_RECEIVED`, `MESSAGE_SENT` | Yes — eventBus type-safety requires them | P1 | M1 (shared enums) |
| Three-panel Inbox is large frontend scope | Scope risk, not a blocker | P2 | M5 notes |
| Meta App Review timeline (external) | Schedule risk only | P0 for launch | M6 |
| Facebook Business Verification (external) | Schedule risk only | P0 for launch | Pre-sprint |
| `server.ts` — Socket.io must attach to `http.Server` not `app` | Architectural, not hard | P1 | M1 |
| No `org.connect_social` in role defaults | Yes — MANAGER/OWNER role seeding won't grant IG connect | P1 | M1 (shared enums) |

---

## M1 — Meta API Spike + Infrastructure + Schema

**Calendar:** Days 1–3 (spike) + Days 1–2 (parallel infrastructure)
**Hard gate:** The spike finding document must be signed off before any M2 code is written. Infrastructure and schema work can proceed in parallel on Days 1–2.

---

### M1-A: Meta API Validation Spike (2–3 days)

This is not optional research. `FINAL_ARCHITECTURE §5.1` mandates it. The entire M2 and M3 implementation depends on its findings.

**Questions the spike must answer (with sources — not guesses):**

| Question | Why it matters |
|----------|---------------|
| Which OAuth flow? "Instagram API with Instagram Login" (User Token path) vs "Instagram API with Facebook Login" (Page Token path) | Different scopes, different endpoints, different token lifetimes |
| What is the actual token type returned? User Access Token or Page Access Token? | Determines what `instagram_accounts.accessToken` stores and how it is refreshed |
| What is the confirmed token lifetime? (IG-3 ambiguity: Page token is short-lived; User token can be exchanged for 60-day long-lived) | Determines cron cadence and `tokenExpiresAt` logic |
| What is the confirmed messaging window? 24h or 7-day? | Determines `windowExpiresAt` computation in `instagram_conversations` |
| What is the exact JSON path to `mid` in a received webhook payload? Confirm `entry[n].messaging[m].message.mid` | Fixes the `[0]`-only extraction bug correctly |
| Can a single webhook delivery contain multiple `entry` objects? Multiple `messaging` objects per entry? | Confirms multi-entry iteration requirement in M3 handler |
| What are the rate limits for send (`POST /{ig-user-id}/messages`)? Per-second? Per-account-per-day? | Determines the per-account rate-limiter configuration in M4 |
| What scopes are required? (`pages_messaging`, `instagram_basic`, `instagram_manage_messages`, etc.) | Required for OAuth redirect construction |
| What is the correct webhook subscription API? (Page-level vs App-level subscription) | Determines subscribe call in M2 post-OAuth |
| What is the recommended way to fetch the IG user's display name and profile picture on a new conversation? | Determines lead enrichment implementation in M3 |

**Spike output document:** Create `docs/planning/SPRINT_6_M1_SPIKE_FINDINGS.md` capturing all findings with exact API responses. Every M2/M3/M4 decision that depends on the spike should cite this document.

**Exit:** Spike findings document reviewed and signed off by tech lead. Answers to all 10 questions above documented with evidence (actual API response samples from sandbox).

---

### M1-B: Infrastructure (parallel with spike, Days 1–2)

**New packages required:**

| Package | Where | Purpose |
|---------|-------|---------|
| `socket.io` | `apps/api/package.json` (dependencies) | Socket.io server |
| `@socket.io/redis-adapter` | `apps/api/package.json` (dependencies) | Redis adapter for multi-instance Socket.io |

**No new packages needed in `apps/web`** — `socket.io-client ^4.8.0` is already installed.

---

### M1 Files to Create

| File | Purpose |
|------|---------|
| `apps/api/src/core/crypto/field-encryption.ts` | AES-256-GCM encrypt/decrypt for OAuth tokens |
| `apps/api/src/core/crypto/field-encryption.test.ts` | Unit tests against known-good test vectors |
| `apps/api/src/core/realtime/socket-server.ts` | Socket.io server singleton (init + getSocketServer + emitToOrg) |
| `apps/api/src/core/realtime/socket-middleware.ts` | Socket.io auth middleware (validates JWT on connect, joins org room) |
| `apps/api/src/core/queue/workers/instagram-send.worker.ts` | Stub: `INSTAGRAM_SEND_JOB` constant + `processInstagramSendJob()` no-op with log |
| `docs/planning/SPRINT_6_M1_SPIKE_FINDINGS.md` | Spike output (written by engineer doing the spike, not generated) |

**`field-encryption.ts` interface contract** (no code — interface only):

The module must export:
- `encrypt(plaintext: string): EncryptedToken` — returns `{ ciphertext: string, iv: string, tag: string, keyVersion: number }` (all hex-encoded)
- `decrypt(token: EncryptedToken): string` — returns original plaintext
- `EncryptedToken` interface
- The key is read from `env.FIELD_ENCRYPTION_KEY` at module load time. Fail-fast if missing in production.
- A `keyVersion` prefix enables rotation: old ciphertexts are decryptable with version 1 key; new encryptions use version 2 key. Store as `v${keyVersion}:${hex(iv)}:${hex(tag)}:${hex(ciphertext)}` in the DB column (a single `Text` column, not split).

**`socket-server.ts` interface contract**:
- `initSocketServer(httpServer: http.Server): IOServer` — called once from `server.ts` after HTTP server starts
- `getSocketServer(): IOServer` — returns the singleton; throws if not initialized
- `emitToOrg(organizationId: string, event: string, data: unknown): void` — helper used by workers and handlers to push events to all clients in `org:{organizationId}` room

**`socket-middleware.ts` contract**:
- On `connection` event: validate `socket.handshake.auth.token` as a JWT
- If valid: `socket.join(`org:${decoded.orgId}`)`, attach `socket.data.userId` and `socket.data.orgId`
- If invalid: `socket.disconnect(true)`

---

### M1 Files to Modify

| File | Change |
|------|--------|
| `apps/api/package.json` | Add `socket.io` + `@socket.io/redis-adapter` to dependencies |
| `apps/api/src/core/config/env.ts` | Add vars with Zod schema and production fail-fast guards (see below) |
| `apps/api/src/server.ts` | After `app.listen()`, call `initSocketServer(server)` |
| `apps/api/src/core/queue/worker-registry.ts` | Register `instagram-send` worker using the stub processor from `instagram-send.worker.ts` |
| `apps/api/src/core/queue/names.ts` | Verify `QUEUE.INSTAGRAM_SEND` is present (it is — no change needed, just confirm) |
| `apps/api/src/core/tenancy/tenant-tables.ts` | Add `instagram_accounts`, `instagram_conversations`, `messages` to `TENANT_TABLES` and `TENANT_MODELS`; update comment count to 22 |
| `packages/shared/src/constants/enums.ts` | Add `InstagramAccountStatus` enum; add to `ActivityType`: `MESSAGE_RECEIVED`, `MESSAGE_SENT`, `INSTAGRAM_ACCOUNT_CONNECTED`, `INSTAGRAM_ACCOUNT_DISCONNECTED`; add `ConversationStatus` enum |
| `packages/shared/src/constants/events.ts` | Add to `DomainEvent`: `DEAL_UPDATED`, `PIPELINE_CREATED`, `PIPELINE_UPDATED`, `PIPELINE_DELETED`, `PIPELINE_STAGE_CREATED`, `PIPELINE_STAGE_UPDATED`, `PIPELINE_STAGE_DELETED`, `PIPELINE_STAGE_REORDERED` (Sprint 5 cleanup), `MESSAGE_RECEIVED`, `MESSAGE_SENT`, `INSTAGRAM_ACCOUNT_CONNECTED`, `INSTAGRAM_ACCOUNT_DISCONNECTED` (Sprint 6 new); update `AllEvents` and `EventName` union — see `SPRINT_6_FINAL_ARCHITECTURE_SIGNOFF.md §5.2` for complete list |
| `packages/shared/src/constants/permissions.ts` | Add `inbox.reply`, `inbox.reply_own`, `inbox.assign`, `inbox.close`, `inbox.close_own` to `MANAGER_PERMISSIONS`; add `inbox.reply_own`, `inbox.close_own` to `SALES_EXECUTIVE_PERMISSIONS`. **⚠ DO NOT add `org.connect_social` to `MANAGER_PERMISSIONS`** — superseded by `SPRINT_6_FINAL_ARCHITECTURE_SIGNOFF.md §4.5` (A3). `org.connect_social` is OWNER and ADMIN only. |
| `prisma/schema.prisma` | Add 3 new models + 2 new enums (see Migrations section) |

**`env.ts` additions** — new variables with their Zod types:

```
INSTAGRAM_APP_ID            z.string().min(1)   — required in production, no default
INSTAGRAM_APP_SECRET        already present (used for webhook HMAC)
INSTAGRAM_OAUTH_REDIRECT_URI z.string().url()   — required in production, no default
FIELD_ENCRYPTION_KEY        z.string().min(64)  — hex-encoded 32-byte key, required in production
SOCKET_IO_CORS_ORIGIN       z.string().optional() — defaults to APP_WEB_ORIGIN
```

Production fail-fast check (same pattern as `JWT_ACCESS_SECRET`): if `NODE_ENV === 'production'`, throw if `INSTAGRAM_APP_ID`, `INSTAGRAM_OAUTH_REDIRECT_URI`, or `FIELD_ENCRYPTION_KEY` are missing or still set to any test default.

---

### M1 Database Migrations

**Migration `0014_instagram_accounts`:**

Creates the `instagram_accounts` table. Fields:
- `id UUID PK`
- `organizationId UUID NOT NULL FK → organizations.id CASCADE`
- `igUserId VARCHAR(50) NOT NULL` — Meta's stable internal user/page ID
- `igUsername VARCHAR(100)` — display handle (can change; updated on token refresh)
- `accessToken TEXT NOT NULL` — AES-256-GCM encrypted value stored as `v{n}:{iv}:{tag}:{ct}` string
- `tokenExpiresAt TIMESTAMPTZ NOT NULL` — when the current token expires (from spike findings)
- `tokenType VARCHAR(20) NOT NULL` — `USER` or `PAGE` (from spike findings)
- `status InstagramAccountStatus NOT NULL DEFAULT 'ACTIVE'` — `ACTIVE | EXPIRED | DISCONNECTED`
- `webhookSubscribed BOOLEAN NOT NULL DEFAULT false`
- `profilePictureUrl TEXT` — nullable, refreshed periodically
- `createdAt`, `updatedAt`, `deletedAt`

Indexes:
- `UNIQUE(organizationId, igUserId)` — one account per org-user pair
- `INDEX(organizationId, status)` — for account list queries and cron filtering
- `INDEX(igUserId)` — for webhook → account lookup

RLS: enable + force + policy: `organizationId = current_setting('app.current_organization_id', true)::uuid`

New Prisma enum `InstagramAccountStatus`: `ACTIVE`, `EXPIRED`, `DISCONNECTED`

---

**Migration `0015_inbox_tables`:**

Creates `instagram_conversations` and `messages` tables.

`instagram_conversations`:
- `id UUID PK`
- `organizationId UUID NOT NULL FK → organizations`
- `igConversationId VARCHAR(100) NOT NULL` — Meta's conversation thread identifier
- `igAccountId UUID NOT NULL FK → instagram_accounts.id` — which connected account received this
- `leadId UUID FK → leads.id SET NULL` — linked lead (may be null initially)
- `contactId UUID FK → contacts.id SET NULL`
- `assignedToId UUID FK → users.id SET NULL`
- `status ConversationStatus NOT NULL DEFAULT 'OPEN'` — `OPEN | CLOSED`
- `labels JSONB NOT NULL DEFAULT '[]'` — string array of label names
- `firstResponseAt TIMESTAMPTZ` — SLA field; set on first OUTBOUND message; never updated after set
- `lastInboundAt TIMESTAMPTZ` — last inbound message timestamp; used for window-expiry check
- `lastMessageAt TIMESTAMPTZ` — last message of any direction; drives list sort
- `createdAt`, `updatedAt`

Indexes:
- `UNIQUE(organizationId, igConversationId)` — idempotent upsert key
- `INDEX(organizationId, status, lastMessageAt DESC)` — primary list query
- `INDEX(organizationId, assignedToId)`
- `INDEX(leadId)`
- `INDEX(igAccountId)`

`messages`:
- `id UUID PK`
- `organizationId UUID NOT NULL FK → organizations`
- `conversationId UUID NOT NULL FK → instagram_conversations.id CASCADE`
- `mid VARCHAR(200) NOT NULL UNIQUE` — Meta's message ID; the idempotency key at the message grain
- `direction MessageDirection NOT NULL` — `INBOUND | OUTBOUND` (enum already exists in `enums.ts`)
- `contentType VARCHAR(20) NOT NULL DEFAULT 'TEXT'` — `TEXT | IMAGE | AUDIO | VIDEO | STICKER` (future)
- `content JSONB NOT NULL` — `{ text?: string, attachmentUrl?: string, attachmentType?: string }`
- `status MessageStatus NOT NULL DEFAULT 'SENT'` — `SENT | DELIVERED | READ | FAILED`
- `sentAt TIMESTAMPTZ NOT NULL`
- `deliveredAt TIMESTAMPTZ`
- `readAt TIMESTAMPTZ`
- `senderId VARCHAR(100)` — IG user ID of sender (for inbound: the DM sender; for outbound: the page/IG user)
- `createdAt`, `updatedAt`

New Prisma enums needed: `ConversationStatus` (`OPEN`, `CLOSED`), `MessageStatus` (`SENT`, `DELIVERED`, `READ`, `FAILED`).

Indexes on `messages`:
- `UNIQUE(mid)` — the message-grain idempotency constraint (cross-tenant; `mid` is globally unique in Meta's system)
- `INDEX(conversationId, sentAt DESC)` — thread display
- `INDEX(organizationId, direction, status)` — for analytics

RLS on both tables: same standard pattern.

---

**Migration `0016_instagram_fk`:**

A single `ALTER TABLE` that adds the deferred FK:
```sql
ALTER TABLE leads
  ADD CONSTRAINT leads_instagram_account_id_fkey
  FOREIGN KEY ("instagramAccountId") REFERENCES instagram_accounts(id)
  ON DELETE SET NULL;
```

This migration is safe to run after accounts are seeded because the column already has no FK constraint. Existing `null` values are unaffected.

---

### M1 Shared Schema Changes

In `prisma/schema.prisma`, add:

```
enum InstagramAccountStatus { ACTIVE EXPIRED DISCONNECTED }
enum ConversationStatus     { OPEN CLOSED }
enum MessageStatus          { SENT DELIVERED READ FAILED }
```

Also add `MESSAGE_RECEIVED`, `MESSAGE_SENT`, `INSTAGRAM_ACCOUNT_CONNECTED`, `INSTAGRAM_ACCOUNT_DISCONNECTED` to the `ActivityType` enum.

Add the 3 new Prisma models (`InstagramAccount`, `InstagramConversation`, `Message`) following the Sprint 5 M1 table comment pattern (section header comment + model).

---

### M1 Integration Tests Required

| Test file | What to test |
|-----------|-------------|
| `apps/api/src/core/crypto/field-encryption.test.ts` | Encrypt → decrypt round-trip; wrong key returns error; key version prefix is present in output; empty string input handled; output format is stable |

No integration tests for migrations themselves — `check:rls` validates RLS coverage.

---

### M1 Acceptance Criteria

1. `pnpm typecheck` — 0 errors across all 4 packages after all enum/type additions
2. `pnpm --filter @leados/api test` — all existing 474 tests pass; `field-encryption.test.ts` new tests pass
3. `pnpm --filter @leados/api check:rls` — reports 22 tables (up from 19); all enabled + forced + policied
4. `socket.io` package is importable in `apps/api/src` (verified by typecheck)
5. `env.ts` starts without error with test env (dev defaults for new vars acceptable in test)
6. Spike findings document exists and answers all 10 questions

### M1 Exit Criteria

All acceptance criteria pass AND the spike findings document is signed off. No M2 code is written before sign-off.

---

## M2 — Instagram OAuth + Account Management

**Calendar:** Days 3–5 (starts after spike sign-off)
**Dependency:** M1-A spike complete; M1-B infrastructure merged
**Parallel work allowed:** BFF routes can be written once API endpoints are stable; UI `AccountConnectCard` can be built in parallel with M2 backend

---

### M2 Scope

1. Instagram OAuth initiation + callback (public, outside `/api/v1`)
2. Account list + disconnect endpoints (authenticated, inside `/api/v1`)
3. `InstagramAdapter` interface + sandbox implementation
4. Token storage encrypted with `field-encryption.ts`
5. Daily token refresh cron registered in `CRON_REGISTRY`
6. Account `EXPIRED` status path
7. Plan-limit enforcement: `PLAN_LIMITS[plan].instagramAccounts`
8. BFF routes for account management

---

### M2 Architecture Decision: OAuth State + Callback

> **⚠ SUPERSEDED — Implementation must follow `SPRINT_6_FINAL_ARCHITECTURE_SIGNOFF.md §4.2` (B-3/A3/A4).** The description below is updated to match the signoff.

The Instagram OAuth flow crosses a redirect boundary, so the callback URL cannot carry a Bearer token. Use a Redis-nonce + signed state JWT:

- **Initiation** (`GET /api/v1/instagram/auth`): Authenticated. Generates `nonce = crypto.randomUUID()`, stores `{ userId, orgId }` in Redis at `oauth:state:{nonce}` (TTL 900s). Signs `state = jwt.sign({ nonce }, OAUTH_STATE_SECRET, { expiresIn: '15m' })` — **not `JWT_ACCESS_SECRET`**. Returns `{ redirectUrl }` with `state` param.
- **Callback** (`GET /api/instagram/callback`): Public (outside `/api/v1`). All error paths **redirect the browser** to `https://app.leados.app/settings/integrations/instagram?error=<CODE>` — they never return JSON. Error codes: `ACCESS_DENIED`, `INVALID_STATE`, `STATE_EXPIRED`, `ALREADY_CONNECTED`, `PLAN_LIMIT_EXCEEDED`. On success: redirect to `?connected=1`. See signoff §4.2 for the complete step-by-step sequence.

The callback endpoint is mounted in `app.ts` outside the auth chain, similar to webhooks. The nonce is deleted from Redis immediately after first use (single-use replay protection). Payload `{ userId, orgId }` is read from Redis (not from the JWT itself — the JWT carries only the nonce).

---

### M2 — `InstagramAdapter` Interface

Create `apps/api/src/modules/instagram/instagram.adapter.ts` defining the interface. The sandbox implementation should be in the same file or `instagram.adapter.sandbox.ts` (for testing). All Meta Graph API calls go through this interface. The inbox and webhook modules never call `fetch` to Meta directly.

Methods:
- `exchangeCodeForToken(code: string): Promise<{ accessToken: string, expiresIn: number }>` — short-lived token exchange
- `getLongLivedToken(shortLivedToken: string): Promise<{ accessToken: string, expiresIn: number }>` — exchange for 60-day (or spike-confirmed duration) token
- `refreshToken(token: string): Promise<{ accessToken: string, expiresIn: number }>` — refresh before expiry
- `subscribeWebhook(igUserId: string, token: string): Promise<void>` — subscribe the app's webhook to this user's events
- `unsubscribeWebhook(igUserId: string, token: string): Promise<void>`
- `getUserProfile(igUserId: string, token: string): Promise<{ igUserId: string, username: string, profilePictureUrl?: string }>` — fetch account info post-OAuth
- `getSenderProfile(senderIgUserId: string, token: string): Promise<{ username?: string, name?: string, profilePictureUrl?: string }>` — enrich lead from IG user info
- `sendMessage(recipientIgUserId: string, content: MessageContent, token: string): Promise<{ mid: string }>` — send a DM

---

### M2 Files to Create

| File | Purpose |
|------|---------|
| `apps/api/src/modules/instagram/instagram.adapter.ts` | `InstagramAdapter` interface + `MetaInstagramAdapter` implementation (spike-validated) |
| `apps/api/src/modules/instagram/instagram.repository.ts` | `PrismaInstagramAccountRepository` — CRUD for `InstagramAccount` using `withTenant` pattern |
| `apps/api/src/modules/instagram/instagram.service.ts` | Business logic: OAuth flow, account management, token encryption/decryption, plan limit enforcement |
| `apps/api/src/modules/instagram/instagram.controller.ts` | Route handlers: `initiateOAuth`, `handleCallback`, `listAccounts`, `disconnectAccount` |
| `apps/api/src/modules/instagram/instagram.routes.ts` | `buildInstagramAuthRouter()` (public — callback) + `buildInstagramRouter(requirePermission)` (authenticated) |
| `apps/api/src/modules/instagram/index.ts` | Module composition root |
| `apps/web/src/app/api/bff/instagram/accounts/route.ts` | BFF: `GET /api/bff/instagram/accounts` |
| `apps/web/src/app/api/bff/instagram/accounts/[id]/route.ts` | BFF: `DELETE /api/bff/instagram/accounts/:id` |
| `apps/web/src/lib/hooks/useInstagramAccounts.ts` | `useInstagramAccounts()` query + `useDisconnectInstagramAccount()` mutation |
| `apps/api/tests/integration/instagram-oauth.integration.test.ts` | See integration tests section |

---

### M2 Files to Modify

| File | Change |
|------|--------|
| `apps/api/src/app.ts` | Mount public instagram callback router at `/api/instagram`; mount authenticated instagram router inside `/api/v1` |
| `apps/api/src/core/scheduler/cron-registry.ts` | Add daily token refresh entry: `id: 'instagram-token-refresh', cron: '0 3 * * *'` (3 AM UTC) |
| `apps/api/src/core/queue/worker-registry.ts` | No change needed — the system queue worker handles cron jobs via CRON_REGISTRY; the token refresh cron fires a system job that calls `instagramService.refreshAllActiveTokens()` |

Note: The cron in `CRON_REGISTRY` fires a system-queue job. The system-queue processor in `worker-registry.ts` will need a new branch to handle `cronId === 'instagram-token-refresh'` → call `instagramService.refreshAllActiveTokens()`. This keeps the cron mechanism unchanged.

---

### M2 API Endpoints

| Method | Path | Auth | Permission | Notes |
|--------|------|------|-----------|-------|
| `GET` | `/api/v1/instagram/auth` | Bearer | `org.connect_social` | Builds OAuth redirect URL; stores signed state in Redis (TTL 15m); returns `{ redirectUrl }` |
| `GET` | `/api/instagram/callback` | None (state validates identity) | — | Validates `state` param; exchanges code; stores account; redirects to settings page |
| `GET` | `/api/v1/instagram/accounts` | Bearer | `org.connect_social` | Lists connected accounts for org; plan-limit metadata included |
| `DELETE` | `/api/v1/instagram/accounts/:id` | Bearer | `org.connect_social` | Unsubscribes webhook; soft-deletes account; sets `status = DISCONNECTED` |

**`org.connect_social` — OWNER and ADMIN only.** Per `SPRINT_6_FINAL_ARCHITECTURE_SIGNOFF.md §4.5` (A3), MANAGER does NOT receive this permission. The M1 permissions.ts change does NOT add `org.connect_social` to MANAGER_PERMISSIONS. The PM decision is final: connecting an Instagram account is an administrator action.

---

### M2 Integration Tests Required

File: `apps/api/tests/integration/instagram-oauth.integration.test.ts`

| Test | What to assert |
|------|---------------|
| `GET /api/v1/instagram/auth` returns 401 without token | RBAC gate |
| `GET /api/v1/instagram/auth` returns 403 with SALES_EXECUTIVE token (no `org.connect_social`) | Permission gate — OWNER/ADMIN only per signoff §4.5 |
| `GET /api/v1/instagram/auth` with OWNER token returns `{ redirectUrl }` containing signed `state` JWT | Happy path |
| `GET /api/instagram/callback` with valid state + mocked code exchange → account created, token stored encrypted; response is HTTP 302 redirect to `?connected=1` | End-to-end OAuth (mock Meta adapter) |
| `GET /api/instagram/callback` with expired state JWT → HTTP 302 redirect to `?error=STATE_EXPIRED` (not 400 JSON) | **A4:** state expiry — assert `res.headers.location` contains `error=STATE_EXPIRED` |
| `GET /api/instagram/callback` replay (nonce already deleted from Redis, second call) → HTTP 302 redirect to `?error=STATE_EXPIRED` (not 409 JSON) | **A4:** replay protection — assert redirect, not 409 |
| `GET /api/instagram/callback` invalid state JWT signature → HTTP 302 redirect to `?error=INVALID_STATE` | Signature forgery |
| `GET /api/instagram/callback` duplicate account (same igUserId already connected) → HTTP 302 redirect to `?error=ALREADY_CONNECTED` (not 409 JSON) | **A4:** idempotency — assert redirect |
| `GET /api/v1/instagram/accounts` returns the connected account with `status: 'ACTIVE'` | List happy path |
| `DELETE /api/v1/instagram/accounts/:id` sets `status = DISCONNECTED`, `deletedAt` set | Disconnect |
| Plan limit: org on TRIAL (limit 1) cannot connect a second account → redirect `?error=PLAN_LIMIT_EXCEEDED` | Plan gate |
| Token stored in DB is not plaintext (raw query — assert starts with `v1:`, not `EAAxx`) | Security assertion |

---

### M2 Risks

1. **Spike findings change the OAuth flow** — if the spike reveals a Facebook-Login path instead of Instagram Login, the scopes and endpoints change. The adapter interface insulates the rest of the code, but the adapter implementation is a rewrite.
2. **Meta's callback URL requirements** — the OAuth redirect URI must be HTTPS and pre-registered. Local development requires `ngrok` or equivalent. Engineers must set this up before testing the callback.
3. **Webhook subscription timing** — subscribing the webhook after OAuth (as designed) means a brief window where the account is connected but not yet receiving webhooks. This is acceptable; the subscribe call must retry on failure via `QUEUE.WEBHOOK_PROCESSING` with job name `'instagram-webhook-subscribe'` and payload `{ igUserId, accessToken, orgId }` — **not the `instagram-send` queue** (see signoff A13). A new dispatch branch `case 'instagram-webhook-subscribe':` in `webhook.worker.ts` calls `adapter.subscribeWebhook()`.

---

### M2 Acceptance Criteria

1. An OWNER can initiate OAuth and be redirected to Meta (verify state param is present and signed)
2. After OAuth, `instagram_accounts` row exists with `accessToken` stored in `v1:iv:tag:ct` format (not plaintext)
3. `GET /api/v1/instagram/accounts` returns the account with `status: 'ACTIVE'`
4. `DELETE /api/v1/instagram/accounts/:id` marks account `DISCONNECTED` and `deletedAt` is set
5. TRIAL plan org blocked from connecting a second account with `PLAN_LIMIT_EXCEEDED`
6. All M2 integration tests pass
7. `pnpm typecheck` + `pnpm lint` pass

### M2 Exit Criteria

All acceptance criteria pass. Sandbox account is connected end-to-end in the development environment.

---

## M3 — Receive Pipeline (Real Instagram Handler)

**Calendar:** Days 5–7
**Dependency:** M2 complete (accounts table must have data for account → org resolution)
**Note:** M3 backend can proceed while M5 frontend is being scaffolded in parallel

---

### M3 Scope

1. Rewrite `webhook.worker.ts:handleInstagram()` with the full production receive pipeline
2. Fix the `[0]`-only extraction bug — iterate all entries + all messaging events
3. Message-grain dedup by `mid` (the `UNIQUE(mid)` constraint on `messages` + upsert pattern)
4. Conversation upsert by `(organizationId, igConversationId)`
5. Lead find/create with IG profile enrichment
6. `webhook_events.organizationId` backfill after account → org resolution
7. Emit `instagram.message.received` via `eventBus.emitDurable()` → Socket.io push to org room
8. `Inbox` module read endpoints (conversations list, detail, messages list)

---

### M3 Receive Pipeline: Step-by-Step (for implementation)

The `handleInstagram(payload, webhookEventId)` function must follow this exact sequence:

```
1. Parse payload as { object: string, entry: Entry[] }
2. If entry array is empty or missing → log and return (no-op)
3. For each entry in entry[]:
   a. For each message_event in entry.messaging[]:
      i.   Extract mid = message_event.message?.mid (or message_event.read?.watermark, etc.)
           - If no mid: generate fallback `ig_fallback_{entry.id}_{entry.time}_{index}`
      ii.  Resolve igAccountId: look up instagram_accounts WHERE igUserId = message_event.recipient.id
           - If not found: log warning + CONTINUE to next message (don't fail the whole batch)
           - If found: derive organizationId from the account
      iii. Upsert conversation:
           INSERT INTO instagram_conversations (organizationId, igConversationId, igAccountId, ...)
           ON CONFLICT (organizationId, igConversationId) DO UPDATE SET lastMessageAt = NOW()
      iv.  Dedup by mid:
           INSERT INTO messages (mid, conversationId, ...) ON CONFLICT (mid) DO NOTHING
           - If conflict (already processed): skip the rest for this message
           - If created: proceed
      v.   Lead find/create:
           - Look up lead WHERE instagramUserId = message_event.sender.id AND organizationId = orgId
           - If not found: create lead (source = INSTAGRAM_DM, firstName from sender.name if available)
           - Link lead to conversation (update conversation.leadId if null)
      vi.  Enrich lead: if sender profile not yet fetched → call adapter.getSenderProfile() → update lead.instagramHandle, lead.profilePictureUrl
      vii. Update lastInboundAt on conversation (for window-expiry tracking)
      viii. Backfill webhook_events.organizationId (first message in batch wins)
      ix.  Emit:
           await eventBus.emitDurable(DomainEvent.MESSAGE_RECEIVED, { conversationId, messageId, orgId }, QUEUE.INSTAGRAM_SEND, 'notify-new-message')
           Note: emitDurable also calls eventBus.emit() which triggers the in-process Socket.io push
4. On any per-message error: log + continue (don't fail the entire batch)
```

The Socket.io push is wired by adding an in-process listener to `eventBus.on(DomainEvent.MESSAGE_RECEIVED, ...)` in a startup hook (similar to how the event bus is used elsewhere). The listener calls `emitToOrg(orgId, 'instagram:message', { conversationId, messageId })`.

---

### M3 — Inbox Module (Read Endpoints)

Create `apps/api/src/modules/inbox/` for the conversation and message read/management layer. This is separate from the `instagram/` module (which handles OAuth and the adapter).

The inbox module provides the CRM-facing view of conversations — what agents see. The instagram module provides the Meta-facing integration.

---

### M3 Files to Create

| File | Purpose |
|------|---------|
| `apps/api/src/modules/inbox/inbox.repository.ts` | `PrismaConversationRepository`, `PrismaMessageRepository` — list/find/upsert operations |
| `apps/api/src/modules/inbox/inbox.service.ts` | `InboxService`: `listConversations()`, `getConversation()`, `listMessages()`, `upsertConversationFromWebhook()`, `createMessageFromWebhook()` |
| `apps/api/src/modules/inbox/inbox.controller.ts` | `listConversations`, `getConversation`, `listMessages` handlers |
| `apps/api/src/modules/inbox/inbox.routes.ts` | `buildInboxRouter(requirePermission)` — read routes only in M3 |
| `apps/api/src/modules/inbox/index.ts` | Module composition |
| `apps/api/tests/integration/inbox-receive.integration.test.ts` | See tests section |

---

### M3 Files to Modify

| File | Change |
|------|--------|
| `apps/api/src/core/queue/workers/webhook.worker.ts` | Rewrite `handleInstagram(payload, webhookEventId)` with full receive pipeline; update `dispatch()` signature to pass `webhookEventId` so the handler can backfill `organizationId` on the event row |
| `apps/api/src/app.ts` | Mount `buildInboxModule()` under `/api/v1` at `/inbox` |
| `apps/api/src/core/events/event-bus.ts` or a new startup hook | Register in-process listener on `MESSAGE_RECEIVED` → call `emitToOrg()` for Socket.io push |

---

### M3 API Endpoints

| Method | Path | Auth | Permission | Notes |
|--------|------|------|-----------|-------|
| `GET` | `/api/v1/inbox/conversations` | Bearer | `inbox.read` (or `inbox.read_own`) | Cursor-paginated; `?cursor=`, `?accountId=`, `?assignedToId=`, `?status=`, `?limit=` |
| `GET` | `/api/v1/inbox/conversations/:id` | Bearer | `inbox.read` (or `inbox.read_own`) | Single conversation with `igAccount`, `lead`, `assignedTo` relations |
| `GET` | `/api/v1/inbox/conversations/:id/messages` | Bearer | `inbox.read` (or `inbox.read_own`) | Cursor-paginated; `?cursor=`, `?limit=` (newest-first) |

**Own-only gate for `inbox.read_own`**: SALES_EXECUTIVE can only see conversations where `assignedToId = ctx.userId`.

---

### M3 Integration Tests Required

File: `apps/api/tests/integration/inbox-receive.integration.test.ts`

| Test | What to assert |
|------|---------------|
| Single IG DM webhook → message created, conversation created, lead created | Full happy path |
| Duplicate webhook (same mid) → second call is no-op (no duplicate message row) | Mid-grain dedup |
| Webhook with unknown `recipientId` (no matching account) → no error thrown, batch continues | Unknown account graceful skip |
| Multi-entry webhook: 2 entries with 1 message each → 2 messages created | Multi-entry iteration |
| Multi-message single entry: 1 entry with 2 messaging events → 2 messages created | Multi-message iteration (fixes `[0]` bug) |
| Existing lead (matched by instagramUserId) → conversation linked to existing lead | Lead matching |
| Cross-org: webhook for account in org A is not visible via `GET /inbox/conversations` from org B | RLS isolation |
| `GET /inbox/conversations` with `inbox.read` permission → returns conversations | List happy path |
| `GET /inbox/conversations` with `inbox.read_own` and unassigned conversation → 0 results | Own-only |
| `GET /inbox/conversations/:id/messages` → returns thread in sentAt DESC order | Message list |

---

### M3 Risks

1. **Profile enrichment rate limit** — calling `adapter.getSenderProfile()` for every new conversation may hit Meta rate limits if many accounts connect simultaneously. Solution: make enrichment async (enqueue a `instagram-enrich` job) and proceed without it if the call fails. Plan: first message creates lead with minimal data; enrichment happens via a deferred job.
2. **Lead dedup ambiguity** — if two different IG users message the org and both happen to have the same `instagramUserId` (impossible in practice but worth a DB constraint), data would merge incorrectly. The `@@index([instagramUserId])` on `leads` is not unique — consider whether this should be `@@unique([organizationId, instagramUserId])`.
3. **`eventBus.emitDurable()` for Socket.io push** — the durable emit enqueues a BullMQ job. The in-process listener handles the Socket.io emit. If the worker process restarts between the BullMQ enqueue and processing, the Socket.io push may be missed. This is acceptable for MVP (the frontend can poll on reconnect). Document this limitation.

---

### M3 Acceptance Criteria

1. A sandbox Instagram DM appears in the `messages` table within 5 seconds of delivery
2. The `instagram_conversations` row is created/upserted correctly
3. A lead is created with `source = 'INSTAGRAM_DM'` and `instagramUserId` set
4. Duplicate webhook delivery (same mid) produces exactly one `messages` row
5. Multi-message webhook produces one `messages` row per message
6. `GET /api/v1/inbox/conversations` returns the new conversation
7. `GET /api/v1/inbox/conversations/:id/messages` returns the message
8. All M3 integration tests pass

### M3 Exit Criteria

A real sandbox DM is visible in the database AND accessible via the conversation API. All integration tests pass.

---

## M4 — Send Pipeline + Status Webhooks

**Calendar:** Days 7–8
**Dependency:** M3 complete (conversations and messages table must exist for send to reference)
**Parallel:** M5 frontend scaffolding can begin on Day 8

---

### M4 Scope

1. `POST /inbox/conversations/:id/messages` — send endpoint
2. `instagram-send` worker — real implementation (replace stub)
3. Per-account rate-limit guard (BullMQ rate limiter)
4. Outgoing message window validation (24h from `lastInboundAt`, or spike-confirmed window)
5. Status webhook handlers: `delivered` and `read` receipts → update `messages.status`, `messages.deliveredAt/readAt`
6. `firstResponseAt` SLA stamping on first outbound message per conversation
7. Feature flag `instagram.sends.enabled` kill switch wired to send endpoint
8. BFF proxy for send

---

### M4 — `instagram-send` Worker Design

The worker (`processInstagramSendJob`) receives:

```typescript
interface InstagramSendJobPayload {
  organizationId: string;
  conversationId: string;
  messageId: string; // ID of the `messages` row already created with status SENT
  recipientIgUserId: string;
  content: { text?: string };
  igAccountId: string;
}
```

Sequence:
1. Load `instagram_accounts` row → decrypt `accessToken`
2. Call `adapter.sendMessage(recipientIgUserId, content, accessToken)`
3. On success: update `messages` row with returned `mid` from Meta (if different from our generated mid), set `status = DELIVERED` (or keep `SENT` and wait for the status webhook)
4. On failure after retries: update `messages.status = FAILED`; surface to UI (the conversation will show a failed indicator)

**Rate limit**: Use BullMQ's built-in rate limiter on the `instagram-send` queue. Rate: spike-confirmed limit per account per second. The rate limit key is `igAccountId`, not `organizationId`, because a single org could have multiple IG accounts.

**Window validation in the service (not the worker)**: The `InboxService.sendMessage()` method checks `conversation.lastInboundAt > now - windowDuration` before enqueuing. If the window is closed, throw a `WINDOW_CLOSED` AppError (409) with a message that the frontend can display.

---

### M4 Files to Create

| File | Purpose |
|------|---------|
| `apps/api/tests/integration/inbox-send.integration.test.ts` | See tests section |

---

### M4 Files to Modify

| File | Change |
|------|--------|
| `apps/api/src/core/queue/workers/instagram-send.worker.ts` | Replace stub with real implementation: load account, decrypt token, call adapter, update message status |
| `apps/api/src/modules/inbox/inbox.service.ts` | Add `sendMessage(conversationId, content, ctx)`: window check → create `messages` row (SENT) → enqueue `instagram-send` job |
| `apps/api/src/modules/inbox/inbox.controller.ts` | Add `sendMessage` handler |
| `apps/api/src/modules/inbox/inbox.routes.ts` | Add `POST /conversations/:id/messages` route with `requirePermission('inbox.reply')` / `inbox.reply_own` |
| `apps/api/src/modules/webhooks/webhook.controller.ts` | Add `receiveInstagramStatus()` handler for delivered/read status webhooks |
| `apps/api/src/modules/webhooks/webhook.routes.ts` | No new route (status events arrive on the same `POST /api/webhooks/instagram` endpoint — they are different `messaging_type` events in the same payload). The status handling is added to `handleInstagram()` in the worker. |
| `apps/web/src/app/api/bff/inbox/conversations/[id]/messages/route.ts` | BFF: `GET` + `POST` |

---

### M4 API Endpoints

| Method | Path | Auth | Permission | Notes |
|--------|------|------|-----------|-------|
| `POST` | `/api/v1/inbox/conversations/:id/messages` | Bearer | `inbox.reply` (or `inbox.reply_own`) | Body: `{ content: { text: string } }`; enqueues job; returns `{ messageId, status: 'SENT' }` immediately |

---

### M4 Integration Tests Required

File: `apps/api/tests/integration/inbox-send.integration.test.ts`

| Test | What to assert |
|------|---------------|
| `POST /inbox/conversations/:id/messages` with valid conversation + mocked adapter → 201 + `messages` row created | Happy path |
| `POST /inbox/conversations/:id/messages` where `lastInboundAt` > 24h ago → 409 `WINDOW_CLOSED` | Window expiry |
| `POST /inbox/conversations/:id/messages` with `FLAG_INSTAGRAM_SENDS_ENABLED=false` → 503 `FEATURE_DISABLED` | Kill switch |
| `POST /inbox/conversations/:id/messages` with `inbox.reply_own` but unassigned conversation → 403 | Own-only |
| Status webhook (delivered): update `messages.status = DELIVERED` + `deliveredAt` | Status receipt |
| Status webhook (read): update `messages.status = READ` + `readAt` | Read receipt |
| First outbound message: `conversation.firstResponseAt` is set | SLA stamping |
| Second outbound message: `conversation.firstResponseAt` is NOT updated | SLA immutability |

---

### M4 Risks

1. **Rate limit configuration** — the spike must confirm the actual per-account rate limit. BullMQ's rate limiter uses `max` + `duration`. If the limit is wrong, sends either throttle unnecessarily or get 429s from Meta.
2. **Message ID consistency** — we create a `messages` row before the send (with a generated UUID). Meta's `mid` comes back in the send response. We need to update the row with Meta's `mid` (or use Meta's `mid` as the primary key). The design above uses our own UUID as PK and stores Meta's `mid` in a separate column (already covered by the `UNIQUE(mid)` constraint). This is correct.
3. **Optimistic UI vs confirmed send** — the BFF returns immediately after enqueuing. The frontend shows the message as "sending." The Socket.io push when `MESSAGE_SENT` is confirmed will update the UI. If the worker fails, the message shows as `FAILED`. This is the correct design but requires the frontend to handle all three states.

---

### M4 Acceptance Criteria

1. A message sent via the API appears in `messages` table with `status = 'SENT'`
2. Meta adapter `sendMessage()` is called with correct content (mock assertion in integration test)
3. Window-closed conversations return 409
4. Kill switch (`FLAG_INSTAGRAM_SENDS_ENABLED=false`) returns 503
5. Status webhook delivers → `messages.status = 'DELIVERED'`
6. `firstResponseAt` is set on first send, not updated on subsequent sends
7. All M4 integration tests pass

### M4 Exit Criteria

Full send round-trip demonstrated in sandbox: agent types message → API called → message appears in sandbox IG account → delivered receipt received → `messages.status = DELIVERED`.

---

## M5 — Social Inbox Frontend

**Calendar:** Days 8–10
**Dependency:** M3 and M4 API endpoints stable (not necessarily production-ready, but stable enough to integrate against)
**Critical item (do first):** `api-client.ts` 401 retry — this must be the first commit in M5

---

### M5 Scope

1. **401 → token refresh → retry in `api-client.ts`** (first, before any other M5 work)
2. Socket.io client connection wired on auth
3. Social Inbox page + all components
4. BFF routes for inbox
5. Inbox navigation entry

---

### M5 — 401 Retry Design

The existing interceptor in `apps/web/src/lib/api-client.ts` has a placeholder comment at line 35. The implementation:

1. On 401 response: call `POST /api/auth/refresh` (the BFF route, not the API directly) using a separate axios instance to avoid infinite loops
2. On success: update the in-memory token via `setAccessToken()`, retry the original request with the new token
3. On failure (refresh also 401): clear the token, redirect to `/login`
4. A `_retried` flag on the request config prevents infinite retry loops

The BFF `/api/auth/refresh` route already exists and is tested. This is a pure frontend change.

---

### M5 — Socket.io Client Wiring

Modify `apps/web/src/lib/socket/client.ts`:
- `connectSocket(token: string): void` — called after login; sets `socket.auth = { token }` and calls `socket.connect()`
- `disconnectSocket(): void` — called on logout; calls `socket.disconnect()`
- `useSocketEvent(event: string, handler)` — React hook that registers an event listener and cleans up on unmount

Wire `connectSocket()` in the auth flow (after successful login response). Wire `disconnectSocket()` in the logout mutation.

The Socket.io server emits `instagram:message` to `org:{orgId}` rooms. The frontend registers:
```
useSocketEvent('instagram:message', ({ conversationId }) => {
  void queryClient.invalidateQueries({ queryKey: ['conversations'] });
  void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
})
```

---

### M5 Files to Create

| File | Purpose |
|------|---------|
| `apps/web/src/app/(dashboard)/inbox/page.tsx` | RSC shell: server-fetch initial conversations, renders `InboxPage` |
| `apps/web/src/components/inbox/InboxPage.tsx` | `'use client'` — three-panel layout |
| `apps/web/src/components/inbox/ConversationList.tsx` | Cursor-paginated list with filter tabs (All / Mine / Unassigned) |
| `apps/web/src/components/inbox/ConversationItem.tsx` | Single conversation tile |
| `apps/web/src/components/inbox/ThreadView.tsx` | Message thread with direction-aware bubbles |
| `apps/web/src/components/inbox/MessageBubble.tsx` | Single message component with status icon |
| `apps/web/src/components/inbox/ComposeBar.tsx` | Textarea + send button + `/` shortcut hook; disabled when window closed |
| `apps/web/src/components/inbox/ConversationHeader.tsx` | Assignee select, open/close toggle, lead link |
| `apps/web/src/components/inbox/WindowExpiredBanner.tsx` | Banner shown when `lastInboundAt > 24h`; replaces ComposeBar |
| `apps/web/src/lib/hooks/useConversations.ts` | `useInfiniteQuery` with cursor; filter params |
| `apps/web/src/lib/hooks/useMessages.ts` | `useInfiniteQuery` with cursor; newest-first |
| `apps/web/src/lib/hooks/useSendMessage.ts` | `useMutation` → BFF POST |
| `apps/web/src/lib/hooks/useAssignConversation.ts` | `useMutation` → BFF PATCH |
| `apps/web/src/app/api/bff/inbox/conversations/route.ts` | BFF: `GET /api/bff/inbox/conversations` |
| `apps/web/src/app/api/bff/inbox/conversations/[id]/route.ts` | BFF: `GET /api/bff/inbox/conversations/:id`, `PATCH` |
| `apps/web/src/app/api/bff/inbox/conversations/[id]/messages/route.ts` | BFF: `GET /api/bff/inbox/conversations/:id/messages`, `POST` |
| `apps/web/src/components/inbox/InboxPage.test.tsx` | Component tests (see tests section) |
| `apps/web/src/components/inbox/ConversationList.test.tsx` | Component tests |
| `apps/web/src/app/api/bff/inbox/conversations/route.test.ts` | BFF route tests |

---

### M5 Files to Modify

| File | Change |
|------|--------|
| `apps/web/src/lib/api-client.ts` | Implement 401 → refresh → retry interceptor |
| `apps/web/src/lib/socket/client.ts` | Add `connectSocket()`, `disconnectSocket()`, `useSocketEvent()` |
| `apps/web/src/components/layout/Sidebar.tsx` (or equivalent nav) | Add Inbox nav entry with unread dot |
| `apps/web/src/lib/auth/token-store.ts` or wherever login success is handled | Call `connectSocket(token)` after successful login |

---

### M5 Frontend Pages

| Route | Component | RSC or Client |
|-------|-----------|--------------|
| `/inbox` | `InboxPage.tsx` | RSC shell + client components |

No `/inbox/[conversationId]` route — the conversation is loaded in the right panel without a URL change (single-page inbox pattern). The URL may optionally include `?conversation=:id` for deep-linking via `useSearchParams`.

---

### M5 BFF Routes

The BFF routes in M5 follow the same `resolveAccessToken` pattern as existing deal BFF routes. Note: M6 will extract `resolveAccessToken` to a shared helper. In M5, copy the pattern (knowingly) — do not refactor the 8 existing BFF files in the same PR; do the extraction cleanly in M6.

---

### M5 Component Design Notes

**Three-panel layout responsiveness:**
- Desktop (≥1024px): left panel 280px (conversation list), center panel flex-1 (thread), right panel hidden by default
- Tablet (768–1023px): left panel collapsible (button to show/hide), center panel flex-1
- Mobile (<768px): stack — list view OR thread view, back button to return to list

**Cursor pagination pattern** — `useConversations`:
- Uses `useInfiniteQuery` with `initialPageParam: null` (not `1` — cursor is an ID, not a page number)
- `getNextPageParam: (lastPage) => lastPage.nextCursor ?? null`
- Flattens pages into a single list

**`ComposeBar` disabled state:** When `conversation.lastInboundAt` is older than the messaging window (24h or spike-confirmed), the `ComposeBar` is replaced by `WindowExpiredBanner` showing "Messaging window closed — the customer must send a new message first." This is a hard UX requirement; do not show a disabled textarea.

**Optimistic message insertion:** On send, use `queryClient.setQueryData` to insert the new message (with status `SENT` and a temporary ID) into the messages query cache before the API response returns. Replace with the real ID on success, or remove on failure. This makes the inbox feel fast.

---

### M5 Integration Tests Required

For BFF routes (`.test.ts` format, node environment):

| Test | What to assert |
|------|---------------|
| `GET /api/bff/inbox/conversations` — no cookie → 401 | Auth gate |
| `GET /api/bff/inbox/conversations` — valid cookie → proxies to API | Happy path |
| `POST /api/bff/inbox/conversations/:id/messages` — valid → 201 | Send proxy |

For components (`.test.tsx` format, jsdom environment):

| Test | What to assert |
|------|---------------|
| `InboxPage.tsx` — renders three-panel layout | Structural |
| `ConversationList.tsx` — renders provided conversations | List rendering |
| `ConversationItem.tsx` — shows last message preview, assignee, unread dot | Item rendering |
| `ComposeBar.tsx` — shows window-expired banner when window is closed | Window expiry UX |
| `ComposeBar.tsx` — calls `onSend` with text on submit | Send callback |
| `MessageBubble.tsx` — inbound vs outbound alignment | Direction rendering |

---

### M5 Risks

1. **Scope underestimate on ComposeBar + `/` shortcut** — the saved-replies shortcut (`/` opens picker, keyboard navigation, on-select inserts) is a non-trivial UX component. If time is tight, ship without the shortcut in M5 and add it in M6. The compose textarea itself must work.
2. **Socket.io reconnect handling** — when the browser tab regains focus or reconnects after a network blip, the Socket.io client should rejoin the org room. The `getSocket()` singleton handles this automatically if `reconnection: true` (the default), but a stale query cache is possible. Add a `connect` event listener that invalidates `['conversations']` on reconnect.
3. **useInfiniteQuery with cursor** — the existing codebase uses `initialPageParam: 1` for page-based queries. Cursor-based queries use `initialPageParam: null`. Ensure the hook setup is correct. TanStack Query v5 requires `initialPageParam` to be provided explicitly.

---

### M5 Acceptance Criteria

1. `api-client.ts` 401 retry works: a 401 triggers a refresh call and retries the original request without the user seeing an error
2. `connectSocket()` is called after login; Socket.io connects and joins `org:{orgId}` room (verify in browser DevTools Network → WS)
3. Inbox page loads and shows conversations
4. Selecting a conversation loads the thread
5. Typing and sending a message shows it in the thread optimistically and persists
6. A new DM arriving in the sandbox appears in the Inbox within 3 seconds without page refresh
7. Window-expired conversation shows banner, not compose bar
8. All M5 tests pass (BFF + component)

### M5 Exit Criteria

Full end-to-end demo: browser opens Inbox → DM arrives in sandbox → message appears in UI in real-time → agent types and sends reply → reply appears in sandbox IG.

---

## M6 — Hardening + App Review Prep

**Calendar:** Day 10 + async (some items are async / external)
**Parallel:** Most M6 work can be done in parallel with late M5 work
**Note:** Meta App Review submission is asynchronous and begins as soon as M5 exit criteria are met

---

### M6 Scope

1. `saved_replies` CRUD endpoints (shell table + BFF + frontend component)
2. `POST /inbox/conversations/:id/leads` — create lead from conversation
3. `/settings/integrations/instagram` settings page
4. `resolveAccessToken` extracted to shared BFF helper (replace all 8 + new inbox duplicates)
5. Submit Meta App Review
6. Reconcile webhook path documentation (confirm `app.ts` canonical path matches any Meta dashboard configuration)
7. `pnpm --filter @leados/api check:rls` — re-verify after all migrations land

---

### M6 — `resolveAccessToken` Extraction

Create `apps/web/src/lib/server/bff-auth.ts` (or `apps/web/src/lib/server/resolve-token.ts`) exporting:

```typescript
export async function resolveAccessToken(request: NextRequest): Promise<string | null>
```

This is the exact function body currently duplicated in 8 BFF handler files. Then update all 8 existing deal BFF files + all new inbox BFF files to import from this shared location.

The files to update (confirmed from source inspection):
- `apps/web/src/app/api/bff/deals/route.ts`
- `apps/web/src/app/api/bff/deals/[id]/route.ts`
- `apps/web/src/app/api/bff/deals/[id]/move/route.ts`
- `apps/web/src/app/api/bff/deals/[id]/won/route.ts`
- `apps/web/src/app/api/bff/deals/[id]/lost/route.ts`
- `apps/web/src/app/api/bff/deals/[id]/activities/route.ts`
- `apps/web/src/app/api/bff/deals/forecast/route.ts`
- `apps/web/src/app/api/bff/pipelines/route.ts`
- All new inbox BFF files from M5

This is a mechanical refactor. Do it in one PR. Typecheck + all existing BFF tests must pass unchanged.

---

### M6 Files to Create

| File | Purpose |
|------|---------|
| `apps/web/src/lib/server/bff-auth.ts` | Shared `resolveAccessToken()` helper |
| `apps/web/src/app/(dashboard)/settings/integrations/instagram/page.tsx` | Instagram settings page — list accounts, connect CTA, disconnect |
| `apps/web/src/components/inbox/SavedReplyPicker.tsx` | Floating picker triggered by `/` in compose bar |
| `apps/web/src/components/inbox/CreateLeadModal.tsx` | Create lead from conversation (pre-filled from IG profile) |
| `apps/web/src/app/api/bff/inbox/saved-replies/route.ts` | BFF: `GET`, `POST` |
| `apps/web/src/app/api/bff/inbox/saved-replies/[id]/route.ts` | BFF: `PATCH`, `DELETE` |
| `apps/web/src/lib/hooks/useSavedReplies.ts` | `useSavedReplies()` query + mutation hooks |

---

### M6 API Endpoints (new)

| Method | Path | Auth | Permission | Notes |
|--------|------|------|-----------|-------|
| `GET` | `/api/v1/inbox/saved-replies` | Bearer | `inbox.read` | Supports `?q=shortcut` for `/` shortcut search |
| `POST` | `/api/v1/inbox/saved-replies` | Bearer | `inbox.reply` | Creates saved reply |
| `PATCH` | `/api/v1/inbox/saved-replies/:id` | Bearer | `inbox.reply` | Updates |
| `DELETE` | `/api/v1/inbox/saved-replies/:id` | Bearer | `inbox.reply` | Soft delete |
| `POST` | `/api/v1/inbox/conversations/:id/leads` | Bearer | `inbox.assign` (or `inbox.read_own`) | Creates lead from conversation; links conversation.leadId |

---

### M6 — Meta App Review Checklist

Items required for App Review submission (independent of code):

| Item | Status at plan time |
|------|-------------------|
| Privacy Policy URL live on HTTPS | Must be created |
| Terms of Service URL live on HTTPS | Must be created |
| Business website live | Must be available |
| Facebook Business Verification complete | External (begin in pre-sprint) |
| Screen recording: DM received → visible in app (sandbox) | Record after M5 exit criteria met |
| Screen recording: reply sent from app → appears in IG | Record after M4 exit criteria met |
| `instagram_manage_messages` permission justification | Written explanation required |
| `pages_messaging` permission justification (if applicable) | Written explanation required |
| Test user accounts for reviewer | Create sandbox test accounts |
| Webhook URL live on HTTPS | Requires production/staging deploy |

App Review cannot be submitted from localhost. A staging environment with a real HTTPS URL and the full stack deployed is required. Factor in deployment time when planning the review submission.

---

### M6 Files to Modify

| File | Change |
|------|--------|
| All 8 deal/pipeline BFF route files | Replace inline `resolveAccessToken` with import from `bff-auth.ts` |
| All M5 inbox BFF route files | Same replacement |
| `apps/api/src/modules/inbox/inbox.routes.ts` | Add saved-replies routes and `POST /conversations/:id/leads` route |
| `apps/api/src/modules/inbox/inbox.controller.ts` | Add `createLeadFromConversation`, `listSavedReplies`, etc. |
| `apps/api/src/modules/inbox/inbox.service.ts` | Add `createLeadFromConversation()` |
| `apps/web/src/components/inbox/ComposeBar.tsx` | Wire `SavedReplyPicker` to `/` keydown event |

---

### M6 Acceptance Criteria

1. `resolveAccessToken` has exactly one definition in the codebase (in `bff-auth.ts`); all BFF routes import from it
2. All 8 existing BFF tests + all new BFF tests pass after refactor (no regressions)
3. Saved replies: create, list (with shortcut search), and use in compose bar
4. Create Lead from conversation: lead appears in leads list with `source = 'INSTAGRAM_DM'` and conversation is linked
5. Settings page shows connected Instagram account(s)
6. Meta App Review submitted (or documented as blocked by external prerequisite)
7. `pnpm typecheck` + `pnpm lint` + `pnpm test` + `check:rls` all pass

### M6 Exit Criteria

All acceptance criteria pass. Sprint retrospective: all 6 milestones signed off.

---

## Safest Implementation Order

### Within Each Milestone

The sequence within every milestone follows this invariant:
1. **Shared types first** (enums, Zod schemas, shared package) — nothing else compiles without them
2. **DB migration** — data layer must exist before service layer
3. **Repository** — raw DB operations, testable in isolation
4. **Service** — business logic, depends on repository
5. **Controller + Routes** — HTTP layer, depends on service
6. **Integration tests** — verify the full stack
7. **BFF routes** — verified after API is stable
8. **Frontend hooks** — verified after BFF routes exist
9. **Frontend components + pages** — verified after hooks work

Never write controller before service. Never write frontend hook before BFF route exists. Never write BFF route before API endpoint is stable.

### Across Milestones

```
M1-A (spike)          ──────────────────────────────────────────────────►
M1-B (infra/schema)   ──────────►
                                  M2 ──────────►
                                                  M3 ──────────►
                                                                  M4 ──────►
                                                                  M5 ──────────►
                                                                 M6 (parallel) ──►
```

- M1-A and M1-B run in parallel
- M2 starts ONLY after M1-A spike is signed off and M1-B is merged
- M3 starts after M2 account table exists (can start M3 service code before M2 OAuth is working, but cannot run integration tests)
- M4 and M5 can begin in parallel from Day 8; M4 backend and M5 frontend are independent
- M6 work that does not depend on M5 components (e.g., `resolveAccessToken` extraction, saved-replies backend) can begin from Day 9

### Items That Cannot Be Parallelized

| Dependency | Why |
|-----------|-----|
| M1-A spike → M2 OAuth implementation | OAuth scopes and token type are determined by the spike; building before spike findings leads to rewrite |
| M1-B migrations → M3 integration tests | `instagram_conversations` and `messages` tables must exist in test DB |
| M2 accounts → M3 account-to-org resolution | `handleInstagram()` looks up `instagram_accounts` by `igUserId` |
| M3 message schema → M4 send endpoint | `POST /conversations/:id/messages` creates a `messages` row |
| M4 `WINDOW_CLOSED` logic → M5 `WindowExpiredBanner` | Frontend reads window state from conversation data |

---

## Cross-Cutting Concerns for All Milestones

### RLS

Every new tenant table (`instagram_accounts`, `instagram_conversations`, `messages`) must be added to:
1. `TENANT_TABLES` in `tenant-tables.ts`
2. `TENANT_MODELS` in the same file
3. The migration's RLS block (`ENABLE RLS`, `FORCE RLS`, policy)
4. Verified by `check:rls` — sprint cannot close until `check:rls` reports 22 tables

### Audit Logging

All state-changing operations in `InboxService` and `InstagramService` must call the audit recorder, same pattern as `PipelineService.recordAudit()`. Required for:
- `INSTAGRAM_ACCOUNT_CONNECTED` — when OAuth succeeds
- `INSTAGRAM_ACCOUNT_DISCONNECTED` — when disconnect is called
- `MESSAGE_SENT` — when a send is enqueued (not when Meta confirms it)
- `CONVERSATION_ASSIGNED` — when `assignedToId` changes

### ActivityType and DomainEvent Sync

`FINAL_ARCHITECTURE §10` (via the comment in `events.ts`): every new `DomainEvent` key MUST match the corresponding `ActivityType` value in both `enums.ts` and `prisma/schema.prisma`. Any divergence causes Sprint 7 workflow triggers to silently never fire.

Checklist:
- `MESSAGE_RECEIVED` in: `ActivityType` (enums.ts), `DomainEvent` (events.ts), `ActivityType` enum (schema.prisma) ✓ (to be added in M1)
- `MESSAGE_SENT` in: same three places ✓ (to be added in M1)
- `INSTAGRAM_ACCOUNT_CONNECTED` in: same three places ✓ (to be added in M1)
- `INSTAGRAM_ACCOUNT_DISCONNECTED` in: same three places ✓ (to be added in M1)

### Test Coverage Thresholds

The configured threshold is 60% on all four metrics. New modules must not drop below. Target for Inbox and Instagram modules: ≥70% branch coverage (matching the roadmap's "70% per module before ship" standing policy).

### Feature Flag

`flags.ts` already defines `instagram.sends.enabled`. Wire it in M4:
- `InboxService.sendMessage()` checks `isEnabled('instagram.sends.enabled')` before enqueuing
- If disabled: throw `AppError` with a 503 status and `FEATURE_DISABLED` code

### `check:rls` Milestone Gate

Run `pnpm --filter @leados/api check:rls` at the end of every milestone. Expected output after each:
- After M1: 22 tables (3 new tables added)
- After M2–M6: 22 tables (no new tables in these milestones)

### Error Codes

Add to `packages/shared/src/errors/error-codes.ts` (or equivalent):
- `INSTAGRAM_ACCOUNT_NOT_FOUND`
- `INSTAGRAM_ACCOUNT_EXPIRED`
- `WINDOW_CLOSED`
- `FEATURE_DISABLED`
- `INVALID_OAUTH_STATE`
- `DUPLICATE_INSTAGRAM_ACCOUNT`

---

## Sprint Definition of Done

A milestone is DONE when:
1. All acceptance criteria for that milestone pass
2. `pnpm typecheck` — 0 errors
3. `pnpm lint` — 0 warnings
4. `pnpm --filter @leados/api test` — all tests pass (including new milestone tests)
5. `pnpm --filter @leados/web test` — all tests pass
6. `pnpm --filter @leados/api check:rls` — expected table count
7. Tech lead has reviewed the milestone's integration tests and confirmed they cover the stated risks

The sprint itself is DONE when all 6 milestones are DONE AND Meta App Review has been submitted (or is blocked by an external prerequisite that is documented and tracked).

---

*This plan is based on source code at HEAD (`1bf88db`). Plan must be re-reviewed if the codebase diverges significantly before implementation starts.*
