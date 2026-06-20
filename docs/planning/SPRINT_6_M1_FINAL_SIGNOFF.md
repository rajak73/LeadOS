# Sprint 6 M1 — Final Signoff

**Milestone:** M1 — Infrastructure + Schema  
**Signoff date:** 2026-06-21  
**Commits:**
- `7afdd3a` feat(s6-m1): instagram foundation, realtime infrastructure and inbox schema
- `b8d4915` fix(ci): always run pnpm install in Deploy Web workflow

---

## Files Changed

### packages/shared
| File | Change |
|------|--------|
| `src/constants/enums.ts` | Added `InstagramAccountStatus`, `ConversationStatus`, `MessageStatus` enums; 4 new `ActivityType` values |
| `src/constants/events.ts` | +12 `DomainEvent` entries (8 Sprint 5 cleanup + 4 Sprint 6) |
| `src/constants/permissions.ts` | Inbox permissions added to MANAGER + SALES_EXEC; `org.connect_social` intentionally excluded from MANAGER |
| `src/constants/instagram.ts` | NEW — `INSTAGRAM_MESSAGING_WINDOW_HOURS`, `INSTAGRAM_MESSAGING_WINDOW_MS` |
| `src/errors/error-codes.ts` | +6 error codes with HTTP status mappings |
| `src/types/activity-metadata.ts` | +4 metadata interfaces + union members |

### prisma/schema.prisma
- New enums: `MessageDirection`, `InstagramAccountStatus`, `ConversationStatus`, `MessageStatus`
- 4 new `ActivityType` values
- New models: `InstagramAccount`, `InstagramConversation`, `Message`
- `Lead.@@unique([organizationId, instagramUserId])` (DB index created CONCURRENTLY in 0015b)
- Back-relations added: Organization, User, Lead, Contact

### prisma/migrations
| Migration | Description |
|-----------|-------------|
| `0014_instagram_accounts` | Enums + `instagram_accounts` table + RLS + 4 ActivityType values |
| `0015_inbox_tables` | `instagram_conversations` + `messages` tables + RLS |
| `0015b_leads_ig_unique_index` | Non-transactional `CREATE UNIQUE INDEX CONCURRENTLY` on leads |
| `0016_instagram_fk` | `NOT VALID` FK + `VALIDATE CONSTRAINT` from leads → instagram_accounts |

### apps/api
| File | Change |
|------|--------|
| `package.json` | +`socket.io`, `@socket.io/redis-adapter`, `@socket.io/redis-emitter`; +`check:enum-parity` script |
| `src/core/config/env.ts` | +5 env vars; production fail-fast extended |
| `src/core/crypto/field-encryption.ts` | NEW — AES-256-GCM encrypt/decrypt |
| `src/core/crypto/field-encryption.test.ts` | NEW — 6 unit tests |
| `src/core/realtime/socket-server.ts` | NEW — Socket.io server + Redis adapter + org room management |
| `src/core/realtime/socket-middleware.ts` | NEW — JWT auth middleware for sockets |
| `src/core/realtime/socket-middleware.test.ts` | NEW — 5 unit tests |
| `src/core/realtime/notification-publisher.ts` | NEW — cross-process emitter for Worker |
| `src/core/realtime/notification-publisher.test.ts` | NEW — 2 unit tests |
| `src/core/queue/workers/instagram-send.worker.ts` | NEW — stub worker |
| `src/core/tenancy/tenant-tables.ts` | 19 → 22 tables |
| `src/core/tenancy/tenant-tables.test.ts` | Count updated; Sprint 6 tables added to expected set |
| `src/core/queue/worker-registry.ts` | instagram-send worker registered |
| `src/server.ts` | `initSocketServer()` wired after listen |
| `src/worker.ts` | `initNotificationPublisher()` wired before startWorkers |

### .github/workflows
| File | Change |
|------|--------|
| `deploy-web.yml` | `pnpm install` made unconditional; deploy step remains gated on VERCEL_TOKEN |

---

## Migrations Applied

Applied to local database via `prisma migrate deploy`:

```
0014_instagram_accounts   ✓ applied
0015_inbox_tables         ✓ applied
0015b_leads_ig_unique_index ✓ applied
0016_instagram_fk         ✓ applied
```

---

## Validation Results

```
pnpm typecheck          PASS — 0 errors
pnpm lint               PASS — 0 warnings
pnpm build              PASS — shared + api + web
pnpm test               PASS — 487 passed, 1 skipped, 0 failed (58 files)
check:rls               PASS — 22 tenant tables enabled + forced + policied; coverage matches registry
check:enum-parity       PASS — 21 shared enum(s) checked
```

---

## GitHub Actions (commit b8d4915)

| Workflow | Status | Duration |
|----------|--------|----------|
| CI | ✅ success | 2m 15s |
| Deploy API | ✅ success | 52s |
| Deploy Web | ✅ success | 21s |
| Tenant Isolation Suite | ✅ success | 54s |

---

## Acceptance Criteria

| Criterion | Status |
|-----------|--------|
| `pnpm typecheck` passes | ✅ |
| `pnpm lint` passes | ✅ |
| `pnpm build` passes | ✅ |
| `pnpm test` passes (all 487 tests) | ✅ |
| `check:rls` — 22 tables | ✅ |
| `check:enum-parity` — 21 enums | ✅ |
| CI green | ✅ |
| Deploy API green | ✅ |
| Deploy Web green | ✅ |
| Tenant Isolation Suite green | ✅ |
| AES-256-GCM field encryption | ✅ |
| Socket.io + Redis adapter wired | ✅ |
| Worker notification publisher wired | ✅ |
| instagram-send queue stub registered | ✅ |
| 4 migrations created and applied | ✅ |
| RLS on all 3 new tables | ✅ |
| Inbox permissions correct (no org.connect_social on MANAGER) | ✅ |
| Production fail-fast covers all 5 new env vars | ✅ |

**M1 is fully closed. M2 may begin.**
