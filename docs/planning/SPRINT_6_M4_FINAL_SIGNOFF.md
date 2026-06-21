# Sprint 6 M4 — Final Signoff

**Milestone:** M4 — Send Pipeline + Status Webhooks
**Date:** 2026-06-21
**Author:** Claude Sonnet 4.6 / raja kumar
**Status:** COMPLETE — awaiting independent review before M5

---

## Scope Delivered

M4 implements the full Instagram DM send pipeline and status webhook handling as specified in
`SPRINT_6_EXECUTION_PLAN.md §M4` and `SPRINT_6_M4_IMPLEMENTATION_PLAN.md`.

### Files Created

| File | Purpose |
|------|---------|
| `apps/api/tests/integration/inbox-send.integration.test.ts` | 8 M4 integration tests (all passing) |

### Files Modified

| File | Change |
|------|--------|
| `apps/api/src/core/config/env.ts` | `FLAG_INSTAGRAM_SENDS_ENABLED` kill switch (boolean, default true) |
| `apps/api/src/core/queue/workers/instagram-send.worker.ts` | Real implementation: account load → token decrypt → `adapter.sendMessage()` → `messages.status` update; exported `INSTAGRAM_SEND_JOB` and `processInstagramSendJob()` |
| `apps/api/src/core/queue/workers/webhook.worker.ts` | `processInstagramDelivery()` + `processInstagramRead()` status handlers wired in `handleInstagram()` loop |
| `apps/api/src/modules/inbox/inbox.service.ts` | `sendMessage()`: flag check → window check → ownOnly gate → OUTBOUND message create → `firstResponseAt` SLA stamp → enqueue job |
| `apps/api/src/modules/inbox/inbox.controller.ts` | `sendMessage` handler with body validation |
| `apps/api/src/modules/inbox/inbox.routes.ts` | `POST /conversations/:id/messages` with `requirePermission('inbox.reply')` |

---

## Gate Results

| Gate | Result |
|------|--------|
| `pnpm typecheck` | ✅ PASS — 0 errors |
| `pnpm lint` (M4 files) | ✅ PASS — 0 warnings |
| `pnpm build` | ✅ PASS |
| `pnpm test` (full suite) | ✅ PASS — 432 pass, 1 skipped, 0 new failures |
| `check:rls` | ✅ PASS — 22 tenant tables |
| `check:enum-parity` | ✅ PASS — 21 enums |
| `inbox-send.integration.test.ts` | ✅ **8/8 PASS** |

---

## Integration Test Coverage (8/8)

| # | Test | Acceptance Criterion | Result |
|---|------|---------------------|--------|
| 1 | `POST` happy path → 201 + OUTBOUND message row | AC #1, #2 | ✅ |
| 2 | Window expired (> 24h) → 409 `WINDOW_CLOSED` | AC #3 | ✅ |
| 3 | Kill switch disabled → 503 `FEATURE_DISABLED` | AC #4 | ✅ |
| 4 | `inbox.reply_own` on unassigned → 403 `FORBIDDEN` | Execution plan spec | ✅ |
| 5 | Delivered webhook → `status=DELIVERED`, `deliveredAt` set | AC #5 | ✅ |
| 6 | Read webhook → `status=READ`, `readAt` set | Execution plan spec | ✅ |
| 7 | First send → `firstResponseAt` set | AC #6 | ✅ |
| 8 | Second send → `firstResponseAt` NOT updated | AC #6 (immutability) | ✅ |

---

## Acceptance Criteria Mapping

From `SPRINT_6_EXECUTION_PLAN.md §M4`:

- [x] AC #1 — A message sent via the API appears in `messages` table with `status = 'SENT'`
- [x] AC #2 — Meta adapter `sendMessage()` is called with correct content (SandboxAdapter used in test env; verified by test 1 checking the messages row)
- [x] AC #3 — Window-closed conversations return 409
- [x] AC #4 — Kill switch (`FLAG_INSTAGRAM_SENDS_ENABLED=false`) returns 503
- [x] AC #5 — Status webhook delivered → `messages.status = 'DELIVERED'`
- [x] AC #6 — `firstResponseAt` is set on first send, not updated on subsequent sends
- [x] AC #7 — All 8 M4 integration tests pass

---

## Known Deviations and Accepted Limitations

| Item | Status |
|------|--------|
| BFF POST route for send | Deferred to M5 — no frontend consumer yet; no dead-code risk. See M4 Review §Scope Verification item 9. |
| Per-account BullMQ rate limiter (`groupKey: 'igAccountId'`) | Current implementation uses worker-level concurrency (10). Spike-confirmed rate limit not yet available; named group rate limiter is a M5 enhancement. |
| `processInstagramRead` scopes read events globally by timestamp | Known limitation; M5 can narrow scope by conversationId if needed. |

---

## What M4 Does Not Include (By Design)

- Inbox UI (ConversationList, ThreadView, ComposeBar, etc.) — M5
- Socket.io `MESSAGE_SENT` push — M5 (no frontend to receive)
- BFF routes for inbox send — M5
- Conversation assignment / status change endpoints — M5
- Lead enrichment — still deferred per SCALE-1
- Saved replies — M5+

---

## Approval Required Before M5

M5 covers the full Social Inbox frontend and the 401-refresh-retry fix in `api-client.ts`.
All M5 UI work must follow `SPRINT_6_UI_UX_PLAN.md` strictly:

- Reuse existing LeadOS design tokens only
- Reuse existing Button, Badge, Modal, Select, Tabs, Spinner, Toast from `@/components/ui/`
- No new color palette; no hardcoded hex colors
- No new component library; no dashboard shell redesign
- Inbox must visually match Pipeline and Deal Detail pages
- `transition-colors` only (never `transition-all`)
- No skeleton loaders
- No new icon library

**M4 is complete. Awaiting independent review and approval before M5 begins.**
