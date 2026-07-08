# Phase 11A — Meta / Instagram / WhatsApp Integration Readiness Audit

## 1. Executive Summary

This audit evaluates the codebase's readiness for real Meta (Instagram and WhatsApp) integration, focusing on webhooks, token management, outbound workers, and the boundary between simulation and real-mode execution.

**Conclusion:** The backend architecture is fully implemented for real Meta integration. Webhook deduplication, multi-tenant payload resolution, OAuth flows, and outbound queue workers are all built. However, it is not "production-ready" to go live until real Meta credentials are created, verified, and injected, and the application passes Meta's App Review (Advanced Access).

## 2. Webhooks Audit

The system handles incoming webhook deliveries efficiently via a persist-then-enqueue pattern:

*   **Endpoints (`webhook.controller.ts`)**:
    *   `/api/webhooks/instagram` (GET for verification, POST for events)
    *   `/api/webhooks/whatsapp` (GET for verification, POST for events)
*   **Verification**:
    *   GET challenges use `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` and `META_WHATSAPP_VERIFY_TOKEN`.
    *   POST events perform timing-safe HMAC-SHA256 validation against `INSTAGRAM_APP_SECRET` and `META_APP_SECRET`.
*   **Idempotency & Enqueuing (`webhook.service.ts`)**:
    *   Events are saved to `webhook_events` using a raw, non-tenant Prisma client. A unique constraint on `(source, externalEventId)` guarantees exactly-once processing (catching `P2002` errors to mark duplicates as `SKIPPED`).
    *   Events are immediately pushed to the `WEBHOOK_PROCESSING` BullMQ queue.

## 3. Worker Execution & Multi-Tenancy

Webhook payloads often arrive without explicit Tenant IDs (Organization IDs). The system securely resolves tenancy:

*   **`webhook.worker.ts`**:
    *   Extracts `recipientIgUserId` or `phoneNumberId` from the raw Meta payload.
    *   Cross-references `InstagramAccount` or `WhatsAppAccount` tables (using the base Prisma client) to find the correct `organizationId`.
    *   Once the `organizationId` is resolved, it enters `withTenant(orgId)` scope to safely upsert Leads, Conversations, and Messages.
    *   It also triggers `InteractiveCaptureService` if a new sender requires contact detail capture.

## 4. Simulation vs. Real Mode

A robust boundary exists between the interactive capture simulation (Phase 9D) and real-world message delivery:

*   **`InteractiveCaptureService`**: Propagates the `isSimulation` flag downwards.
*   **Outbound Workers (`instagram-send.worker.ts`, `whatsapp-send.worker.ts`)**:
    *   **Simulation Mode:** If `job.data.isSimulation === true`, the worker skips the Meta Adapter entirely. It optimistically marks the local `Message` as `SENT` and returns, preventing any real API calls.
    *   **Real Mode (Safety Guard):** If `isSimulation` is falsy, the worker attempts real API delivery. However, it explicitly checks for credentials (`env.INSTAGRAM_APP_SECRET` / `env.META_APP_SECRET`). If they are missing, or if the kill switches (`FLAG_INSTAGRAM_SENDS_ENABLED` / `FLAG_WHATSAPP_SENDS_ENABLED`) are false, the job fails safely and marks the message as `FAILED`. No phantom "sent" messages are created.

## 5. OAuth and Token Management

*   **OAuth Flow (`instagram.service.ts`)**: The system initiates OAuth via `https://api.instagram.com/oauth/authorize`, utilizing state JWTs for CSRF protection and Redis nonces. Callbacks exchange short-lived tokens for long-lived tokens securely.
*   **Encryption**: Access tokens for both Instagram and WhatsApp are encrypted before database insertion using AES-256-GCM (`FIELD_ENCRYPTION_KEY`). The outbound workers decrypt these tokens dynamically right before hitting the `MetaInstagramAdapter` or `MetaWhatsAppAdapter`.

## 6. Environment Configuration Audit

The `env.ts` file correctly enforces these variables. In development/test, placeholder values are used to allow integration tests to run HMAC signatures. In production, these must be populated:

**Instagram:**
*   `INSTAGRAM_APP_ID` (Required in Prod)
*   `INSTAGRAM_APP_SECRET` (Requires override in Prod)
*   `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` (Requires override in Prod)
*   `INSTAGRAM_OAUTH_REDIRECT_URI` (Required in Prod)

**WhatsApp:**
*   `META_APP_SECRET` (Requires override in Prod)
*   `META_WHATSAPP_VERIFY_TOKEN` (Requires override in Prod)
*   `META_WHATSAPP_PHONE_ID` (Optional default sender)
*   `META_API_VERSION` (Defaults to `v20.0`)

## 7. Gap Analysis & Next Steps (Phase 11B)

To move out of simulation and go live with Meta, the following external actions are required:

1.  **Meta Developer Console Setup:**
    *   Create a Meta App (Business type).
    *   Add the Instagram Graph API and WhatsApp products.
2.  **App Review (Advanced Access):**
    *   Meta requires a formal review (screencast and justification) to grant Advanced Access for `instagram_manage_messages` and `pages_messaging`. Without Advanced Access, the app can only interact with tester accounts.
3.  **Credential Injection:**
    *   Extract the generated App ID, App Secret, and Webhook Verify Tokens from the Meta Console and inject them into the production Render environment.
4.  **Frontend Onboarding:**
    *   Ensure the frontend UI provides a clear path for users to initiate the Instagram OAuth flow and input their WhatsApp Business configuration.
