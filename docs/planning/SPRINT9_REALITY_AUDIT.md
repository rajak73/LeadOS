# Sprint 9 Reality Audit: WhatsApp Integration (V2)

This audit details the status, requirements, database schemas, and missing features for **Sprint 9 (WhatsApp Channel Integration)** of the LeadOS application.

---

## 1. Overview & Current Status

* **Status:** 2% Complete
* **Prisma Schema State:** No WhatsApp models defined. `WHATSAPP` exists as an enum value in `LeadSource` and `ConversationType`.
* **Core Code:** No backend module code or frontend UI pages exist. WhatsApp-send queues and feature flags are registered.

---

## 2. Feature Breakdown

### Implemented Features
- **Queue Scaffolding:** Registered queue `whatsapp-send` in `core/queue/names.ts` with priority 10.
- **Feature Flag:** Flag `whatsapp.sends.enabled` registered in `core/flags/flags.ts`.
- **Enum Seed:** `WHATSAPP` is defined in shared constants and schema enums.

### Missing Features
- **Database Schema Models:** Models `WhatsAppAccount` (to store WABA credentials and access tokens), `WhatsAppTemplate` (for pre-approved Meta message templates), and custom conversation metadata are missing.
- **Meta Cloud API Adapter:** Service layer to send template and free-form messages, verify webhooks, and register accounts.
- **Embedded Signup Integration:** Redirection URLs and handlers to support the self-serve Facebook Business login iframe.
- **Inbound Webhook Controller:** Callback route `/api/webhooks/whatsapp` to receive events and updates from Meta.
- **Outbound Message Workers:** BullMQ consumer to process rate-limited template broadcasts and message deliveries.
- **24-hour Window Tracker:** Computed values and locks to restrict agent replies to approved templates once the 24-hour customer window expires.
- **Broadcast Campaign UI:** Frontend builder to select segments and send bulk templates.
- **Unified Inbox Integration:** Support for rendering WhatsApp threads, templates picker, and window timer labels in the React app.

### Broken Features
- None.

---

## 3. Tech Stack Requirements

### Database Requirements
- Add tables: `whatsapp_accounts` (organization-scoped, holding metadata), `whatsapp_templates` (holding approved template content), and add columns to `conversations` to track 24h expiration dates.

### API Requirements
- Build `whatsapp.service.ts` and `/api/v1/whatsapp` route controllers.
- Expose endpoints to fetch, submit, and sync templates from Meta.
- Handle OAuth callbacks to save token details securely.

### Frontend Requirements
- Create `settings/integrations/whatsapp` panel containingEmbedded Signup launcher.
- Build templates gallery and creation form in settings.
- Implement window timer warning and restrict message input on expired threads.

### Worker Requirements
- Add `whatsapp-send` queue processor in `apps/api/src/core/queue/workers/whatsapp.worker.ts`.
- Update webhook worker to handle incoming WhatsApp payload formats.

---

## 4. Security & RLS Review

* **Access Token Encryption:** Since WhatsApp tokens grant access to customer numbers, they must be encrypted before database storage (using the project's GCM encryption helper).
* **RLS Coverage:** The new `whatsapp_accounts` and `whatsapp_templates` tables must have `organizationId` fields and be registered in `tenant-tables.ts` for strict partition isolation.
* **Webhook Signature Checks:** Signature validation via Meta App Secret HMAC hash comparison must be active on `/api/webhooks/whatsapp`.

---

## 5. Technical Debt

1. **Meta API Version Control:** Meta updates Cloud API endpoints regularly; service must isolate API versions correctly.
2. **Conversation Window Sync:** Mismatches between local window timers and Meta's billing clock can lead to paid errors.
