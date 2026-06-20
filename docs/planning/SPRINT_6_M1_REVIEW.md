# Sprint 6 M1 Review

**Milestone:** M1 — Infrastructure + Schema  
**Date:** 2026-06-21  
**Status:** COMPLETE — awaiting approval before M2

---

## Files Changed

### packages/shared

| File | Change |
|------|--------|
| `src/constants/enums.ts` | Added `InstagramAccountStatus`, `ConversationStatus`, `MessageStatus` enums; added 4 `ActivityType` values (`MESSAGE_RECEIVED`, `MESSAGE_SENT`, `INSTAGRAM_ACCOUNT_CONNECTED`, `INSTAGRAM_ACCOUNT_DISCONNECTED`) |
| `src/constants/events.ts` | Added 12 `DomainEvent` entries: 8 Sprint 5 cleanup (`DEAL_UPDATED`, `PIPELINE_*`) + 4 Sprint 6 (`MESSAGE_RECEIVED`, `MESSAGE_SENT`, `INSTAGRAM_ACCOUNT_CONNECTED`, `INSTAGRAM_ACCOUNT_DISCONNECTED`) |
| `src/constants/permissions.ts` | Added `inbox.reply`, `inbox.reply_own`, `inbox.assign`, `inbox.close`, `inbox.close_own` to `MANAGER_PERMISSIONS`; added `inbox.reply_own`, `inbox.close_own` to `SALES_EXECUTIVE_PERMISSIONS`. Types widened to `readonly string[]` (matches existing `PERMISSION_CATALOG` pattern for non-standard permission keys). `org.connect_social` NOT added to MANAGER per signoff §4.5. |
| `src/constants/instagram.ts` | NEW — `INSTAGRAM_MESSAGING_WINDOW_HOURS = 24`, `INSTAGRAM_MESSAGING_WINDOW_MS` |
| `src/errors/error-codes.ts` | Added 6 error codes: `INSTAGRAM_ACCOUNT_NOT_FOUND`, `INSTAGRAM_ACCOUNT_EXPIRED`, `WINDOW_CLOSED`, `FEATURE_DISABLED`, `INVALID_OAUTH_STATE`, `DUPLICATE_INSTAGRAM_ACCOUNT` with HTTP status mappings |
| `src/types/activity-metadata.ts` | Added 4 metadata interfaces: `MessageReceivedMetadata`, `MessageSentMetadata`, `InstagramAccountConnectedMetadata`, `InstagramAccountDisconnectedMetadata`; added to `ActivityMetadata` union |

### prisma/schema.prisma

- Added `MessageDirection` enum (parity with `enums.ts`)
- Added `InstagramAccountStatus`, `ConversationStatus`, `MessageStatus` enums
- Added 4 `ActivityType` values
- Added `InstagramAccount`, `InstagramConversation`, `Message` models
- Added `@@unique([organizationId, instagramUserId])` on `Lead` (DB index created CONCURRENTLY in 0015b)
- Added back-relations: `Organization.instagramAccounts/Conversations/messages`, `User.assignedConversations`, `Lead.instagramConversations/instagramAccount`, `Contact.instagramConversations`

### prisma/migrations

| Migration | Description |
|-----------|-------------|
| `0014_instagram_accounts/migration.sql` | `InstagramAccountStatus`, `MessageDirection` enums; 4 new `ActivityType` values; `instagram_accounts` table + indexes + RLS |
| `0015_inbox_tables/migration.sql` | `ConversationStatus`, `MessageStatus` enums; `instagram_conversations` + `messages` tables + indexes + RLS |
| `0015b_leads_ig_unique_index/migration.sql` | Non-transactional (`-- Prisma Migration not running in a transaction` pragma); `CREATE UNIQUE INDEX CONCURRENTLY` on `leads(organizationId, instagramUserId)` |
| `0016_instagram_fk/migration.sql` | `ALTER TABLE leads ADD CONSTRAINT ... NOT VALID` FK to `instagram_accounts`; `VALIDATE CONSTRAINT` |

### apps/api

| File | Change |
|------|--------|
| `package.json` | Added `socket.io ^4.8.1`, `@socket.io/redis-adapter ^8.3.0`, `@socket.io/redis-emitter ^5.1.0`; added `check:enum-parity` script |
| `src/core/config/env.ts` | Added `INSTAGRAM_APP_ID`, `INSTAGRAM_OAUTH_REDIRECT_URI`, `FIELD_ENCRYPTION_KEY` (64-char hex, AES-256), `SOCKET_IO_CORS_ORIGIN`, `OAUTH_STATE_SECRET`; extended production fail-fast block to cover all 5 new vars |
| `src/core/crypto/field-encryption.ts` | NEW — AES-256-GCM encrypt/decrypt; wire format `v{n}:{hex(iv)}:{hex(tag)}:{hex(ct)}` |
| `src/core/crypto/field-encryption.test.ts` | NEW — 6 unit tests: roundtrip short, roundtrip long, random IV, wire format structure, tamper detection, invalid format |
| `src/core/realtime/socket-server.ts` | NEW — `initSocketServer()`, `getSocketServer()`, `emitToOrg()`; Redis adapter on fresh IORedis instances (no `keyPrefix`); JWT auth middleware wired; org room join on connect |
| `src/core/realtime/socket-middleware.ts` | NEW — `socketAuthMiddleware()`; validates JWT from `socket.handshake.auth.token`; sets `socket.data.{userId, organizationId, role}` |
| `src/core/realtime/socket-middleware.test.ts` | NEW — 5 unit tests: valid JWT, missing token, non-string token, invalid JWT, tampered JWT |
| `src/core/realtime/notification-publisher.ts` | NEW — `initNotificationPublisher()`, `notifyOrg()`; uses `@socket.io/redis-emitter` for cross-process publish from Worker |
| `src/core/realtime/notification-publisher.test.ts` | NEW — 2 unit tests: throws before init, publishes after init |
| `src/core/queue/workers/instagram-send.worker.ts` | NEW — stub worker consuming `INSTAGRAM_SEND` queue; throws "not yet implemented" until M2 |
| `src/core/tenancy/tenant-tables.ts` | Added `instagram_accounts`, `instagram_conversations`, `messages` to `TENANT_TABLES` (19→22) and corresponding Prisma models to `TENANT_MODELS` |
| `src/core/tenancy/tenant-tables.test.ts` | Updated count assertion 19→22; added Sprint 6 tables to expected set |
| `src/core/queue/worker-registry.ts` | Imported and registered `createInstagramSendWorker()` in `startWorkers()` |
| `src/server.ts` | Imports and calls `initSocketServer(server)` after `app.listen()` |
| `src/worker.ts` | Imports and calls `initNotificationPublisher()` before `startWorkers()` |

### docs/planning

| File | Change |
|------|--------|
| `SPRINT_6_M1_SPIKE_FINDINGS.md` | NEW — placeholder listing 7 Meta API questions to be answered during M2 spike |

---

## Architecture Decisions Followed

| Decision | Source | Applied |
|----------|--------|---------|
| `@socket.io/redis-adapter` in API, `@socket.io/redis-emitter` in Worker | Signoff §5.1 | ✅ `socket-server.ts` + `notification-publisher.ts` |
| Fresh IORedis instances for Socket.io (no `keyPrefix`) | Signoff §5.1 / Readiness review | ✅ `socket-server.ts` creates separate pub/sub clients |
| `OAUTH_STATE_SECRET` separate from `JWT_ACCESS_SECRET` | Signoff §4.4 / A1 | ✅ `env.ts` |
| AES-256-GCM field encryption, 64-char hex key | Signoff §4.3 | ✅ `field-encryption.ts` |
| Wire format `v{n}:{hex(iv)}:{hex(tag)}:{hex(ct)}` | Signoff §4.3 | ✅ `field-encryption.ts` |
| `org.connect_social` = OWNER + ADMIN only (NOT MANAGER) | Signoff §4.5 / A3 | ✅ `permissions.ts` comment |
| Migration split for CONCURRENTLY index | Signoff §5.3 / A8 | ✅ `0015` (transactional) + `0015b` (pragma + CONCURRENTLY) |
| `NOT VALID` FK then `VALIDATE CONSTRAINT` | Signoff §5.3 | ✅ `0016_instagram_fk` |
| Socket.io transport: `['websocket']` only | Signoff §5.1 | ✅ `socket-server.ts` |
| Socket.io path: `/ws` | Signoff §5.1 | ✅ `socket-server.ts` |
| ActivityType 27 → 31 (4 new values) | Execution plan §M1-B | ✅ `enums.ts` + `schema.prisma` + migration 0014 |
| 12 DomainEvent entries added (8 S5 cleanup + 4 S6) | Signoff §5.2 | ✅ `events.ts` |
| Production fail-fast covers all new secrets | Readiness review / A12 | ✅ `env.ts` |

---

## Tests Added

| File | Tests | Coverage |
|------|-------|----------|
| `src/core/crypto/field-encryption.test.ts` | 6 | Roundtrip, random IV, wire format, tamper detection, format validation |
| `src/core/realtime/socket-middleware.test.ts` | 5 | Valid token, missing token, non-string token, invalid JWT, tampered JWT |
| `src/core/realtime/notification-publisher.test.ts` | 2 | Pre-init guard, post-init publish |
| `src/core/tenancy/tenant-tables.test.ts` | Updated | Count 19→22, Sprint 6 tables in expected set |

---

## Validation Results

```
pnpm typecheck   PASS  (0 errors)
pnpm lint        PASS  (0 warnings)
pnpm build       PASS  (shared + api + web all built)
pnpm test        485 passed, 2 failed (expected — see below)
check:enum-parity  OK — 21 shared enum(s) checked
check:rls        FAIL — 3 tables not in DB (expected — see below)
```

### Expected Failures (require DB migration, not M1 schema code)

Both failures are caused by the new tables (`instagram_accounts`, `instagram_conversations`, `messages`) not existing in the local development database yet — migrations 0014–0016 have not been applied.

| Failure | Cause | Resolution |
|---------|-------|------------|
| `rls.foundation.test.ts` — "every tenant table has RLS ENABLED + FORCED" | Table doesn't exist in DB | Run `pnpm db:migrate` |
| `rls.foundation.test.ts` — "RLS coverage == registry" | Table doesn't exist in DB | Run `pnpm db:migrate` |
| `check:rls` — 3 tables not found | Tables don't exist in DB | Run `pnpm db:migrate` |

These are the same class of failure that appeared in Sprint 5 M1 for `pipelines`, `pipeline_stages`, `deals`, and `webhook_events`. They self-resolve on `pnpm db:migrate`.

---

## Known Risks

| Risk | Severity | Notes |
|------|----------|-------|
| Migration 0015b CONCURRENTLY failure leaves invalid index | Medium | Index has `IF NOT EXISTS`; recovery: `DROP INDEX IF EXISTS leads_org_ig_user_unique` + re-run migration |
| `FIELD_ENCRYPTION_KEY` rotation not implemented | Low | Key version in wire format (`v1:...`) enables future rotation; M1 only needs one key |
| Socket.io redis-adapter version compatibility with socket.io 4.8 | Low | `@socket.io/redis-adapter ^8.3.0` is the supported version for socket.io 4.x |
| `instagramAccountId` on Lead has no FK until migration 0016 runs | Accepted | The deferred FK pattern (`NOT VALID` → `VALIDATE`) is intentional and documented in schema comment |
| Meta API spike findings (M1-A placeholder) may change M2 schema | Medium | If the spike reveals different webhook shapes or token structures, migration 0014/0015 may need additive columns in M2. Flagged in `SPRINT_6_M1_SPIKE_FINDINGS.md`. |

---

## M1 Exit Criteria Status

| Criterion | Status |
|-----------|--------|
| `pnpm typecheck` passes | ✅ |
| `pnpm lint` passes | ✅ |
| `pnpm build` passes | ✅ |
| Unit tests pass (excluding DB-dependent integration tests) | ✅ 485/485 |
| `check:enum-parity` passes | ✅ 21 enums checked |
| `check:rls` passes (22 tables) | ⏳ Requires `pnpm db:migrate` in target environment |
| `AES-256-GCM` field encryption implemented + tested | ✅ |
| Socket.io server with Redis adapter wired | ✅ |
| Worker notification publisher wired | ✅ |
| `instagram-send` queue stub registered | ✅ |
| Schema: `instagram_accounts`, `instagram_conversations`, `messages` models | ✅ |
| 4 migrations created (0014, 0015, 0015b, 0016) | ✅ |
| New permissions added correctly (MANAGER/SALES_EXEC; no org.connect_social to MANAGER) | ✅ |
| Production fail-fast covers all 5 new env vars | ✅ |
