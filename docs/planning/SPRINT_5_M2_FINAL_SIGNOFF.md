# SPRINT_5_M2_FINAL_SIGNOFF.md

> Sprint 5 M2 independent final signoff  
> Scope reviewed: Pipeline Module backend implementation  
> Result: **NOT APPROVED**  
> Date: 2026-06-20

---

## 1. Review Inputs

Source files reviewed directly:

- `docs/planning/SPRINT_5_M2_REVIEW.md`
- `apps/api/src/modules/pipelines/pipeline.repository.ts`
- `apps/api/src/modules/pipelines/pipeline.service.ts`
- `apps/api/src/modules/pipelines/pipeline.controller.ts`
- `apps/api/src/modules/pipelines/pipeline.routes.ts`
- `apps/api/src/modules/pipelines/index.ts`
- `apps/api/src/core/activities/activity.service.ts`
- `apps/api/tests/integration/pipelines.integration.test.ts`
- `apps/api/src/app.ts`

This signoff is based on the actual source code, not on the prior M2 review document.

---

## 2. Validation Commands

Commands run:

| Command | Result |
|---|---:|
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `pnpm build` | PASS |
| `JWT_ACCESS_SECRET=... JWT_REFRESH_PEPPER=... pnpm --filter @leados/api exec vitest run tests/integration/pipelines.integration.test.ts` | PASS - 30 tests |
| `pnpm --filter @leados/api check:rls` | PASS - 19 tenant tables enabled, forced, and policied |

Notes:

- Pipeline integration tests required unsandboxed execution so Supertest could bind local ephemeral ports.
- The focused pipeline suite executes successfully against real Postgres in this environment.

---

## 3. Verification Checklist

| # | Check | Status | Source Evidence |
|---:|---|---:|---|
| 1 | Repository correctness | PASS | `PrismaPipelineRepository` and `PrismaPipelineStageRepository` implement create/read/update/delete, stage append, reorder validation, default/delete guards, and deal-reference guards. |
| 2 | Service correctness | PASS WITH EXCEPTION | Service methods wrap tenant work correctly and enforce plan/default/stage rules, but activity emission is missing. |
| 3 | Controller correctness | PASS | Controller is thin, delegates to service, and uses `sendSuccess` envelope consistently. |
| 4 | Route correctness | PASS | Routes use validation schemas, correct permissions, and safe `/stages/reorder` ordering before `/:stageId`. |
| 5 | TenantRepository usage | PASS | Pipeline repositories extend `TenantRepository`; tenant create helpers are used for tenant-scoped inserts. |
| 6 | `withTenant` usage | PASS | Every service DB operation is inside `withTenant(ctx.organizationId, ...)`. |
| 7 | RLS preservation | PASS | `check:rls` reports 19 tenant tables enabled, forced, and policied. |
| 8 | Tenant isolation | PASS | Cross-org read and update tests return 404; repositories rely on tenant-scoped client. |
| 9 | RBAC enforcement | PASS | All pipeline routes call `requirePermission(...)`; tests cover 401 and 403 paths. |
| 10 | Plan-limit enforcement | PASS | `PipelineService.create()` reads subscription plan and enforces `PLAN_LIMITS[plan].pipelines`; TRIAL limit test passes. |
| 11 | Activity emission behavior | **FAIL** | `PipelineService` explicitly does not emit activity rows; no `ActivityService.append()` call exists in `modules/pipelines`. |
| 12 | Audit recording behavior | PASS | Pipeline and stage mutations call `audit.record(...)`; integration tests assert pipeline create/update audit rows. |
| 13 | Integration test coverage | PASS | 30 pipeline integration tests cover CRUD, limits, validation, RBAC, tenancy, reorder, conflicts, and audit. |
| 14 | No M3 functionality implemented | PASS | No `modules/deals` implementation, deal service, deal controller, deal routes, or `/deals` API found. Deal rows appear only as conflict-test fixtures. |
| 15 | No frontend work implemented | PASS | No pipeline/deal/kanban matches found under `apps/web`; frontend files remain outside M2 scope. |

---

## 4. Blocking Finding

### BLOCKER-M2-1: Pipeline Activity Emission Is Missing

Severity: **P0 for final M2 approval**

The Sprint 5 M2 implementation does not emit pipeline activity rows for pipeline create/update.

Source evidence:

- `pipeline.service.ts` lines 6-11 state that pipeline CRUD does not emit Activity rows.
- `pipeline.service.ts` lines 37-74 create the pipeline and stages inside `withTenant`, but do not call `ActivityService.append()`.
- `pipeline.service.ts` lines 111-121 update the pipeline inside `withTenant`, but do not call `ActivityService.append()`.
- `rg "ActivityService|activityService|append\\(" apps/api/src/modules/pipelines apps/api/tests/integration/pipelines.integration.test.ts` returned no matches.

Why this blocks approval:

- The requested review explicitly includes "Activity emission behavior".
- The Sprint 5 M2 design expects pipeline create/update activity behavior.
- The current implementation substitutes audit-only behavior. That may be a reasonable architectural constraint because the current `activities` table requires a lead/contact/deal relation and has no pipeline relation, but it is still not the specified M2 activity behavior.

Required resolution before approval:

- Either implement source-of-truth-compliant activity emission for pipeline create/update, or formally update the Sprint 5 M2 source of truth to state that pipeline admin actions are audit-only until the activity schema supports pipeline-linked activities.

---

## 5. Non-Blocking Observations

### OBS-M2-1: Repository `create()` Does Not Own Initial Stage Creation

The execution plan described repository-level pipeline creation with optional initial stages in a single transaction. The current implementation creates the pipeline in `PrismaPipelineRepository.create()` and then creates initial stages from the service using `PrismaPipelineStageRepository.create()` in the same `withTenant` transaction.

This preserves atomic behavior and tenant safety, so it is not a blocker.

### OBS-M2-2: Pipeline Delete Is Hard Delete

The repository hard-deletes pipelines after pre-flight guards. This aligns with the current Prisma model, which has no `deletedAt` field for `Pipeline`. It is not a blocker unless the blueprint is changed to require soft deletion for pipelines.

---

## 6. Final Verdict

**Sprint 5 M2 is NOT APPROVED for final signoff.**

Reason:

- 14 of 15 requested verification categories pass.
- Activity emission behavior does not pass against the source code.

Sprint 5 M2 should not be upgraded to final approved status until `BLOCKER-M2-1` is resolved or the architecture/source-of-truth explicitly defers pipeline activity emission.
