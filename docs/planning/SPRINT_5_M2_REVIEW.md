# SPRINT_5_M2_REVIEW.md

> Sprint 5 M2 — Pipeline Module review  
> Scope: Pipeline and PipelineStage backend only  
> Status: **READY FOR RE-REVIEW**  
> Date: 2026-06-20

---

## 1. Implementation Summary

Sprint 5 M2 implements the backend Pipeline module under `/api/v1/pipelines` and remediates the final-signoff blocker for missing activity emission.

Delivered scope:

- Pipeline repository following the tenant repository pattern.
- Pipeline stage repository following the tenant repository pattern.
- Pipeline service with `withTenant` unit-of-work wrapping for all database access.
- Pipeline controller using the existing success envelope conventions.
- Pipeline routes with RBAC permission enforcement and Zod request validation.
- Module registration in the authenticated `/api/v1` route tree.
- `ActivityService.listForDeal()` extension for Sprint 5 deal activity read paths.
- Pipeline/stage activity links on `activities`.
- Pipeline and stage activity emission for all M2 mutations.
- Audit rows written inside the same `withTenant` transaction as activity rows for pipeline/stage mutations.
- Integration tests proving activity rows are written.

No Sprint 5 M3 deal endpoints or frontend work were implemented.

---

## 2. Files Changed

Application files:

- `apps/api/src/app.ts`
- `apps/api/src/core/activities/activity.service.ts`
- `apps/api/src/modules/pipelines/index.ts`
- `apps/api/src/modules/pipelines/pipeline.controller.ts`
- `apps/api/src/modules/pipelines/pipeline.repository.ts`
- `apps/api/src/modules/pipelines/pipeline.routes.ts`
- `apps/api/src/modules/pipelines/pipeline.service.ts`

Shared/schema files:

- `packages/shared/src/constants/enums.ts`
- `packages/shared/src/types/activity-metadata.ts`
- `prisma/schema.prisma`
- `prisma/migrations/0013_pipeline_activity_links/migration.sql`

Test files:

- `apps/api/tests/integration/pipelines.integration.test.ts`

Planning artifact:

- `docs/planning/SPRINT_5_M2_REVIEW.md`

---

## 3. Activity Emission Remediation

Resolved blocker:

- `PIPELINE_CREATED` emitted on pipeline creation.
- `PIPELINE_UPDATED` emitted on pipeline update.
- `PIPELINE_DELETED` emitted on pipeline deletion.
- `PIPELINE_STAGE_CREATED` emitted on stage creation, including initial stages created with a pipeline.
- `PIPELINE_STAGE_UPDATED` emitted on stage update.
- `PIPELINE_STAGE_DELETED` emitted on stage deletion.
- `PIPELINE_STAGE_REORDERED` emitted on stage reorder.

Schema support added:

- `activities.relatedPipelineId`
- `activities.relatedPipelineStageId`
- `activities_entity_required` now accepts lead, contact, deal, pipeline, or pipeline-stage references.
- Pipeline/stage activity links are scalar UUIDs, not foreign keys, so delete events preserve the deleted entity ID.

Audit behavior:

- Pipeline/stage mutation audit rows are now written inside the same `withTenant` transaction as the mutation and activity row.
- Existing audit row shape is preserved through `buildAuditRow(...)` and tenant-injected `auditLog.create(...)`.

---

## 4. Tests Added

`pipelines.integration.test.ts` covers:

- Pipeline creation.
- Pipeline creation with initial stages.
- First pipeline auto-default behavior.
- Trial plan pipeline limit enforcement.
- 401 unauthenticated access.
- 403 RBAC denial for missing pipeline permissions.
- Request validation failures.
- Pipeline list and get-by-id.
- Cross-tenant read and write isolation.
- Pipeline update and default swap uniqueness.
- Pipeline deletion success.
- Pipeline deletion conflict when deals exist.
- Default pipeline deletion conflict.
- Stage creation.
- Duplicate won-stage rejection.
- Duplicate lost-stage rejection.
- Rejection of a stage marked both won and lost.
- Stage update.
- Rejection of stage update marked both won and lost.
- Stage reorder exact-set validation.
- Stage deletion success.
- Stage deletion conflict for only stage.
- Stage deletion conflict when deals exist.
- Pipeline create/update audit log assertions.
- Activity row assertions for pipeline create, update, delete.
- Activity row assertions for stage create, update, reorder, delete.

---

## 5. Acceptance Criteria Status

| Criterion | Status | Evidence |
|---|---:|---|
| Pipeline CRUD endpoints implemented | PASS | Routes mounted under `/api/v1/pipelines` |
| Pipeline stage CRUD/reorder implemented | PASS | Stage create/update/delete/reorder routes and tests |
| `TenantRepository` pattern followed | PASS | Pipeline repositories extend `TenantRepository` |
| All DB access uses `withTenant` | PASS | Service methods wrap repository work in `withTenant` |
| RBAC enforced | PASS | All routes use `requirePermission(...)`; 403 tests included |
| API envelope preserved | PASS | Controller uses `sendSuccess`; errors flow through `AppError` |
| Plan limit enforced | PASS | TRIAL pipeline limit returns `PLAN_LIMIT_EXCEEDED` |
| Default pipeline uniqueness | PASS | Service unsets previous default in same tenant transaction |
| Won/lost stage uniqueness | PASS | Duplicate won/lost stage tests pass |
| Stage cannot be both won and lost | PASS | Repository validation + integration tests |
| Reorder validates exact stage set | PASS | Missing stage ID returns validation error |
| Delete pipeline with deals rejected | PASS | 409 conflict test |
| Tenant isolation preserved | PASS | Cross-org read/write tests + RLS coverage gate |
| Activity emission followed | PASS | Activity rows emitted and tested for pipeline/stage mutations |
| Audit conventions followed | PASS | Audit rows use `buildAuditRow(...)` and are written in the same tenant transaction |
| `ActivityService.listForDeal()` added | PASS | Method added for deal activity reads |
| No M3 deal module implemented | PASS | Only seed helpers create deal rows for conflict tests |

---

## 6. Validation Results

Environment:

- Node: `v20.20.2`
- pnpm: `9.15.9`

Commands run:

| Command | Result |
|---|---:|
| `pnpm --filter @leados/api exec prisma generate --schema=../../prisma/schema.prisma` | PASS |
| `pnpm check:enum-parity` | PASS |
| `pnpm --filter @leados/api db:migrate` | PASS - applied `0013_pipeline_activity_links` |
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `pnpm build` | PASS |
| `JWT_ACCESS_SECRET=... JWT_REFRESH_PEPPER=... pnpm --filter @leados/api exec vitest run tests/integration/pipelines.integration.test.ts` | PASS - 30 tests |
| `JWT_ACCESS_SECRET=... JWT_REFRESH_PEPPER=... pnpm --filter @leados/api exec vitest run --maxWorkers=1` | PASS - 52 files, 429 passed, 1 skipped |
| `pnpm --filter @leados/shared test` | PASS - 7 files, 76 passed |
| `pnpm --filter @leados/web test` | PASS - 6 files, 20 passed |
| `pnpm --filter @leados/api check:rls` | PASS - 19 tenant tables enabled, forced, and policied |

Validation notes:

- API tests were run serialized because this repository has existing parallel DB fixture/cache interference outside the M2 scope.
- Supertest and `tsx` commands requiring local listener/IPC access were run outside the sandbox when necessary.

---

## 7. Risks Discovered

| Risk | Severity | Mitigation |
|---|---:|---|
| Pipeline/stage activity links are scalar UUIDs rather than FK relations | P2 | Intentional so delete events preserve deleted entity IDs; metadata also stores the entity IDs and names |
| Root `pnpm test` local execution remains sensitive to Turbo env filtering and parallel DB fixtures | P2 | Future test-infra cleanup outside M2 scope: pass JWT env vars through Turbo and isolate DB fixtures/cache for fully parallel API runs |
| Pipeline hard-delete is constrained by current Prisma model lacking `deletedAt` | P2 | Current repository guards avoid DB errors; soft-delete would require schema/architecture change and is not part of this remediation |

---

## 8. Re-Review Readiness

Sprint 5 M2 is ready for re-review.

The previous final-signoff blocker for missing activity emission has been addressed:

- Pipeline create/update/delete emit activity rows.
- Stage create/update/reorder/delete emit activity rows.
- Activity and audit writes occur in the same `withTenant` transaction as the mutation.
- RLS coverage remains green at 19 tenant tables.

Do not begin M3 until M2 is explicitly re-approved.
