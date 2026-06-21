# Sprint 6 M4 — Implementation Plan

**Author:** Claude Sonnet 4.6 (Principal Engineer)
**Date:** 2026-06-21
**Status:** PLAN — do not begin until M3 is approved and this plan is signed off
**Milestone:** M4 — Send Pipeline + Status Webhooks
**Depends on:** M3 complete (conversations, messages tables exist; receive pipeline operational)
**Calendar:** Days 7–8 (per `SPRINT_6_EXECUTION_PLAN.md`)
**Source documents:** `SPRINT_6_EXECUTION_PLAN.md §M4`, `SPRINT_6_FINAL_ARCHITECTURE_SIGNOFF.md`

---

## M4 Scope (from Execution Plan)

1. `POST /inbox/conversations/:id/messages` — send endpoint
2. `instagram-send` worker — real implementation (replace M1 stub)
3. Per-account rate-limit guard (BullMQ rate limiter)
4. Outgoing message window validation (24h from `lastInboundAt`)
5. Status webhook handlers: `delivered` and `read` receipts → update `messages.status`, `messages.deliveredAt`, `messages.readAt`
6. `firstResponseAt` SLA stamping on first outbound message per conversation
7. Feature flag `instagram.sends.enabled` kill switch wired to send endpoint
8. BFF proxy for send

---

## Files to Modify

| File | What Changes |
|------|-------------|
| `apps/api/src/core/queue/workers/instagram-send.worker.ts` | Replace no-op stub with real send: load account → decrypt token → call adapter → update message status on success/failure |
| `apps/api/src/modules/inbox/inbox.service.ts` | Add `sendMessage(conversationId, content, senderId)`: window check → create `messages` row (status OUTBOUND/SENT) → enqueue `instagram-send` job → `firstResponseAt` SLA stamp |
| `apps/api/src/modules/inbox/inbox.controller.ts` | Add `sendMessage` request handler |
| `apps/api/src/modules/inbox/inbox.routes.ts` | Add `POST /conversations/:id/messages` with `requirePermission('inbox.reply')` |
| `apps/api/src/core/queue/names.ts` | Confirm `QUEUE.INSTAGRAM_SEND` has rate limiter config (add `rateLimiter` to `createQueue` call if missing) |
| `apps/api/src/modules/webhooks/webhook.worker.ts` | Add `processInstagramStatus()` in `handleInstagram()` — handle `delivery` and `read` messaging events alongside `message` events |
| `apps/web/src/app/api/bff/inbox/conversations/[id]/messages/route.ts` | Add `POST` handler: forward body + auth header to API |

## Files to Create

| File | Purpose |
|------|---------|
| `apps/api/tests/integration/inbox-send.integration.test.ts` | 8 M4 integration tests (see test plan below) |

---

## 1. `instagram-send.worker.ts` — Real Implementation

**Current state:** `processInstagramSendJob()` is a no-op stub that logs and returns.

**Interface contract (from execution plan):**

```typescript
export interface InstagramSendJobPayload {
  organizationId: string;
  conversationId: string;
  messageId: string;        // UUID of the messages row (created optimistically by service)
  recipientIgUserId: string;
  content: { text?: string };
  igAccountId: string;
}
```

**Implementation sequence:**

```
1. Load instagram_account row by igAccountId (base prisma, cross-tenant for decryption)
   - If not found or status !== ACTIVE: update messages.status = FAILED, return
2. Decrypt accessToken: decryptField(account.accessToken) → plainToken
3. Call adapter.sendMessage(recipientIgUserId, content, plainToken)
   - On success: returns { mid: string } from Meta
   - Update messages row: status = 'SENT' (or leave as SENT — no change needed; mid already set)
     Note: Meta's mid differs from our generated UUID; store Meta's mid in messages.mid column
     (messages.mid is already VARCHAR; update it to Meta's mid so status webhooks can match by mid)
4. On adapter error after retries:
   - update messages.status = FAILED
   - Do NOT throw (let BullMQ retry handle it via job failure; worker-registry handles DLQ)
   - Actually: DO throw so BullMQ increments attemptsMade and retries. On final attempt, update FAILED.
```

**Rate limiting:** BullMQ native rate limiter on the `instagram-send` queue. Key = `igAccountId`. Config: `{ max: 10, duration: 1000 }` (10 messages/sec/account — adjust to spike-confirmed limit). This is set in `names.ts` QUEUE config, not in the worker itself.

**Error recovery:** If the worker fails and the job goes to DLQ, the `messages` row stays at `SENT`. A startup reconciliation pass (similar to `reEnqueueStalePendingWebhooks`) can detect stale SENT messages and retry.

---

## 2. `inbox.service.ts` — `sendMessage()` Method

Add to `InboxService`:

```typescript
async sendMessage(
  conversationId: string,
  content: { text: string },
  senderId: string,           // authenticated userId (from requireTenantContext)
): Promise<{ messageId: string; status: 'SENT' }>
```

**Sequence inside `withTenant()`:**

```
1. requireTenantContext() — get { organizationId, userId, ownOnly }
2. convRepo.findByIdOrThrow(conversationId) — 404 if not found
3. ownOnly check: if ownOnly && conv.assignedToId !== userId → throw FORBIDDEN
4. Feature flag check:
   - if env.FLAG_INSTAGRAM_SENDS_ENABLED === false → throw AppError(ErrorCode.FEATURE_DISABLED, ...)
     (503 — use a new ErrorCode or map FEATURE_DISABLED to 503 in error-handler)
5. Window validation:
   - const windowDuration = 24 * 60 * 60 * 1000  // 24 hours in ms
   - if (!conv.lastInboundAt || Date.now() - conv.lastInboundAt.getTime() > windowDuration):
     throw AppError(ErrorCode.WINDOW_CLOSED, 'Messaging window has expired — customer must send a new message')
     (409 conflict)
6. Create messages row (optimistic):
   - msgRepo.create({
       conversationId,
       direction: 'OUTBOUND',
       contentType: 'TEXT',
       content: { text: content.text },
       status: 'SENT',
       sentAt: new Date(),
       senderId: senderId,       // internal user ID
       mid: generateMid(),       // temporary UUID; replaced with Meta mid after send
     })
7. SLA: firstResponseAt stamp
   - if (!conv.firstResponseAt):
     convRepo.update(conversationId, { firstResponseAt: new Date() })
8. Enqueue instagram-send job:
   enqueue(QUEUE.INSTAGRAM_SEND, INSTAGRAM_SEND_JOB, {
     organizationId,
     conversationId,
     messageId: msg.id,
     recipientIgUserId: conv.igConversationId.split('_')[1],  // senderIgUserId from igConversationId
     content: { text: content.text },
     igAccountId: conv.igAccountId,
   })
9. Return { messageId: msg.id, status: 'SENT' }
```

**`generateMid()`:** `crypto.randomUUID()` prefixed with `local_` to distinguish from Meta mids until the send worker updates it. Example: `local_a1b2c3d4-...`

**ErrorCode additions needed:**
- `WINDOW_CLOSED` (409) — add to `packages/shared/src/constants/error-codes.ts` if not present
- `FEATURE_DISABLED` (503) — add if not present
- Check existing ErrorCode list before adding

**`FLAG_INSTAGRAM_SENDS_ENABLED` in env.ts:**
```typescript
FLAG_INSTAGRAM_SENDS_ENABLED: z.coerce.boolean().default(true),
```

---

## 3. `inbox.controller.ts` — `sendMessage` Handler

Add to `createInboxController`:

```typescript
async function sendMessage(req: Request, res: Response): Promise<void> {
  const { id: conversationId } = req.params as { id: string };
  const { content } = req.body as { content?: { text?: string } };
  
  if (!content?.text || typeof content.text !== 'string' || content.text.trim() === '') {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'content.text is required');
  }
  
  const ctx = requireTenantContext();
  const result = await service.sendMessage(conversationId, { text: content.text.trim() }, ctx.userId);
  sendSuccess(res, result, 201);
}
```

Add `sendMessage` to the return value of `createInboxController`.

---

## 4. `inbox.routes.ts` — POST Route

Add after the existing GET routes:

```typescript
// POST /inbox/conversations/:id/messages
// inbox.reply_own holders (SALES_EXECUTIVE) can reply to their assigned conversations only
router.post(
  '/conversations/:id/messages',
  requirePermission('inbox.reply'),
  (req, res, next) => ctrl.sendMessage(req, res).catch(next),
);
```

`requirePermission('inbox.reply')` also grants access to holders of `inbox.reply_own` (the `decide()` function sets `ownOnly = true`). The service's `ownOnly` check handles the restriction.

---

## 5. `webhook.worker.ts` — Status Webhook Handling

Status webhooks arrive on the same `POST /api/webhooks/instagram` endpoint, processed as `INSTAGRAM` source jobs. Inside `handleInstagram()`, the existing `processInstagramMessage()` only handles events where `msgEvent.message` exists (inbound DM). Status events use different field names:

**Delivered receipt payload shape:**
```json
{ "sender": { "id": "..." }, "recipient": { "id": "..." }, "timestamp": 1234,
  "delivery": { "watermark": 1234, "mids": ["mid.xxx"] } }
```

**Read receipt payload shape:**
```json
{ "sender": { "id": "..." }, "recipient": { "id": "..." }, "timestamp": 1234,
  "read": { "watermark": 1234 } }
```

**Implementation — add to `handleInstagram()` loop:**

```typescript
// Inside the messaging[] loop, BEFORE processInstagramMessage:
const delivery = msgEvent['delivery'] as { mids?: string[]; watermark?: number } | undefined;
const read = msgEvent['read'] as { watermark?: number } | undefined;

if (delivery?.mids?.length) {
  await processInstagramDelivery(delivery.mids, webhookEventId).catch(err =>
    logger.warn({ message: 'Status delivery error', error: String(err) })
  );
  continue;  // not a message event
}
if (read?.watermark) {
  await processInstagramRead(read.watermark, webhookEventId).catch(err =>
    logger.warn({ message: 'Status read error', error: String(err) })
  );
  continue;
}
// ... existing message handling
```

**`processInstagramDelivery(mids, webhookEventId)`:**
```typescript
// Update all messages where mid IN mids AND status != DELIVERED
// Use base prisma (mids are globally unique — no cross-tenant risk)
await prisma.message.updateMany({
  where: { mid: { in: mids }, status: { not: 'DELIVERED' } },
  data: { status: 'DELIVERED', deliveredAt: new Date() },
});
```

**`processInstagramRead(watermark, webhookEventId)`:**
```typescript
// Read watermark means all messages sent before this timestamp are read
// Update messages where sentAt <= new Date(watermark) AND status != READ
// This requires knowing the conversation — use watermark as timestamp filter
await prisma.message.updateMany({
  where: {
    sentAt: { lte: new Date(watermark) },
    direction: 'OUTBOUND',
    status: { not: 'READ' },
  },
  data: { status: 'READ', readAt: new Date() },
});
```

**Note:** The `messages` table needs `deliveredAt` and `readAt` columns. Check migration `0015_inbox_tables` — if these columns are not present, a new migration `0016_message_status_timestamps` is needed:
```sql
ALTER TABLE messages ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMPTZ;
```
And add to Prisma schema `Message` model. **Verify this before implementing.**

---

## 6. BFF Route — `apps/web/src/app/api/bff/inbox/conversations/[id]/messages/route.ts`

Check if the file already exists from M3/M5 scaffold. If not, create it with `GET` (forwarding to API) and `POST`:

```typescript
// POST handler
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const token = getAccessToken(req);  // same pattern as other BFF routes
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const body = await req.json();
  const res = await apiClient.post(
    `/inbox/conversations/${params.id}/messages`,
    body,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return NextResponse.json(res.data, { status: res.status });
}
```

Follow the exact same pattern as other BFF routes in the codebase (check `apps/web/src/app/api/bff/leads/` for the pattern).

---

## 7. M4 Integration Tests — `inbox-send.integration.test.ts`

8 tests required per execution plan:

| # | Test | Assertion |
|---|------|-----------|
| 1 | `POST /inbox/conversations/:id/messages` with valid conversation + mocked adapter | 201 + `messages` row with `direction = OUTBOUND`, `status = SENT`; `instagram-send` job enqueued |
| 2 | `POST` where `lastInboundAt` > 24h ago | 409 with `WINDOW_CLOSED` error code |
| 3 | `POST` with `FLAG_INSTAGRAM_SENDS_ENABLED=false` in env | 503 with `FEATURE_DISABLED` error code |
| 4 | `POST` with `inbox.reply_own` token on unassigned conversation | 403 FORBIDDEN |
| 5 | Status webhook (delivered): `processWebhookJob` with delivery event → `messages.status = DELIVERED`, `deliveredAt` set | Direct worker invocation with delivery payload |
| 6 | Status webhook (read): worker with read event → `messages.status = READ`, `readAt` set | Direct worker invocation with read payload |
| 7 | First outbound message → `conversation.firstResponseAt` is set | After send, `convRepo.findById()` → assert `firstResponseAt !== null` |
| 8 | Second outbound message → `conversation.firstResponseAt` NOT updated | Send twice; assert `firstResponseAt` equals timestamp of first send |

**Test setup pattern:** Follow `inbox-receive.integration.test.ts` — use `seedInstagramAccount()`, `buildDmPayload()` helpers. Add:
- `buildDeliveryPayload(mids)` — generates delivery receipt webhook payload
- `buildReadPayload(watermark)` — generates read receipt webhook payload
- `mockInstagramAdapter()` — stubs `adapter.sendMessage()` to return `{ mid: 'meta_mid_xxx' }`

**Window test setup:** Create conversation with `lastInboundAt = new Date(Date.now() - 25 * 60 * 60 * 1000)` (25h ago).

**Kill switch test setup:** `vi.stubEnv('FLAG_INSTAGRAM_SENDS_ENABLED', 'false')` — restore in `afterEach`.

---

## 8. Pre-Implementation Checks

Before writing any M4 code, verify:

1. **`messages` table schema** — confirm `deliveredAt` and `readAt` columns exist in `prisma/schema.prisma`. If absent, write migration `0016` first.
2. **`ErrorCode` enum** — check `packages/shared/src/constants/error-codes.ts` for `WINDOW_CLOSED` and `FEATURE_DISABLED`. Add if missing (and add `check:enum-parity` update).
3. **`QUEUE.INSTAGRAM_SEND` exists** — confirm in `apps/api/src/core/queue/names.ts`. Already expected from M1 but verify.
4. **`adapter.sendMessage()` signature** — check `apps/api/src/modules/instagram/instagram.adapter.ts` for the exact method signature and return type.
5. **BFF pattern** — read one existing BFF route (e.g., `apps/web/src/app/api/bff/leads/`) to confirm the exact token-forwarding pattern before writing the new route.
6. **`instagramUserId` derivation** — `igConversationId = ${recipientIgUserId}_${senderIgUserId}`. `senderIgUserId = igConversationId.split('_')[1]`. Confirm this is the correct split (no underscores in IG user IDs).

---

## 9. Implementation Order (within M4)

Sequential dependencies within M4:

```
Step 1: Schema check (migrations if needed — deliveredAt/readAt columns)
  ↓
Step 2: ErrorCode additions (WINDOW_CLOSED, FEATURE_DISABLED) + env.ts flag
  ↓
Step 3: instagram-send.worker.ts (real implementation)
Step 4: webhook.worker.ts (status handlers)  ← parallel with step 3
  ↓
Step 5: inbox.service.ts (sendMessage method)
  ↓
Step 6: inbox.controller.ts + inbox.routes.ts (HTTP layer)
  ↓
Step 7: BFF route
  ↓
Step 8: inbox-send.integration.test.ts (write tests, run until all 8 pass)
  ↓
Step 9: pnpm typecheck + pnpm lint + pnpm test (all gates must pass)
```

---

## 10. M4 Acceptance Criteria

From `SPRINT_6_EXECUTION_PLAN.md §M4`:

1. A message sent via the API appears in `messages` table with `status = 'SENT'`
2. Meta adapter `sendMessage()` is called with correct content (mock assertion in integration test)
3. Window-closed conversations return 409
4. Kill switch (`FLAG_INSTAGRAM_SENDS_ENABLED=false`) returns 503
5. Status webhook delivered → `messages.status = 'DELIVERED'`
6. `firstResponseAt` is set on first send, not updated on subsequent sends
7. All 8 M4 integration tests pass
8. `pnpm typecheck` + `pnpm lint` + `pnpm build` + `pnpm test` all pass

---

## 11. M4 Exit Criteria

All 8 acceptance criteria pass. `pnpm test` shows zero regressions beyond the 10 pre-existing baseline failures.

---

## 12. What M4 Does Not Include (By Design)

- **Inbox UI** — M5 scope (ConversationList, ThreadView, ComposeBar, MessageBubble, etc.)
- **Lead enrichment via `getSenderProfile()`** — still deferred; M3's `INSTAGRAM_ENRICH_JOB` stub remains
- **Conversation assignment / status change endpoints** — M5 scope (PATCH /conversations/:id)
- **Saved replies** — M5+ scope
- **`@socket.io/redis-emitter` `MESSAGE_SENT` push** — add when M5 frontend needs it; not required for M4 backend tests
- **BFF GET routes for inbox** — defer to M5 unless needed for M4 tests (the integration tests hit the API directly, not via BFF)

---

## UI/UX Non-Negotiables (for M5 — recorded here for M5 handoff)

M4 has no UI changes. When M5 begins, all frontend components must:
- Reuse existing LeadOS design tokens from `apps/web/src/styles/tokens.css`
- Reuse existing `Button`, `Badge`, `Modal`, `Select`, `Tabs`, `Spinner`, `Toast` from `@/components/ui/`
- No new color palette; no hardcoded hex colors
- No new component library; no dashboard shell redesign
- Inbox must visually match Pipeline and Deal Detail pages
- `transition-colors` only (never `transition-all`)
- No skeleton loaders
- No new icon library

See `SPRINT_6_UI_UX_PLAN.md` for full specification including exact class-by-class layout for all inbox components.

---

**M4 implementation requires explicit approval before starting. Do not write any M4 code until approved.**
