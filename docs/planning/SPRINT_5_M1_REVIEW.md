# Sprint 5 M1 Review — Pipeline & Deal Foundation

**Date:** 2026-06-20
**Milestone:** Sprint 5 M1 — Pipeline, Deals & Webhook Schema
**Status:** COMPLETE — all validation gates passed

---

## Scope

M1 establishes the database and shared-type foundation for the deal pipeline feature. No HTTP endpoints are included; those land in M2 (pipelines) and M3 (deals). M1 delivers:

1. **Prisma models** — `Pipeline`, `PipelineStage`, `Deal`, `WebhookEvent`
2. **SQL migrations** — three migrations applied in sequence
3. **RLS** — all four new tables registered and policied; `check:rls` passes at 19 tables
4. **Shared types** — Zod schemas, enums, plan limits, activity metadata
5. **Deferred FK activation** — four `relatedDealId` columns from Sprint 4 now carry FK constraints
6. **Isolation tests** — 6 new RLS assertion tests (2 per new table: pipelines, pipeline_stages, deals)

---

## Files Changed

### New files
| File | Purpose |
|---|---|
| `packages/shared/src/schemas/pipeline.ts` | Zod: createPipeline, patchPipeline, createStage, patchStage, reorderStages |
| `packages/shared/src/schemas/deal.ts` | Zod: createDeal, patchDeal, moveDeal, lostDeal, dealListQuery |
| `prisma/migrations/0010_pipeline_tables/migration.sql` | pipelines, pipeline_stages, deals tables; deferred FK activation |
| `prisma/migrations/0011_pipeline_rls/migration.sql` | RLS ENABLE+FORCE+policy for pipelines, pipeline_stages, deals |
| `prisma/migrations/0012_webhook_events/migration.sql` | WebhookSource/Status enums, webhook_events table, dual-policy RLS, ActivityType enum extension |

### Modified files
| File | Change |
|---|---|
| `prisma/schema.prisma` | Added 4 new models; extended Organization/User/Lead/Contact/Task/Activity/Note/File relations; added WebhookSource, WebhookEventStatus enums; extended ActivityType with 3 new values |
| `packages/shared/src/constants/enums.ts` | Added WebhookSource, WebhookEventStatus const-enums; extended ActivityType |
| `packages/shared/src/constants/plan-limits.ts` | Added `deals` field to PlanLimits; values: TRIAL 250, STARTER 1000, GROWTH/SCALE unlimited |
| `packages/shared/src/types/activity-metadata.ts` | Added DealUpdatedMetadata, PipelineCreatedMetadata, PipelineUpdatedMetadata; extended ActivityMetadata union |
| `packages/shared/src/index.ts` | Exported pipeline and deal schemas |
| `apps/api/src/core/tenancy/tenant-tables.ts` | Added 4 new tenant tables + models; updated count comment to 19 |
| `apps/api/tests/integration/isolation.rls.test.ts` | Added ISO-2f, ISO-2g, ISO-2h test groups (6 tests) |

---

## Validation Gates

### `prisma validate`
```
✓ The schema at prisma/schema.prisma is valid
```

### `prisma generate`
```
✓ Generated Prisma Client (v6.x) — all 4 new models confirmed via node -e
```

### `prisma migrate deploy`
```
✓ migrations/0010_pipeline_tables/migration.sql applied
✓ migrations/0011_pipeline_rls/migration.sql applied
✓ migrations/0012_webhook_events/migration.sql applied
All 3 migrations applied successfully.
```

### `check:rls`
```
RLS coverage check: OK — 19 tenant tables enabled + forced + policied; coverage matches registry.
```

### TypeScript (`tsc --noEmit`)
```
✓ @leados/shared build — clean (DTS + ESM)
✓ @leados/api tsc -- clean (no errors)
```

### Lint (`eslint src`)
```
✓ @leados/api lint — clean
```

### Build
```
✓ @leados/api build success in 30ms
```

### Integration tests
```
✓ 22 test files passed, 239 tests passed, 1 skipped
✓ isolation.rls.test.ts — 24 tests passed (was 18; +6 from Sprint 5 M1)
```

**Note on pre-existing test runner issue:** `pnpm test:isolation` fails with env validation errors for `isolation.rls.test.ts` and `isolation.app.test.ts` when `.env` has empty `JWT_ACCESS_SECRET` / `JWT_REFRESH_PEPPER` values. This failure is pre-existing (reproduced on unmodified baseline). The cause: Zod `.default()` applies only when the value is `undefined`, but the test worker environment receives empty strings from `.env`. The fix (populate JWT secrets in `.env` or pre-process empties) is outside M1 scope. Running with the secrets set (`JWT_ACCESS_SECRET=... JWT_REFRESH_PEPPER=... npx vitest run`) confirms all 24 RLS tests pass.

---

## Architecture Decisions

### Partial unique index for default pipeline
`CREATE UNIQUE INDEX ON "pipelines" ("organizationId") WHERE "isDefault" = true` — enforces exactly one default pipeline per org at DB level without a trigger. Covers the TOCTOU window an application-layer check would leave open.

### Dual-policy RLS for webhook_events
`webhook_events.organizationId` is nullable — Stripe events arrive before org is resolved. Two policies:
- `webhook_insert`: `WITH CHECK (true)` — allows the receiver to insert with `NULL organizationId`
- `webhook_select` / `webhook_update`: `organizationId IS NULL OR organizationId = GUC` — covers pre-resolution rows + tenant-scoped rows

The worker back-fills `organizationId` before marking `DONE`. Deduplication is idempotency-key based on `(source, externalEventId)`.

### ActivityType enum extension in SQL
`ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'DEAL_UPDATED'` — extending a Postgres enum requires DDL (cannot be done via ORM-only). Placed in migration 0012 alongside the webhook_events table to keep enum changes co-located with the feature that introduces them.

### Deferred FK activation
Sprint 4 left `relatedDealId` as a bare UUID column on tasks, activities, notes, files (deals table didn't exist yet). Migration 0010 activates FK constraints via idempotent `DO` blocks — safe for re-runs and CI replays.

---

## Risk Register (M1 items)

| ID | Risk | Mitigation | Status |
|---|---|---|---|
| R-M1-1 | Cross-org pipeline access if RLS missed | check:rls hard-fails if coverage ≠ registry | MITIGATED — 19 tables confirmed |
| R-M1-2 | Deferred FK breaks existing Sprint 4 data | FK is SET NULL on delete; existing NULL values remain valid | CONFIRMED — migration applied clean |
| R-M1-3 | Multiple default pipelines per org | Partial unique index enforced at DB level | MITIGATED |
| R-M1-4 | ActivityMetadata union out of sync with Prisma enum | Prisma enum = shared enums = ActivityMetadata union (all modified in M1 together) | CONFIRMED |
| R-M1-5 | webhook_events RLS blocks INSERT | Separate INSERT policy (WITH CHECK true) | CONFIRMED — dual-policy active |

---

## Ready for M2?

All M1 acceptance criteria met. M2 (Pipeline HTTP layer) can proceed when directed:
- `PipelineRepository` + `PipelineService` + `pipeline.controller` + `pipeline.routes`
- Tests: `pipelines.integration.test.ts`

**Do not proceed to M2 without explicit direction.**
