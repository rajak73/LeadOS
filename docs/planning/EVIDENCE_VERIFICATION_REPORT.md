# LeadOS Evidence Verification Report

Generated: 2026-06-23T10:35:00+05:30  
Author: LeadOS Chief Architect / Principal QA Lead

---

## 1. Exact Git Status Output

```text
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   apps/api/src/app.ts
	modified:   apps/api/src/core/activities/activity.service.ts
	modified:   apps/api/src/core/config/env.ts
	modified:   apps/api/src/core/email/templates.ts
	modified:   apps/api/src/core/queue/worker-registry.ts
	modified:   apps/api/src/core/queue/workers/email-delivery.worker.ts
	modified:   apps/api/src/core/scheduler/cron-registry.ts
	modified:   apps/api/src/core/tenancy/context.ts
	modified:   apps/api/src/core/tenancy/tenant-tables.test.ts
	modified:   apps/api/src/core/tenancy/tenant-tables.ts
	modified:   apps/api/src/modules/deals/deal.controller.ts
	modified:   apps/api/src/modules/deals/deal.routes.ts
	modified:   apps/api/src/modules/deals/deal.service.ts
	modified:   apps/api/src/modules/inbox/inbox.controller.ts
	modified:   apps/api/src/modules/inbox/inbox.routes.ts
	modified:   apps/api/src/modules/inbox/inbox.service.ts
	modified:   apps/api/src/modules/leads/lead.controller.ts
	modified:   apps/api/src/modules/leads/lead.routes.ts
	modified:   apps/api/src/modules/leads/lead.service.ts
	modified:   apps/api/src/modules/tasks/task.controller.ts
	modified:   apps/api/src/modules/tasks/task.repository.ts
	modified:   apps/api/src/modules/tasks/task.routes.ts
	modified:   apps/api/src/modules/tasks/task.service.ts
	modified:   apps/api/tests/setup-env.ts
	modified:   apps/api/vitest.config.ts
	modified:   apps/web/src/app/(dashboard)/layout.tsx
	modified:   apps/web/src/app/(dashboard)/page.tsx
	modified:   apps/web/src/components/app/AppChrome.tsx
	modified:   apps/web/src/components/leads/LeadDetailPage.tsx
	modified:   apps/web/src/components/leads/LeadListPage.tsx
	modified:   apps/web/src/components/leads/LeadTable.tsx
	modified:   apps/web/src/components/nav/NavLinks.tsx
	modified:   packages/shared/src/errors/error-codes.ts
	modified:   packages/shared/src/index.ts
	modified:   packages/shared/src/types/activity-metadata.ts
	modified:   packages/shared/src/types/index.ts
	modified:   pnpm-lock.yaml
	modified:   prisma/migrations/migration_lock.toml
	modified:   prisma/schema.prisma

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	apps/api/scripts/apply-billing-db.ts
	apps/api/scripts/check-db.ts
	apps/api/src/core/db/
	apps/api/src/core/queue/workers/ai-scoring.worker.ts
	apps/api/src/core/queue/workers/followup-sweep.worker.ts
	apps/api/src/core/queue/workers/workflow-execution.worker.ts
	apps/api/src/modules/ai/
	apps/api/src/modules/analytics/
	apps/api/src/modules/billing/
	apps/api/src/modules/search/
	apps/api/src/modules/tasks/followup.service.ts
	apps/api/src/modules/workflow/
	apps/api/tests/integration/ai-routes.integration.test.ts
	apps/api/tests/integration/ai-scoring.integration.test.ts
	apps/api/tests/integration/analytics.integration.test.ts
	apps/api/tests/integration/followup.integration.test.ts
	apps/api/tests/integration/productivity.integration.test.ts
	apps/api/tests/integration/workflow.integration.test.ts
	apps/web/src/app/(dashboard)/settings/billing/
	apps/web/src/app/(dashboard)/settings/layout.tsx
	apps/web/src/app/(dashboard)/settings/page.tsx
	apps/web/src/app/(dashboard)/settings/profile/
	apps/web/src/app/(dashboard)/settings/team/
	apps/web/src/app/(dashboard)/tasks/
	apps/web/src/app/(dashboard)/workflows/
	apps/web/src/app/api/bff/analytics/
	apps/web/src/app/api/bff/leads/
	apps/web/src/app/api/bff/tasks/
	apps/web/src/app/api/bff/workflows/
	apps/web/src/components/app/CommandPalette.tsx
	apps/web/src/components/leads/BulkActionBar.tsx
	apps/web/src/components/leads/LeadScoreBadge.tsx
	apps/web/src/components/leads/LeadScorePopover.tsx
	apps/web/src/components/leads/ViewBar.tsx
	apps/web/src/components/workflows/
	apps/web/src/lib/hooks/useAnalytics.ts
	apps/web/src/lib/hooks/useBulkConversations.ts
	apps/web/src/lib/hooks/useBulkDeals.ts
	apps/web/src/lib/hooks/useBulkLeads.ts
	apps/web/src/lib/hooks/useGlobalSearch.ts
	apps/web/src/lib/hooks/useLeadScore.ts
	apps/web/src/lib/hooks/useTasks.ts
	apps/web/src/lib/hooks/useWorkflows.ts
	docs/planning/M2_IMPLEMENTATION_CHECKLIST.md
	docs/planning/M2_PHASE_A_REPORT.md
	docs/planning/M2_PHASE_B_REPORT.md
	docs/planning/MASTER_PROJECT_AUDIT.md
	docs/planning/PROJECT_ANALYSIS.md
	docs/planning/PROJECT_STATE_HANDOFF.md
	docs/planning/REALITY_CHECK_REPORT.md
	docs/planning/REMEDIATION_EVIDENCE_REPORT.md
	docs/planning/REPOSITORY_RECOVERY_REPORT.md
	docs/planning/SESSION_LOG.md
	docs/planning/agent_verification/
	packages/shared/src/schemas/bulk.ts
	packages/shared/src/types/ai.ts
	packages/shared/src/types/workflow.ts
	prisma/migrations/0019_ai_usage_counters/
	prisma/migrations/0020_notification_type_lead_scored/
	prisma/migrations/0021_add_workflows/

no changes added to commit (use "git add" and/or "git commit -a")
```

---

## 2. Exact Git Diff --Stat Output

```text
 apps/api/src/app.ts                                |   6 +
 apps/api/src/core/activities/activity.service.ts   |   2 +-
 apps/api/src/core/config/env.ts                    |  13 ++
 apps/api/src/core/email/templates.ts               |  18 ++
 apps/api/src/core/queue/worker-registry.ts         |  18 ++
 .../core/queue/workers/email-delivery.worker.ts    |   9 +-
 apps/api/src/core/scheduler/cron-registry.ts       |   8 +
 apps/api/src/core/tenancy/context.ts               |   2 +
 apps/api/src/core/tenancy/tenant-tables.test.ts    |  13 +-
 apps/api/src/core/tenancy/tenant-tables.ts         |  10 +
 apps/api/src/modules/deals/deal.controller.ts      |   8 +-
 apps/api/src/modules/deals/deal.routes.ts          |   8 +
 apps/api/src/modules/deals/deal.service.ts         |  84 ++++++++-
 apps/api/src/modules/inbox/inbox.controller.ts     |   8 +-
 apps/api/src/modules/inbox/inbox.routes.ts         |  10 +
 apps/api/src/modules/inbox/inbox.service.ts        |  59 +++++-
 apps/api/src/modules/leads/lead.controller.ts      |   8 +-
 apps/api/src/modules/leads/lead.routes.ts          |  13 +-
 apps/api/src/modules/leads/lead.service.ts         | 156 ++++++++++++++-
 apps/api/src/modules/tasks/task.controller.ts      |  13 ++
 apps/api/src/modules/tasks/task.repository.ts      |  10 +
 apps/api/src/modules/tasks/task.routes.ts          |   6 +
 apps/api/src/modules/tasks/task.service.ts         |  14 ++
 apps/api/tests/setup-env.ts                        |   8 +
 apps/api/vitest.config.ts                          |   1 +
 apps/web/src/app/(dashboard)/layout.tsx            |   2 +-
 apps/web/src/app/(dashboard)/page.tsx              | 209 +++++++++++++++------
 apps/web/src/components/app/AppChrome.tsx          |  45 ++++-
 apps/web/src/components/leads/LeadDetailPage.tsx   |  10 +
 apps/web/src/components/leads/LeadListPage.tsx     |   4 +
 apps/web/src/components/leads/LeadTable.tsx        | 162 ++++++++++------
 apps/web/src/components/nav/NavLinks.tsx           |   2 +
 packages/shared/src/errors/error-codes.ts          |   9 +
 packages/shared/src/index.ts                       |   1 +
 packages/shared/src/types/activity-metadata.ts     |   3 +-
 packages/shared/src/types/index.ts                 |   4 +
 pnpm-lock.yaml                                     |  12 ++
 prisma/migrations/migration_lock.toml              |   4 +-
 prisma/schema.prisma                               | 137 ++++++++++++--
 39 files changed, 963 insertions(+), 146 deletions(-)
```

---

## 3. Newly Created Files by Sprint 7 Milestone

### Sprint 7 M2 — AI Lead Scoring
- `apps/api/src/modules/ai/ai.routes.ts`
- `apps/api/src/modules/ai/ai.service.ts`
- `apps/api/src/modules/ai/ai.prompts.ts`
- `apps/api/src/modules/ai/ai.adapter.ts`
- `apps/api/src/modules/ai/ai.service.test.ts`
- `apps/api/src/modules/ai/index.ts`
- `apps/api/src/modules/ai/ai.controller.ts`
- `apps/api/src/core/queue/workers/ai-scoring.worker.ts`
- `apps/api/tests/integration/ai-scoring.integration.test.ts`
- `apps/api/tests/integration/ai-routes.integration.test.ts`
- `apps/web/src/components/leads/LeadScoreBadge.tsx`
- `apps/web/src/components/leads/LeadScorePopover.tsx`
- `apps/web/src/lib/hooks/useLeadScore.ts`
- `apps/web/src/app/api/bff/leads/[id]/score/route.ts`
- `apps/web/src/app/api/bff/leads/[id]/rescore/route.ts`
- `packages/shared/src/types/ai.ts`
- `prisma/migrations/0019_ai_usage_counters/`
- `prisma/migrations/0020_notification_type_lead_scored/`

### Sprint 7 M3 — Workflow Engine
- `apps/api/src/modules/workflow/workflow.routes.ts`
- `apps/api/src/modules/workflow/workflow.controller.ts`
- `apps/api/src/modules/workflow/workflow.repository.ts`
- `apps/api/src/modules/workflow/workflow.service.ts`
- `apps/api/src/modules/workflow/workflow.evaluator.ts`
- `apps/api/src/modules/workflow/workflow.actions.ts`
- `apps/api/src/core/queue/workers/workflow-execution.worker.ts`
- `apps/api/tests/integration/workflow.integration.test.ts`
- `apps/web/src/app/(dashboard)/workflows/page.tsx`
- `apps/web/src/app/(dashboard)/workflows/new/page.tsx`
- `apps/web/src/app/(dashboard)/workflows/[id]/page.tsx`
- `apps/web/src/app/(dashboard)/workflows/[id]/runs/page.tsx`
- `apps/web/src/components/workflows/WorkflowFormBuilder.tsx`
- `apps/web/src/lib/hooks/useWorkflows.ts`
- `apps/web/src/app/api/bff/workflows/route.ts`
- `apps/web/src/app/api/bff/workflows/meta/route.ts`
- `apps/web/src/app/api/bff/workflows/[id]/route.ts`
- `apps/web/src/app/api/bff/workflows/[id]/runs/route.ts`
- `packages/shared/src/types/workflow.ts`
- `prisma/migrations/0021_add_workflows/`

### Sprint 7 M4 — Smart Follow-ups
- `apps/api/src/modules/tasks/followup.service.ts`
- `apps/api/src/core/queue/workers/followup-sweep.worker.ts`
- `apps/api/tests/integration/followup.integration.test.ts`
- `apps/web/src/app/api/bff/leads/[id]/follow-up-suggestion/route.ts`
- `apps/web/src/app/(dashboard)/tasks/page.tsx`
- `apps/web/src/app/api/bff/tasks/route.ts`
- `apps/web/src/app/api/bff/tasks/[id]/route.ts`
- `apps/web/src/lib/hooks/useTasks.ts`

### Sprint 7 M5 — Analytics Intelligence
- `apps/api/src/modules/analytics/analytics.controller.ts`
- `apps/api/src/modules/analytics/analytics.service.ts`
- `apps/api/src/modules/analytics/analytics.repository.ts`
- `apps/api/src/modules/analytics/analytics.routes.ts`
- `apps/api/tests/integration/analytics.integration.test.ts`
- `apps/web/src/app/api/bff/analytics/dashboard/route.ts`
- `apps/web/src/lib/hooks/useAnalytics.ts`

### Sprint 7 M6 — Productivity Polish
- `apps/api/src/modules/search/search.routes.ts`
- `apps/api/src/modules/search/search.controller.ts`
- `apps/api/src/modules/search/search.service.ts`
- `apps/api/src/modules/search/index.ts`
- `apps/api/tests/integration/productivity.integration.test.ts`
- `apps/web/src/components/app/CommandPalette.tsx`
- `apps/web/src/components/leads/BulkActionBar.tsx`
- `apps/web/src/components/leads/ViewBar.tsx`
- `apps/web/src/lib/hooks/useBulkConversations.ts`
- `apps/web/src/lib/hooks/useBulkDeals.ts`
- `apps/web/src/lib/hooks/useBulkLeads.ts`
- `apps/web/src/lib/hooks/useGlobalSearch.ts`
- `packages/shared/src/schemas/bulk.ts`

---

## 4. Exact Paths for Key Services and Components

- **ai.service.ts**: `apps/api/src/modules/ai/ai.service.ts`
- **ai.adapter.ts**: `apps/api/src/modules/ai/ai.adapter.ts`
- **ai-scoring.worker.ts**: `apps/api/src/core/queue/workers/ai-scoring.worker.ts`
- **workflow.service.ts**: `apps/api/src/modules/workflow/workflow.service.ts`
- **workflow.actions.ts**: `apps/api/src/modules/workflow/workflow.actions.ts`
- **workflow.evaluator.ts**: `apps/api/src/modules/workflow/workflow.evaluator.ts`
- **followup.service.ts**: `apps/api/src/modules/tasks/followup.service.ts`
- **analytics.service.ts**: `apps/api/src/modules/analytics/analytics.service.ts`
- **CommandPalette component**: `apps/web/src/components/app/CommandPalette.tsx`
- **BulkActionBar component**: `apps/web/src/components/leads/BulkActionBar.tsx`
- **Global search implementation**:
  - Backend Services: `apps/api/src/modules/search/search.service.ts`
  - Backend Controller: `apps/api/src/modules/search/search.controller.ts`
  - Backend Routes: `apps/api/src/modules/search/search.routes.ts`
  - Frontend Hook: `apps/web/src/lib/hooks/useGlobalSearch.ts`

---

## 5. Raw Output of Verification Command runs

### pnpm typecheck
```text
@leados/api:typecheck: src/core/queue/workers/workflow-execution.worker.ts(89,9): error TS2322: Type '{ eventId: string; event: string; payload: { [key: string]: unknown; organizationId: string; id: string; depth?: number; eventId?: string; }; }' is not assignable to type 'JsonNull | InputJsonValue'.
@leados/api:typecheck:   Type '{ eventId: string; event: string; payload: { [key: string]: unknown; organizationId: string; id: string; depth?: number; eventId?: string; }; }' is not assignable to type 'InputJsonObject'.
@leados/api:typecheck:     Property 'payload' is incompatible with index signature.
@leados/api:typecheck:       Type '{ [key: string]: unknown; organizationId: string; id: string; depth?: number; eventId?: string; }' is not assignable to type 'InputJsonValue | null | undefined'.
@leados/api:typecheck:         Type '{ [key: string]: unknown; organizationId: string; id: string; depth?: number; eventId?: string; }' is missing the following properties from type 'readonly (InputJsonValue | null)[]': length, concat, join, slice, and 20 more.
@leados/api:typecheck: src/modules/leads/lead.service.ts(633,32): error TS2345: Argument of type '{ status: LeadStatus; phone: string | null; email: string | null; organizationId: string; aiScore: number | null; id: string; createdAt: Date; updatedAt: Date; ... 16 more ...; deletedAt: Date | null; } | undefined' is not assignable to parameter of type '{ status: LeadStatus; phone: string | null; email: string | null; organizationId: string; aiScore: number | null; id: string; createdAt: Date; updatedAt: Date; ... 16 more ...; deletedAt: Date | null; }'.
@leados/api:typecheck:   Type 'undefined' is not assignable to type '{ status: LeadStatus; phone: string | null; email: string | null; organizationId: string; aiScore: number | null; id: string; createdAt: Date; updatedAt: Date; ... 16 more ...; deletedAt: Date | null; }'.
@leados/api:typecheck: src/modules/leads/lead.service.ts(640,32): error TS2345: Argument of type '{ status: LeadStatus; phone: string | null; email: string | null; organizationId: string; aiScore: number | null; id: string; createdAt: Date; updatedAt: Date; ... 16 more ...; deletedAt: Date | null; } | undefined' is not assignable to parameter of type '{ status: LeadStatus; phone: string | null; email: string | null; organizationId: string; aiScore: number | null; id: string; createdAt: Date; updatedAt: Date; ... 16 more ...; deletedAt: Date | null; }'.
@leados/api:typecheck:   Type 'undefined' is not assignable to type '{ status: LeadStatus; phone: string | null; email: string | null; organizationId: string; aiScore: number | null; id: string; createdAt: Date; updatedAt: Date; ... 16 more ...; deletedAt: Date | null; }'.
@leados/api:typecheck: src/modules/leads/lead.service.ts(641,31): error TS2345: Argument of type '{ status: LeadStatus; phone: string | null; email: string | null; organizationId: string; aiScore: number | null; id: string; createdAt: Date; updatedAt: Date; ... 16 more ...; deletedAt: Date | null; } | undefined' is not assignable to parameter of type '{ status: LeadStatus; phone: string | null; email: string | null; organizationId: string; aiScore: number | null; id: string; createdAt: Date; updatedAt: Date; ... 16 more ...; deletedAt: Date | null; }'.
@leados/api:typecheck:   Type 'undefined' is not assignable to type '{ status: LeadStatus; phone: string | null; email: string | null; organizationId: string; aiScore: number | null; id: string; createdAt: Date; updatedAt: Date; ... 16 more ...; deletedAt: Date | null; }'.
@leados/api:typecheck: src/modules/workflow/workflow.service.ts(46,9): error TS2322: Type '{ conditions: WorkflowCondition[]; trigger: { type: "LEAD_CREATED" | "LEAD_STATUS_CHANGED" | "DEAL_CREATED" | "DEAL_STAGE_MOVED" | "MESSAGE_RECEIVED"; config?: Record<...> | undefined; }; actions: { ...; }[]; }' is not assignable to type 'JsonNull | InputJsonValue'.
@leados/api:typecheck:   Type '{ conditions: WorkflowCondition[]; trigger: { type: "LEAD_CREATED" | "LEAD_STATUS_CHANGED" | "DEAL_CREATED" | "DEAL_STAGE_MOVED" | "MESSAGE_RECEIVED"; config?: Record<...> | undefined; }; actions: { ...; }[]; }' is not assignable to type 'InputJsonObject'.
@leados/api:typecheck:     Property 'conditions' is incompatible with index signature.
@leados/api:typecheck:       Type 'WorkflowCondition[]' is not assignable to type 'InputJsonValue | null | undefined'.
@leados/api:typecheck:         Type 'WorkflowCondition[]' is not assignable to type 'InputJsonObject'.
@leados/api:typecheck:           Index signature for type 'string' is missing in type 'WorkflowCondition[]'.
@leados/api:typecheck: src/modules/workflow/workflow.service.ts(105,30): error TS2379: Argument of type '{ name?: string; description?: string | null; triggerType?: string; definition?: { conditions: WorkflowCondition[]; trigger: { type: "LEAD_CREATED" | "LEAD_STATUS_CHANGED" | "DEAL_CREATED" | "DEAL_STAGE_MOVED" | "MESSAGE_RECEIVED"; config?: Record<...> | undefined; }; actions: { ...; }[]; }; isActive?: boolean; }' is not assignable to parameter of type 'WorkflowUpdateInput' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
@leados/api:typecheck:   Types of property 'definition' are incompatible.
@leados/api:typecheck:     Type '{ conditions: WorkflowCondition[]; trigger: { type: "LEAD_CREATED" | "LEAD_STATUS_CHANGED" | "DEAL_CREATED" | "DEAL_STAGE_MOVED" | "MESSAGE_RECEIVED"; config?: Record<...> | undefined; }; actions: { ...; }[]; }' is not assignable to type 'JsonNull | InputJsonValue'.
@leados/api:typecheck:       Type '{ conditions: WorkflowCondition[]; trigger: { type: "LEAD_CREATED" | "LEAD_STATUS_CHANGED" | "DEAL_CREATED" | "DEAL_STAGE_MOVED" | "MESSAGE_RECEIVED"; config?: Record<...> | undefined; }; actions: { ...; }[]; }' is not assignable to type 'InputJsonObject'.
@leados/api:typecheck:         Property 'conditions' is incompatible with index signature.
@leados/api:typecheck:           Type 'WorkflowCondition[]' is not assignable to type 'InputJsonValue | null | undefined'.
@leados/api:typecheck:             Type 'WorkflowCondition[]' is not assignable to type 'InputJsonObject'.
@leados/api:typecheck:               Index signature for type 'string' is missing in type 'WorkflowCondition[]'.
 ELIFECYCLE  Command failed with exit code 2.
```

### pnpm lint
```text
> leados@0.0.0 lint /Users/rajakumar/lead_os
> turbo run lint

• turbo 2.9.18

   • Packages in scope: @leados/api, @leados/config, @leados/shared, @leados/tsconfig, @leados/web
   • Running lint in 5 packages
   • Remote caching disabled

@leados/shared:build: cache hit, replaying logs 7de2cc6b507f63e8
@leados/shared:build: > @leados/shared@0.0.0 build /Users/rajakumar/lead_os/packages/shared
@leados/shared:build: > tsup
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
@leados/api:lint: cache miss, executing 1fa78254c738248d
@leados/shared:lint: > @leados/shared@0.0.0 lint /Users/rajakumar/lead_os/packages/shared
@leados/shared:lint: > eslint src
@leados/web:lint: cache hit, replaying logs ce56bd7311a7926e
@leados/web:lint: > @leados/web@0.0.0 lint /Users/rajakumar/lead_os/apps/web
@leados/web:lint: > eslint src
@leados/api:lint: > @leados/api@0.0.0 lint /Users/rajakumar/lead_os/apps/api
@leados/api:lint: > eslint src

 Tasks:    4 successful, 4 total
Cached:    3 cached, 4 total
  Time:    2.361s 
```

### pnpm build
```text
@leados/web:build: + First Load JS shared by all                    103 kB
@leados/web:build:   ├ chunks/4833-abc3beae8911c7b7.js             46.1 kB
@leados/web:build:   ├ chunks/e43e8e11-5158f16210594e29.js         54.2 kB
@leados/web:build:   └ other shared chunks (total)                 2.17 kB
@leados/web:build: 
@leados/web:build: ○  (Static)   prerendered as static content
@leados/web:build: ƒ  (Dynamic)  server-rendered on demand
@leados/web:build: 
@leados/api:build: > @leados/api@0.0.0 build /Users/rajakumar/lead_os/apps/api
@leados/api:build: > tsup
@leados/api:build: CLI Building entry: src/server.ts, src/worker.ts
@leados/api:build: CLI Using tsconfig: tsconfig.json
@leados/api:build: CLI tsup v8.5.1
@leados/api:build: CLI Using tsup config: /Users/rajakumar/lead_os/apps/api/tsup.config.ts
@leados/api:build: CLI Target: node20
@leados/api:build: CLI Cleaning output folder
@leados/api:build: ESM Build start
@leados/api:build: ESM dist/socket-server-B2FJW5OJ.js              263.00 B
@leados/api:build: ESM dist/notification-publisher-5BRWMQY4.js     252.00 B
@leados/api:build: ESM dist/notification.service-TGGLE72I.js       392.00 B
@leados/api:build: ESM dist/chunk-2BIK76D2.js                      8.18 KB
@leados/api:build: ESM dist/chunk-OSFPJZNK.js                      8.58 KB
@leados/api:build: ESM dist/chunk-7SJ2I6S7.js                      835.00 B
@leados/api:build: ESM dist/chunk-3PFFGAMB.js                      53.70 KB
@leados/api:build: ESM dist/server.js                              200.59 KB
@leados/api:build: ESM dist/worker.js                              27.73 KB
@leados/api:build: ESM dist/chunk-WWB7FQPF.js                      2.60 KB
@leados/api:build: ESM dist/chunk-LSOXOY4K.js                      6.98 KB
@leados/api:build: ESM dist/client-AKUQ2KSU.js                     174.00 B
@leados/api:build: ESM dist/dist-NJSBFOQF.js                       3.59 KB
@leados/api:build: ESM dist/chunk-OMIZAJWG.js                      1.21 KB
@leados/api:build: ESM dist/instagram.adapter-FPNEPYNW.js          275.00 B
@leados/api:build: ESM dist/instagram.service-PXV4E5ID.js          487.00 B
@leados/api:build: ESM dist/chunk-V3GKTYQB.js                      1.71 KB
@leados/api:build: ESM dist/app-error-ZSXIIYZX.js                  149.00 B
@leados/api:build: ESM dist/chunk-KDT6ZNSS.js                      4.84 KB
@leados/api:build: ESM dist/instagram.repository-VQXZXKUY.js       268.00 B
@leados/api:build: ESM dist/chunk-WYPRM6XR.js                      1.04 KB
@leados/api:build: ESM dist/field-encryption-IZD5GISL.js           196.00 B
@leados/api:build: ESM dist/chunk-55TNTGXM.js                      1.00 KB
@leados/api:build: ESM dist/chunk-C2NNFJXP.js                      28.69 KB
@leados/api:build: ESM dist/chunk-EBL467S4.js                      6.31 KB
@leados/api:build: ESM dist/chunk-SBNS2OIK.js                      439.00 B
@leados/api:build: ESM dist/chunk-JBBNJLSO.js                      1.66 KB
@leados/api:build: ESM dist/chunk-27IXWBTR.js                      8.04 KB
@leados/api:build: ESM dist/notification.service-TGGLE72I.js.map   71.00 B
@leados/api:build: ESM dist/notification-publisher-5BRWMQY4.js.map 71.00 B
@leados/api:build: ESM dist/chunk-3PFFGAMB.js.map                  118.47 KB
@leados/api:build: ESM dist/socket-server-B2FJW5OJ.js.map          71.00 B
@leados/api:build: ESM dist/chunk-2BIK76D2.js.map                  15.78 KB
@leados/api:build: ESM dist/chunk-7SJ2I6S7.js.map                  1.90 KB
@leados/api:build: ESM dist/chunk-OSFPJZNK.js.map                  18.34 KB
@leados/api:build: ESM dist/chunk-WWB7FQPF.js.map                  6.82 KB
@leados/api:build: ESM dist/worker.js.map                          55.00 KB
@leados/api:build: ESM dist/chunk-LSOXOY4K.js.map                  21.64 KB
@leados/api:build: ESM dist/client-AKUQ2KSU.js.map                 71.00 B
@leados/api:build: ESM dist/dist-NJSBFOQF.js.map                   71.00 B
@leados/api:build: ESM dist/chunk-OMIZAJWG.js.map                  2.38 KB
@leados/api:build: ESM dist/chunk-V3GKTYQB.js.map                  4.19 KB
@leados/api:build: ESM dist/instagram.service-PXV4E5ID.js.map      71.00 B
@leados/api:build: ESM dist/instagram.adapter-FPNEPYNW.js.map      71.00 B
@leados/api:build: ESM dist/chunk-KDT6ZNSS.js.map                  12.63 KB
@leados/api:build: ESM dist/instagram.repository-VQXZXKUY.js.map   71.00 B
@leados/api:build: ESM dist/field-encryption-IZD5GISL.js.map       71.00 B
@leados/api:build: ESM dist/chunk-WYPRM6XR.js.map                  3.92 KB
@leados/api:build: ESM dist/app-error-ZSXIIYZX.js.map              71.00 B
@leados/api:build: ESM dist/chunk-SBNS2OIK.js.map                  1.11 KB
@leados/api:build: ESM dist/chunk-55TNTGXM.js.map                  2.08 KB
@leados/api:build: ESM dist/chunk-EBL467S4.js.map                  10.97 KB
@leados/api:build: ESM dist/chunk-C2NNFJXP.js.map                  60.11 KB
@leados/api:build: ESM dist/chunk-JBBNJLSO.js.map                  3.85 KB
@leados/api:build: ESM dist/chunk-27IXWBTR.js.map                  19.12 KB
@leados/api:build: ESM dist/server.js.map                          450.47 KB
@leados/api:build: ESM ⚡️ Build success in 71ms

 Tasks:    3 successful, 3 total
Cached:    2 cached, 3 total
  Time:    788ms 
```

### pnpm test
```text
@leados/api:test:  Test Files  71 passed (71)
@leados/api:test:       Tests  595 passed | 1 skipped (596)
@leados/api:test:    Start at  10:27:11
@leados/api:test:    Duration  81.74s (transform 972ms, setup 67ms, collect 34.30s, tests 29.59s, environment 12ms, prepare 5.02s)
@leados/web:test:  Test Files  39 passed (39)
@leados/web:test:       Tests  171 passed (171)
@leados/web:test:    Start at  10:22:49
@leados/web:test:    Duration  69.61s (transform 18.84s, setup 68.07s, collect 99.12s, tests 64.05s, environment 118.10s, prepare 36.08s)

 Tasks:    4 successful, 4 total
Cached:    4 cached, 4 total
  Time:    68ms >>> FULL TURBO
```

### pnpm check:enum-parity
```text
enum-parity: OK (21 shared enum(s) checked).
```

### pnpm --filter @leados/api check:rls
```text
RLS coverage check: OK — 27 tenant tables enabled + forced + policied; coverage matches registry.
```

### npx prisma validate
```text
Environment variables loaded from .env
Prisma schema loaded from prisma/schema.prisma
The schema at prisma/schema.prisma is valid 🚀
```

---

## 6. First 50 Lines of prisma/schema.prisma

```prisma
// LeadOS Prisma schema — Sprint 5 M1 (Pipeline & Deals + Webhook Foundation).
// Source of truth: docs/blueprint/09-PRISMA-SCHEMA.md (approved per SPRINT_4_SCHEMA_APPROVAL.md).
// Sprint 5 adds: Pipeline, PipelineStage, Deal, WebhookEvent models + 2 new enums.
// Enums mirror packages/shared/src/constants/enums.ts; check:enum-parity gate enforces parity.

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions", "fullTextSearch", "fullTextIndex"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  directUrl  = env("DATABASE_DIRECT_URL")
  extensions = [uuidOssp(map: "uuid-ossp"), pgcrypto, pgTrgm(map: "pg_trgm")]
}

// Infrastructure-only table (NOT a domain model). Retained from Sprint 1 for the deep
// health check's read/write probe.
model HealthCheck {
  id        String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  checkedAt DateTime @default(now())

  @@map("health_check")
}

// ============================================================================
// ENUMS — must match packages/shared/src/constants/enums.ts (enum-parity gate)
// ============================================================================

enum UserStatus {
  ACTIVE
  SUSPENDED
  DELETED
}

enum OrgStatus {
  ACTIVE
  SUSPENDED
  DELETED
}

enum MemberStatus {
  ACTIVE
  INVITED
  SUSPENDED
}

enum SubscriptionPlan {
  TRIAL
```

---

## 7. Subscription Model and SubscriptionStatus Enum Definitions

### SubscriptionStatus Enum (lines 56–62)
```prisma
enum SubscriptionStatus {
  TRIALING
  ACTIVE
  PAST_DUE
  CANCELLED
  PAUSED
}
```

### Subscription Model (lines 441–464)
```prisma
model Subscription {
  id                     String             @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  organizationId         String             @unique @db.Uuid
  plan                   SubscriptionPlan   @default(TRIAL)
  planId                 BillingPlanId?
  status                 SubscriptionStatus @default(TRIALING)
  trialEndsAt            DateTime?
  seatCount              Int                @default(1)
  stripeCustomerId       String?            @unique
  stripeSubscriptionId   String?            @unique
  stripeCurrentPeriodEnd DateTime?
  cancelAtPeriodEnd      Boolean            @default(false)
  lastStripeEventAt      DateTime?
  lastSyncedAt           DateTime?
  createdAt              DateTime           @default(now())
  updatedAt              DateTime           @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  billingPlan  BillingPlan? @relation(fields: [planId], references: [id])

  @@index([stripeCustomerId])
  @@index([stripeSubscriptionId])
  @@map("subscriptions")
}
```

---

## 8. Contents of prisma/migrations

```text
total 8
drwxr-xr-x@ 25 rajakumar  staff  800 Jun 22 22:50 .
drwxr-xr-x@  5 rajakumar  staff  160 Jun 22 16:25 ..
drwxr-xr-x@  3 rajakumar  staff   96 Jun 18 17:05 0000_init_extensions
drwxr-xr-x@  3 rajakumar  staff   96 Jun 18 23:30 0001_identity
drwxr-xr-x@  3 rajakumar  staff   96 Jun 19 10:19 0002_tenancy_roles
drwxr-xr-x@  4 rajakumar  staff  128 Jun 19 10:19 0003_rls_policies
drwxr-xr-x@  4 rajakumar  staff  128 Jun 19 14:13 0006_audit
drwxr-xr-x@  3 rajakumar  staff   96 Jun 19 19:33 0007_crm_tables
drwxr-xr-x@  3 rajakumar  staff   96 Jun 19 19:33 0008_crm_indexes
drwxr-xr-x@  3 rajakumar  staff   96 Jun 19 19:34 0009_crm_rls
drwxr-xr-x@  3 rajakumar  staff   96 Jun 20 14:58 0010_pipeline_tables
drwxr-xr-x@  3 rajakumar  staff   96 Jun 20 14:58 0011_pipeline_rls
drwxr-xr-x@  3 rajakumar  staff   96 Jun 20 14:59 0012_webhook_events
drwxr-xr-x@  3 rajakumar  staff   96 Jun 20 17:14 0013_pipeline_activity_links
drwxr-xr-x@  3 rajakumar  staff   96 Jun 21 02:45 0014_instagram_accounts
drwxr-xr-x@  3 rajakumar  staff   96 Jun 21 02:45 0015_inbox_tables
drwxr-xr-x@  3 rajakumar  staff   96 Jun 21 02:46 0015b_leads_ig_unique_index
drwxr-xr-x@  3 rajakumar  staff   96 Jun 21 02:46 0016_instagram_fk
drwxr-xr-x@  3 rajakumar  staff   96 Jun 22 00:20 0017_notifications_tables
drwxr-xr-x@  3 rajakumar  staff   96 Jun 22 00:20 0018_activity_conversation_link
drwxr-xr-x@  3 rajakumar  staff   96 Jun 22 09:02 0019_activity_conversation_constraint
drwxr-xr-x@  3 rajakumar  staff   96 Jun 22 14:10 0019_ai_usage_counters
drwxr-xr-x@  3 rajakumar  staff   96 Jun 22 16:13 0020_notification_type_lead_scored
drwxr-xr-x@  3 rajakumar  staff   96 Jun 22 22:50 0021_add_workflows
-rw-r--r--@  1 rajakumar  staff  126 Jun 22 22:50 migration_lock.toml
```

---

## 9. Git Log --Oneline -10 Output

```text
676c1a4 test(notifications): fix NextRequest typing in preferences route tests
c5245b0 test(notifications): increase coverage and stabilize CI
d22785a docs(sprint7): complete M1 verification and M2 architecture review
6523980 feat(inbox): complete Sprint 6 M6 inbox productivity features
24b2481 fix(test): resolve API suite failures from empty-string env var placeholders
3d57fe7 feat(inbox): implement Social Inbox frontend (Sprint 6 M5)
bfcc317 feat(inbox): implement send pipeline and status webhooks (Sprint 6 M4)
f783118 docs(sprint6): add M3 signoff
0c61d1f feat(inbox): implement receive pipeline (Sprint 6 M3)
555b6c9 feat(instagram): implement Sprint 6 M2 — OAuth flow, account management, token lifecycle
```
