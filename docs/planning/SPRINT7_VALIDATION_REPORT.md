# Sprint 7 Validation Report

This report presents the raw outputs of the validation checks run on the LeadOS repository as proof of correctness and completeness.

---

## Validation Gate Summary

| Gate | Command | Status |
|------|---------|--------|
| Prisma Validation | `npx prisma validate` | **PASS** |
| Typecheck | `pnpm typecheck` | **PASS** |
| Enum Parity | `pnpm check:enum-parity` | **PASS** |
| Row-Level Security Check | `pnpm --filter @leados/api check:rls` | **PASS** |
| Linter | `pnpm lint` | **PASS** |
| Unit & Integration Tests | `pnpm test` | **PASS** |
| Production Build | `pnpm build` | **PASS** |

---

## Raw Command Outputs

### 1. Prisma Validation
```text
$ npx prisma validate
npm warn Unknown project config "public-hoist-pattern". This will stop working in the next major version of npm.
Environment variables loaded from .env
Prisma schema loaded from prisma/schema.prisma
The schema at prisma/schema.prisma is valid 🚀
```

### 2. Typecheck
```text
$ pnpm typecheck
WARN Unsupported engine: wanted: {"node":"20.x"} (current: {"node":"v25.2.1","pnpm":"9.15.9"})

> leados@0.0.0 typecheck /Users/rajakumar/lead_os
> turbo run typecheck

• turbo 2.9.18

   • Packages in scope: @leados/api, @leados/config, @leados/shared, @leados/tsconfig, @leados/web
   • Running typecheck in 5 packages
   • Remote caching disabled

@leados/shared:build: cache hit, replaying logs 7de2cc6b507f63e8
@leados/shared:typecheck: cache hit, replaying logs ea77ea6234210021
@leados/shared:build: 
@leados/shared:typecheck: 
@leados/shared:typecheck: > @leados/shared@0.0.0 typecheck /Users/rajakumar/lead_os/packages/shared
@leados/shared:typecheck: > tsc --noEmit
@leados/shared:typecheck: 
@leados/shared:build: > @leados/shared@0.0.0 build /Users/rajakumar/lead_os/packages/shared
@leados/shared:build: > tsup
@leados/shared:build: 
@leados/shared:build: CLI Building entry: src/index.ts
@leados/shared:build: CLI Using tsconfig: tsconfig.json
@leados/shared:build: CLI tsup v8.5.1
@leados/shared:build: CLI Using tsup config: /Users/rajakumar/lead_os/packages/shared/tsup.config.ts
@leados/shared:build: CLI Target: es2022
@leados/shared:build: CLI Cleaning output folder
@leados/shared:build: ESM Build start
@leados/shared:build: ESM dist/index.js     29.08 KB
@leados/shared:build: ESM dist/index.js.map 63.15 KB
@leados/shared:build: ESM ⚡️ Build success in 53ms
@leados/shared:build: DTS Build start
@leados/shared:build: DTS ⚡️ Build success in 5995ms
@leados/shared:build: DTS dist/index.d.ts 67.07 KB
@leados/web:typecheck: cache hit, replaying logs ba748d772ae606d0
@leados/web:typecheck: 
@leados/web:typecheck: > @leados/web@0.0.0 typecheck /Users/rajakumar/lead_os/apps/web
@leados/web:typecheck: > tsc --noEmit
@leados/web:typecheck: 
@leados/api:typecheck: cache hit, replaying logs 91ace5529f4593e4
@leados/api:typecheck: 
@leados/api:typecheck: > @leados/api@0.0.0 typecheck /Users/rajakumar/lead_os/apps/api
@leados/api:typecheck: > tsc --noEmit
@leados/api:typecheck: 

 Tasks:    4 successful, 4 total
Cached:    4 cached, 4 total
  Time:    117ms >>> FULL TURBO
```

### 3. Enum Parity Check
```text
$ pnpm check:enum-parity
WARN Unsupported engine: wanted: {"node":"20.x"} (current: {"node":"v25.2.1","pnpm":"9.15.9"})

> leados@0.0.0 check:enum-parity /Users/rajakumar/lead_os
> node scripts/check-enum-parity.mjs

enum-parity: OK (21 shared enum(s) checked).
```

### 4. Row-Level Security Check
```text
$ pnpm --filter @leados/api check:rls
WARN Unsupported engine: wanted: {"node":"20.x"} (current: {"node":"v25.2.1","pnpm":"9.15.9"})

> @leados/api@0.0.0 check:rls /Users/rajakumar/lead_os/apps/api
> tsx scripts/check-rls-coverage.ts

RLS coverage check: OK — 27 tenant tables enabled + forced + policied; coverage matches registry.
```

### 5. Linter
```text
$ pnpm lint
WARN Unsupported engine: wanted: {"node":"20.x"} (current: {"node":"v25.2.1","pnpm":"9.15.9"})

> leados@0.0.0 lint /Users/rajakumar/lead_os
> turbo run lint

• turbo 2.9.18

   • Packages in scope: @leados/api, @leados/config, @leados/shared, @leados/tsconfig, @leados/web
   • Running lint in 5 packages
   • Remote caching disabled

@leados/shared:build: cache hit, replaying logs 7de2cc6b507f63e8
@leados/shared:build: 
@leados/shared:build: > @leados/shared@0.0.0 build /Users/rajakumar/lead_os/packages/shared
@leados/shared:build: > tsup
@leados/shared:build: 
@leados/shared:build: CLI Building entry: src/index.ts
@leados/shared:build: CLI Using tsconfig: tsconfig.json
@leados/shared:build: CLI tsup v8.5.1
@leados/shared:build: CLI Using tsup config: /Users/rajakumar/lead_os/packages/shared/tsup.config.ts
@leados/shared:build: CLI Target: es2022
@leados/shared:build: CLI Cleaning output folder
@leados/shared:build: ESM Build start
@leados/shared:build: ESM dist/index.js     29.08 KB
@leados/shared:build: ESM dist/index.js.map 63.15 KB
@leados/shared:build: ESM ⚡️ Build success in 53ms
@leados/shared:build: DTS Build start
@leados/shared:build: DTS ⚡️ Build success in 5995ms
@leados/shared:build: DTS dist/index.d.ts 67.07 KB
@leados/shared:lint: cache hit, replaying logs 40eb7d9cbea24b42
@leados/web:lint: cache hit, replaying logs 70de47c40c9cd9c6
@leados/shared:lint: 
@leados/shared:lint: > @leados/shared@0.0.0 lint /Users/rajakumar/lead_os/packages/shared
@leados/shared:lint: > eslint src
@leados/shared:lint: 
@leados/api:lint: cache hit, replaying logs 63cc91850927e998
@leados/web:lint: 
@leados/web:lint: > @leados/web@0.0.0 lint /Users/rajakumar/lead_os/apps/web
@leados/web:lint: > eslint src
@leados/web:lint: 
@leados/api:lint: 
@leados/api:lint: > @leados/api@0.0.0 lint /Users/rajakumar/lead_os/apps/api
@leados/api:lint: > eslint src
@leados/api:lint: 

 Tasks:    4 successful, 4 total
Cached:    4 cached, 4 total
  Time:    82ms >>> FULL TURBO
```

### 6. Unit & Integration Tests
```text
$ pnpm test
WARN Unsupported engine: wanted: {"node":"20.x"} (current: {"node":"v25.2.1","pnpm":"9.15.9"})

> leados@0.0.0 test /Users/rajakumar/lead_os
> turbo run test

• turbo 2.9.18

   • Packages in scope: @leados/api, @leados/config, @leados/shared, @leados/tsconfig, @leados/web
   • Running test in 5 packages
   • Remote caching disabled

@leados/shared:build: cache hit, replaying logs 7de2cc6b507f63e8
@leados/shared:build: 
@leados/shared:build: > @leados/shared@0.0.0 build /Users/rajakumar/lead_os/packages/shared
@leados/shared:build: > tsup
@leados/shared:build: 
@leados/shared:build: CLI Building entry: src/index.ts
@leados/shared:build: CLI Using tsconfig: tsconfig.json
@leados/shared:build: CLI tsup v8.5.1
@leados/shared:build: CLI Using tsup config: /Users/rajakumar/lead_os/packages/shared/tsup.config.ts
@leados/shared:build: CLI Target: es2022
@leados/shared:build: CLI Cleaning output folder
@leados/shared:build: ESM Build start
@leados/shared:build: ESM dist/index.js     29.08 KB
@leados/shared:build: ESM dist/index.js.map 63.15 KB
@leados/shared:build: ESM ⚡️ Build success in 53ms
@leados/shared:build: DTS Build start
@leados/shared:build: DTS ⚡️ Build success in 5995ms
@leados/shared:build: DTS dist/index.d.ts 67.07 KB
@leados/shared:test: cache hit, replaying logs cf4df0cf9e038858
@leados/shared:test: 
@leados/shared:test: > @leados/shared@0.0.0 test /Users/rajakumar/lead_os/packages/shared
@leados/shared:test: > vitest run
@leados/shared:test: 
@leados/shared:test: 
@leados/shared:test:  RUN  v3.2.6 /Users/rajakumar/lead_os/packages/shared
@leados/shared:test: 
@leados/shared:test:  ✓ src/schemas/lead.test.ts (10 tests) 31ms
@leados/shared:test:  ✓ src/schemas/contact.test.ts (10 tests) 33ms
@leados/shared:test:  ✓ src/schemas/task.test.ts (12 tests) 86ms
@leados/shared:test:  ✓ src/schemas/auth.test.ts (10 tests) 63ms
@leados/shared:test:  ✓ src/schemas/note.test.ts (14 tests) 36ms
@leados/shared:test:  ✓ src/schemas/file.test.ts (12 tests) 34ms
@leados/shared:test:  ✓ src/shared.test.ts (8 tests) 58ms
@leados/shared:test: 
@leados/shared:test:  Test Files  7 passed (7)
@leados/shared:test:       Tests  76 passed (76)
@leados/shared:test:    Start at  10:22:49
@leados/shared:test:    Duration  4.57s (transform 1.18s, setup 0ms, collect 2.94s, tests 341ms, environment 3ms, prepare 5.99s)
@leados/shared:test: 
@leados/web:test: cache hit, replaying logs 143c2c3eaafc7b28
@leados/web:test: 
@leados/web:test: > @leados/web@0.0.0 test /Users/rajakumar/lead_os/apps/web
@leados/web:test: > vitest run
@leados/web:test: 
@leados/web:test:  DEPRECATED  "environmentMatchGlobs" is deprecated. Use `test.projects` to define different configurations instead.
@leados/web:test: 
@leados/web:test:  RUN  v3.2.6 /Users/rajakumar/lead_os/apps/web
@leados/web:test: 
@leados/web:test:  ✓ src/components/inbox/ComposeBar.test.tsx (7 tests) 1435ms
@leados/web:test:    ✓ ComposeBar > renders a textarea and Send button  482ms
@leados/web:test:    ✓ ComposeBar > calls onSend and clears textarea on button click  612ms
@leados/web:test:  ✓ src/components/app/CommandPalette.test.tsx (7 tests) 1576ms
@leados/web:test:    ✓ CommandPalette > renders input and default state prompt when query is empty  372ms
@leados/web:test:    ✓ CommandPalette > shows loading state when query is input  387ms
@leados/web:test:  ✓ src/components/leads/BulkActionBar.test.tsx (5 tests) 1566ms
@leados/web:test:    ✓ BulkActionBar > renders null when selectedIds is empty  404ms
@leados/web:test:    ✓ BulkActionBar > renders selection count and buttons when selectedIds has items  369ms
@leados/web:test:    ✓ BulkActionBar > displays tags popup and triggers tags add on submit  474ms
@leados/web:test:  ✓ src/components/inbox/CreateLeadModal.test.tsx (7 tests) 2095ms
@leados/web:test:    ✓ CreateLeadModal > renders form fields when open  890ms
@leados/web:test:    ✓ CreateLeadModal > calls mutate with correct payload when firstName is provided  420ms
@leados/web:test:    ✓ CreateLeadModal > does not include lastName in payload when left empty  408ms
@leados/web:test:  ✓ src/components/leads/LeadFilters.test.tsx (9 tests) 1819ms
@leados/web:test:    ✓ LeadFilters > renders the filter panel  465ms
@leados/web:test:    ✓ LeadFilters > calls setFilters with search after 300ms debounce  643ms
@leados/web:test:    ✓ LeadFilters > calls savePreset when Save is clicked with a preset name  321ms
@leados/web:test:  ✓ src/components/leads/LeadTable.test.tsx (7 tests) 1162ms
@leados/web:test:    ✓ LeadTable > calls onImport when Import CSV is clicked  516ms
@leados/web:test:  ✓ src/components/kanban/KanbanBoard.test.tsx (7 tests) 1576ms
@leados/web:test:    ✓ KanbanBoard > renders stage columns  465ms
@leados/web:test:    ✓ KanbanBoard > mobile stage navigation > advances to next stage on next click  401ms
@leados/web:test:  ✓ src/components/inbox/SavedReplyPicker.test.tsx (7 tests) 1753ms
@leados/web:test:    ✓ SavedReplyPicker > filters replies by search term  1022ms
@leados/web:test:  ✓ src/components/deals/DealDetailPage.test.tsx (5 tests) 1404ms
@leados/web:test:    ✓ DealDetailPage > renders deal title  1008ms
@leados/web:test:  ✓ src/components/kanban/DealCard.test.tsx (6 tests) 1198ms
@leados/web:test:    ✓ DealCard > calls onMarkWon when Won button clicked  620ms
@leados/web:test:  ✓ src/components/notifications/NotificationBell.test.tsx (3 tests) 1213ms
@leados/web:test:    ✓ NotificationBell > renders the unread count badge from the API  312ms
@leados/web:test:    ✓ NotificationBell > opens the panel and lists notifications  497ms
@leados/web:test:    ✓ NotificationBell > marks all read via the BFF  391ms
@leados/web:test:  ✓ src/components/inbox/InboxPage.test.tsx (5 tests) 1122ms
@leados/web:test:    ✓ InboxPage > switches to Mine tab and fetches with filter  614ms
@leados/web:test:  ✓ src/components/leads/LeadDetailPage.test.tsx (6 tests) 1417ms
@leados/web:test:    ✓ LeadDetailPage > renders the page container  702ms
@leados/web:test:    ✓ LeadDetailPage > renders lead name in first-name field  369ms
@leados/web:test:  ✓ src/components/leads/CsvImportModal.test.tsx (3 tests) 624ms
@leados/web:test:    ✓ CsvImportModal > renders the file input and upload button when open  362ms
@leados/web:test:  ✓ src/lib/api-client.test.ts (8 tests) 213ms
@leados/web:test:  ✓ src/components/inbox/ConversationList.test.tsx (4 tests) 528ms
@leados/web:test:    ✓ ConversationList > calls onSelect when item clicked  305ms
@leados/web:test:  ✓ src/components/deals/StageTimeline.test.tsx (5 tests) 519ms
@leados/web:test:  ✓ src/components/deals/ActivityFeed.test.tsx (3 tests) 211ms
@leados/web:test:  ✓ src/lib/hooks/useSendMessage.test.ts (4 tests) 303ms
@leados/web:test:  ✓ src/lib/hooks/useConversations.test.ts (3 tests) 252ms
@leados/web:test:  ✓ src/components/leads/LeadStatusBadge.test.tsx (5 tests) 296ms
@leados/web:test:  ✓ src/app/api/bff/deals/route.test.ts (5 tests) 41ms
@leados/web:test:  ✓ src/app/api/bff/deals/[id]/lost/route.test.ts (2 tests) 19ms
@leados/web:test:  ✓ src/lib/server/bff.test.ts (6 tests) 20ms
@leados/web:test:  ✓ src/app/api/bff/deals/[id]/activities/route.test.ts (3 tests) 20ms
@leados/web:test:  ✓ src/app/api/bff/deals/forecast/route.test.ts (3 tests) 43ms
@leados/web:test:  ✓ src/app/api/bff/deals/[id]/route.test.ts (4 tests) 25ms
@leados/web:test:  ✓ src/app/api/bff/notifications/read/route.test.ts (2 tests) 53ms
@leados/web:test:  ✓ src/app/api/health/route.test.ts (2 tests) 12ms
@leados/web:test:  ✓ src/app/api/auth/logout/route.test.ts (3 tests) 44ms
@leados/web:test:  ✓ src/app/api/bff/deals/[id]/move/route.test.ts (2 tests) 50ms
@leados/web:test:  ✓ src/app/api/bff/notifications/preferences/route.test.ts (4 tests) 71ms
@leados/web:test:  ✓ src/app/api/bff/inbox/conversations/route.test.ts (4 tests) 70ms
@leados/web:test:  ✓ src/app/api/auth/login/route.test.ts (2 tests) 35ms
@leados/web:test:  ✓ src/app/api/bff/deals/[id]/won/route.test.ts (2 tests) 31ms
@leados/web:test:  ✓ src/lib/server/cookies.test.ts (6 tests) 9ms
@leados/web:test:  ✓ src/app/api/bff/pipelines/route.test.ts (3 tests) 17ms
@leados/web:test:  ✓ src/lib/server/bff-auth.test.ts (5 tests) 8ms
@leados/web:test:  ✓ src/app/api/auth/refresh/route.test.ts (3 tests) 18ms
@leados/web:test:  ✓ src/app/api/bff/notifications/route.test.ts (2 tests) 33ms
@leados/web:test:  ✓ src/lib/auth/token-store.test.ts (4 tests) 13ms
@leados/web:test: 
@leados/web:test:  Test Files  41 passed (41)
@leados/web:test:       Tests  183 passed (183)
@leados/web:test:    Start at  10:52:15
@leados/web:test:    Duration  22.33s (transform 4.51s, setup 24.46s, collect 28.58s, tests 22.91s, environment 36.28s, prepare 11.82s)
@leados/web:test: 
@leados/api:test: cache hit, replaying logs a686462fa3706f10
@leados/api:test: 
@leados/api:test: > @leados/api@0.0.0 test /Users/rajakumar/lead_os/apps/api
@leados/api:test: > vitest run
@leados/api:test: 
@leados/api:test: 
@leados/api:test:  RUN  v3.2.6 /Users/rajakumar/lead_os/apps/api
@leados/api:test: 
@leados/api:test:  ✓ src/modules/auth/auth.login.test.ts (7 tests) 11411ms
@leados/api:test:  ✓ src/modules/auth/auth.refresh.test.ts (7 tests) 6588ms
@leados/api:test:  ✓ src/modules/auth/auth.service.test.ts (10 tests) 4150ms
@leados/api:test:  ✓ src/modules/auth/auth.password.test.ts (7 tests) 4985ms
@leados/api:test:  ✓ src/core/crypto/password.test.ts (3 tests) 2556ms
@leados/api:test:  ✓ tests/boundary-rule.test.ts (2 tests) 738ms
@leados/api:test:  ✓ tests/integration/deals.integration.test.ts (27 tests) 714ms
@leados/api:test:  ✓ tests/integration/inbox-receive.integration.test.ts (11 tests) 354ms
@leados/api:test:  ✓ tests/integration/inbox-send.integration.test.ts (16 tests) 428ms
@leados/api:test:  ✓ tests/integration/pipelines.integration.test.ts (30 tests) 470ms
@leados/api:test:  ✓ tests/integration/auth.routes.test.ts (12 tests) 647ms
@leados/api:test:  ✓ tests/integration/contacts.integration.test.ts (21 tests) 297ms
@leados/api:test:  ✓ tests/integration/files.integration.test.ts (10 tests) 224ms
@leados/api:test:  ✓ tests/integration/leads.integration.test.ts (24 tests) 297ms
@leados/api:test:  ✓ tests/integration/notes.integration.test.ts (10 tests) 231ms
@leados/api:test:  ✓ tests/integration/productivity.integration.test.ts (9 tests) 346ms
@leados/api:test:  ✓ tests/integration/instagram-oauth.integration.test.ts (13 tests) 192ms
@leados/api:test:  ✓ tests/integration/leads-list.integration.test.ts (12 tests) 224ms
@leados/api:test:  ✓ tests/integration/isolation.rls.test.ts (24 tests) 141ms
@leados/api:test:  ✓ tests/integration/tasks.integration.test.ts (13 tests) 217ms
@leados/api:test:  ✓ tests/integration/leads-notes.integration.test.ts (6 tests) 174ms
@leados/api:test:  ✓ tests/integration/isolation.rbac.test.ts (23 tests) 245ms
@leados/api:test:  ✓ tests/integration/notifications.integration.test.ts (9 tests) 242ms
@leados/api:test:  ✓ tests/integration/ai-scoring.integration.test.ts (5 tests) 256ms
@leados/api:test:  ✓ tests/integration/inbox-saved-replies.integration.test.ts (19 tests) 193ms
@leados/api:test:  ✓ tests/integration/leads-import.integration.test.ts (8 tests) 189ms
@leados/api:test:  ✓ tests/integration/leads-export.integration.test.ts (7 tests) 168ms
@leados/api:test:  ✓ tests/integration/webhook.integration.test.ts (12 tests) 124ms
@leados/api:test:  ✓ tests/integration/audit.integration.test.ts (4 tests) 119ms
@leados/api:test:  ✓ tests/integration/rbac.enforcement.test.ts (7 tests) 155ms
@leados/api:test:  ✓ tests/integration/workflow.integration.test.ts (5 tests) 128ms
@leados/api:test:  ✓ tests/integration/followup.integration.test.ts (1 test) 110ms
@leados/api:test:  ✓ tests/integration/ai-routes.integration.test.ts (6 tests) 170ms
@leados/api:test:  ✓ tests/integration/analytics.integration.test.ts (1 test) 87ms
@leados/api:test:  ✓ tests/integration/rls.foundation.test.ts (9 tests) 94ms
@leados/api:test:  ✓ tests/integration/tenant.middleware.e2e.test.ts (5 tests) 93ms
@leados/api:test:  ✓ tests/integration/crm.rls.test.ts (13 tests) 88ms
@leados/api:test:  ✓ tests/integration/isolation.app.test.ts (13 tests) 73ms
@leados/api:test:  ✓ tests/integration/health.test.ts (6 tests) 71ms
@leados/api:test:  ✓ tests/integration/tenancy.withTenant.test.ts (7 tests) 56ms
@leados/api:test:  ✓ tests/integration/tenancy.reassignment.test.ts (5 tests) 45ms
@leados/api:test:  ✓ tests/integration/org-scoped-auth.integration.test.ts (5 tests) 40ms
@leados/api:test:  ✓ src/core/middleware/auth.middleware.test.ts (5 tests) 39ms
@leados/api:test:  ✓ src/core/middleware/csrf.test.ts (4 tests) 27ms
@leados/api:test:  ✓ src/core/errors/error-handler.test.ts (3 tests) 31ms
@leados/api:test:  ✓ tests/integration/queue-roundtrip.test.ts (2 tests | 1 skipped) 24ms
@leados/api:test:  ✓ src/modules/rbac/rbac.service.test.ts (6 tests) 9ms
@leados/api:test:  ✓ src/core/email/email-sender.test.ts (5 tests) 11ms
@leados/api:test:  ✓ src/core/crypto/field-encryption.test.ts (6 tests) 7ms
@leados/api:test:  ✓ src/core/realtime/socket-middleware.test.ts (5 tests) 11ms
@leados/api:test:  ✓ src/modules/ai/ai.service.test.ts (8 tests) 10ms
@leados/api:test:  ✓ src/core/auth/jwt.test.ts (4 tests) 8ms
@leados/api:test:  ✓ src/core/tenancy/tenant-extension.test.ts (28 tests) 6ms
@leados/api:test:  ✓ src/core/middleware/tenant.middleware.test.ts (4 tests) 9ms
@leados/api:test:  ✓ src/core/realtime/notification-publisher.test.ts (2 tests) 6ms
@leados/api:test:  ✓ src/core/middleware/rbac.middleware.test.ts (7 tests) 6ms
@leados/api:test:  ✓ src/core/events/event-bus.test.ts (2 tests) 12ms
@leados/api:test:  ✓ src/core/tenancy/context.test.ts (5 tests) 9ms
@leados/api:test:  ✓ src/modules/rbac/permission-resolver.test.ts (4 tests) 6ms
@leados/api:test:  ✓ src/core/http/envelope.test.ts (4 tests) 4ms
@leados/api:test:  ✓ src/core/tenancy/tenant-tables.test.ts (7 tests) 5ms
@leados/api:test:  ✓ src/core/tenancy/membership.test.ts (4 tests) 6ms
@leados/api:test:  ✓ src/core/auth/tokens.test.ts (4 tests) 8ms
@leados/api:test:  ✓ src/core/config/env.test.ts (5 tests) 9ms
@leados/api:test:  ✓ src/core/authz/permission-check.test.ts (6 tests) 7ms
@leados/api:test:  ✓ src/core/queue/jobs/health-echo.test.ts (2 tests) 5ms
@leados/api:test:  ✓ src/core/tenancy/scope.test.ts (5 tests) 7ms
@leados/api:test:  ✓ src/core/audit/audit-recorder.test.ts (3 tests) 3ms
@leados/api:test:  ✓ src/core/audit/pii-masking.test.ts (6 tests) 4ms
@leados/api:test:  ✓ src/core/flags/flags.test.ts (3 tests) 3ms
@leados/api:test:  ✓ src/core/tenancy/tenant-repository.test.ts (3 tests) 3ms
@leados/api:test: 
@leados/api:test:  Test Files  71 passed (71)
@leados/api:test:       Tests  595 passed | 1 skipped (596)
@leados/api:test:    Start at  10:45:50
@leados/api:test:    Duration  87.95s (transform 1.42s, setup 66ms, collect 32.03s, tests 38.42s, environment 12ms, prepare 4.74s)
@leados/api:test: 

 Tasks:    4 successful, 4 total
Cached:    4 cached, 4 total
  Time:    204ms >>> FULL TURBO
```

### 7. Production Build
```text
$ pnpm build
WARN Unsupported engine: wanted: {"node":"20.x"} (current: {"node":"v25.2.1","pnpm":"9.15.9"})

> leados@0.0.0 build /Users/rajakumar/lead_os
> turbo run build

• turbo 2.9.18

   • Packages in scope: @leados/api, @leados/config, @leados/shared, @leados/tsconfig, @leados/web
   • Running build in 5 packages
   • Remote caching disabled

@leados/shared:build: cache hit, replaying logs 7de2cc6b507f63e8
@leados/shared:build: 
@leados/shared:build: > @leados/shared@0.0.0 build /Users/rajakumar/lead_os/packages/shared
@leados/shared:build: > tsup
...
@leados/web:build:    ▲ Next.js 15.5.19
@leados/web:build: 
@leados/web:build:    Creating an optimized production build ...
@leados/web:build:  ✓ Compiled successfully in 2.7s
@leados/web:build:    Linting and checking validity of types ...
@leados/web:build: 
@leados/web:build:  ⚠ The Next.js plugin was not detected in your ESLint configuration. See https://nextjs.org/docs/app/api-reference/config/eslint#migrating-existing-config
@leados/web:build:    Collecting page data ...
@leados/web:build:    Generating static pages (0/18) ...
@leados/web:build:    Generating static pages (4/18) 
@leados/web:build:    Generating static pages (8/18) 
@leados/web:build:    Generating static pages (13/18) 
@leados/web:build:  ✓ Generating static pages (18/18)
@leados/web:build:    Finalizing page optimization ...
@leados/web:build:    Collecting build traces ...
@leados/web:build: 
@leados/web:build: Route (app)                                        Size  First Load JS
@leados/web:build: ┌ ○ /                                           2.79 kB         118 kB
@leados/web:build: ├ ○ /_not-found                                   998 B         104 kB
@leados/web:build: ├ ○ /analytics                                  2.59 kB         114 kB
...
@leados/web:build: + First Load JS shared by all                    103 kB
@leados/web:build:   ├ chunks/4833-abc3beae8911c7b7.js             46.1 kB
@leados/web:build:   ├ chunks/e43e8e11-5158f16210594e29.js         54.2 kB
@leados/web:build:   └ other shared chunks (total)                 2.17 kB
@leados/web:build: 
@leados/web:build: ○  (Static)   prerendered as static content
@leados/web:build: ƒ  (Dynamic)  server-rendered on demand
@leados/web:build: 

 Tasks:    3 successful, 3 total
Cached:    3 cached, 3 total
  Time:    246ms >>> FULL TURBO
```
