# Sprint 4 M5 Final Signoff
**Reviewer:** Independent senior engineer  
**Date:** 2026-06-20  
**Scope:** CRM-5.1 Notes module · CRM-5.2 Files module

---

## Method

Read every production file in `apps/api/src/modules/notes/**` and `apps/api/src/modules/files/**`, both integration test files, and the M5 review doc. Each check is verified against the actual code, not the review summary.

---

## Check 1 — CRM-5.1 Notes module correctness

**Repository** (`note.repository.ts`)
- Extends `TenantRepository`; `asTenantCreate<Prisma.NoteUncheckedCreateInput>` injects `organizationId`. ✅
- `content` is cast to `Prisma.InputJsonValue` — Prisma's JSONB type requires this. ✅
- `findById` / `findByIdOrThrow` both filter `deletedAt: null` — soft-deleted notes are invisible. ✅
- `findByIdOrThrow` throws `AppError(NOT_FOUND)` on miss — maps to 404. ✅
- `softDelete` sets `deletedAt: new Date()` via `update` — no row deletion. ✅
- `listForLead` / `listForContact` filter `deletedAt: null`, order `createdAt: 'desc'`, paginate with `skip` / `take`. ✅

**Service** (`note.service.ts`)
- Every mutation calls `requireTenantContext()` and opens `withTenant(ctx.organizationId, ...)`. ✅
- Activity emission is inside the `withTenant` callback (caller's `TenantTransactionClient`) — correct, atomic with the DB write. ✅
- Audit call is **outside** `withTenant` — consistent with the established pattern. ✅
- `listForLead` / `listForContact` open their own `withTenant` scope — correct (called from LeadService / ContactService after the 404 guard has already fired in the parent entity's scope). ✅

**Controller** (`note.controller.ts`)
- `create` → 201, `update` → 200, `softDelete` → 204 (sends `null`, no body). ✅

**Routes** (`note.routes.ts`)
- `POST /` → `requirePermission('notes.create')` → `validate(createNoteSchema)`. ✅
- `PATCH /:id` → `requirePermission('notes.update')` → `validate(noteIdParamSchema, 'params')` → `validate(patchNoteSchema)`. ✅
- `DELETE /:id` → `requirePermission('notes.delete')` → `validate(noteIdParamSchema, 'params')`. ✅

**Module factory** (`notes/index.ts`) — `buildNotesModule` wires `PrismaAuditRecorder → NoteService → createNoteController → buildNoteRouter`. ✅

**CHECK 1: PASS**

---

## Check 2 — CRM-5.2 Files module correctness

**Repository** (`file.repository.ts`)
- Extends `TenantRepository`; `asTenantCreate<Prisma.FileUncheckedCreateInput>` injects `organizationId`. ✅
- `create` stores `BigInt(data.sizeBytes)` — correct for PostgreSQL BIGINT. ✅
- `findById` / `findByIdOrThrow` filter `deletedAt: null`. ✅
- `findByIdOrThrow` throws `AppError(NOT_FOUND)`. ✅
- `softDelete` sets `deletedAt: new Date()`. ✅
- `listForLead` / `listForContact` filter `deletedAt: null`, order `createdAt: 'desc'`, paginate. ✅

**Service** (`file.service.ts`)
- `generatePresignedUrl`: calls `requireTenantContext()`, generates a UUID via `crypto.randomUUID()`, delegates to `StorageService`. Does **not** write to the database at this step — correct for the two-step flow. ✅
- `recordMetadata`: opens `withTenant`, creates file row, conditionally emits `FILE_UPLOADED` only when `hasEntityFk` is true (files without entity FKs are silent). ✅
- `softDelete`: opens `withTenant`, `findByIdOrThrow` (404 guard), soft-delete, conditionally emits `FILE_DELETED`. ✅
- `toFileResponse`: maps `sizeBytes: Number(file.sizeBytes)` — prevents `JSON.stringify` crash on BigInt. Applied on all return paths (single `recordMetadata` return, and `.map(toFileResponse)` in both list methods). ✅
- `FileResponse` interface: `Omit<File, 'sizeBytes'> & { sizeBytes: number }` — type-safe. ✅

**Controller** (`file.controller.ts`)
- `presignedUrl` → 200, `recordMetadata` → 201, `softDelete` → 204. ✅

**Routes** (`file.routes.ts`)
- `POST /presigned-url` → `requirePermission('files.create')` → `validate(presignedUrlRequestSchema)`. ✅
- `POST /` → `requirePermission('files.create')` → `validate(recordFileSchema)`. ✅
- `DELETE /:id` → `requirePermission('files.delete')` → `validate(fileIdParamSchema, 'params')`. ✅

**Module factory** (`files/index.ts`) — `buildFilesModule` wires `PrismaAuditRecorder → FileService → createFileController → buildFileRouter`. ✅

**CHECK 2: PASS**

---

## Check 3 — Activity emission

| Event | Trigger | Inside withTenant? | Conditional on FK? |
|---|---|---|---|
| `NOTE_ADDED` | `NoteService.create()` | ✅ yes | No — schema refine guarantees ≥1 FK |
| `NOTE_UPDATED` | `NoteService.update()` | ✅ yes | No — FK values taken from `existing` before update |
| `NOTE_DELETED` | `NoteService.softDelete()` | ✅ yes | No — FK values taken from `existing` before delete |
| `FILE_UPLOADED` | `FileService.recordMetadata()` | ✅ yes | ✅ `hasEntityFk` guard |
| `FILE_DELETED` | `FileService.softDelete()` | ✅ yes | ✅ `hasEntityFk` guard |

`NOTE_UPDATED` uses FK values from `existing` (fetched before the update), not from the updated record. This is correct — the entity FKs cannot change (content-only patch). ✅

The `as AppendInput` cast (`Omit<ActivityAppendInput, 'organizationId'>`) resolves the `exactOptionalPropertyTypes` issue with conditional spreads. The cast is safe in all cases because:
- Notes: `createNoteSchema.refine` guarantees at least one FK; `findByIdOrThrow` guarantees the FK values are accessible on `existing`.
- Files: guarded explicitly by `if (hasEntityFk)` before the cast.

**CHECK 3: PASS**

---

## Check 4 — RBAC permissions

**Permission catalog (from implementation)**

| Permission | OWNER | ADMIN | MANAGER | SALES_EXECUTIVE |
|---|---|---|---|---|
| notes.create | ✅ | ✅ | ✅ | ✅ |
| notes.update | ✅ | ✅ | ✅ | ✅ |
| notes.delete | ✅ | ✅ | ✅ | ❌ |
| files.create | ✅ | ✅ | ✅ | ✅ |
| files.read | ✅ | ✅ | ✅ | ✅ |
| files.delete | ✅ | ✅ | ✅ | ❌ |

**Route guards verified against routes files:**
- `POST /notes` → `notes.create` ✅
- `PATCH /notes/:id` → `notes.update` ✅
- `DELETE /notes/:id` → `notes.delete` ✅
- `POST /files/presigned-url` → `files.create` ✅
- `POST /files` → `files.create` ✅
- `DELETE /files/:id` → `files.delete` ✅

**Integration test verification:**
- `DELETE /notes/:id` with `salesToken()` → 403 ✅ (notes.integration.test.ts:238–250)
- `DELETE /files/:id` with `salesToken()` → 403 ✅ (files.integration.test.ts:278–298)
- `POST /notes` with no auth → 401 ✅ (notes.integration.test.ts:184–189)
- `POST /files/presigned-url` with no auth → 401 ✅ (files.integration.test.ts:181–186)

**NB-1:** `files.read` is in the permission catalog but no route currently uses it as a guard — sub-resource file listings are gated by `leads.read` / `contacts.read` (they live in the lead/contact routers). `files.read` is pre-allocated for a future direct `GET /files/:id` or `GET /files` endpoint. This is intentional and does not constitute a gap.

**CHECK 4: PASS**

---

## Check 5 — RLS isolation

**Tenancy enforcement per operation:**
- Notes mutations: `requireTenantContext()` → `withTenant(ctx.organizationId, ...)` → Prisma tenant extension sets `app.current_organization_id` GUC in a `SET LOCAL` block. RLS policies on the `notes` table filter by this GUC. ✅
- Files mutations: same pattern. ✅
- Notes list delegated path: `NoteService.listForLead()` and `.listForContact()` each call `requireTenantContext()` + `withTenant()`. They are invoked from `LeadService.listNotes()` / `ContactService.listNotes()` which first execute a `withTenant` block that calls `repo.findByIdOrThrow(leadId)` — if the lead doesn't exist for this org, RLS hides it and NOT_FOUND is thrown before the notes list is ever attempted. ✅
- Same pattern holds for files sub-resource listing. ✅

**Integration test verification:**
- `GET /leads/:id/notes` with `otherOrgToken()` → 404 ✅ (notes.integration.test.ts:275–280)
- `GET /leads/:id/files` with `otherOrgToken()` → 404 ✅ (files.integration.test.ts:333–338)

**CHECK 5: PASS**

---

## Check 6 — Audit recording

**Notes** (`note.service.ts`):
- `create`: `this.audit.record({ action: 'created', resource: 'note', resourceId: note.id, after: note })` ✅
- `update`: `this.audit.record({ action: 'updated', resource: 'note', resourceId: id, after: note })` ✅
- `softDelete`: `this.audit.record({ action: 'deleted', resource: 'note', resourceId: id })` — no `after` on soft-delete, consistent with M4 task/lead/contact pattern. ✅

**Files** (`file.service.ts`):
- `recordMetadata`: `this.audit.record({ action: 'created', resource: 'file', resourceId: file.id, after: toFileResponse(file) })` — `toFileResponse(file)` converts BigInt before the audit payload is serialized. ✅
- `softDelete`: `this.audit.record({ action: 'deleted', resource: 'file', resourceId: id })` ✅

All audit calls are outside the `withTenant` transaction — established convention. ✅

**CHECK 6: PASS**

---

## Check 7 — Validation gates

| Gate | Result |
|---|---|
| `@leados/shared` build | ✅ PASS |
| `@leados/shared` unit tests | ✅ 76 tests — 100% statements, 100% functions |
| `@leados/api` typecheck (`tsc --noEmit`) | ✅ 0 errors |
| `@leados/api` lint | ✅ PASS |
| `@leados/api` test:coverage | ✅ 366 passed / 1 skipped |
| Statements | ✅ 87.81% (threshold 60%) |
| Functions | ✅ 88.46% (threshold 60%) |
| Branches | ✅ 85.11% (threshold 60%) |

Test count: 346 → 366 (+20 new integration tests across both modules).
No pre-existing tests regressed.

**CHECK 7: PASS**

---

## Noted Behaviors (non-blocking)

**NB-1:** `files.read` is in the permission catalog and assigned to all four roles, but no current route is gated by it. Sub-resource file listings use `leads.read` / `contacts.read`. The permission is pre-allocated for a future direct files endpoint. No action required.

**NB-2:** Notes without an entity FK cannot be created (enforced by `createNoteSchema.refine`), so `NOTE_ADDED` is always emitted. The code does not need a `hasEntityFk` guard on notes as it does on files — files can be stored without an entity FK and the conditional is correct.

**NB-3:** `generatePresignedUrl` does not open a `withTenant` transaction because it performs no database write — it only reads `ctx.organizationId` from the JWT-derived tenant context and delegates to `StorageService`. This is architecturally correct; the tenant context is still authenticated.

---

## Verdict

All 7 checks pass. No blocking findings.

SPRINT 4 M5 APPROVED TO COMMIT
