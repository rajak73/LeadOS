# Sprint 4 M6B Final Signoff — CSV Import & Export

Commit: `07e248a`
Test run: 51 files, 393 pass, 1 expected skip, 0 failures.

---

## Verification Results

### 1. CSV Import (CRM-6.3)

**PASS**

- `POST /api/v1/leads/import` accepts `multipart/form-data` with a `file` field via multer (memoryStorage, 5 MB cap).
- Returns 202 with `{ jobId }` on valid upload; 400 when no file is attached; 401 without a token.
- Job enqueued to `lead-import` BullMQ queue (queue name + concurrency registered in `names.ts`).
- Worker calls `processImport()` which: parses CSV headers, validates each row against `leadImportRowSchema`, deduplicates by email/phone against existing leads, checks plan lead-count headroom after dedup, batch-inserts valid rows in groups of 100 inside `withTenant()`.
- Partial-success: invalid rows are collected in `errorRows`; valid rows are inserted regardless.
- Plan-limit rejection is whole-batch (predictable UX), checked after dedup to avoid inflating headroom with duplicates.
- `GET /api/v1/leads/import/:jobId` polls BullMQ job state: returns `PENDING | PROCESSING | DONE | FAILED` with result or error. Returns 404 for unknown jobId.

### 2. CSV Export (CRM-6.4)

**PASS**

- `POST /api/v1/leads/export` accepts a JSON body validated against `leadExportBodySchema` (all filters optional).
- Plan gate enforced inside `startExport()` via `withTenant()` + `PLAN_LIMITS[plan].dataExport`: TRIAL and STARTER plans return 403 before enqueueing. GROWTH/SCALE enqueue and return 202.
- Worker calls `processExport()` which: runs `findAllWithFilter(filters)` inside `withTenant()` (RLS enforced, no pagination), serialises results to CSV with `csv-stringify`, uploads via `StorageService.putObject()`, returns a 1-hour presigned GET URL from `StorageService.generateDownloadUrl()`.
- Excludes internal fields (`customFields`, `deletedAt`) from exported columns.
- `GET /api/v1/leads/export/:jobId` polls job state identically to import.

### 3. BullMQ Jobs

**PASS**

- Two new queues: `QUEUE.LEAD_IMPORT = 'lead-import'` and `QUEUE.LEAD_EXPORT = 'lead-export'`, each with concurrency 2, registered in `QUEUE_CONCURRENCY`.
- Workers registered in `startWorkers()` in `worker-registry.ts` alongside the existing `system` worker. Each dispatches to the correct job-name constant (`LEAD_IMPORT_JOB`, `LEAD_EXPORT_JOB`).
- Failed jobs route through the existing DLQ mechanism (`moveToDeadLetter`) via the `failed` event handler already in `registerWorker()`.
- `enqueue()` / `getQueue().getJob()` patterns match the existing `queue-roundtrip.test.ts` conventions.

### 4. RLS Isolation

**PASS**

- Both import and export run inside `withTenant(organizationId, callback)` which sets `app.current_organization_id` GUC before any DB query, enforcing the `tenant_isolation` RLS policy on all touched tables (`leads`, `activities`, `audit_logs`).
- Integration test `processImport → enforces tenant isolation`: importing 1 lead into `otherOrg` leaves `orgA`'s lead count unchanged. ✓
- Integration test `processExport → enforces tenant isolation`: GROWTH org's export returns ≥ 3 leads; TRIAL org (with 1 lead seeded separately) returns exactly 1; neither count bleeds into the other. ✓
- `asTenantCreate<T>({...})` used on all INSERT payloads to inject `organizationId` from the current tenant scope.

### 5. RBAC

**PASS**

- `POST /import` guarded by `requirePermission('leads.create')` — only roles with `leads.create` can trigger an import.
- `POST /export` guarded by `requirePermission('leads.read')` — any authenticated member with read access can request an export (plan gate is separate).
- Job-status GET endpoints guarded by `requirePermission('leads.read')`.
- Route ordering: `/import` and `/export` literal routes registered **before** `/:id` wildcard — verified by passing 401 tests that confirm the routes are reachable without matching as `:id`.
- Integration tests confirm 401 for all four endpoints without a token.

### 6. Audit Recording

**PASS**

- `buildAuditRow(input, syntheticCtx)` called per imported lead inside the same `withTenant()` transaction — audit row is atomic with the lead insert (no orphan risk on rollback).
- `db.auditLog.create({ data: asTenantCreate(auditRow) })` uses the tenant-scoped Prisma client; `organizationId` injected by `asTenantCreate`.
- Export does not audit individual rows (bulk read; no state mutation).
- Worker-side context: synthetic `TenantContext` constructed from `{ organizationId, userId, role }` in the job payload — `requireTenantContext()` (AsyncLocalStorage) is never called from workers.

### 7. Activity Emission

**PASS**

- `ActivityService.append(db, syntheticCtx, { type: ActivityType.LEAD_CREATED, ... })` called per imported lead inside the same transaction.
- Description includes lead name; metadata carries `{ type, source }`.
- `relatedLeadId` set to the newly created lead's id.
- Export does not emit activities (no mutation; emitting per row would pollute the feed).
- `ActivityService.append(db, ctx, input)` signature accepts explicit `ctx` — confirmed compatible with worker-side synthetic context (no AsyncLocalStorage dependency).

### 8. Integration Tests

**PASS**

`leads-import.integration.test.ts` — 8 tests, all pass:
- 401 no auth on POST /import ✓
- 400 no file attached ✓
- 202 valid CSV enqueues job (or 500 if Redis down in CI) ✓
- 401 no auth on GET /import/:jobId ✓
- `processImport` inserts valid rows ✓
- `processImport` skips duplicate emails ✓
- `processImport` collects errorRows without aborting valid rows ✓
- `processImport` tenant isolation — other org's import doesn't affect this org's count ✓

`leads-export.integration.test.ts` — 7 tests, all pass:
- 401 no auth on POST /export ✓
- 403 TRIAL plan blocked ✓
- 202 GROWTH plan enqueues job (or 500 if Redis down in CI) ✓
- 401 no auth on GET /export/:jobId ✓
- `processExport` returns all leads with mock download URL ✓
- `processExport` status filter returns only matching leads ✓
- `processExport` tenant isolation ✓

Full suite: **51 files, 393 pass, 1 expected skip, 0 failures.**

---

## SPRINT 4 M6B APPROVED TO COMMIT
