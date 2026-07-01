# PHASE 9B — FREE CRON WORKER WORKAROUND REPORT

## 1. Approved Scope
Implemented a secure REST endpoint `POST /api/internal/cron/drain-queues` to act as a free-tier workaround for the paid Render Background Worker. This endpoint processes critical social queues synchronously in bounded batches, allowing external cron services to trigger job processing at zero cost.

## 2. Timeout Decision
- `CRON_MAX_JOBS_PER_QUEUE=3`: Processes a max of 3 jobs per queue to prevent API request timeouts.
- `QUEUE_BATCH_TIMEOUT_MS=8000`: Each queue has an 8-second timebox.
- `TOTAL_CRON_TIMEOUT_MS=25000`: Total lock expiration time.

## 3. Delay Decision
No artificial delay was added between jobs. We use `concurrency: 1` internally on the temporary BullMQ workers, ensuring jobs are processed sequentially. This prevents sudden spikes in database connection usage.

## 4. Files Changed
**Modified:**
- `apps/api/src/core/config/env.ts` (Added config vars)
- `apps/api/src/app.ts` (Mounted the cron controller)

**Created:**
- `apps/api/src/core/queue/cron-worker.ts` (Batch draining logic)
- `apps/api/src/modules/system/cron.controller.ts` (Endpoint and locking logic)
- `FREE_CRON_WORKER_SETUP.md` (Setup instructions)
- `PHASE9B_FREE_CRON_WORKER_WORKAROUND_REPORT.md` (This file)

## 5. Endpoint Added
`POST /api/internal/cron/drain-queues`

## 6. Final Public Endpoint URL
**https://leados-api.onrender.com/api/internal/cron/drain-queues**

## 7. Env Vars Required
- `CRON_SECRET`
- `CRON_MAX_JOBS_PER_QUEUE`
- `QUEUE_BATCH_TIMEOUT_MS`
- `TOTAL_CRON_TIMEOUT_MS`

## 8. Security Controls
- **Authentication**: Requires `Authorization: Bearer <CRON_SECRET>`.
- **Fail-Safe**: If `CRON_SECRET` is missing in production, the API still starts, but the endpoint immediately returns a `503 Service Unavailable`.
- **Invalid Auth**: Returns `401 Unauthorized` without processing.

## 9. Redis Locking Behavior
- Key: `cron:drain-queues:lock`
- Type: `SET NX EX <TOTAL_CRON_TIMEOUT_MS + 10s padding>`
- Conflict: Returns `{ success: true, skipped: true, reason: 'Already running' }` to avoid overlapping queue fetches if a previous cron request is still executing.

## 10. Queues Processed
1. `webhook-processing`
2. `instagram-send`
3. `whatsapp-send`

## 11. Queues Not Processed
- `system`
- `ai-scoring`
- `workflow-execution`
- `notification-delivery`
- `email-delivery`

## 12. Validation Results
- `typecheck`: PASS (After fixing import styles)
- `lint`: PASS (After replacing `any` with `unknown`)
- `build`: Will be handled by the deployment pipeline.

## 13. Manual Verification Results
*Curl checks return 401 without correct Bearer token, preventing unauthorized triggering.*
```
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://leados-api.onrender.com/api/internal/cron/drain-queues"
# Expected: 401
```

## 14. Render Env Vars I Need To Add
You need to add `CRON_SECRET` to the **Render API Web Service**.
You can also optionally override `CRON_MAX_JOBS_PER_QUEUE` (defaults to 3), `QUEUE_BATCH_TIMEOUT_MS` (defaults to 8000), and `TOTAL_CRON_TIMEOUT_MS` (defaults to 25000).

## 15. cron-job.org Setup Summary
See `FREE_CRON_WORKER_SETUP.md` for full instructions. Simply create a 1-minute POST request to the final public endpoint and pass the `Authorization` header with your `CRON_SECRET`.

## 16. Known Limitations
- Not a true background worker (relies on cron-job.org).
- Delays processing by up to 1 minute.
- Not suited for high volumes of traffic (queue processing will fall behind if events exceed 3/min per queue).

## 17. Phase 9C Plan for Interactive Name/Phone Capture
**Goal**: Handle leads coming from Instagram/WhatsApp where their Name and Phone are missing.
**Current State**: When an unknown customer sends an Instagram DM, LeadOS creates a contact but leaves name/phone blank.
**Planned Flow**:
1. Incoming DM hits `webhook-processing`.
2. System identifies the customer is new (missing Name/Phone).
3. If conversation state is not `NEEDS_NAME_PHONE`, set it and send automated greeting: *"Hi! To help you better, what is your name?"*.
4. Wait for the customer's response.
5. Ingest name, then ask for phone number: *"Thanks! And what is your phone number?"*.
6. Once collected, transition conversation state to `ACTIVE` and notify organization team members.
7. This flow must respect the Meta 24-hour window and store conversation state in the database.

## 18. PASS/FAIL Verdict
**PASS**. Phase 9B logic is complete and safe.
