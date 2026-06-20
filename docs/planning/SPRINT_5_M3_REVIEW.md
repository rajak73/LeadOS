# Sprint 5 M3 Review — Deal Module

Date: 2026-06-20  
Scope: Sprint 5 M3 only — Deal Module backend implementation.

## Verdict

Sprint 5 M3 implementation is complete and ready for review.

No M4 webhook work was implemented. No frontend work was implemented. No schema redesign was introduced beyond the shared activity metadata type required by the M3 activity contract.

## Files Changed

Created:

- `apps/api/src/modules/deals/deal.repository.ts`
- `apps/api/src/modules/deals/deal.service.ts`
- `apps/api/src/modules/deals/deal.controller.ts`
- `apps/api/src/modules/deals/deal.routes.ts`
- `apps/api/src/modules/deals/index.ts`
- `apps/api/tests/integration/deals.integration.test.ts`

Modified:

- `apps/api/src/app.ts`
  - Registered `buildDealsModule(rbac.requirePermission)` under `/api/v1/deals`.
- `packages/shared/src/types/activity-metadata.ts`
  - Extended `DealCreatedMetadata` with `pipelineId`, `stageId`, and optional `value` to match the Sprint 5 execution-plan activity payload.

## Delivered Functionality

- Deal CRUD API:
  - `POST /api/v1/deals`
  - `GET /api/v1/deals`
  - `GET /api/v1/deals/:id`
  - `PATCH /api/v1/deals/:id`
  - `DELETE /api/v1/deals/:id`
- Deal lifecycle API:
  - `POST /api/v1/deals/:id/move`
  - `POST /api/v1/deals/:id/won`
  - `POST /api/v1/deals/:id/lost`
- Forecast API:
  - `GET /api/v1/deals/forecast`
- Tenant-scoped `PrismaDealRepository extends TenantRepository`.
- All DB access through `withTenant`.
- ownOnly behavior for list/get/update/move/won/lost.
- Full-read-only forecast guard; `deals.read_own` is insufficient for forecast.
- Plan-limit enforcement for deal creation.
- Cross-org lead/contact/pipeline/stage reference protection.
- Deal lifecycle finality:
  - WON/LOST deals cannot move.
  - WON/LOST deals cannot be re-won/re-lost.
- Soft delete for deals.
- Weighted forecast by stage using explicit tenant predicate in raw SQL.
- Activity emission inside the same `withTenant` transaction.
- Audit recording inside the same `withTenant` transaction.

## Activity Emission

Implemented inside the same transaction as each mutation:

- `DEAL_CREATED`
- `DEAL_UPDATED`
- `DEAL_STAGE_MOVED`
- `DEAL_WON`
- `DEAL_LOST`

No `DEAL_DELETED` activity was added because Sprint 5 M3 does not define that activity type. Deal deletion writes audit only.

## Audit Recording

Implemented inside the same transaction as each mutation using:

- `buildAuditRow(input, ctx)`
- `db.auditLog.create(...)`
- `asTenantCreate(...)`

Covered actions:

- `created`
- `updated`
- `moved`
- `won`
- `lost`
- `deleted`

Audit snapshots serialize Prisma `Decimal` values to strings to avoid JSON serialization failures.

## Tests Added

Added `apps/api/tests/integration/deals.integration.test.ts`.

Coverage: 27 integration tests.

The suite covers:

- 401 unauthenticated access.
- 403 RBAC failure for delete and assignment.
- Deal create/list/get/update/delete.
- Soft-delete hiding.
- Plan-limit enforcement.
- ownOnly list/get/update/move behavior.
- Tenant isolation.
- Cross-org lead/contact reference rejection.
- Stage-to-pipeline validation.
- Cross-pipeline move rejection.
- Won/lost lifecycle finality.
- Activity rows for create/update/move/won/lost.
- Audit rows for create/update/move/delete.
- Weighted forecast correctness.
- Forecast full-read guard.
- Forecast tenant isolation.

## Validation Results

- `pnpm typecheck` — PASS
- `pnpm lint` — PASS
- `pnpm build` — PASS
- Focused M3 test:
  - `pnpm --filter @leados/api exec vitest run tests/integration/deals.integration.test.ts` — PASS
  - 27 tests passed
- Full test suite:
  - `pnpm test` — PASS
  - API: 53 files passed, 456 tests passed, 1 skipped
  - Shared: 7 files passed, 76 tests passed
  - Web: 6 files passed, 20 tests passed
- `pnpm --filter @leados/api check:rls` — PASS
  - `RLS coverage check: OK — 19 tenant tables enabled + forced + policied; coverage matches registry.`
- `git diff --check` — PASS

## Acceptance Criteria Status

- ≥ 20 integration tests — PASS, 27 added.
- CRUD coverage — PASS.
- Stage move coverage — PASS.
- Won/lost finality — PASS.
- Cross-pipeline move rejection — PASS.
- ownOnly behavior — PASS.
- Plan limit — PASS.
- RBAC matrix — PASS.
- Tenancy — PASS.
- 401/403/404/409 coverage — PASS.
- Weighted forecast correctness — PASS.
- Won deal cannot be moved — PASS.
- SALES_EXECUTIVE cannot see another user’s deal through `deals.read_own` — PASS.
- Activity emitted for deal mutations — PASS, verified through persisted activity rows.
- Isolation suite/RLS coverage unchanged — PASS.

## Risks Discovered

- Raw SQL forecast queries bypass the Prisma tenant extension. Mitigation implemented: forecast SQL explicitly filters by `current_setting('app.current_organization_id', true)::uuid`.
- Forecast endpoint initially inherited `_own` fallback through `requirePermission('deals.read')`. Mitigation implemented: service-level `ctx.ownOnly` guard returns 403 for `deals.read_own`.
- Audit snapshots cannot safely persist full Prisma `Decimal` objects. Mitigation implemented: deal audit snapshots serialize money/date fields into JSON-safe primitives.

## Out Of Scope Confirmed

- No M4 webhook receiver, worker, queue, or route work.
- No frontend implementation.
- No Kanban UI.
- No Deal Detail UI.
- No new Prisma migration.
- No schema redesign.

## Review Recommendation

Recommend independent Sprint 5 M3 review against the source code before M4 begins.
