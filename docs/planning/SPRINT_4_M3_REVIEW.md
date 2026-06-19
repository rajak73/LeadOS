# Sprint 4 M3 Review — Contact Module & Lead→Contact Conversion

**Date:** 2026-06-19  
**Milestone:** M3 (CRM-3.1, CRM-3.2, CRM-3.3)  
**Status:** COMPLETE

---

## 1. Objective

Implement the contact module (repository, service, controller, routes) and the atomic lead→contact conversion endpoint (`POST /leads/:id/convert`), following the same tenancy, RLS, RBAC, activity, and audit conventions established in M1–M2.

---

## 2. Files Created

| File | Purpose |
|------|---------|
| `packages/shared/src/schemas/contact.ts` | `createContactSchema`, `patchContactSchema`, `contactIdParamSchema` Zod schemas + inferred types |
| `packages/shared/src/schemas/contact.test.ts` | 10 tests — coverage gate guard (exercises `patchContactSchema.refine`) |
| `apps/api/src/modules/contacts/contact.repository.ts` | `PrismaContactRepository extends TenantRepository` — create, findById, findByIdOrThrow, update, softDelete, count, findByEmail, findByPhone, findByCreatedFromLeadId |
| `apps/api/src/modules/contacts/contact.service.ts` | `ContactService` — create (plan limit + dedup), update (ownOnly), softDelete; `sanitizeContact()` exported for audit snapshots |
| `apps/api/src/modules/contacts/contact.controller.ts` | `createContactController()` factory — create→201, getById→200, update→200, softDelete→204 |
| `apps/api/src/modules/contacts/contact.routes.ts` | POST `/`, GET `/:id`, PATCH `/:id`, DELETE `/:id` with RBAC + validation middleware |
| `apps/api/src/modules/contacts/index.ts` | `buildContactsModule(requirePermission)` — wires `PrismaAuditRecorder → ContactService → controller → router` |
| `apps/api/tests/integration/contacts.integration.test.ts` | 21 integration tests (7 POST, 3 GET, 3 PATCH, 2 DELETE, 6 convert) |

---

## 3. Files Modified

| File | Change |
|------|--------|
| `packages/shared/src/index.ts` | Added `export * from './schemas/contact.js'` |
| `apps/api/src/modules/leads/lead.service.ts` | Added `convert()` method (CRM-3.2) — atomic withTenant transaction |
| `apps/api/src/modules/leads/lead.controller.ts` | Added `convert` handler — calls `service.convert()`, responds 201 |
| `apps/api/src/modules/leads/lead.routes.ts` | Added `POST /:id/convert` — `leads.update` permission, `leadIdParamSchema` validation |
| `apps/api/src/app.ts` | Imported `buildContactsModule`, mounted at `/api/v1/contacts` |

---

## 4. Architecture Decisions

### 4.1 convert() placed in lead.service.ts (not contact.service.ts)

The lead is the entity transitioning state (→ WON). Both `PrismaLeadRepository` and `PrismaContactRepository` are constructed inside the same `withTenant` callback, sharing the same `TenantTransactionClient`. Moving `convert()` to `contact.service.ts` would require a cross-module `withTenant` handshake that doesn't exist in the framework. This is the only sanctioned cross-module repository import in the codebase.

### 4.2 WON status bypasses PatchLeadInput

`PatchLeadInput` (the HTTP-boundary Zod schema) explicitly excludes `WON` from valid status values — WON is only reachable through `convert()`. Inside the `withTenant` callback, `convert()` calls `db.lead.update()` directly to set `status: 'WON'`, bypassing the HTTP schema. This is intentional: the schema enforcement belongs at the HTTP boundary, not inside the service layer.

### 4.3 Prisma nullable JSON sentinel (Prisma.DbNull)

The `address` field in the Contact model is `Json?` (nullable JSON). Prisma's generated type for this field is `NullableJsonNullValueInput | InputJsonValue`. Setting it to JavaScript `null` causes a type error; instead `Prisma.DbNull` is used to store SQL NULL. This required importing `Prisma` as a value (not type-only) in `contact.repository.ts`.

### 4.4 exactOptionalPropertyTypes + Prisma update type

The conditional-spread pattern used to build partial update objects conflicts with Prisma's `Without<ContactUpdateInput, ContactUncheckedUpdateInput>` union type under `exactOptionalPropertyTypes: true`. The update data object is cast to `Prisma.ContactUncheckedUpdateInput` — safe because the conditional spreads guarantee only defined fields are present, and the values satisfy the column types.

### 4.5 AuditRecorder called post-transaction

Both `contact.service.ts` and `lead.service.ts` follow the established M2 pattern: `AuditRecorder.record()` runs after `withTenant` returns, in a best-effort separate transaction. For `convert()`, two audit records are written (one for the lead transition, one for the new contact) — both post-transaction, best-effort.

### 4.6 ActivityService called inside transaction

`ActivityService.append(db, ctx, input)` receives the `TenantTransactionClient` from the caller's `withTenant` callback. All activity rows and `lastActivityAt` updates are atomic with the parent mutation.

---

## 5. Test Coverage

### @leados/shared coverage (after M3 schemas + tests)

| Metric | Coverage |
|--------|----------|
| Statements | 100% |
| Branches | 83.33% |
| Functions | 100% |
| Lines | 100% |

Coverage gate (70% functions): **PASS**

### @leados/api unit tests

| Result | Count |
|--------|-------|
| Test files | 45 passed |
| Tests | 333 passed, 1 skipped |

### Integration test checklist (contacts.integration.test.ts — 21 cases)

| # | Endpoint | Scenario | Expected |
|---|----------|----------|----------|
| 1 | POST /contacts | OWNER creates contact | 201 + org isolation |
| 2 | POST /contacts | Email duplicate | 409 CONFLICT + existingContactId |
| 3 | POST /contacts | Phone duplicate | 409 CONFLICT |
| 4 | POST /contacts | Plan limit (TRIAL at cap) | 402 PLAN_LIMIT_EXCEEDED |
| 5 | POST /contacts | Missing firstName | 422 VALIDATION_ERROR |
| 6 | POST /contacts | No auth token | 401 |
| 7 | POST /contacts | Non-member (not in org) | 403 |
| 8 | GET /contacts/:id | OWNER fetches own contact | 200 |
| 9 | GET /contacts/:id | Cross-org (RLS isolation) | 404 |
| 10 | GET /contacts/:id | Unknown UUID | 404 NOT_FOUND |
| 11 | PATCH /contacts/:id | Field update | 200 |
| 12 | PATCH /contacts/:id | Empty body | 422 |
| 13 | PATCH /contacts/:id | Cross-org PATCH (RLS) | 404 |
| 14 | DELETE /contacts/:id | Soft delete | 204 |
| 15 | GET /contacts/:id | After soft delete | 404 |
| 16 | POST /leads/:id/convert | OWNER happy path — atomic | 201 + lead=WON + contact.createdFromLeadId |
| 17 | POST /leads/:id/convert | Already converted (idempotency) | 409 CONFLICT |
| 18 | POST /leads/:id/convert | Unknown lead | 404 NOT_FOUND |
| 19 | POST /leads/:id/convert | Cross-org lead (RLS) | 404 |
| 20 | POST /leads/:id/convert | SALES_EXECUTIVE ownOnly — assigned lead | 201 |
| 21 | POST /leads/:id/convert | SALES_EXECUTIVE ownOnly — unassigned lead | 404 |

---

## 6. Validation Gates

| Gate | Result |
|------|--------|
| `pnpm --filter @leados/shared typecheck` | ✅ PASS |
| `pnpm --filter @leados/api typecheck` | ✅ PASS |
| `pnpm --filter @leados/shared lint` | ✅ PASS |
| `pnpm --filter @leados/api lint` | ✅ PASS |
| `pnpm --filter @leados/shared build` | ✅ PASS |
| `pnpm --filter @leados/api build` | ✅ PASS |
| `pnpm --filter @leados/shared test:coverage` | ✅ PASS (functions 100%) |
| `pnpm --filter @leados/api test` | ✅ PASS (333/334) |

---

## 7. Risks Discovered

### 7.1 Prisma DbNull vs JsonNull (low)

The Prisma nullable JSON sentinel pattern (`Prisma.DbNull`) is not obvious to engineers who haven't encountered Prisma's JSON field handling. Future Contact fields of type `Json?` must use this pattern or typecheck will fail. No change needed — the comment in `contact.repository.ts` explains the constraint.

### 7.2 convert() cross-module repo import (low, managed)

`lead.service.ts` imports `PrismaContactRepository`. This is the only place in the codebase where a service imports a repository from another module. Documented in the file header and in this review. The alternative (a `contact.convert()` service method) would require the contacts module to depend on leads — the same coupling, reversed. The current placement is the cleaner option given how `withTenant` works.

### 7.3 Integration test DB-gating (low)

All 21 integration tests are guarded by `describe.skipIf(!pgUp)`. In CI they hit a real Postgres instance. The `beforeAll` seed functions use raw `$queryRawUnsafe` rather than Prisma's high-level API to avoid needing an org-scoped transaction for seed data.

---

## 8. Readiness Recommendation

**PASS — M3 is production-ready.**

All CRM-3.1 through CRM-3.3 deliverables are implemented:
- Contact repository, service, controller, and routes following established LeadOS patterns
- Atomic lead→contact conversion in a single `withTenant` transaction
- Activity events (`LEAD_WON`, `CONTACT_CREATED`) inside the transaction
- Audit records (best-effort post-transaction) for both the lead and the new contact
- RLS isolation: tenant extension injects `organizationId`; `leados_app` role has no `BYPASSRLS`
- RBAC: `contacts.*` permissions resolved through `requirePermission` with `_own` variant support
- Plan limit enforcement (TRIAL/STARTER/GROWTH/SCALE) for the contacts resource
- Email and phone deduplication (409 with `existingContactId`)
- Shared Zod schemas in `@leados/shared` with coverage tests
- 21 integration tests covering happy path, error cases, RLS isolation, and RBAC ownOnly semantics
- All 8 validation gates: typecheck, lint, build, test, test:coverage — GREEN
