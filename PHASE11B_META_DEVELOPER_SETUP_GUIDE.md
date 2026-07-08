# Phase 11B — Meta Developer Setup Guide & Test Integration Checklist

## 1. Approved Scope
This guide provides practical, founder-facing instructions to set up the real Meta Developer environment required to bring LeadOS out of simulation mode and into real production use. It covers Instagram Business and WhatsApp Cloud API setup, required Webhook configurations, and App Review requirements.

## 2. Current LeadOS Social Status
*   **Simulation Mode:** Currently enabled and working perfectly for both Instagram and WhatsApp interactive lead capture.
*   **Background Workers:** Queues, cron jobs, and background workers are fully functional.
*   **Real Integration Status:** **NOT CONFIGURED YET**. Real Meta credentials are not present. Real API calls are skipped safely.
*   **App Review:** The app requires Meta App Review (Advanced Access) before public production use.

## 3. What Already Exists in Code
*   **Routing:** `/api/webhooks/instagram`, `/api/webhooks/whatsapp`, and `/api/instagram/callback` are implemented and live on the Render API.
*   **Webhook Deduplication:** Incoming events are handled idempotently via `webhook_events`.
*   **Tenancy Security:** Multitenant payload resolution isolates organization data securely.
*   **Token Encryption:** AES-256-GCM encryption is used for storing Meta access tokens.
*   **Outbound Workers:** `INSTAGRAM_SEND_JOB` and `WHATSAPP_SEND_JOB` workers exist.
*   **Simulation vs Real Mode:** The `isSimulation` flag safely routes to either mock or real behavior.
*   **Kill Switches:** Outbound sends fail safely if real credentials are not present in `.env` or if the kill flags (`FLAG_INSTAGRAM_SENDS_ENABLED`, `FLAG_WHATSAPP_SENDS_ENABLED`) are disabled.

## 4. What Is Still Not Real/Production Ready
*   **Meta Developer App:** Missing.
*   **Production Environment Variables:** The Render deployment lacks real Meta secrets.
*   **Advanced Access:** Meta App Review is required for `instagram_manage_messages` and `pages_messaging`.

## 5. Meta Developer Account Setup
1.  Go to [Meta for Developers](https://developers.facebook.com/).
2.  Log in with your Facebook account and complete the registration to become a Meta Developer.
3.  Ensure your account is linked to the Meta Business Manager for your organization.

## 6. Meta App Creation Steps
1.  In the Meta Developer Console, click **Create App**.
2.  Select the **Business** app type (or the type that supports Instagram Graph API and WhatsApp).
3.  Name the app (e.g., "LeadOS CRM") and link it to your Business Portfolio.
4.  Once created, navigate to the App Dashboard and add the following products:
    *   **Instagram Graph API**
    *   **WhatsApp**
    *   **Facebook Login for Business** (required for Instagram OAuth)

## 7. Instagram Business Setup Steps
1.  Ensure you have an Instagram account converted to a **Professional/Business Account**.
2.  In the Instagram app settings, ensure "Allow Access to Messages" is toggled ON (under Settings > Privacy > Messages).

## 8. Facebook Page Connection Steps
1.  Your Instagram Business Account must be linked to a Facebook Page that you admin.
2.  In Facebook Business Settings, ensure both the Page and the Instagram Account are added to your Business Manager.

## 9. WhatsApp Cloud API Test Setup Steps
1.  In the Meta App Dashboard, navigate to **WhatsApp > Getting Started**.
2.  Meta will automatically provision a **Test Phone Number**.
3.  Note the **Phone Number ID** (this will map to `META_WHATSAPP_PHONE_ID`).
4.  Add your own personal phone number as a **Recipient Phone Number** for testing.
5.  Generate a temporary access token to verify the API works.

## 10. Webhook Callback URL Setup
In the Meta App Dashboard, set up webhooks for both products.

*   **Instagram Webhooks (via Facebook Login / Messenger settings):**
    *   **Callback URL:** `https://leados-api.onrender.com/api/webhooks/instagram`
    *   **Fields to Subscribe:** `messages`, `messaging_postbacks`, `message_reads`, `feed`
*   **WhatsApp Webhooks:**
    *   **Callback URL:** `https://leados-api.onrender.com/api/webhooks/whatsapp`
    *   **Fields to Subscribe:** `messages`

## 11. Webhook Verify Token Setup
When configuring the webhooks in the Meta Dashboard, you will be prompted for a "Verify Token". You must generate secure random strings for these, enter them into the Meta Dashboard, and save them for your `.env` variables.

*   For Instagram: Use the value you plan for `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`.
*   For WhatsApp: Use the value you plan for `META_WHATSAPP_VERIFY_TOKEN`.

## 12. Required Environment Variable Names
The following variables must be populated to enable real integration. (No values are listed here for security).

**Instagram Config:**
*   `INSTAGRAM_APP_ID` (Found in Meta App Settings)
*   `INSTAGRAM_APP_SECRET` (Found in Meta App Settings)
*   `INSTAGRAM_OAUTH_REDIRECT_URI` (Set to: `https://leados-api.onrender.com/api/instagram/callback`)
*   `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` (The token you define in Meta Webhook setup)
*   `FLAG_INSTAGRAM_SENDS_ENABLED` (Must be `true` or omitted)

**WhatsApp Config:**
*   `META_APP_SECRET` (Found in Meta App Settings - usually the same as `INSTAGRAM_APP_SECRET`)
*   `META_WHATSAPP_VERIFY_TOKEN` (The token you define in Meta Webhook setup)
*   `META_WHATSAPP_PHONE_ID` (Optional: The Test Phone Number ID for WhatsApp)
*   `META_API_VERSION` (Defaults to `v20.0` in code)
*   `FLAG_WHATSAPP_SENDS_ENABLED` (Must be `true` or omitted)

## 13. Render Environment Variable Checklist
*   [ ] Log into Render dashboard.
*   [ ] Select the LeadOS API service.
*   [ ] Add all variables listed in Section 12.
*   [ ] Deploy the updated environment.

## 14. Local/Staging Environment Checklist
*   [ ] Create or update your `.env` securely. **DO NOT COMMIT TO GIT.**
*   [ ] Ensure `ngrok` or similar is used if testing webhooks locally, as Meta requires a public HTTPS URL. (If using Render for staging, skip local webhook config).

## 15. Instagram Test User Checklist
Before Advanced Access, the app can only interact with roles assigned in the app.
*   [ ] In the Meta App Dashboard, go to **Roles > Roles**.
*   [ ] Add the Instagram accounts you wish to test with as "Testers".
*   [ ] Accept the tester invite in the respective Instagram accounts.

## 16. WhatsApp Test Number Checklist
*   [ ] Ensure the recipient phone number is verified in the WhatsApp > API Setup panel.
*   [ ] Send a test message from the WhatsApp panel to your verified phone to open the 24-hour window.

## 17. App Review / Advanced Access Checklist
To allow *any* user to message your Instagram or WhatsApp numbers:
*   [ ] App requires **Advanced Access** for `instagram_manage_messages`.
*   [ ] App requires **Advanced Access** for `pages_messaging`.
*   [ ] Prepare a screencast demonstrating the OAuth flow and how messages are handled in the LeadOS UI.
*   [ ] Submit the app for Meta App Review.

## 18. Business Verification Notes
*   Meta requires **Business Verification** to grant Advanced Access or use WhatsApp beyond the test tier.
*   Ensure your organization's legal details are verified in the Meta Business Manager.

## 19. Safe Test Plan
1.  Deploy the real credentials to Render without altering existing simulation data.
2.  Use the LeadOS frontend (Settings > Integrations) to initiate the Instagram OAuth flow using a Meta Test User.
3.  Send a real DM from a Test User on Instagram to the connected Business Account.
4.  Verify the webhook arrives, decrypts, and appears in the LeadOS Inbox.
5.  Reply from the LeadOS Inbox and verify delivery to the Test User.
6.  Repeat for WhatsApp using the verified test numbers.

## 20. Production Launch Blockers
*   Meta App Review Approval (Advanced Access).
*   Business Verification Approval.
*   Final QA of real-world rate limits against Meta's Graph API.

## 21. Rollback Plan
If real integration causes issues or crashes:
1.  Go to the Render dashboard.
2.  Set `FLAG_INSTAGRAM_SENDS_ENABLED=false` and `FLAG_WHATSAPP_SENDS_ENABLED=false`.
3.  This safely kills all outbound sends without requiring a code deploy, throwing harmless errors in the background queue.
4.  To stop incoming webhooks, remove the callback URLs in the Meta Developer Console.

## 22. Next Phase Recommendation
**CAUTION:** The founder must verify final steps against official Meta Developer documentation before entering credentials or submitting App Review.

**Recommended Next Phase: Phase 11C — Meta Test Credential Wiring + Webhook Verification in Staging/Test Mode**

*Phase 11C should only begin after the founder confirms:*
1.  Meta Developer App is created.
2.  Instagram Business Account is connected.
3.  Facebook Page is connected.
4.  WhatsApp Cloud API test number is ready.
5.  Test users are added.
6.  Required environment variables are added in Render securely.
7.  No secrets have been pasted in chat.
