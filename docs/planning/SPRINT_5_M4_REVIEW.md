# Sprint 5 M4 Review — Webhook Subsystem Skeleton

Date: 2026-06-20  
Scope: Sprint 5 M4 — Webhook receiver, BullMQ worker, idempotency, DLQ, startup re-enqueue.

## Verdict

Sprint 5 M4 implementation is complete and ready for review.

No M5 frontend work was implemented. No Instagram inbox or real event handlers were implemented. No new DB tables or RLS policies were added — the `webhook_events` table and its dual-policy RLS from M1 are reused unchanged.

---

## Files Created

- `apps/api/src/modules/webhooks/webhook.service.ts`
- `apps/api/src/modules/webhooks/webhook.controller.ts`
- `apps/api/src/modules/webhooks/webhook.routes.ts`
- `apps/api/src/modules/webhooks/index.ts`
- `apps/api/src/core/queue/workers/webhook.worker.ts`
- `apps/api/tests/integration/webhook.integration.test.ts`

## Files Modified

- `apps/api/src/core/config/env.ts`
  - Added `INSTAGRAM_APP_SECRET`, `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`, `STRIPE_WEBHOOK_SECRET` with dev/test defaults.
- `apps/api/src/core/queue/worker-registry.ts`
  - Added `registerWorker('webhook-processing', ...)` in `startWorkers()`.
  - Added `void reEnqueueStalePendingWebhooks().catch(...)` on startup.
- `apps/api/src/app.ts`
  - Replaced `import { webhookRouter } from './core/webhooks/webhook.routes.js'` with `import { buildWebhooksModule } from './modules/webhooks/index.js'`.
  - Updated mount: `app.use('/api/webhooks', express.raw(...), buildWebhooksModule())`.
- `apps/api/src/core/webhooks/webhook.routes.ts`
  - Replaced Sprint 1 `/_echo` stub with a placeholder comment.

---

## Delivered Functionality

### Webhook Receiver

- `GET /api/webhooks/instagram` — Meta hub.challenge verification. Checks `hub.mode=subscribe` + `hub.verify_token` against env; returns `hub.challenge` as plain text on match; 403 on mismatch.
- `POST /api/webhooks/instagram` — HMAC-SHA256 verified receiver. Header: `X-Hub-Signature-256: sha256=<hex>`. Invalid or missing signature → 400. Valid → persist + enqueue + 200.
- `POST /api/webhooks/stripe` — Stripe signature verified receiver. Header: `Stripe-Signature: t=<ts>,v1=<hex>`. Timestamp tolerance ±300 seconds. Invalid or expired → 400. Valid → persist + enqueue + 200.

### HMAC Verification

Both receivers use `crypto.timingSafeEqual` to prevent timing side channels. `req.body` is a raw `Buffer` (from `express.raw()` already mounted in `app.ts` before `express.json()`). No external HMAC library — Node.js built-in `crypto` only.

### Idempotency

Unique constraint `(source, externalEventId)` is the DB-layer guard. On P2002 conflict:
- Existing status `DONE` or `SKIPPED` → return 200 immediately, no re-enqueue.
- Existing status `PENDING` or `PROCESSING` → update to `SKIPPED`, return 200 (worker guards on `SKIPPED` status and returns early).
- Existing status `FAILED` → re-enqueue for another attempt, return 200.

### BullMQ Worker

`processWebhookJob` registered on `QUEUE.WEBHOOK_PROCESSING` (`'webhook-processing'`, concurrency 30). No new queue name was created — the existing queue provisioned in `names.ts` is reused.

Worker flow:
1. Load event from DB via base `prisma` (no `withTenant`, no GUC — `organizationId` is null for all Sprint 5 events).
2. Guard: if status is `DONE` or `SKIPPED`, return early.
3. Update: `status=PROCESSING`, `attempts++`, `lastAttemptAt=now()`.
4. Dispatch to `handleInstagram` / `handleStripe` / `handleSystem` (Sprint 5 skeleton: log and return).
5. On success: `status=DONE`, `processedAt=now()`.
6. On error: `status=FAILED`, `errorMessage` set; BullMQ retries 3× with exponential backoff (2s→4s→8s); after exhaustion → `moveToDeadLetter('webhook-processing', ...)`.

### Dead-Letter Queue

Reuses existing `moveToDeadLetter()` from `apps/api/src/core/queue/dlq.ts`. The `worker-registry.ts` `worker.on('failed', ...)` handler already calls `moveToDeadLetter` when attempts are exhausted. The worker also explicitly calls it before rethrowing on the last attempt to guarantee the DB status is captured even if the DLQ write fails.

### Startup Re-enqueue

`reEnqueueStalePendingWebhooks()` called fire-and-forget in `startWorkers()`. Scans `webhook_events WHERE status='PENDING' AND createdAt < now() - INTERVAL '5 minutes'` via base `prisma`; enqueues each to `webhook-processing`. Recovers events orphaned by API crash between DB write and Redis enqueue.

---

## Architecture Conformance

| Constraint | Status |
|---|---|
| `express.raw()` before `express.json()` in `app.ts` | Preserved — existing mount unchanged |
| No `requireTenantContext()` in receiver or worker | Confirmed — no import anywhere in M4 files |
| No `withTenant()` in receiver (org null at receive time) | Confirmed |
| HMAC via `crypto.timingSafeEqual` | Confirmed |
| `QUEUE.WEBHOOK_PROCESSING` reused (no new queue) | Confirmed |
| `registerWorker('webhook-processing', ...)` pattern | Confirmed |
| DLQ via `moveToDeadLetter()` | Confirmed |
| No M5/M6 code | Confirmed |

---

## Tests Added

12 integration tests in `apps/api/tests/integration/webhook.integration.test.ts`:

**POST /api/webhooks/instagram (4):**
- 200 — valid HMAC persists event with `status=PENDING`
- 400 — invalid HMAC signature, nothing persisted
- 400 — missing `X-Hub-Signature-256` header
- 200 — duplicate `externalEventId` marks existing event `SKIPPED`

**GET /api/webhooks/instagram (2):**
- 200 — valid `verify_token` returns `hub.challenge` value
- 403 — invalid `verify_token`

**POST /api/webhooks/stripe (3):**
- 200 — valid Stripe signature persists event with `status=PENDING`
- 400 — invalid Stripe signature
- 400 — expired Stripe timestamp (> 300s tolerance)

**Worker: processWebhookJob (3):**
- `PENDING → DONE` on successful dispatch; `processedAt` set
- `DONE` event skipped without re-processing; `attempts` unchanged
- Missing event returns early without error

**Test isolation:** A `beforeAll` defensive cleanup runs before every suite execution, deleting any rows matching `LIKE 'test-m4-%' OR LIKE 'ig_test-m4-%'`. The `afterAll` cleanup uses the same two-pattern delete. This covers both directly-seeded IDs (`test-m4-*`) and IDs generated by `extractInstagramEventId`'s `ig_${entryId}_${entryTime}` fallback (`ig_test-m4-*`). Suite passes on repeated executions against the same database.

---

## Validation Results

- `npm run -w apps/api typecheck` — PASS
- `npm run -w apps/api lint` — PASS
- `npm run -w apps/api build` — PASS (ESM build success in 37ms)
- `npm run -w apps/api test -- tests/integration/webhook.integration.test.ts` — PASS (12/12, verified on two consecutive runs)
- `npm run -w apps/api check:rls` — PASS (`19 tenant tables enabled + forced + policied`)

---

## Notes

**Prisma P2002 log in test stdout:** The duplicate idempotency test triggers a caught unique constraint violation. Prisma logs the raw error to stderr before the catch handler runs. This is expected behavior — the test passes and the idempotency path is exercised correctly.

**RLS on webhook_events:** The base `prisma` client (admin role, BYPASSRLS) is used for all webhook DB access. The dual-policy RLS (`webhook_insert` permissive, `webhook_select`/`webhook_update` admitting NULL-org rows) is the future backstop for when the connection switches to `leados_app`. For Sprint 5, all events have `organizationId=null`.

**Sprint 6 limitation (documented):** The startup re-enqueue scan uses base `prisma` which, once the runtime switches to `leados_app`, will only see NULL-org `PENDING` events due to the `webhook_select` policy. Sprint 6 Stripe handlers that backfill `organizationId` will require the re-enqueue scan to use a `leados_platform_admin` (BYPASSRLS) connection. Not a Sprint 5 concern.

---

## Out of Scope Confirmed

- No Instagram inbox or DM processing
- No Stripe billing event processing
- No WhatsApp receiver
- No frontend changes
- No new Prisma migrations
- No new RLS policies
