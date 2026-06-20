# Sprint 6 — Implementation Readiness Review

**Author:** Final Architecture Authority
**Date:** 2026-06-21
**Reviews:** `SPRINT_6_IMPLEMENTATION_READINESS_SIGNOFF.md` findings against updated documents
**Input documents audited at this revision:**
- `SPRINT_6_FINAL_ARCHITECTURE_SIGNOFF.md` — amended 2026-06-21 (A1–A13 applied)
- `SPRINT_6_EXECUTION_PLAN.md` — amended 2026-06-21 (BLOCKER 1/2/3 + A3/A4/A5/A10/A13)
- `SPRINT_6_IMPLEMENTATION_READINESS_SIGNOFF.md` — source of issues list

> This document verifies that every blocking issue and every amendment from the readiness signoff has been applied and that the two implementation documents are now consistent with each other and with the live codebase at HEAD (`1bf88db`).

---

## Blocker Resolution Verification

### BLOCKER 1 — Migration 0015 `CREATE INDEX CONCURRENTLY` in Prisma Transaction

**Original finding:** `CREATE INDEX CONCURRENTLY` cannot execute inside a PostgreSQL transaction block. Prisma 5 runs migrations transactionally by default. Migration 0015 would fail on first `prisma migrate deploy`.

**Resolution applied (A2) — `SPRINT_6_FINAL_ARCHITECTURE_SIGNOFF.md §5.3`:**

The migration strategy is now explicitly documented:
- Migration `0015_inbox_tables` — creates `instagram_conversations` and `messages` tables (standard transactional migration)
- Migration `0015b_leads_ig_unique_index` — a separate non-transactional migration file containing ONLY the `CREATE UNIQUE INDEX CONCURRENTLY` statement, preceded by the required pragma `-- Prisma Migration not running in a transaction`

The signoff now specifies:
- The pragma required to suppress transaction wrapping
- The consequence of non-transactional mode on rollback
- The `IF NOT EXISTS` idempotency clause for safe retries
- The Prisma `@@unique` behavior and why raw SQL must replace Prisma's generated DDL for this specific index
- The exact engineer workflow (two `prisma migrate` steps)

**Status: RESOLVED** ✓

---

### BLOCKER 2 — `org.connect_social` Permission Conflict

**Original finding:** Execution plan M1 (`permissions.ts` row) explicitly added `org.connect_social` to `MANAGER_PERMISSIONS`. Signoff §4.5 restricted it to OWNER/ADMIN only. Direct conflict producing incorrect RBAC if execution plan was followed.

**Resolution applied (A3) — two documents updated:**

**`SPRINT_6_FINAL_ARCHITECTURE_SIGNOFF.md §9 M1`:** Added explicit override row:
> "A3 — OVERRIDE: Do NOT add `org.connect_social` to MANAGER_PERMISSIONS. The execution plan M1 files-to-modify (permissions.ts line) includes this — it is superseded by §4.5 of this signoff."

**`SPRINT_6_EXECUTION_PLAN.md` M1 files-to-modify table:**
- Old: `"... add `org.connect_social` to `MANAGER_PERMISSIONS`"`
- New: `"⚠ DO NOT add `org.connect_social` to `MANAGER_PERMISSIONS` — superseded by SPRINT_6_FINAL_ARCHITECTURE_SIGNOFF.md §4.5 (A3). `org.connect_social` is OWNER and ADMIN only."`

**`SPRINT_6_EXECUTION_PLAN.md` M2 endpoint note:**
- Old: `"MANAGER was given this in M1 permissions update — confirm with PM if MANAGER should be able to connect accounts or only OWNER/ADMIN."`
- New: `"OWNER and ADMIN only. Per SPRINT_6_FINAL_ARCHITECTURE_SIGNOFF.md §4.5 (A3), MANAGER does NOT receive this permission. [...] The PM decision is final."`

**Single source of truth:** `SPRINT_6_FINAL_ARCHITECTURE_SIGNOFF.md §4.5` — OWNER and ADMIN only.

**Status: RESOLVED** ✓

---

### BLOCKER 3 — M2 Callback Error Response Format Conflict

**Original finding:** Execution plan M2 integration tests expected HTTP 400 JSON for expired state and HTTP 409 JSON for duplicate account. The signoff §4.2 specifies browser redirects with `?error=` params for all callback failure paths. A browser-redirect OAuth callback cannot return JSON — the browser has navigated away from the app.

**Resolution applied (A4) — two documents updated:**

**`SPRINT_6_FINAL_ARCHITECTURE_SIGNOFF.md §9 M2`:** Added explicit override row:
> "All callback error responses are browser redirects — `?error=STATE_EXPIRED`, `?error=INVALID_STATE`, `?error=ALREADY_CONNECTED`, `?error=PLAN_LIMIT_EXCEEDED`, `?error=ACCESS_DENIED`. Zero JSON error responses from the callback endpoint. The execution plan M2 test cases 5–6 expect JSON 400/409 — these are superseded by the redirect design in §4.2. Integration tests must assert `res.headers.location` contains the error param."

**`SPRINT_6_EXECUTION_PLAN.md` M2 integration test table:** All test rows for the callback endpoint updated:
- Test case 5: `"expired state → 400 with INVALID_STATE"` → `"HTTP 302 redirect to ?error=STATE_EXPIRED"`
- Test case 6: `"duplicate call → 409 (account already exists)"` → `"HTTP 302 redirect to ?error=ALREADY_CONNECTED"`
- Added test case for invalid JWT signature → redirect `?error=INVALID_STATE`
- Replay-attack test (nonce deleted) → redirect `?error=STATE_EXPIRED`

**`SPRINT_6_EXECUTION_PLAN.md` M2 Architecture Decision section:** Updated to document:
- `OAUTH_STATE_SECRET` (not `JWT_ACCESS_SECRET`) for state JWT signing
- Redis nonce storage and single-use deletion
- That all error paths redirect (zero JSON responses from callback)

**Single documented behavior:** All `GET /api/instagram/callback` error paths issue HTTP 302 redirects to `https://app.leados.app/settings/integrations/instagram?error=<CODE>`.

**Status: RESOLVED** ✓

---

## Amendment Verification (A1–A13)

| # | Amendment | Applied To | Status |
|---|-----------|-----------|--------|
| A1 | `NEXT_PUBLIC_WS_URL` added to env var inventory | Signoff §4.4 — new paragraph after OAUTH_STATE_SECRET block | ✓ |
| A2 | Migration non-transactional pragma requirement; 0015b split | Signoff §5.3 — new `> A2` block with pragma, split strategy, engineer workflow | ✓ |
| A3 | `org.connect_social` OWNER/ADMIN only — explicit override | Signoff §9 M1 table (new row); Exec plan M1 permissions.ts row; Exec plan M2 endpoint note | ✓ |
| A4 | M2 callback redirects supersede execution plan 400/409 | Signoff §9 M2 table (new row); Exec plan M2 test table (all callback rows rewritten) | ✓ |
| A5 | `instagram-enrich` → `QUEUE.WEBHOOK_PROCESSING` (not system queue) | Signoff §9 M3 table — "CORRECTION" row replaces original | ✓ |
| A6 | `NEXT_PUBLIC_WS_URL` production hardening in `connectSocket()` | Signoff §3.4 — `> A6` callout after the code block | ✓ |
| A7 | Railway sticky sessions not required (`transports: ['websocket']` only) | Signoff §6.2 — `> A7` callout replacing old sticky-session sentence | ✓ |
| A8 | B-2 deferral reason corrected: column exists, emission missing | Signoff §2 B-2 — `> A8 — Correction` block added; original wrong sentence replaced | ✓ |
| A9 | Union count corrected from 22 to 27 | Signoff §5.1 — `> A9` callout after opening paragraph | ✓ |
| A10 | 7 PIPELINE_* DomainEvent entries added to M1 list | Signoff §5.2 — expanded DomainEvent list now has 12 entries; Exec plan events.ts row updated | ✓ |
| A11 | `check:enum-parity` added to M1 acceptance criteria | Signoff §9 M1 table — new row | ✓ |
| A12 | `error-codes.ts` 6 new codes added to M1 files-to-modify | Signoff §9 M1 table — new row | ✓ |
| A13 | Webhook subscription retry job specified (`'instagram-webhook-subscribe'`, WEBHOOK_PROCESSING queue) | Signoff §9 M2 table — row updated; Exec plan M2 risk 3 updated | ✓ |

---

## Cross-Document Consistency Verification

### env.ts Variables — Consistent

Both documents now agree on the complete list of new API-side env vars added in M1:

| Variable | Signoff §4.4 | Exec Plan M1 env.ts section | Consistent |
|---------|-------------|---------------------------|-----------|
| `INSTAGRAM_APP_ID` | ✓ | ✓ | ✓ |
| `INSTAGRAM_OAUTH_REDIRECT_URI` | ✓ | ✓ | ✓ |
| `FIELD_ENCRYPTION_KEY` | ✓ | ✓ | ✓ |
| `SOCKET_IO_CORS_ORIGIN` | ✓ | ✓ | ✓ |
| `OAUTH_STATE_SECRET` | ✓ (new — not in exec plan) | Updated text supersedes exec plan | ✓ |
| `NEXT_PUBLIC_WS_URL` | ✓ (A1) | Referenced in client.ts, Vercel env | ✓ |

### Permission Model — Consistent

| Permission | MANAGER | SALES_EXEC | OWNER/ADMIN | Source |
|-----------|---------|-----------|------------|--------|
| `inbox.read` | ✓ | ✗ | ✓ | Exec plan + signoff |
| `inbox.read_own` | ✓ | ✓ | ✓ | Exec plan + signoff |
| `inbox.reply` | ✓ | ✗ | ✓ | Exec plan |
| `inbox.reply_own` | ✓ | ✓ | ✓ | Exec plan |
| `inbox.assign` | ✓ | ✗ | ✓ | Exec plan |
| `inbox.close` | ✓ | ✗ | ✓ | Exec plan |
| `inbox.close_own` | ✓ | ✓ | ✓ | Exec plan |
| `org.connect_social` | ✗ | ✗ | ✓ | Signoff §4.5 (A3) — exec plan updated |

### OAuth Callback Behavior — Consistent

All paths through `GET /api/instagram/callback` are now documented identically in both documents:

| Scenario | Signoff §4.2 | Exec Plan M2 Tests | Consistent |
|---------|-------------|-------------------|-----------|
| `?error` from Meta | redirect `?error=ACCESS_DENIED` | ✓ | ✓ |
| Invalid JWT signature | redirect `?error=INVALID_STATE` | redirect assertion | ✓ |
| Expired JWT | redirect `?error=STATE_EXPIRED` | redirect assertion | ✓ |
| Replayed nonce | redirect `?error=STATE_EXPIRED` | redirect assertion | ✓ |
| Duplicate account | redirect `?error=ALREADY_CONNECTED` | redirect assertion | ✓ |
| Plan limit exceeded | redirect `?error=PLAN_LIMIT_EXCEEDED` | redirect assertion | ✓ |
| Success | redirect `?connected=1` | ✓ | ✓ |

### Migration Sequence — Consistent

Both documents reflect the same migration sequence:

| Migration | Contents | Transactional | Source |
|-----------|---------|--------------|--------|
| `0014_instagram_accounts` | `instagram_accounts` table + RLS | Yes | Exec plan M1 |
| `0015_inbox_tables` | `instagram_conversations` + `messages` + RLS | Yes | Exec plan M1 + signoff A2 |
| `0015b_leads_ig_unique_index` | `CREATE UNIQUE INDEX CONCURRENTLY` on leads | **No** (pragma required) | Signoff §5.3 A2 |
| `0016_instagram_fk` | `ALTER TABLE leads ADD CONSTRAINT ... NOT VALID` | Yes | Exec plan M1 + signoff §5.4 |

### Queue Assignments — Consistent

| Job | Queue | Document | Consistent |
|-----|-------|---------|-----------|
| Outbound Meta DM send | `INSTAGRAM_SEND` | Both | ✓ |
| Socket.io notification | Redis pub/sub directly via `redis-emitter` | Both | ✓ |
| Webhook subscription retry | `WEBHOOK_PROCESSING` / `'instagram-webhook-subscribe'` | Signoff A13 + exec plan M2 risk 3 | ✓ |
| Lead enrichment | `WEBHOOK_PROCESSING` / `'instagram-enrich'` | Signoff A5 + exec plan M3 scope | ✓ |
| Notification delivery | Not used in Sprint 6 | Both | ✓ |
| Token refresh cron | System queue via CRON_REGISTRY | Exec plan M2 | ✓ |

### DomainEvent List — Consistent

Both documents now specify the same 12 entries to add to `events.ts` in M1:

Signoff §5.2 (12 entries) ↔ Exec plan M1 events.ts row (references signoff §5.2): ✓

### ActivityMetadata Union — Consistent

Both documents specify the same 4 new interfaces:
- `MessageReceivedMetadata` (`type: 'MESSAGE_RECEIVED'`)
- `MessageSentMetadata` (`type: 'MESSAGE_SENT'`)
- `InstagramAccountConnectedMetadata` (`type: 'INSTAGRAM_ACCOUNT_CONNECTED'`)
- `InstagramAccountDisconnectedMetadata` (`type: 'INSTAGRAM_ACCOUNT_DISCONNECTED'`)

Current count (27) + 4 new = 31 total. Both documents agree. ✓

### FINAL_ARCHITECTURE.md Alignment

The amended signoff and execution plan remain consistent with `FINAL_ARCHITECTURE.md`:

| FINAL_ARCHITECTURE requirement | Sprint 6 plan | Consistent |
|-------------------------------|--------------|-----------|
| §2 — RLS on all tenant tables | 3 new tables get RLS in migrations; `check:rls` gate verifies 22 tables | ✓ |
| §3 — Same-site domains + BFF | BFF routes in M5/M6; no bearer token to browser for session | ✓ |
| §5.1 — Pre-build Meta API spike | M1-A spike, must be signed off before M2 | ✓ |
| §5.2 — InstagramAdapter interface | Created in M2 | ✓ |
| §5.3 — persist-then-200, message-grain dedup | M3 pipeline: UNIQUE(mid) + ON CONFLICT DO NOTHING | ✓ |
| §5.4 — AES-256-GCM key-versioned token | `field-encryption.ts` with `v{n}:` prefix | ✓ |
| §6.1 — Application-level encryption for OAuth tokens only | `instagram_accounts.accessToken` encrypted; email/phone not | ✓ |
| §6.3 — HMAC-SHA256 over raw body | Webhook controller; `express.raw()` before JSON parser | ✓ |
| §7 — Socket.io tier with Redis adapter | `initSocketServer()` in `server.ts`; redis-emitter in worker | ✓ |
| §7.3 — WS Redis adapter from day one | M1 infrastructure | ✓ |

### Sprint 5 Signoff Compatibility

| Sprint 5 signoff | Dependency in Sprint 6 | Compatible |
|-----------------|----------------------|-----------|
| M1 APPROVED — 19 tenant tables, `check:rls` | Sprint 6 adds 3 → 22; `check:rls` validates 22 | ✓ |
| M2 APPROVED WITH DEVIATION — pipeline activity emission deferred | B-2 formally deferred to Sprint 7; sprint 6 does not touch pipeline module | ✓ |
| M3 APPROVED — 27 deal integration tests | Sprint 6 does not modify deal module | ✓ |
| M4 APPROVED — persist-then-200 on webhooks | Sprint 6 extends same pattern to Instagram webhooks | ✓ |
| M5 APPROVED — Kanban + Deal Detail UI | Sprint 6 UI follows same token system; no Kanban changes | ✓ |

---

## Remaining Low-Severity Notes (No Longer Blocking)

These items from the original readiness signoff were categorized as LOW severity. They are noted here for completeness — none are blockers for implementation:

| Item | Resolution | Status |
|------|-----------|--------|
| TR-3 — `STATE_EXPIRED` / `STATE_REPLAYED` error code collision | Recommended differentiating in a future sprint; not blocking | Accepted, deferred |
| TR-4 — Suspended org test fixture needs clarification | Implement as unit test with mocked org-status check in JWT middleware; org status check in `socket-middleware.ts` should come from JWT claim (not DB query) to keep socket connect path fast | Accepted |
| SR-2 — Auth token in Socket.io handshake auth visible in logs | Implementation note: log only `userId`/`orgId` post-verification, never `handshake.auth.token` | Accepted |
| DR-3 — Staging environment not operationally defined | To be decided by tech lead before M5 exits; not blocking M1–M4 | Accepted |
| SC-3 — Migration 0016 transactional mode confirmation | `ALTER TABLE ... ADD CONSTRAINT ... NOT VALID` is transaction-safe; no pragma needed for 0016 | Confirmed, no action |

---

## Final Pre-Implementation Checklist

The following external/administrative gates remain open. They do not block technical implementation (M1-B through M4 can begin) but block Meta API testing and App Review submission:

| Gate | Blocks | Owner |
|------|--------|-------|
| Facebook Business Verification initiated | App Review submission | PM/Founder |
| Meta sandbox app created with `api.leados.app/api/instagram/callback` as OAuth redirect URI | M2 end-to-end testing | Engineer |
| Sandbox Instagram account for receive/send test DMs | M3/M4 exit criteria | Engineer |
| Staging environment defined (Railway project, Neon DB, Redis) | M6 App Review prep | Tech Lead/Infra |
| `NEXT_PUBLIC_WS_URL` set in Vercel (production + staging) | Production Socket.io | Engineer/DevOps |

---

## VERDICT

```
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║              READY FOR IMPLEMENTATION                             ║
║                                                                   ║
║  All 3 blocking issues from the readiness signoff are resolved.   ║
║  All 13 amendments (A1–A13) are applied.                          ║
║  Both implementation documents are internally consistent          ║
║  and consistent with each other.                                  ║
║                                                                   ║
║  Implementation contract:                                         ║
║  SPRINT_6_FINAL_ARCHITECTURE_SIGNOFF.md (amended 2026-06-21)      ║
║  supersedes SPRINT_6_EXECUTION_PLAN.md wherever they conflict.    ║
║  This document confirms there are no remaining conflicts.         ║
║                                                                   ║
║  The spike (M1-A) begins immediately.                             ║
║  M1-B begins after spike sign-off.                                ║
║  M2 begins after M1-B is merged AND external gates 1–2 above      ║
║  are confirmed.                                                   ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
```

---

*All verifications in this document are based on direct source-code reads at HEAD (`1bf88db`) and the amended planning documents. No verification is based solely on planning document cross-reference.*
