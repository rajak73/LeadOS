# Phase 11C — Founder Meta Setup Action Tracker

## 1. Current Status
LeadOS architecture is ready for Instagram/WhatsApp real integration. Routing, queues, OAuth flows, multitenant isolation, token encryption, and workers are implemented. However, real Meta setup is pending.

## 2. Why Phase 11C Is Blocked
Phase 11C is the "Meta Test Credential Wiring + Webhook Verification" phase. This requires real credentials from Meta and a verified webhook setup to proceed. The agent cannot (and should not) do this on behalf of the founder for security and compliance reasons.

## 3. Founder Actions Required
Please complete the checklists below before authorizing Phase 11C.

## 4. Meta Developer App Checklist
* [ ] Log into Meta for Developers.
* [ ] Create a Business App.
* [ ] Add Instagram Graph API and WhatsApp products.
* [ ] Note down the **App ID** and **App Secret**.

## 5. Instagram Business Checklist
* [ ] Convert your target Instagram account to a Professional/Business account.
* [ ] Toggle "Allow Access to Messages" to ON in the Instagram app privacy settings.

## 6. Facebook Page Checklist
* [ ] Ensure you have a Facebook Page.
* [ ] Link the Instagram Business account to the Facebook Page via Business Manager.

## 7. WhatsApp Cloud API Test Number Checklist
* [ ] Navigate to WhatsApp > Getting Started in the Meta App Dashboard.
* [ ] Retrieve your **Test Phone Number ID**.
* [ ] Add your personal number as a verified test recipient.

## 8. Test User Checklist
* [ ] Go to Roles > Roles in the Meta App Dashboard.
* [ ] Add your testing Instagram/Facebook accounts as App Testers.
* [ ] Accept the invites in the respective accounts.

## 9. Callback URLs to Configure
In the Meta Webhook settings, configure these exact URLs:
*   **Instagram Webhook:** `https://leados-api.onrender.com/api/webhooks/instagram`
*   **Instagram OAuth Callback:** `https://leados-api.onrender.com/api/instagram/callback`
*   **WhatsApp Webhook:** `https://leados-api.onrender.com/api/webhooks/whatsapp`

## 10. Render Environment Variable Checklist
Add the following variable names (with your real Meta values) to the Render Dashboard for the API service:
*   `INSTAGRAM_APP_ID`
*   `INSTAGRAM_APP_SECRET`
*   `INSTAGRAM_OAUTH_REDIRECT_URI` (set to `https://leados-api.onrender.com/api/instagram/callback`)
*   `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` (the verification string you provided to Meta)
*   `META_APP_SECRET`
*   `META_WHATSAPP_VERIFY_TOKEN` (the verification string you provided to Meta)
*   `META_WHATSAPP_PHONE_ID`
*   `META_API_VERSION` (use `v20.0` or later)
*   `FLAG_INSTAGRAM_SENDS_ENABLED` (set to `true`)
*   `FLAG_WHATSAPP_SENDS_ENABLED` (set to `true`)

## 11. Local/Staging Environment Variable Checklist
* [ ] Replicate the above variables into your local `.env` file for local testing (do not commit this file).

## 12. Security Rules for Secrets
* **NEVER** paste secrets in the chat.
* **NEVER** commit `.env` to git.
* Keep your App Secret and Webhook Verify Tokens private.

## 13. What Founder Should Say When Ready
When all checklists are complete, copy and paste this exact message to the agent:

> Meta Developer setup is complete. Required env variables are configured securely in local/staging/Render. Do not print secrets. Proceed with Phase 11C test credential wiring and webhook verification.

## 14. What Agent Will Do in Phase 11C
* The agent will guide you through testing the integration locally or on staging.
* It will verify the webhooks are received.
* It will test sending messages using the existing integration code.

## 15. What Agent Will NOT Do Without Approval
* Call Meta APIs unexpectedly.
* Send real messages to non-test users.
* Deploy to production.
* Modify production databases or run seeds/migrations.
* Ask for your secrets in the chat.
