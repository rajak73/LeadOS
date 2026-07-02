# Free Cron Worker Setup

## 1. Why this workaround exists
LeadOS uses [BullMQ](https://docs.bullmq.io/) backed by Upstash Redis to handle background tasks like Webhooks and Social Message Sending. Normally, a dedicated background worker process handles these queues continuously.

However, the **Render Free Tier** does not support Background Worker services. To achieve a zero-cost deployment, this workaround allows an external cron service to securely trigger the main API web service to process pending jobs in small, synchronous batches.

## 2. Why Render Background Worker is skipped
Render charges for background workers, which violates the strict free-tier requirement. The web service will act as a temporary worker when triggered.

## 3. Required Render API Environment Variables
You must add the following variables to your **LeadOS API** environment in the Render dashboard:

| Variable | Description |
|---|---|
| `CRON_SECRET` | Secret bearer token to secure the endpoint. |
| `CRON_MAX_JOBS_PER_QUEUE` | Maximum number of jobs to process per queue per run. |
| `QUEUE_BATCH_TIMEOUT_MS` | Maximum duration (ms) to allow a single queue to process. |
| `TOTAL_CRON_TIMEOUT_MS` | Used for the global Redis lock expiry. |

## 4. Recommended Values
- `CRON_MAX_JOBS_PER_QUEUE` = **3**
- `QUEUE_BATCH_TIMEOUT_MS` = **8000** (8 seconds)
- `TOTAL_CRON_TIMEOUT_MS` = **25000** (25 seconds)

*Generate a secure `CRON_SECRET` using a password generator or `openssl rand -hex 32`.*

## 5. cron-job.org Setup Steps
1. Sign up / log in to [cron-job.org](https://cron-job.org/).
2. Create a **New Cronjob**.
3. **Title:** LeadOS Queue Drainer
4. **URL:** `https://leados-api.onrender.com/api/internal/cron/drain-queues`
5. **Execution schedule:** Every 1 minute.
6. **Advanced Options > Headers:**
   - Add Header: `Authorization`
   - Value: `Bearer <YOUR_CRON_SECRET>` (Replace `<YOUR_CRON_SECRET>` with your actual secret).
7. **HTTP Method:** `POST`
8. Save and enable the job.

## 6. Exact Endpoint URL
```
POST https://leados-api.onrender.com/api/internal/cron/drain-queues
```

## 7. Required Authorization Header
```
Authorization: Bearer <CRON_SECRET>
```

## 8. Security Warning
⚠️ **CRON_SECRET MUST NOT BE EXPOSED.**
Do not commit this secret to version control. If exposed, anyone can repeatedly trigger queue processing, potentially exhausting your database connection pool and Meta API rate limits.

## 9. Limitations
- **Less reliable than a paid worker:** It depends on external pings (cron-job.org).
- **Render free service sleep:** If the API sleeps, the first cron ping might timeout while waking the server up.
- **Heavy queues may lag:** With a max of 3 jobs per queue per minute, processing a sudden influx of 100 messages will take ~33 minutes to drain.
- **AI scoring/workflows skipped:** Phase 9B does not process the AI Lead Scoring or Workflow Execution queues.
