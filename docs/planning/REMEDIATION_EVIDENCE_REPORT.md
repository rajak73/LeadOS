# LeadOS Remediation Evidence Report

Generated: 2026-06-23T10:10:00+05:30  
Author: LeadOS Chief Architect / Principal QA Lead

---

## 1. Diagnostics Run & Exact Output

We have executed the required diagnostics on the active workspace. Below is the captured raw console output for each diagnostic tool.

### A. Git Status Output
```bash
$ git status
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
	docs/planning/SESSION_LOG.md
	docs/planning/agent_verification/
	packages/shared/src/schemas/bulk.ts
	packages/shared/src/types/ai.ts
	packages/shared/src/types/workflow.ts
	prisma/migrations/0019_ai_usage_counters/
	prisma/migrations/0020_notification_type_lead_scored/
	prisma/migrations/0021_add_workflows/
```

### B. Prisma Schema Validation Output
```bash
$ npx prisma validate --schema=prisma/schema.prisma
Environment variables loaded from .env
Prisma schema loaded from prisma/schema.prisma

Error: Prisma schema validation - (validate wasm)
Error code: P1012
error: The enum "SubscriptionStatus" cannot be defined because an enum with that name already exists.
  -->  prisma/schema.prisma:1138
   | 
1137 | 
1138 | enum SubscriptionStatus {
   | 
error: The model "Subscription" cannot be defined because a model with that name already exists.
  -->  prisma/schema.prisma:1163
   | 
1162 | 
1163 | model Subscription {
   | 

Validation Error Count: 2
[Context: validate]
```

### C. Typecheck Output
```bash
$ pnpm typecheck
@leados/api:typecheck: src/modules/billing/billing.service.ts(9,24): error TS2307: Cannot find module '../../core/logger/logger.js' or its corresponding type declarations.
@leados/api:typecheck: src/modules/billing/billing.service.ts(14,28): error TS2322: Type '"2024-12-18.acacia"' is not assignable to type '"2025-02-24.acacia"'.
@leados/api:typecheck: src/modules/billing/billing.service.ts(20,31): error TS2339: Property 'internal' does not exist on type 'typeof AppError'.
@leados/api:typecheck: src/modules/billing/billing.service.ts(52,9): error TS2561: Object literal may only specify known properties, but 'planId' does not exist in type 'Without<SubscriptionCreateInput, SubscriptionUncheckedCreateInput> & SubscriptionUncheckedCreateInput'. Did you mean to write 'plan'?
@leados/api:typecheck: src/modules/billing/billing.service.ts(72,34): error TS2339: Property 'badRequest' does not exist on type 'typeof AppError'.
@leados/api:typecheck: src/modules/billing/billing.service.ts(83,38): error TS2339: Property 'internal' does not exist on type 'typeof AppError'.
@leados/api:typecheck: src/modules/billing/billing.service.ts(97,22): error TS2339: Property 'badRequest' does not exist on type 'typeof AppError'.
@leados/api:typecheck: src/modules/billing/billing.service.ts(111,18): error TS2353: Object literal may only specify known properties, and 'plan' does not exist in type 'SubscriptionInclude<DefaultArgs>'.
@leados/api:typecheck: src/modules/billing/billing.service.ts(121,40): error TS2339: Property 'internal' does not exist on type 'typeof AppError'.
@leados/api:typecheck: src/modules/billing/billing.service.ts(132,36): error TS2551: Property 'stripeWebhookEvent' does not exist on type 'PrismaClient<PrismaClientOptions, never, DefaultArgs>'. Did you mean 'webhookEvent'?
@leados/api:typecheck: src/modules/billing/billing.service.ts(139,19): error TS2551: Property 'stripeWebhookEvent' does not exist on type 'PrismaClient<PrismaClientOptions, never, DefaultArgs>'. Did you mean 'webhookEvent'?
@leados/api:typecheck: src/modules/billing/billing.service.ts(188,9): error TS2561: Object literal may only specify known properties, but 'planId' does not exist in type 'Without<SubscriptionCreateInput, SubscriptionUncheckedCreateInput> & SubscriptionUncheckedCreateInput'. Did you mean to write 'plan'?
@leados/api:typecheck: src/modules/billing/billing.service.ts(195,9): error TS2561: Object literal may only specify known properties, but 'planId' does not exist in type '(Without<SubscriptionUpdateInput, SubscriptionUncheckedUpdateInput> & SubscriptionUncheckedUpdateInput) | (Without<...> & SubscriptionUpdateInput)'. Did you mean to write 'plan'?
@leados/api:typecheck: src/modules/billing/billing.service.ts(227,9): error TS2322: Type '"ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELED" | "UNPAID"' is not assignable to type 'SubscriptionStatus | EnumSubscriptionStatusFieldUpdateOperationsInput'.
@leados/api:typecheck:   Type '"CANCELED"' is not assignable to type 'SubscriptionStatus | EnumSubscriptionStatusFieldUpdateOperationsInput'. Did you mean '"CANCELLED"'?
```

### D. Enum Parity Output
```bash
$ pnpm check:enum-parity
enum-parity MISMATCH for SubscriptionStatus:
  prisma: ["ACTIVE","CANCELED","PAST_DUE","TRIALING","UNPAID"]
  shared: ["ACTIVE","CANCELLED","PAST_DUE","PAUSED","TRIALING"]
enum-parity: FAILED
```

### E. RLS Check Output
```bash
$ pnpm --filter @leados/api check:rls
RLS coverage check FAILED:
  - registry table "workflows" has no organizationId column → stale registry entry
  - registry table "workflow_runs" has no organizationId column → stale registry entry
  - table "workflows" not found in the database
  - table "workflow_runs" not found in the database
```

### F. Prisma Migrate Status Output
```bash
$ npx prisma migrate status --schema=prisma/schema.prisma
22 migrations found in prisma/migrations
Following migration have not yet been applied:
0021_add_workflows
```

---

## 2. Issues Details & Evidence

Below is the structured evidence for every compile or schema issue detected during this verification pass.

### Issue 1: Duplicate `SubscriptionStatus` Enum definition
- **File Path:** `prisma/schema.prisma`
- **Line Numbers:** lines 1138–1144 (duplicate) vs lines 56–62 (original).
- **Error Output:**
  ```text
  error: The enum "SubscriptionStatus" cannot be defined because an enum with that name already exists.
    -->  prisma/schema.prisma:1138
  ```

### Issue 2: Duplicate `Subscription` Model definition
- **File Path:** `prisma/schema.prisma`
- **Line Numbers:** lines 1163–1182 (duplicate) vs lines 441–459 (original).
- **Error Output:**
  ```text
  error: The model "Subscription" cannot be defined because a model with that name already exists.
    -->  prisma/schema.prisma:1163
  ```

### Issue 3: Missing Module in `billing.service.ts`
- **File Path:** `apps/api/src/modules/billing/billing.service.ts`
- **Line Number:** line 9
- **Error Output:**
  ```text
  src/modules/billing/billing.service.ts(9,24): error TS2307: Cannot find module '../../core/logger/logger.js' or its corresponding type declarations.
  ```

### Issue 4: Stripe Version Mismatch in `billing.service.ts`
- **File Path:** `apps/api/src/modules/billing/billing.service.ts`
- **Line Number:** line 14
- **Error Output:**
  ```text
  src/modules/billing/billing.service.ts(14,28): error TS2322: Type '"2024-12-18.acacia"' is not assignable to type '"2025-02-24.acacia"'.
  ```

### Issue 5: Non-existent static methods on `AppError`
- **File Path:** `apps/api/src/modules/billing/billing.service.ts`
- **Line Numbers:** lines 20, 72, 83, 97, 121
- **Error Outputs:**
  - `src/modules/billing/billing.service.ts(20,31): error TS2339: Property 'internal' does not exist on type 'typeof AppError'.`
  - `src/modules/billing/billing.service.ts(72,34): error TS2339: Property 'badRequest' does not exist on type 'typeof AppError'.`
  - `src/modules/billing/billing.service.ts(83,38): error TS2339: Property 'internal' does not exist on type 'typeof AppError'.`
  - `src/modules/billing/billing.service.ts(97,22): error TS2339: Property 'badRequest' does not exist on type 'typeof AppError'.`
  - `src/modules/billing/billing.service.ts(121,40): error TS2339: Property 'internal' does not exist on type 'typeof AppError'.`

### Issue 6: Unmapped Prisma Schema Properties (`planId` / `stripeWebhookEvent`)
- **File Path:** `apps/api/src/modules/billing/billing.service.ts`
- **Line Numbers:** lines 52, 111, 132, 139, 188, 195, 227
- **Error Outputs:**
  - `src/modules/billing/billing.service.ts(52,9): error TS2561: Object literal may only specify known properties, but 'planId' does not exist in type 'Without<SubscriptionCreateInput, ...>'.`
  - `src/modules/billing/billing.service.ts(111,18): error TS2353: Object literal may only specify known properties, and 'plan' does not exist in type 'SubscriptionInclude<DefaultArgs>'.`
  - `src/modules/billing/billing.service.ts(132,36): error TS2551: Property 'stripeWebhookEvent' does not exist on type 'PrismaClient<PrismaClientOptions, never, DefaultArgs>'. Did you mean 'webhookEvent'?`
  - `src/modules/billing/billing.service.ts(227,9): error TS2322: Type '"ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELED" | "UNPAID"' is not assignable to type 'SubscriptionStatus'.`

---

## 3. Findings Categorization

### A. Issues Confirmed with Evidence
- **Duplicate Subscription Model & SubscriptionStatus Enum:** Confirmed by `npx prisma validate` CLI error output `P1012`.
- **Compile Errors in `billing.service.ts`:** Confirmed by `pnpm typecheck` outputting 14 TypeScript errors.
- **Unapplied Migration `0021_add_workflows`:** Confirmed by `npx prisma migrate status` reporting it has not been applied.
- **RLS Failures for Workflows:** Confirmed by RLS script outputting "table workflows not found in the database".
- **Enum Parity Mismatch on SubscriptionStatus:** Confirmed by enum-parity script outputting mismatch between shared and prisma enums.

### B. Issues Disproven
- **None.** All reported issues and stubs are confirmed exactly as described.

### C. Required Fix Order
1. **Consolidate database schema:** Clean up duplicate models/enums in `prisma/schema.prisma` and resolve fields into a unified schema.
2. **Apply workflow migration:** Deploy migration `0021_add_workflows` to configure Postgres tables and enable RLS.
3. **Regenerate Prisma Client:** Rebuild type definitions for modules and libraries to consume.
4. **Remediate `billing.service.ts`:** Correct import paths, resolve Stripe SDK constructor mismatch, replace `AppError` helpers, and update fields to match consolidated prisma types.
5. **Run Verification Suite:** Ensure RLS checks, enum-parity validation, typechecks, and tests are completely green.

### D. Estimated Effort
- **Consolidation and Client Generation:** 2 Hours
- **Billing Service Remediation:** 3 Hours
- **Migration & Testing Verification:** 1 Hour

**Total Remediation Effort:** **6 Hours**
