# Sprint 9 Execution Plan: WhatsApp Channel Integration

## Pre-flight Status
- Sprint 8: ✅ COMPLETE & VALIDATED
- `prisma validate`: ✅ PASS
- `pnpm typecheck`: ✅ PASS (cached)

---

## 1. Overview

Sprint 9 adds WhatsApp Business API (Cloud API) as a fully integrated messaging channel in LeadOS.
It mirrors the Instagram channel pattern: account setup → webhook receive → inbound conversation → outbound send.

---

## 2. Milestones

### M1 — Schema + Migration (`0022_whatsapp_integration`)
- Add `WhatsAppAccount` model (organizationId-scoped, AES-GCM encrypted tokens)
- Add `WhatsAppTemplate` model (approved template cache per account)
- Add `whatsappWindowExpiresAt` column to `Conversation` (24h window tracking)
- Register new tables in `tenant-tables.ts`
- Register in `NON_TENANT_TABLES` if applicable (both are tenant-scoped → TENANT_TABLES)
- Run `prisma validate` → must be clean

### M2 — Environment + Env Schema
- Add to `env.ts`:
  - `META_APP_SECRET` (WhatsApp app secret for HMAC verification)
  - `META_WHATSAPP_VERIFY_TOKEN` (webhook challenge token)
  - `META_WHATSAPP_PHONE_ID` (optional; used as default sender)
  - `META_API_VERSION` (default `v20.0`)
  - `FLAG_WHATSAPP_SENDS_ENABLED` (kill switch flag, coerce boolean)

### M3 — Meta Cloud API Adapter (`whatsapp.adapter.ts`)
- Interface: `WhatsAppAdapter`
  - `sendTextMessage(to, text, phoneNumberId, accessToken)`
  - `sendTemplate(to, template, phoneNumberId, accessToken)`
  - `getTemplates(wabaId, accessToken)` — syncs approved templates
  - `verifyWebhookSignature(rawBody, signature, appSecret)` — HMAC-SHA256
- `MetaWhatsAppAdapter` — calls `https://graph.facebook.com/{version}/`
- `SandboxWhatsAppAdapter` — deterministic stubs for integration tests
- Export singleton `whatsappAdapter` (sandbox in test, real in prod)

### M4 — WhatsApp Service (`whatsapp.service.ts`)
- `connectAccount(wabaId, accessToken)` — stores encrypted token, syncs templates
- `listAccounts()` — tenant-scoped list
- `disconnectAccount(id)` — soft-delete
- `syncTemplates(accountId)` — fetches from Meta, upserts `WhatsAppTemplate`
- `sendMessage(conversationId, content, accountId)` — enforces 24h window; enqueues to WHATSAPP_SEND queue
- `getTemplates(accountId)` — lists cached templates for the org

### M5 — WhatsApp Repository (`whatsapp.repository.ts`)
- `PrismaWhatsAppAccountRepository`
- `PrismaWhatsAppTemplateRepository`

### M6 — Inbound Webhook Controller
- `GET /api/webhooks/whatsapp` — Meta verification challenge (echo hub.challenge)
- `POST /api/webhooks/whatsapp` — validate HMAC-SHA256 signature; persist `webhook_event`; enqueue `WEBHOOK_PROCESSING`

### M7 — Webhook Worker (extend `webhook.worker.ts`)
- Add `handleWhatsApp(payload, webhookEventId)` to the dispatch switch
- Parse inbound message events → upsert Conversation (type=WHATSAPP) + Message
- Update `whatsappWindowExpiresAt` on each inbound message (+24h)
- Fire-and-forget realtime + notification (same pattern as Instagram)

### M8 — WhatsApp Send Worker (`whatsapp-send.worker.ts`)
- Process `whatsapp-send` queue
- Fetch `WhatsAppAccount` decrypted token
- Call adapter to send text or template message
- Update `Message.status` to `SENT` / `FAILED`
- Register in `worker-registry.ts`

### M9 — BFF Routes (web → api proxy)
- `apps/web/src/app/api/bff/whatsapp/accounts/route.ts`
- `apps/web/src/app/api/bff/whatsapp/templates/[accountId]/route.ts`

### M10 — Frontend Integration
- `apps/web/src/app/(dashboard)/settings/integrations/whatsapp/page.tsx`
  - Embedded Signup launcher (Facebook Business login redirect)
  - Connected accounts list with disconnect button
  - Template gallery per account
- Extend `inbox` conversation view: render WHATSAPP channel indicator
- Add `whatsappWindowExpiresAt` warning timer in thread view when < 30 min remain

### M11 — Integration Tests (`whatsapp.integration.test.ts`)
- Test account connect/list/disconnect
- Test inbound webhook → conversation + message creation
- Test 24h window enforcement on outbound send
- Test template sync
- Test HMAC signature rejection on bad webhooks

---

## 3. Files to Create

| File | Purpose |
|------|---------|
| `prisma/migrations/0022_whatsapp_integration/migration.sql` | Schema migration |
| `apps/api/src/modules/whatsapp/whatsapp.adapter.ts` | Meta Cloud API adapter |
| `apps/api/src/modules/whatsapp/whatsapp.service.ts` | Business logic |
| `apps/api/src/modules/whatsapp/whatsapp.repository.ts` | DB access layer |
| `apps/api/src/modules/whatsapp/whatsapp.controller.ts` | HTTP handlers |
| `apps/api/src/modules/whatsapp/whatsapp.routes.ts` | Route definitions |
| `apps/api/src/modules/whatsapp/index.ts` | Module barrel |
| `apps/api/src/core/queue/workers/whatsapp-send.worker.ts` | Send queue processor |
| `apps/web/src/app/api/bff/whatsapp/accounts/route.ts` | BFF proxy |
| `apps/web/src/app/api/bff/whatsapp/templates/[accountId]/route.ts` | BFF proxy |
| `apps/web/src/app/(dashboard)/settings/integrations/whatsapp/page.tsx` | Settings UI |
| `apps/web/src/lib/hooks/useWhatsApp.ts` | React Query hooks |
| `apps/api/tests/integration/whatsapp.integration.test.ts` | Integration tests |

## 4. Files to Modify

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add WhatsAppAccount, WhatsAppTemplate, alter Conversation |
| `apps/api/src/core/config/env.ts` | Add META_APP_SECRET, META_WHATSAPP_VERIFY_TOKEN, FLAG_WHATSAPP_SENDS_ENABLED |
| `apps/api/src/core/tenancy/tenant-tables.ts` | Register whatsapp_accounts, whatsapp_templates |
| `apps/api/src/core/queue/worker-registry.ts` | Register whatsapp-send worker |
| `apps/api/src/core/queue/workers/webhook.worker.ts` | Add WHATSAPP dispatch case |
| `apps/api/src/app.ts` | Mount /api/webhooks/whatsapp + /api/v1/whatsapp routes |
| `packages/shared/src/index.ts` | Export WhatsApp types |

## 5. Validation Gates (after each milestone)
- `pnpm exec prisma validate`
- `pnpm typecheck`
- `pnpm check:enum-parity`
- `pnpm --filter @leados/api check:rls`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
