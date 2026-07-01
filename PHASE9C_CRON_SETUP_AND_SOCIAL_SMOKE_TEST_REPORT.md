# Phase 9C — Cron Setup and Social Smoke Test Report

## 1. Phase 9B Final Status
- **API Health:** `200 OK` (PASS)
- **No-Auth Cron:** `401 Unauthorized` (PASS - endpoint is correctly guarded)
- **Wrong-Auth Cron:** `401 Unauthorized` (PASS - endpoint correctly rejects bad tokens)
- **Status:** The workaround queue-draining endpoint is LIVE, successfully blocking unauthenticated traffic, and awaiting cron-job.org invocation.

## 2. cron-job.org Setup Steps
Follow these manual steps to connect the cron service to the live LeadOS API:
1. Log in to [cron-job.org](https://cron-job.org)
2. Click **Create Cronjob**
3. Configure as follows:
   - **Title:** `LeadOS Queue Drain`
   - **URL:** `https://leados-api.onrender.com/api/internal/cron/drain-queues`
   - **Execution Schedule:** Every 5 minutes (Start with 5 minutes. Later change to every 1 minute only if needed.)
4. Click the **Advanced** tab:
   - **HTTP Method:** `POST`
   - **Headers:** Add a new header
     - Key: `Authorization`
     - Value: `Bearer <CRON_SECRET>` *(See Section 3)*

## 3. Founder Manual Secret Handling
- **DO NOT paste `CRON_SECRET` in chat.**
- Open your Render Dashboard -> `leados-api` -> Environment.
- Copy the exact value of `CRON_SECRET`.
- Paste it directly into the cron-job.org Header value (replacing `<CRON_SECRET>`).

## 4. Authorized Cron Test Instructions
To verify the endpoint manually with your secret, run this in your local terminal:

```bash
# 1. Temporarily export your secret (Do NOT paste this in chat)
export CRON_SECRET="your-actual-secret-value"

# 2. Trigger the drain endpoint
curl -s -X POST https://leados-api.onrender.com/api/internal/cron/drain-queues \
  -H "Authorization: Bearer $CRON_SECRET"
```

**Expected output:** A JSON response indicating success and the number of jobs processed. If the queues are empty, processing zero jobs is entirely correct and means the endpoint works.

## 5. Smoke Test Plan
To safely verify social automation without risking real Meta calls or customer data:
1. **Develop a Simulation Script:** (Requires your approval to create). A script that POSTs a mock Instagram/WhatsApp payload to the local webhook ingestion endpoint.
2. **Ingestion Verification:** Confirm the event is safely saved to the database with a `PENDING` status.
3. **Queue Processing:** Trigger the local cron drain endpoint.
4. **Processing Verification:** Confirm the event transitions from `PENDING` to `COMPLETED` (or similar status) based on worker logic.
5. **Data Verification:** Confirm that the simulated message correctly generated a lead/conversation/message record within the correct test organization.
6. **Idempotency Check:** Resend the exact same mock payload and confirm no duplicate lead/message is created.
7. **Security Check:** Confirm strict tenant isolation remains safe throughout the lifecycle.

## 6. What Was Verified
- Render deployment successfully launched with new env variables.
- The cron endpoint is accessible over HTTPS.
- Authentication middleware successfully intercepts unauthorized requests.

## 7. What Was Not Tested
- End-to-end webhook ingestion to message delivery.
- Database mutation from actual queue processing (requires authorized invocation).
- Real Meta API connections (intentionally skipped for safety).

## 8. Worker-Free Limitations
- **Timeout Risk:** Since queues are drained via an HTTP request, if processing takes longer than Render's HTTP timeout (usually 100 seconds) or our custom timeout (`TOTAL_CRON_TIMEOUT_MS`), the request will close.
- **Batch Limits:** Processing is intentionally throttled (`CRON_MAX_JOBS_PER_QUEUE=3`) to mitigate timeouts. In high-traffic scenarios, a dedicated worker service will be required.

## 9. Remaining Meta Approval Blockers
- Real Instagram/WhatsApp webhook processing cannot happen until Meta App Review is passed.
- Production outbound messaging requires approved phone numbers and verified business accounts.

## 10. PASS/FAIL Verdict
**PASS.** The free cron worker workaround is fully implemented, deployed, and strictly secured.

## 11. Next Recommended Phase
**Phase 9D — Interactive Lead Capture Flow**
Once the cron-job.org polling is verified, we should build the interactive state machine:
- If a new Instagram/WhatsApp sender lacks a name/phone: trigger an automated reply asking for details.
- Store a temporary conversation state (e.g., `NEEDS_NAME_PHONE`).
- Parse their next reply to extract data and update the lead profile.
- Implement guards to avoid repeatedly asking for the same data and respecting Meta's 24-hour messaging window.
- Ensure strict tenant isolation.
