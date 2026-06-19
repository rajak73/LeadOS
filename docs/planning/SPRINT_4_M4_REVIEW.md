# Sprint 4 M4 Review — Activity Feed & Task Module

**Date:** 2026-06-20
**Milestone:** CRM-4.1 (Activity feed) + CRM-4.2/4.3/4.4 (Task CRUD + status machine)

---

## Deliverables

| # | File | Status |
|---|------|--------|
| 1 | `packages/shared/src/schemas/task.ts` | ✅ Created |
| 2 | `packages/shared/src/schemas/task.test.ts` | ✅ Created (12 tests) |
| 3 | `packages/shared/src/index.ts` | ✅ Added `export * from './schemas/task.js'` |
| 4 | `packages/shared/src/constants/permissions.ts` | ✅ Added `tasks.delete` to `PERMISSION_CATALOG` |
| 5 | `apps/api/src/core/activities/activity.service.ts` | ✅ Added `listForLead()`, `listForContact()`, `ActivityPage` interface |
| 6 | `apps/api/src/modules/tasks/task.repository.ts` | ✅ Created |
| 7 | `apps/api/src/modules/tasks/task.service.ts` | ✅ Created |
| 8 | `apps/api/src/modules/tasks/task.controller.ts` | ✅ Created |
| 9 | `apps/api/src/modules/tasks/task.routes.ts` | ✅ Created |
| 10 | `apps/api/src/modules/tasks/index.ts` | ✅ Created |
| 11 | `apps/api/src/modules/leads/lead.service.ts` | ✅ Added `listActivities()` |
| 12 | `apps/api/src/modules/leads/lead.controller.ts` | ✅ Added `listActivities` handler |
| 13 | `apps/api/src/modules/leads/lead.routes.ts` | ✅ Added `GET /:id/activities` |
| 14 | `apps/api/src/modules/contacts/contact.service.ts` | ✅ Added `listActivities()` |
| 15 | `apps/api/src/modules/contacts/contact.controller.ts` | ✅ Added `listActivities` handler |
| 16 | `apps/api/src/modules/contacts/contact.routes.ts` | ✅ Added `GET /:id/activities` |
| 17 | `apps/api/src/app.ts` | ✅ Mounted `buildTasksModule` at `/api/v1/tasks` |
| 18 | `apps/api/tests/integration/tasks.integration.test.ts` | ✅ Created (13 tests) |

---

## Architecture Decisions

### 1. `ActivityPage` interface in `activity.service.ts`
`listForLead()` and `listForContact()` return `{ items: Activity[]; total: number }` typed as `ActivityPage`. This interface lives in `activity.service.ts` alongside the methods that produce it. Controllers import it via the service export rather than from a shared types file — activity listing is a service-layer concern, not a domain type.

### 2. Sequential count + findMany within an interactive transaction
Prisma's interactive transaction runs on a single PostgreSQL connection. Two parallel `Promise.all` queries would serialize anyway on that connection. Explicit sequential queries (`await count()` then `await findMany()`) are clearer and avoid any race confusion.

### 3. `tasks.delete` added to `PERMISSION_CATALOG`
The original catalog omitted `tasks.delete`. The DELETE route requires it. Added to PERMISSION_CATALOG and implicitly picked up by `ADMIN_PERMISSIONS` (which includes all non-billing permissions). OWNER gets all. MANAGER and SALES_EXECUTIVE do not have `tasks.delete` — intentional, matching the permission model in doc 11.

### 4. Activity emission guard — skip when no entity FK
The `activities` table has a DB-level CHECK constraint requiring at least one of (`relatedLeadId`, `relatedContactId`, `relatedDealId`) to be non-null. Tasks can be created without a related entity (orphaned tasks, e.g. a reminder not linked to a CRM record). Rather than reject those creates, the service skips TASK_CREATED emission. A `logger.warn` is NOT added — this is expected behavior, not an anomaly.

### 5. `as AppendInput` cast for conditional spread calls
`exactOptionalPropertyTypes: true` causes TypeScript to infer `string | undefined` from conditional spread `...(x !== null ? { key: x } : {})` even when the value is narrowed. The cast `as Omit<ActivityAppendInput, 'organizationId'>` is safe:
- The guard `hasEntityFk` ensures at least one FK is non-null before the append call
- The conditional spread guarantees only defined (non-null) keys are included
- No data loss, no runtime risk — TypeScript's inference limitation only

### 6. `as TaskUpdateData` cast for `repo.update()`
Same root cause: `PatchTaskInput` optional fields carry `string | undefined` in the inferred type, which conflicts with `TaskUpdateData`'s `string` (no explicit undefined). The cast is safe because Zod validation at the HTTP boundary guarantees value correctness.

### 7. Status machine in service layer
The approved state machine (PENDING → IN_PROGRESS/CANCELLED, IN_PROGRESS → COMPLETED/CANCELLED, COMPLETED/CANCELLED terminal) is enforced in `TaskService.update()` before calling the repository. The schema (`patchTaskSchema`) accepts any valid `TaskStatus` — the service returns a 422 with `INVALID_STATUS_TRANSITION` code when the transition is rejected. This is the same pattern as the lead status machine.

### 8. `ownOnly` for tasks
- `tasks.read`: no `_own` variant. SALES_EXECUTIVE has `tasks.read` → `ctx.ownOnly = false` → no `assignedToId` filter on reads.
- `tasks.update`: SALES_EXECUTIVE has `tasks.update_own` → `ctx.ownOnly = true` → `findByIdOrThrow(id, ctx.userId)` adds `assignedToId` filter → returns 404 for tasks not assigned to them.
- `tasks.delete`: OWNER/ADMIN/MANAGER only. SALES_EXECUTIVE does not have this permission.

### 9. `completedAt` server-set only
`patchTaskSchema` intentionally excludes `completedAt`. The server sets it to `now()` when status transitions to `COMPLETED`, and clears it (sets to `null`) when transitioning to any other status. This prevents client clock skew and ensures the timestamp is authoritative.

---

## TypeScript Issues Encountered and Fixed

### Issue 1 — `exactOptionalPropertyTypes` + conditional spread → `string | undefined`
TypeScript infers `relatedLeadId?: string | undefined` from conditional spreads in object literals, which fails against `ActivityAppendInput.relatedLeadId?: string`. Fixed with `as AppendInput` cast on the full append input object.

### Issue 2 — `exactOptionalPropertyTypes` + PatchTaskInput spread → `title?: string | undefined`
`PatchTaskInput`'s inferred type has `title?: string | undefined` (Zod's `optional()` infers this), conflicting with `TaskUpdateData.title?: string`. Fixed with `as TaskUpdateData` cast on the `repo.update()` argument.

### Issue 3 — shared package exports not visible until `pnpm build`
The API typecheck imports `CreateTaskInput` etc. from compiled `@leados/shared` dist files, not source. Required `pnpm --filter @leados/shared build` after adding `task.ts` to regenerate declarations.

---

## Validation Results

| Gate | Result |
|------|--------|
| `@leados/shared` typecheck | ✅ PASS (0 errors) |
| `@leados/shared` lint | ✅ PASS |
| `@leados/shared` test (50 tests) | ✅ PASS |
| `@leados/shared` coverage — Statements | ✅ 100% |
| `@leados/shared` coverage — Functions | ✅ 100% |
| `@leados/api` typecheck | ✅ PASS (0 errors) |
| `@leados/api` lint | ✅ PASS |
| `@leados/api` unit tests (346 + 1 skipped) | ✅ PASS |
| `@leados/api` coverage — Statements | ✅ 86.46% |
| `@leados/api` coverage — Functions | ✅ 86.69% |
| Integration tests — tasks (13) | ✅ 13/13 PASS |
| Integration tests — all (187 total) | ✅ 186 passed / 1 skipped |

**Readiness: PASS**
