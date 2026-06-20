# Sprint 4 M6B Review — CSV Import & Export for Leads

## Scope

CRM-6.3 (CSV import) and CRM-6.4 (CSV export) implemented as async BullMQ jobs.  
All changes committed in `07e248a`.

---

## Files Created

| File | Purpose |
|------|---------|
| `apps/api/src/modules/leads/lead-import.service.ts` | Worker-side import logic: parse, validate, dedup, plan-limit, batch insert, activity + audit per row |
| `apps/api/src/modules/leads/lead-export.service.ts` | Worker-side export logic: findAllWithFilter → CSV → S3 putObject → presigned GET URL |
| `apps/api/src/core/queue/workers/lead-import.worker.ts` | BullMQ processor wrapper for lead-import queue |
| `apps/api/src/core/queue/workers/lead-export.worker.ts` | BullMQ processor wrapper for lead-export queue |
| `apps/api/tests/integration/leads-import.integration.test.ts` | 8 integration tests (HTTP + unit-via-integration) |
| `apps/api/tests/integration/leads-export.integration.test.ts` | 7 integration tests (HTTP + unit-via-integration) |

## Files Modified

| File | Change |
|------|--------|
| `packages/shared/src/schemas/lead.ts` | Added `leadImportRowSchema`, `LeadImportRow`, `leadExportBodySchema`, `LeadExportBody` |
| `apps/api/src/core/queue/names.ts` | Added `LEAD_IMPORT`, `LEAD_EXPORT` to QUEUE + `QUEUE_CONCURRENCY` (concurrency: 2 each) |
| `apps/api/src/core/queue/worker-registry.ts` | Registered lead-import and lead-export workers in `startWorkers()` |
| `apps/api/src/core/storage/storage.service.ts` | Renamed `PRESIGNED_URL_EXPIRY_SECONDS` → `PRESIGNED_PUT_EXPIRY_SECONDS`; added `PRESIGNED_GET_EXPIRY_SECONDS`; added `generateDownloadUrl()` (1h presigned GET); added `putObject()` (direct S3 PUT from worker) |
| `apps/api/src/modules/leads/lead.repository.ts` | Added `findAllWithFilter()` — identical WHERE to `findManyWithFilter` but no `skip`/`take` (for export) |
| `apps/api/src/modules/leads/lead.service.ts` | Added `startImport()`, `getImportJob()`, `startExport()`, `getExportJob()` |
| `apps/api/src/modules/leads/lead.controller.ts` | Added `importCsv`, `getImportJob`, `exportCsv`, `getExportJob` to interface + implementation |
| `apps/api/src/modules/leads/lead.routes.ts` | Added 4 new routes before `/:id`; added multer middleware (5 MB limit, memoryStorage) |
| `apps/api/package.json` + `pnpm-lock.yaml` | Added `multer`, `@types/multer`, `csv-parse`, `csv-stringify` |

---

## Architecture Decisions

### Async via BullMQ
Both import and export are enqueued as BullMQ jobs rather than processed synchronously.
- Import: CSV can be large (up to 5 MB = thousands of rows); synchronous insert would tie up the API.
- Export: filtered queries over large datasets + S3 upload can take seconds; async keeps p99 latency low.
- Clients poll `GET /leads/import/:jobId` / `GET /leads/export/:jobId` for status.

### Worker Context (No AsyncLocalStorage)
BullMQ workers run in a separate Node.js process. `requireTenantContext()` reads from AsyncLocalStorage, which is request-scoped and not populated in workers. Solution:
- Job payloads carry `organizationId`, `userId`, `role`.
- Workers construct a synthetic `TenantContext` from the payload.
- `withTenant(organizationId, callback)` sets the GUC and opens a tenant-scoped transaction.
- `ActivityService.append(db, syntheticCtx, ...)` accepts explicit ctx — works in workers.
- Audit: `buildAuditRow(input, syntheticCtx)` + `db.auditLog.create()` inside the same transaction (atomic with inserts).

### Import Semantics
- **Partial success**: valid rows are inserted even when some rows fail schema validation.
- **Dedup**: before insert, batch-lookup existing leads by email/phone; skip collisions.
- **Plan limit**: checked after dedup (to avoid counting duplicates against headroom). If `validAfterDedup + currentCount > limit`, the entire import is rejected (not silently truncated).
- **Batch insert**: rows inserted in groups of 100 to stay within transaction limits.

### Export Semantics
- **Plan gate**: `PLAN_LIMITS[plan].dataExport` must be `true` (GROWTH / SCALE only; TRIAL / STARTER return 403).
- **`findAllWithFilter`**: new repository method mirrors `findManyWithFilter` WHERE clause but omits `skip`/`take` and always orders by `createdAt DESC`.
- **CSV columns**: `id, firstName, lastName, email, phone, source, status, assignedToId, tags, aiScore, lostReason, createdAt, updatedAt` (excludes `customFields`, `deletedAt`, internal FK fields).
- **S3 upload**: `StorageService.putObject()` — no-op in test, real `PutObjectCommand` in prod.
- **Download URL**: `StorageService.generateDownloadUrl()` — mock URL in test (`http://mock-storage.test/download/...`), 1-hour presigned GET URL in prod.

### Route Ordering
`/import` and `/export` literal routes are registered **before** `/:id` in the Express router. Without this, `GET /leads/import/:jobId` would match `/:id` with `id = "import"`.

---

## Validation Gates

| Gate | Status |
|------|--------|
| TypeScript typecheck (`tsc --noEmit`) | ✅ Clean |
| ESLint | ✅ Clean |
| Build (`tsup`) | ✅ Build success in 32ms |
| Test suite | ✅ 393 pass, 1 expected skip, 51 test files |

### Test Coverage

**`leads-import.integration.test.ts`** (8 tests):
- `401` — no auth token on POST /import
- `400` — no file attached
- `202` — valid CSV enqueues a job (or 500 if Redis down in CI)
- `401` — no auth on GET /import/:jobId
- `processImport` — valid rows inserted into correct org
- `processImport` — duplicate rows skipped (by email)
- `processImport` — invalid rows collected in `errorRows` without aborting valid rows
- `processImport` — tenant isolation: other org's import does not affect this org's count

**`leads-export.integration.test.ts`** (7 tests):
- `401` — no auth token on POST /export
- `403` — TRIAL plan blocked
- `202` — GROWTH plan enqueues job (or 500 if Redis down in CI)
- `401` — no auth on GET /export/:jobId
- `processExport` — returns all matching leads; downloadUrl is mock URL
- `processExport` — status filter returns only matching leads
- `processExport` — tenant isolation: each org's export only includes its own leads

### Test Cleanup Note
The `activities` table has `BEFORE DELETE FOR EACH ROW` and `BEFORE UPDATE FOR EACH ROW` triggers that prevent direct mutation (immutability guarantee). The cascade from `DELETE FROM leads` fires `SET NULL` on `activities.relatedLeadId` (an UPDATE), and the cascade from `DELETE FROM organizations` fires cascade DELETE on activities — both blocked by the triggers.

Resolution: test `afterAll` blocks run inside a `$transaction` with `SET LOCAL session_replication_role = replica` (superuser-only, consistent with `leads.integration.test.ts` pattern), which disables triggers for the session.

---

## Tenancy & RLS

- Import: all inserts run inside `withTenant(organizationId, ...)` → GUC `app.current_organization_id` set → RLS policy `tenant_isolation` enforced on all tables.
- Export: `findAllWithFilter` runs inside `withTenant` → same RLS enforcement. The isolation test confirms that org A's export does not include org B's leads.
- `asTenantCreate<T>({...})` is used on all INSERT payloads to inject `organizationId` from the current tenant scope.

## RBAC

- Import: `requirePermission('leads.create')` — only roles with `leads.create` can import.
- Export: `requirePermission('leads.read')` — any role with read access can export (if plan allows).
- Job-status endpoints: `requirePermission('leads.read')` — same as list endpoint.

## Activity Emission

- `ActivityService.append(db, ctx, { type: ActivityType.LEAD_CREATED, ... })` called per imported lead within the same transaction.
- Export does not emit activities (bulk read operation; emitting one activity per exported row would pollute the feed).

## Audit Recording

- `buildAuditRow(input, ctx)` + `db.auditLog.create({ data: asTenantCreate(auditRow) })` per imported lead within the same transaction.
- Export does not audit individual rows (same reasoning as activities).
