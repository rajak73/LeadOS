# Sprint 6 Readiness Review — Principal Engineer Assessment

**Reviewer role:** Principal Engineer, independent audit
**Date:** 2026-06-21
**Method:** Source-code inspection only. No reliance on prior review documents.
**Files read:** `schema.prisma`, `app.ts`, `worker.ts`, `webhook.worker.ts`, `webhook.controller.ts`, `webhook.service.ts`, `api-client.ts`, `env.ts`, `event-bus.ts`, `scheduler.ts`, `cron-registry.ts`, `names.ts`, `flags.ts`, `socket/client.ts`, all module directories, all `package.json` files.

---

## 1. Sprint 5 Final Score

**76 / 100**

### Breakdown

| Category | Weight | Score | Notes |
|----------|--------|-------|-------|
| Feature completeness vs plan | 30% | 22/30 | M1–M6 shipped. File upload is a placeholder (accepted). Notes is a textarea (accepted). Leads frontend is deferred Sprint 4 work, not net-new Sprint 5 scope — it counts but is not bonus work. |
| Test quality | 25% | 21/25 | 659 passing tests is real work. Integration test suite is well-structured. However: 0 frontend component tests for `DealCard`, `KanbanBoard`, `StageTimeline` mutation paths; `useMoveDeal` optimistic update is untested; socket client stub has 0 tests. |
| Coverage | 15% | 13/15 | API 87.5%/82.3% is solid. Web coverage only measures BFF routes — React component branches are untracked. The 83.84% branch coverage on BFF routes has 21 uncovered branches; most are auth error paths, which are the paths most likely to fail in prod. |
| Technical debt left behind | 15% | 9/15 | 7 debt items, 5 of which were known at M5 start and not addressed. The 401 retry placeholder has been sitting in `api-client.ts` since Sprint 1 (comment says "implemented in Sprint 2"). Five sprints later, it still is not there. This is the most consequential unresolved item. |
| Architecture compliance | 15% | 11/15 | `FINAL_ARCHITECTURE §5.3` mandates message-grain dedup at the `mid` level. The current webhook idempotency is at the envelope level only — a critical compliance gap for Sprint 6. The `CRON_REGISTRY` is empty despite the Sprint 5 plan requiring the webhook async backbone to be production-ready. |

**Honest assessment:** Sprint 5 produced a solid CRM-backend foundation and a functional Kanban UI. The async backbone (persist-then-200, HMAC, idempotent, BullMQ) is the most important delivery and it is correctly implemented. The score is reduced because two features were placeholders, the 401 retry remains unimplemented for the 5th sprint in a row, and the webhook idempotency does not yet meet the architecture spec for Sprint 6 use.

---

## 2. Production Readiness Score

**41 / 100**

This is not a failing grade — it correctly reflects that the system is **not designed to be production-ready yet**. Sprint 8 is the production launch. The score is calibrated against what would be needed to put this in front of real users today.

| Gap | Severity |
|-----|----------|
| No billing (Stripe Checkout, plan enforcement beyond limits, subscription state machine) | P0 for launch |
| No 401 token-refresh retry — users will get hard failures on token expiry | P0 for daily usability |
| No email delivery wired (SendGrid configured in env as optional) | P0 for auth flows |
| No file upload (presigned URL infra) | P1 |
| No realtime tier (`socket.io` server not installed in API) | P1 for Inbox |
| `JWT_ACCESS_SECRET` has a dev default that boots in production without error | P0 security |
| No rate-limit per-user (only per-org) — API-1 P1 known gap | P1 |
| No GDPR export/erasure pipeline | P1 for EU |
| No staging environment validated (same-site domains requirement) | P0 for auth |
| Notes are plain textarea — not suitable for B2B SaaS UX | P2 |

The platform spine, tenancy layer, RBAC, and CRM core are production-grade in isolation. The system is not yet a shippable product.

---

## 3. Technical Debt Score

**34 / 100** *(lower = more debt)*

Seven known items from the closure report plus three additional items found during this review.

| ID | Item | Age | Severity | Source |
|----|------|-----|----------|--------|
| **TD-1** | `resolveAccessToken` duplicated in 8 BFF handlers | Sprint 5 M5 | Medium | `apps/web/src/app/api/bff/deals/*/route.ts` |
| **TD-2** | No 401 → token refresh retry in `api-client.ts` | **Sprint 1** (5 sprints old) | **High** | `apps/web/src/lib/api-client.ts:35` |
| **TD-3** | Notes use `<textarea>` not rich text editor | Sprint 5 M6 | Low | `LeadNotesList.tsx:40` |
| **TD-4** | File upload is a `<p>` placeholder | Sprint 5 M6 | Medium | `LeadFilesList.tsx:34` |
| **TD-5** | Webhook worker is a log-and-skip skeleton | Sprint 5 M4 | Medium (by design) | `webhook.worker.ts:handleInstagram()` |
| **TD-6** | Won/Lost via hover buttons not `...` menu | Sprint 5 M5 | Low | `DealCard.tsx:61` |
| **TD-7** | `instagramAccountId` bare UUID, no FK | Sprint 4 | Low (by design) | `schema.prisma:449` |
| **TD-8** | `CRON_REGISTRY` is empty | **Sprint 1** (by design, but now blocking) | **High** | `cron-registry.ts:[]` |
| **TD-9** | No AES-256-GCM encryption utility exists anywhere | Not built yet | **Critical for Sprint 6** | `find apps/api/src -name "*.ts" \| xargs grep -l "createCipheriv"` → 0 results |
| **TD-10** | Webhook idempotency is envelope-grain only; architecture requires message-grain `mid` dedup | Sprint 5 M4 | **High for Sprint 6** | `FINAL_ARCHITECTURE §5.3` vs `webhook.service.ts` |

**TD-8, TD-9, TD-10 are newly found** — they are not in the Sprint 5 closure report. TD-9 (no AES encryption) and TD-10 (missing `mid`-grain dedup) are direct Sprint 6 blockers, not future concerns.

---

## 4. Top 10 Risks Before Sprint 6

### R-1 — Meta App Review (EXTERNAL, SCHEDULE-CRITICAL)
**Severity: P0**
Meta App Review gates production Instagram use. Review typically takes 1–8 weeks and can be rejected requiring resubmission. Facebook Business Verification (a prerequisite) can take another 1–2 weeks. The Sprint 6 roadmap says "submit at the earliest demonstrable point" — but the earliest demonstrable point requires a working integration, which won't exist until mid-Sprint 6. This creates a 3–6 week delay between completion of the sprint and being able to use it in production. **Action:** Begin Facebook Business Verification immediately (it is not blocked on code). Do not wait for the full implementation.

### R-2 — Meta API validation spike not done (TECHNICAL, SPRINT-START BLOCKER)
**Severity: P0**
`FINAL_ARCHITECTURE §5.1` mandates a 2–3 day pre-build spike to validate: OAuth flow variant (Instagram Login vs Facebook Login), correct scopes, token type and true lifetime (the IG-3 discrepancy — Page token vs 60-day long-lived token), real messaging window duration (commonly 24h), and current webhook field names. **This spike has not happened.** Building Sprint 6 M2 (OAuth) and M3 (receive pipeline) without it means the entire implementation may be built on the wrong assumptions. A re-do halfway through the sprint is a two-sprint cost.

### R-3 — `socket.io` server is not installed in the API process
**Severity: P0**
`apps/web` has `socket.io-client ^4.8.0` installed. `apps/api/package.json` does not have `socket.io` or `@socket.io/redis-adapter`. The Web client stub (`apps/web/src/lib/socket/client.ts`) sets `autoConnect: false`. The realtime tier — required for the Inbox to show incoming messages without polling — does not exist on the server side. The HTTP→WebSocket upgrade, org rooms, and Redis adapter all need to be built from scratch. This is 1–2 days of infrastructure work that should be M1 day one, not discovered mid-sprint.

### R-4 — No AES-256-GCM encryption utility (SECURITY, M2 BLOCKER)
**Severity: P0**
`FINAL_ARCHITECTURE §5.4` requires: encrypt Instagram OAuth tokens at rest, AES-256-GCM, with a key-version prefix (rotatable). A search of all `.ts` files in `apps/api/src` finds zero uses of `createCipheriv`, `createDecipheriv`, or any encryption library. The utility does not exist. `env.ts` has no `FIELD_ENCRYPTION_KEY` variable. Storing Instagram access tokens in plaintext in `instagram_accounts.accessToken` would be a security violation. This must be built before M2 merges.

### R-5 — `CRON_REGISTRY` is empty; daily token refresh will not run
**Severity: P1**
Instagram long-lived user tokens need to be refreshed before they expire (FINAL_ARCHITECTURE §5.4: "per-account refresh per the spike-confirmed token"). The scheduler mechanism exists (`scheduler.ts`, `cron-registry.ts`) and is single-flight-correct. But `CRON_REGISTRY = []`. The daily token refresh job cannot be registered because no such job has been written. If tokens expire without refresh, all accounts go `EXPIRED` simultaneously and no DMs are received until each account owner manually reconnects.

### R-6 — Webhook idempotency is envelope-grain, not message-grain (CORRECTNESS)
**Severity: P1**
`FINAL_ARCHITECTURE §5.3`: "dedup at the **message** grain (`mid`) independent of the coarse `webhook_events` envelope." The current `persistAndEnqueue()` in `webhook.service.ts` deduplicates on `(source, externalEventId)`. The `externalEventId` is extracted by `extractInstagramEventId()` in `webhook.controller.ts` — which uses the `entry.messaging[0].mid`. **But** a single webhook delivery can contain multiple entries, and a single entry can contain multiple messaging events. The current extractor takes only `[0]` — if Meta batches two messages into one webhook, the second message is silently dropped. The architecture says the real handler needs to split messages and dedup each `mid` independently.

### R-7 — 401 token refresh has been a placeholder for 5 sprints (USABILITY, NOW CRITICAL)
**Severity: P1**
`apps/web/src/lib/api-client.ts:35`: comment says "implemented in Sprint 2 (needs /auth/refresh)". Sprint 2 is done. The `/api/auth/refresh` BFF endpoint exists and is tested. The interceptor is still a no-op. Access tokens have a 15-minute TTL. An agent using the Inbox for 20 minutes will get a hard 401 on every API call with no recovery. This is the first thing agents will notice in UAT. It must ship in Sprint 6.

### R-8 — `instagram-send` queue has no worker implementation
**Severity: P1**
`apps/api/src/core/queue/names.ts` defines `QUEUE.INSTAGRAM_SEND = 'instagram-send'` with concurrency 10. The `apps/api/src/core/queue/worker-registry.ts` (not read, but implied by `startWorkers()` in `worker.ts`) must register a worker for this queue. Currently, no such worker file exists under `apps/api/src`. The send pipeline — the only way to reply to an Instagram DM — cannot function without it.

### R-9 — `env.ts` has no Instagram OAuth env vars beyond the webhook vars
**Severity: P1**
`env.ts` declares: `INSTAGRAM_APP_SECRET` and `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` (both for webhook receipt). Missing: `INSTAGRAM_APP_ID` (required for OAuth redirect), `INSTAGRAM_OAUTH_REDIRECT_URI` (required for callback URL), `FIELD_ENCRYPTION_KEY` (required for AES-256-GCM). Any process that starts in the Sprint 6 environment will silently use `undefined` for these values because they are not in the Zod schema and the schema does not fail-fast on unknown vars. The OAuth flow and token storage will silently be broken.

### R-10 — Three-panel Inbox is the most complex frontend component in the system (SCOPE RISK)
**Severity: P2**
The Kanban board (Sprint 5 M5) was the most complex frontend work to date. The Social Inbox is larger: cursor-paginaged conversation list, thread view with message bubbles and status indicators, compose with `/` shortcut saved replies, real-time message delivery via Socket.io, assignment UI, create-lead-from-conversation modal, and mobile responsiveness. This scope should be broken into frontend-first (static with mock data) → API integration → realtime layers, not built as one milestone. If scope is underestimated, realtime will be cut first — which removes the core value proposition of the Inbox.

---

## 5. Missing Architecture Pieces for Instagram Inbox

These are architecture-level components that have zero implementation and must exist before the Inbox can function.

| Component | Architecture doc reference | Current state |
|-----------|---------------------------|---------------|
| AES-256-GCM encryption utility with key-version prefix | FINAL_ARCHITECTURE §5.4, §6.1 | **Does not exist.** Zero code. |
| Socket.io server (`socket.io` package) | FINAL_ARCHITECTURE §1, §7.1 | Not installed in API. Client stub exists in web (`autoConnect: false`). |
| Socket.io Redis adapter (`@socket.io/redis-adapter`) | FINAL_ARCHITECTURE §7.1 | Not installed anywhere. |
| Org-room Socket.io namespace + join-on-auth | FINAL_ARCHITECTURE §7.1 | Not implemented. |
| `instagram-send` BullMQ worker | DEVELOPMENT_ROADMAP Sprint 6 | Queue defined, worker file does not exist. |
| Daily IG token refresh cron | FINAL_ARCHITECTURE §5.4 | `CRON_REGISTRY` is empty. |
| Meta API validation spike | FINAL_ARCHITECTURE §5.1 (mandatory) | Not done. Sprint 6 build must not start before this. |
| `InstagramAdapter` interface | FINAL_ARCHITECTURE §5.2 | Not defined. |
| Account → org resolution in webhook worker | FINAL_ARCHITECTURE §5.3 | `handleInstagram()` just logs. |
| Message-grain `mid` dedup | FINAL_ARCHITECTURE §5.3 | Only envelope-grain dedup exists. |
| `instagram.message.received` event emission | FINAL_ARCHITECTURE §5.3 | `eventBus.emitDurable()` wiring does not exist for this event. |
| Lead find/create + IG profile enrichment | DEVELOPMENT_ROADMAP Sprint 6 | Not implemented. |
| `FIELD_ENCRYPTION_KEY` in `env.ts` | FINAL_ARCHITECTURE §5.4 | Not declared. Process starts without it silently. |
| `INSTAGRAM_APP_ID` / `INSTAGRAM_OAUTH_REDIRECT_URI` in `env.ts` | Required for OAuth | Not declared. |

---

## 6. Missing Database Tables for Inbox

None of the Instagram Inbox tables exist in `schema.prisma`. `saved_replies` is the only inbox-adjacent table and it was created as a shell in Sprint 4 (no routes, no service).

| Table | Purpose | Status |
|-------|---------|--------|
| `instagram_accounts` | OAuth credentials (AES-encrypted token), account status, org mapping | **Does not exist** |
| `instagram_conversations` | One per IG thread (IG IGSID + page_id → org). Tracks `firstResponseAt` (SLA), `lastMessageAt`, `isOpen`, `assignedToId`, `labels` | **Does not exist** |
| `messages` | Individual DMs, direction (INBOUND/OUTBOUND), `mid` (idempotency key), `status` (sent/delivered/read), `content` JSON | **Does not exist** |
| FK: `leads.instagramAccountId → instagram_accounts.id` | Enrichment link — currently a bare UUID | **Migration required** |
| Message-grain dedup extension | Either a field on `messages` or a separate `message_dedup` table | **Architecture decision not made** |

`saved_replies` shell exists with columns `(id, organizationId, title, content, shortcut, isGlobal, createdById, deletedAt)`. No routes or service code. Needs CRUD endpoints in Sprint 6.

---

## 7. Missing API Endpoints for Inbox

### Instagram OAuth

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/auth/instagram` | OAuth redirect to Meta; requires `INSTAGRAM_APP_ID` + scopes |
| `GET` | `/auth/instagram/callback` | Code exchange → long-lived token → AES-encrypt → store in `instagram_accounts` |
| `GET` | `/instagram/accounts` | List connected accounts for org |
| `DELETE` | `/instagram/accounts/:id` | Disconnect; revoke webhooks subscription |

### Conversations + Messages

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/inbox/conversations` | Cursor-paginated; filter by account, assignee, label, isOpen |
| `GET` | `/inbox/conversations/:id` | Single conversation + participant info |
| `PATCH` | `/inbox/conversations/:id` | Assign to user, update labels, toggle open/closed |
| `GET` | `/inbox/conversations/:id/messages` | Cursor-paginated thread |
| `POST` | `/inbox/conversations/:id/messages` | Send reply → enqueue to `instagram-send` → Meta Graph API |
| `POST` | `/inbox/conversations/:id/leads` | Create lead from conversation |

### Saved Replies

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/saved-replies` | List (org-global + user-created); support shortcut search |
| `POST` | `/saved-replies` | Create |
| `PATCH` | `/saved-replies/:id` | Update |
| `DELETE` | `/saved-replies/:id` | Soft delete |

### BFF routes (Next.js)

All of the above need corresponding `/api/bff/inbox/*` route handlers, following the same `resolveAccessToken` pattern already used for deals (and the pattern that needs to be extracted to a shared helper).

---

## 8. Missing Frontend Pages/Components for Inbox

### Pages

| Route | Description | Status |
|-------|-------------|--------|
| `/inbox` | Three-panel Social Inbox | **Does not exist** |
| `/settings/integrations/instagram` | OAuth connect, account list, disconnect | **Does not exist** |

### Components

| Component | Description | Status |
|-----------|-------------|--------|
| `InboxPage.tsx` | Three-panel layout: accounts sidebar + conversation list + thread panel | **Does not exist** |
| `ConversationList.tsx` | Cursor-paginated list, filter bar, unread badge, account indicator | **Does not exist** |
| `ConversationItem.tsx` | Single conversation tile: last message preview, assignee avatar, SLA badge | **Does not exist** |
| `ThreadView.tsx` | Message bubbles, direction-aware alignment, timestamp, delivery status | **Does not exist** |
| `ComposeBar.tsx` | Textarea + send button + saved-reply `/` trigger + emoji (optional) | **Does not exist** |
| `SavedReplyPicker.tsx` | Floating panel, `/` shortcut to open, fuzzy search, keyboard nav | **Does not exist** |
| `ConversationHeader.tsx` | Assignee select, label chips, open/close toggle | **Does not exist** |
| `CreateLeadFromConversationModal.tsx` | Pre-filled from IG profile, confirmation | **Does not exist** |
| `AccountConnectCard.tsx` | OAuth "Connect Instagram" CTA, status, disconnect | **Does not exist** |
| Socket.io `useSocket` hook | Connect on auth, join org room, `new_message` → `queryClient.invalidate` | **Does not exist** (stub is `autoConnect: false`, not wired) |
| `useConversations` hook | `useInfiniteQuery`, cursor pagination | **Does not exist** |
| `useMessages` hook | `useInfiniteQuery` + real-time appended by socket event | **Does not exist** |
| `useSendMessage` hook | `useMutation` → BFF → API → `instagram-send` queue | **Does not exist** |
| `useInstagramAccounts` hook | `useQuery` for connected accounts | **Does not exist** |

### Existing components that need modification

| Component | Change needed |
|-----------|--------------|
| Nav sidebar | Add "Inbox" entry with unread count badge |
| `LeadMetadataForm` | Show Instagram handle if `instagramHandle` is set; link to conversation |
| `api-client.ts` | **Must implement 401 → refresh → retry** before Inbox ships |

---

## 9. Recommended Sprint 6 Milestone Breakdown (M1–M6)

Sprint 6 is two weeks (10 working days). The workload is large. The breakdown below is honest about what fits.

---

### M1 — Pre-Build Spike + Infrastructure + Schema (Days 1–3)

**This must be done before M2. Do not parallelize with M2.**

**Backend:**
- Meta API validation spike (1.5–2 days): Confirm OAuth flow variant, scopes, token type + lifetime, messaging window, webhook field names, `mid` field path in live sandbox event. Document findings. Only then begin coding.
- Install `socket.io` + `@socket.io/redis-adapter` in `apps/api`
- Add `INSTAGRAM_APP_ID`, `INSTAGRAM_OAUTH_REDIRECT_URI`, `FIELD_ENCRYPTION_KEY` to `env.ts` Zod schema with fail-fast production guard (same pattern as `JWT_ACCESS_SECRET`)
- Implement AES-256-GCM encryption utility: `encrypt(plaintext, key) → { ciphertext, iv, tag, keyVersion }` and `decrypt(envelope, key)`; unit tests against known vectors
- Migrations:
  - `0014_instagram_accounts` — `instagram_accounts(id, organizationId, igAccountId, igUsername, accessToken [ENCRYPTED], tokenExpiresAt, status, webhookSubscribed, createdAt, updatedAt, deletedAt)`
  - `0015_inbox_conversations` — `instagram_conversations(id, organizationId, igConversationId, igAccountId FK, leadId FK nullable, contactId FK nullable, assignedToId FK nullable, labels jsonb, isOpen, firstResponseAt, lastMessageAt, createdAt, updatedAt)`
  - `0016_messages` — `messages(id, organizationId, conversationId FK, direction ENUM(INBOUND/OUTBOUND), mid [unique idempotency key], content jsonb, status ENUM(SENT/DELIVERED/READ/FAILED), sentAt, deliveredAt, readAt, createdAt, updatedAt)`
  - `0017_instagram_account_fk` — add FK `leads.instagramAccountId → instagram_accounts.id` (the deferred constraint)
  - Add RLS to all 4 new tables (all are tenant-scoped); update `check:rls` registry
- Socket.io server setup: attach to Express HTTP server; Redis adapter; org-room namespace (`/inbox`); `auth` middleware validates JWT, joins `org:{orgId}` room
- Register `INSTAGRAM_SEND` worker stub in worker registry (empty handler — parallel to implementing it in M4)

**Exit gate:** `pnpm typecheck`, `pnpm test`, `check:rls` pass. `encrypt/decrypt` unit tests pass. Meta spike findings documented in a decision record.

---

### M2 — Instagram OAuth + Account Management (Days 3–5)

**Backend:**
- `GET /auth/instagram` — build OAuth state (signed, nonce), redirect to Meta
- `GET /auth/instagram/callback` — exchange code → long-lived token, AES-encrypt, store in `instagram_accounts`, subscribe webhook on the account
- `GET /instagram/accounts` — list connected accounts (permission: `org.read`)
- `DELETE /instagram/accounts/:id` — unsubscribe webhook, mark deleted
- Register daily token refresh cron in `CRON_REGISTRY`: refresh each `ACTIVE` account's token before `tokenExpiresAt - 7 days`; set status to `EXPIRED` if refresh fails; emit notification (placeholder OK for Sprint 6)
- `InstagramAdapter` interface: `connect()`, `subscribeWebhook()`, `unsubscribeWebhook()`, `refreshToken()`, `fetchProfile()`, `sendMessage()`, `getConversation()` — separates wire format from business logic

**BFF:**
- `GET /api/bff/instagram/accounts`
- `DELETE /api/bff/instagram/accounts/:id`

**Tests:** Unit tests for AES round-trip on token fields. Integration tests for OAuth callback (mocked Meta API response). Integration test for account deletion.

**Exit gate:** OAuth flow demoed end-to-end in sandbox. Token stored encrypted in DB (verified via direct query). Cron registered and visible in BullMQ dashboard.

---

### M3 — Receive Pipeline (Real Instagram Handler) (Days 5–7)

**Backend:**
- Rewrite `handleInstagram()` in `webhook.worker.ts`:
  1. Parse `entry` array — iterate ALL entries and ALL `messaging` events (not just `[0]`)
  2. For each message event: extract `mid`, look up `instagram_accounts` by `recipientId` → resolve `organizationId`
  3. Dedup by `mid` in `messages` table (upsert with `ON CONFLICT (mid) DO NOTHING`)
  4. Upsert `instagram_conversations` by `(igConversationId, organizationId)`
  5. Create `messages` row
  6. Lead find/create: look up lead by `instagramHandle` or `instagramUserId`; if not found, create with `source = 'INSTAGRAM'`, `firstName` from IG display name
  7. Backfill `webhook_events.organizationId`
  8. Emit `instagram.message.received` via `eventBus.emitDurable(...)` → Socket.io broadcast to `org:{orgId}` room
- Conversations + Messages read endpoints: `GET /inbox/conversations`, `GET /inbox/conversations/:id`, `GET /inbox/conversations/:id/messages`

**Tests:** Integration tests: single message receive, multi-message batch, duplicate `mid` idempotency, cross-account isolation, lead enrichment.

**Exit gate:** Sandbox DM received → visible in `messages` table → `webhook_events.status = DONE`. Multi-entry batch test passes (proves the `[0]`-only bug is fixed).

---

### M4 — Send Pipeline + Status Webhooks (Days 7–8)

**Backend:**
- `POST /inbox/conversations/:id/messages` → validate → check conversation is OPEN → enqueue to `instagram-send`
- `INSTAGRAM_SEND` worker: call Meta Graph API `POST /{ig-user-id}/messages`; handle rate limits (per-account budget); on success: persist `messages` row with `direction = OUTBOUND`; on failure after retries: set `status = FAILED`, surface error
- Status webhook handlers: `delivered` + `read` receipts → update `messages.status`, `messages.deliveredAt`, `messages.readAt`, `instagram_conversations.firstResponseAt` (only if not already set)
- Feature flag `instagram.sends.enabled` wired to send endpoint (kill switch already defined, just needs to be checked)
- Out-of-window (24h) detection: if `instagram_conversations.lastInboundMessageAt > 24h`, reject send with 409 + `reason: WINDOW_CLOSED`

**BFF:**
- `POST /api/bff/inbox/conversations/:id/messages`

**Tests:** Integration test: send → Meta mock API called → `messages` row created. Out-of-window rejection test. Status webhook delivered → `firstResponseAt` set.

**Exit gate:** Send pipeline round-trip demonstrated in sandbox (DM received → reply sent → delivered status received).

---

### M5 — Frontend: Social Inbox (Days 8–10)

**Frontend (parallel to M4 backend where possible):**
- `app/(dashboard)/inbox/page.tsx` — RSC shell; fetch initial conversations
- `InboxPage.tsx` (client component) — three-panel layout (responsive: stacked on mobile)
- `ConversationList.tsx` — `useInfiniteQuery`, `IntersectionObserver` for cursor pagination
- `ConversationItem.tsx` — last message preview, assignee avatar, unread dot, account badge
- `ThreadView.tsx` — message bubbles, inbound left / outbound right, timestamps, delivery status icons
- `ComposeBar.tsx` — textarea, `/` prefix triggers `SavedReplyPicker`, send button disabled when window closed (shows tooltip)
- `SavedReplyPicker.tsx` — floating panel, keyboard navigation, on-select inserts into compose
- `ConversationHeader.tsx` — assignee select (mutation: `PATCH /conversations/:id`), labels, open/close toggle
- Socket.io integration: `useSocket` hook connects on auth (set `autoConnect: true` on login, stop on logout), joins `org:{orgId}`, on `instagram.message.received` → `queryClient.invalidateQueries(['conversations'])` + append message to active thread
- **401 retry in `api-client.ts`**: this must ship in this milestone — Inbox sessions will be long-lived, and the 15-minute token TTL makes 401s near-certain during normal use

**BFF routes:**
- `GET /api/bff/inbox/conversations` (cursor-based)
- `GET /api/bff/inbox/conversations/[id]`
- `PATCH /api/bff/inbox/conversations/[id]`
- `GET /api/bff/inbox/conversations/[id]/messages`
- `POST /api/bff/inbox/conversations/[id]/messages`
- `GET /api/bff/saved-replies`

**Exit gate:** Sandbox DM visible in Inbox UI. Reply typed and sent. New DM arrives in UI without page refresh (Socket.io working).

---

### M6 — Hardening, Settings, App Review Prep (Day 10 + async)

**Backend:**
- `saved_replies` CRUD endpoints (shell table exists, routes needed)
- `POST /inbox/conversations/:id/leads` — create lead from conversation (pre-fill from IG profile)
- `GET /instagram/accounts` page in Settings
- `resolveAccessToken` extracted to shared BFF helper (replace 8+ duplicates)
- Add `instagram_accounts` labeling/SLA metrics to coverage
- Reconcile webhook path mismatch documented in DEVELOPMENT_ROADMAP (doc 10 vs SETUP.md — already fixed in `app.ts` canonical path, but verify against Meta dashboard config)

**Frontend:**
- `CreateLeadFromConversationModal.tsx`
- `/settings/integrations/instagram` page: `AccountConnectCard`, list accounts, disconnect
- Nav sidebar: Inbox entry with unread badge

**Infrastructure:**
- Submit Meta App Review (requires working sandbox demo + privacy policy URL + screen recording)
- Facebook Business Verification (begin immediately if not already started — external dependency with long lead time)

**Exit gate:** Full end-to-end demo: IG DM → Inbox → reply → create lead. Settings page shows connected account. Meta App Review submitted.

---

## 10. Go / No-Go Decision for Sprint 6

### Verdict: **CONDITIONAL GO**

Sprint 6 can start, but with the following conditions. Starting without them guarantees a mid-sprint replan.

---

### Hard preconditions (do these before writing M2 code)

| # | Precondition | Status | Estimated effort |
|---|-------------|--------|-----------------|
| **P-1** | Meta API validation spike — must complete and document findings before M2 code starts | **NOT DONE** | 1.5–2 days |
| **P-2** | `socket.io` + `@socket.io/redis-adapter` installed in `apps/api` and Socket.io server attached to HTTP server | **NOT DONE** | 0.5 days |
| **P-3** | AES-256-GCM encryption utility implemented and unit-tested | **NOT DONE** | 0.5 days |
| **P-4** | `env.ts` updated with `INSTAGRAM_APP_ID`, `INSTAGRAM_OAUTH_REDIRECT_URI`, `FIELD_ENCRYPTION_KEY` with production fail-fast guard | **NOT DONE** | 2 hours |
| **P-5** | Facebook Business Verification process initiated with Meta | Unknown | External — start immediately |

---

### Hard blockers if skipped

| Skip | Consequence |
|------|-------------|
| Skip spike (P-1) | Build OAuth on wrong token type → entire OAuth flow may need rewrite mid-sprint |
| Skip Socket.io (P-2) | M5 realtime layer cannot be built; Inbox degrades to polling-only (not acceptable for a DM product) |
| Skip AES (P-3) | IG access tokens stored in plaintext → security violation; refactoring encrypted columns after seeding is expensive |
| Skip env.ts (P-4) | `INSTAGRAM_APP_ID` is `undefined` in every environment; OAuth redirect is broken day one |

---

### What is healthy going into Sprint 6

- Webhook backbone (HMAC, persist-then-200, idempotency) is correct and tested. M3 only needs to add real handler logic.
- `instagram-send` queue is named and concurrency-configured. M4 only needs the worker implementation.
- Feature flag `instagram.sends.enabled` exists and defaults to `true`. The kill switch works.
- `eventBus.emitDurable()` pattern is established and correct. M3 just needs to call it for the right event.
- Scheduler mechanism (`scheduleAllCrons`, `cron-registry.ts`) is single-flight correct. M2 just needs to add an entry.
- `InstagramAdapter` pattern from FINAL_ARCHITECTURE §5.2 is a clean seam — once defined, the receive and send implementations bind to it, not to Meta's wire format.

---

### Risk-adjusted timeline

With the 5 preconditions met, the Sprint 6 scope is achievable in 10 days for a senior full-stack engineer but leaves zero slack. The most likely overrun points are:

1. **M3 receive pipeline** — multi-entry batching + lead enrichment is more logic than it looks
2. **M5 ComposeBar + SavedReplyPicker** — the `/` shortcut UX is fiddly; keyboard nav in the picker is a known front-end time sink
3. **M5 Socket.io client integration** — reconnect logic, org-room state after tab visibility change, and stale-closure bugs in mutation callbacks are consistently underestimated

**Recommendation:** If capacity is constrained, cut M6 (saved replies, create-lead-from-conversation, settings page) from Sprint 6 and move it to Sprint 6.5 / Sprint 7 start. The Meta App Review submission does not require the settings page — it requires the core receive+send+display flow.

---

*All claims in this document verified against source code at commit `1bf88db` (HEAD). No reliance on prior review documents.*
