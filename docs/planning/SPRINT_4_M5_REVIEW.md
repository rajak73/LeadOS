# Sprint 4 M5 Review — Notes & Files Modules (CRM-5.1 / CRM-5.2)

**Date:** 2026-06-20  
**Branch:** main  
**Milestone:** Sprint 4 M5 — Notes and File Attachments

---

## Scope Delivered

| Story | Feature | Status |
|-------|---------|--------|
| CRM-5.1 | Notes module (create / update / soft-delete / sub-resource list) | DONE |
| CRM-5.2 | Files module — presigned URL flow + metadata record + soft-delete + sub-resource list | DONE |
| CRM-5.x | `notes.*` and `files.*` permissions wired to all four roles | DONE |
| CRM-5.x | Activity emission for NOTE_ADDED / NOTE_UPDATED / NOTE_DELETED / FILE_UPLOADED / FILE_DELETED | DONE |
| CRM-5.x | AuditRecorder calls on every mutation | DONE |
| CRM-5.x | Schema validation tests — `note.ts` + `file.ts` | DONE |
| CRM-5.x | Integration tests — notes (10) + files (10) | DONE |

---

## Files Created

### Shared package
| File | Purpose |
|------|---------|
| `packages/shared/src/schemas/note.ts` | `createNoteSchema`, `patchNoteSchema`, `noteIdParamSchema` with refine |
| `packages/shared/src/schemas/note.test.ts` | 14 tests covering both refine branches |
| `packages/shared/src/schemas/file.ts` | `presignedUrlRequestSchema`, `recordFileSchema`, `fileIdParamSchema`, ALLOWED_MIME_TYPES |
| `packages/shared/src/schemas/file.test.ts` | 12 tests |

### API — core
| File | Purpose |
|------|---------|
| `apps/api/src/core/storage/storage.service.ts` | S3 presigned URL generation; `isTest()` bypass returns mock URL |

### API — notes module
| File | Purpose |
|------|---------|
| `apps/api/src/modules/notes/note.repository.ts` | TenantRepository subclass; JSONB content cast; soft-delete; paginated list |
| `apps/api/src/modules/notes/note.service.ts` | withTenant, activity emission, audit calls |
| `apps/api/src/modules/notes/note.controller.ts` | create→201, update→200, softDelete→204 |
| `apps/api/src/modules/notes/note.routes.ts` | POST /, PATCH /:id, DELETE /:id |
| `apps/api/src/modules/notes/index.ts` | `buildNotesModule()` factory |

### API — files module
| File | Purpose |
|------|---------|
| `apps/api/src/modules/files/file.repository.ts` | TenantRepository subclass; BigInt(sizeBytes) on write; paginated list |
| `apps/api/src/modules/files/file.service.ts` | Two-step upload flow; BigInt→Number mapping; conditional activity emission |
| `apps/api/src/modules/files/file.controller.ts` | presignedUrl→200, recordMetadata→201, softDelete→204 |
| `apps/api/src/modules/files/file.routes.ts` | POST /presigned-url, POST /, DELETE /:id |
| `apps/api/src/modules/files/index.ts` | `buildFilesModule()` factory |

### Integration tests
| File | Tests |
|------|-------|
| `apps/api/tests/integration/notes.integration.test.ts` | 10 tests |
| `apps/api/tests/integration/files.integration.test.ts` | 10 tests |

---

## Files Modified

| File | Change |
|------|--------|
| `packages/shared/src/constants/permissions.ts` | Added `'notes'` to RESOURCES; added `notes.create/update/delete`; distributed to roles per approved matrix |
| `packages/shared/src/index.ts` | Re-exports `note.ts` and `file.ts` schemas |
| `apps/api/src/core/config/env.ts` | Added optional S3 env vars |
| `apps/api/src/modules/leads/lead.service.ts` | Added `listNotes()` and `listFiles()` with 404 guard + ownOnly respect |
| `apps/api/src/modules/leads/lead.controller.ts` | Added `listNotes` and `listFiles` handler methods |
| `apps/api/src/modules/leads/lead.routes.ts` | Added `GET /:id/notes` and `GET /:id/files` |
| `apps/api/src/modules/contacts/contact.service.ts` | Same sub-resource additions as leads |
| `apps/api/src/modules/contacts/contact.controller.ts` | Same as leads controller |
| `apps/api/src/modules/contacts/contact.routes.ts` | Same routes pattern as leads |
| `apps/api/src/app.ts` | Mounts `/notes` and `/files` routers |
| `apps/api/package.json` + `pnpm-lock.yaml` | Added `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` |

---

## Permission Matrix (as approved)

| Permission | OWNER | ADMIN | MANAGER | SALES_EXECUTIVE |
|------------|-------|-------|---------|-----------------|
| notes.create | ✅ | ✅ | ✅ | ✅ |
| notes.update | ✅ | ✅ | ✅ | ✅ |
| notes.delete | ✅ | ✅ | ✅ | ❌ |
| files.create | ✅ | ✅ | ✅ | ✅ |
| files.read   | ✅ | ✅ | ✅ | ✅ |
| files.delete | ✅ | ✅ | ✅ | ❌ |

SALES_EXECUTIVE cannot delete notes or files. Both integration tests verify this with 403 assertions.

---

## Validation Gates

| Gate | Result |
|------|--------|
| `@leados/shared` build | ✅ PASS |
| `@leados/shared` unit tests | ✅ 76 tests — 100% statements, 100% functions |
| `@leados/api` typecheck (`tsc --noEmit`) | ✅ 0 errors |
| `@leados/api` lint | ✅ PASS |
| `@leados/api` test:coverage | ✅ 366 passed / 1 skipped (DB-gated) |
| Statements | ✅ 87.81% (threshold 60%) |
| Functions | ✅ 88.46% (threshold 60%) |
| Branches | ✅ 85.11% (threshold 60%) |

Total test count increased from 346 → 366 (+20 new tests across notes and files integration suites).

---

## Architecture Decisions

**BigInt serialization:** `File.sizeBytes` is a PostgreSQL BIGINT mapped as `bigint` by Prisma. `JSON.stringify` throws on bare BigInt. The service layer converts to `Number()` before returning — safe for files up to 9 PB.

**Two-step upload flow:** Presigned URL step does not write to the database. It only generates a fileId (via `crypto.randomUUID()`) and a storage key. The client uploads directly to S3 and then calls `POST /files` to record metadata. This decouples upload I/O from our API latency.

**Test bypass for storage:** `isTest()` (from `env.ts`) returns true in Vitest, causing `StorageService` to return a mock URL. Integration tests exercise the full presigned-url route without requiring real AWS credentials.

**exactOptionalPropertyTypes:** The TypeScript strict flag causes conditional spreads to infer `prop?: T | undefined`, which activity emission types reject. All activity calls use `as AppendInput` (i.e., `Omit<ActivityAppendInput, 'organizationId'>`) to sidestep this — safe because the schema refine or guard already ensures at least one FK is non-null.

**Sub-resource listing:** `GET /leads/:id/notes`, `GET /leads/:id/files`, `GET /contacts/:id/notes`, `GET /contacts/:id/files` all call through the entity service first (to get a 404 if the entity doesn't exist or is cross-org) before delegating to the notes/files service. This preserves RLS without duplicating tenant context setup.

---

## No Regressions

All 346 pre-existing tests continue to pass. The +20 new integration tests are additive.

---

SPRINT 4 M5 APPROVED TO COMMIT
