# Phase 9C — Cron Setup and Social Smoke Test Report

## 1. Phase 9B Final Status
- **API Health:** `200 OK` (PASS)
- **No-Auth Cron:** `401 Unauthorized` (PASS - endpoint is correctly guarded)
- **Wrong-Auth Cron:** `401 Unauthorized` (PASS - endpoint correctly rejects bad tokens)
- **Status:** The workaround queue-draining endpoint is real, LIVE, successfully blocking unauthenticated traffic, and awaiting cron-job.org invocation.

## 2. cron-job.org Setup Steps
Follow these manual steps to connect the cron service to the live LeadOS API. **cron-job.org setup is real and ready for configuration**:
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

## 5. Smoke Test Plan (SIMULATION ONLY)
**IMPORTANT CLARIFICATION:** The following smoke scripts are **SIMULATION-ONLY**. Real Instagram/WhatsApp/Facebook integrations are NOT configured, no real Meta credentials have been provided, no real webhook subscriptions exist, and no real outbound social reply has been tested. Real production social automation remains completely blocked until Meta credentials and approvals are configured.

To safely verify local social automation logic without real Meta calls:
1. **Simulation Scripts:** We have created `simulate-instagram-webhook.ts` and `simulate-whatsapp-webhook.ts`. These scripts POST mock payloads to the local webhook ingestion endpoint.
2. **Ingestion Verification:** Confirm the mock event is safely saved to the database with a `PENDING` status.
3. **Queue Processing:** Trigger the local cron drain endpoint.
4. **Processing Verification:** Confirm the mock event transitions from `PENDING` to `COMPLETED`.
5. **Data Verification:** Confirm that the simulated message correctly generated a lead/conversation/message record.

## 6. What Was Verified
- Render deployment successfully launched with new env variables.
- The cron endpoint is accessible over HTTPS.
- Authentication middleware successfully intercepts unauthorized requests.

## 7. What Was Not Tested / Not Configured
- **Real Instagram/WhatsApp/Facebook integrations are NOT configured.**
- No real Meta credentials have been provided.
- No real Meta webhook subscription has been verified.
- No real outbound social reply has been tested.

## 8. Worker-Free Limitations
- **Timeout Risk:** Since queues are drained via an HTTP request, if processing takes longer than Render's HTTP timeout, the request will close.
- **Batch Limits:** Processing is intentionally throttled to mitigate timeouts. In high-traffic scenarios, a dedicated worker service will be required.

## 9. Remaining Meta Approval Blockers
- Real Instagram/WhatsApp webhook processing cannot happen until Meta App Review is passed.
- Production outbound messaging requires approved phone numbers and verified business accounts.

## 10. PASS/FAIL Verdict
**PASS (Simulation & Infrastructure Only).** The free cron worker workaround is fully implemented and deployed. However, the social automation integration itself remains in purely simulation/mock mode.

## 11. Next Recommended Phase
**Phase 9D — Interactive Lead Capture Flow (Simulation Mode)**
Once the cron-job.org polling is verified, we should build the interactive state machine entirely using the simulation scripts:
- If a new simulated sender lacks a name/phone: trigger an automated state change.
- Store a temporary conversation state (`NEEDS_NAME_PHONE`).
- Parse their next simulated reply to extract data and update the lead profile.
- Real Meta delivery will only be added later after credentials exist.
