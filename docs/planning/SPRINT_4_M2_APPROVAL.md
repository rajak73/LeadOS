# Sprint 4 M2 — Final Approval

**Date:** 2026-06-19  
**Reviewer:** Independent Senior Engineer  
**Commit:** `a39ac81` (test(shared): add lead schema coverage tests)  
**Preceding commit:** `eebb7a3` (feat(crm): implement lead module and activity service — Sprint 4 M2)

---

## CI Status

**GREEN.** Confirmed locally against the state at commit `a39ac81`:

| Suite | Files | Tests | Result |
|-------|-------|-------|--------|
| `@leados/shared` | 3 | 28 | ✅ pass |
| `@leados/web` | 6 | 20 | ✅ pass |
| `@leados/api` | 44 | 312 pass / 1 skip | ✅ pass |

The 1 skipped test is `queue-roundtrip.test.ts` (Redis not present locally) — pre-existing, unchanged since Sprint 3.

---

## Coverage Gate

`@leados/shared test:coverage` — **all thresholds met**:

| Metric | Threshold | Actual | Status |
|--------|-----------|--------|--------|
| Statements | 80% | **100%** | ✅ |
| Functions | **70%** | **100%** | ✅ |
| Lines | 80% | **100%** | ✅ |
| Branches | 60% | **80%** | ✅ |

The failing gate from CI run 27839128493 was caused by `patchLeadSchema.refine` — a Zod callback V8 counts as a function declaration — never being invoked by any test. Fixed in `a39ac81` by adding `packages/shared/src/schemas/lead.test.ts` (10 tests: 4 for `createLeadSchema`, 4 for `patchLeadSchema` including the refine in both true/false branches, 2 for `leadIdParamSchema`). No production code was modified.

---

## Sprint 4 M2 Acceptance Criteria Verification

### CRM-2.1: Lead Repository

| Criterion | Verified |
|-----------|----------|
| `PrismaLeadRepository extends TenantRepository` | ✅ `lead.repository.ts:14` |
| `super(db)` in constructor triggers `assertTenantScope()` | ✅ `lead.repository.ts:16` |
| `asTenantCreate` used for all inserts (organizationId never caller-supplied) | ✅ `lead.repository.ts:21` |
| All 8 methods present: create, findById, findByIdOrThrow, update, softDelete, count, findByEmail, findByPhone | ✅ lines 19, 39, 49, 58, 79, 87, 92, 100 |
| Soft-delete awareness (`deletedAt: null`) on all reads | ✅ `lead.repository.ts:43, 93, 101` |
| `findManyWithFilter` deferred per plan out-of-scope table | ✅ intentional |

### CRM-2.2: Lead Service CRUD

| Criterion | Verified |
|-----------|----------|
| Plan limit check before insert; defaults to TRIAL if no subscription row | ✅ `lead.service.ts:57–68` |
| Email deduplication; 409 CONFLICT with `existingLeadId` | ✅ `lead.service.ts:71–78` |
| `LEAD_CREATED` activity in same transaction as create | ✅ `lead.service.ts:84–89` |
| Audit written post-withTenant (best-effort) on create | ✅ `lead.service.ts:95–100` |
| `ownOnly` filter in `getById` (`ctx.ownOnly → assignedToId` guard) | ✅ `lead.service.ts:109` |
| `ownOnly` filter in `update` | ✅ `lead.service.ts:121` |
| Audit on update, post-withTenant | ✅ `lead.service.ts:175–179` |
| Audit on softDelete, no activity (correct per spec) | ✅ `lead.service.ts:196–200` |

### CRM-2.3: Status Machine

| Criterion | Verified |
|-----------|----------|
| WON absent from `patchLeadSchema` enum → schema rejects before service | ✅ `schemas/lead.ts:21,46` |
| WON blocked again in `assertValidStatusTransition` (belt-and-suspenders) | ✅ `lead.service.ts:22–27` |
| Terminal (WON or LOST) cannot transition to anything | ✅ `lead.service.ts:30–36` |
| Open → open (including backwards) allowed | ✅ implicit by exclusion |
| Open → LOST allowed; LOST requires lostReason | ✅ `lead.service.ts:131–136` |
| `LEAD_STATUS_CHANGED` activity when status changes | ✅ `lead.service.ts:142–153` |
| `LEAD_ASSIGNED` activity when assignedToId changes | ✅ `lead.service.ts:155–169` |

### CRM-2.4: Endpoints, Controller, Routes

| Criterion | Verified |
|-----------|----------|
| POST `/leads` → `leads.create` | ✅ `lead.routes.ts:24` |
| GET `/leads/:id` → `leads.read` (resolves `_own` via `decide()`) | ✅ `lead.routes.ts:31` |
| PATCH `/leads/:id` → `leads.update` (resolves `_own`) | ✅ `lead.routes.ts:38` |
| DELETE `/leads/:id` → `leads.delete` (no `_own` variant — correct) | ✅ `lead.routes.ts:45` |
| `validate(params)` on all routes with `:id` | ✅ GET L32, PATCH L39–40, DELETE L46 |
| `asyncHandler` wraps all handlers | ✅ throughout `lead.routes.ts` |
| Controller is a plain object (`createLeadController` factory) | ✅ `lead.controller.ts:17` |
| `sendSuccess` used for all responses; 201/200/204 per verb | ✅ `lead.controller.ts:21,26,31,36` |
| Composition root wires `PrismaAuditRecorder → LeadService → controller → router` | ✅ `modules/leads/index.ts:13–15` |
| Router mounted in `app.ts` after `authMiddleware` and `tenantMiddleware` | ✅ `app.ts:62` |

### ActivityService (CRM-4.1 partial)

| Criterion | Verified |
|-----------|----------|
| No `withTenant` call — accepts caller's `TenantTransactionClient` | ✅ `activity.service.ts:22–26` |
| Only `append()` — no update or delete method | ✅ entire file |
| `lastActivityAt` updated in same transaction as activity row | ✅ `activity.service.ts:41–52` |
| `asTenantCreate` used for activity insert | ✅ `activity.service.ts:29` |

---

## Isolation and Non-Regression Checks

### Tenancy

- `PrismaLeadRepository` instantiation outside `withTenant` scope throws `TenantScopeError` at construction (verified via `assertTenantScope()` in base class constructor).
- Tenant extension injects `organizationId` on every insert; callers never supply it.
- Cross-org isolation confirmed by integration tests 8, 19, 24: a valid member of orgB using orgB scope receives 404 for any orgA lead ID (RLS makes the row invisible — correct behavior, not a 403).

### RBAC

- `requirePermission('leads.read')` correctly falls back to `leads.read_own` via `decide()` in `permission-check.ts` — no changes to that file.
- `ownOnly` flag propagated from RBAC middleware to service to repository without modification to the RBAC module.
- Test 6 (403 for non-member) and tests 8/19/24 (404 for cross-org via RLS) cleanly distinguish membership rejection from row-level isolation.

### Audit

- `PrismaAuditRecorder.record()` called post-`withTenant` on all three mutations: create, update, softDelete.
- `maskPii()` applied at the recorder layer (`audit-recorder.ts:37–38`) — email and phone keys recursively masked regardless of call-site.
- `sanitizeLead()` strips `customFields` (large JSON blob) from snapshot before the audit record is written.
- No changes to `audit-recorder.ts` or `pii-masking.ts`.

### No Regressions

- All 44 api test files pass. The 312 test count is identical to pre-M2 baseline plus the 24 new lead integration tests; no previously-passing test regressed.
- `@leados/web` (20 tests), `@leados/shared` (28 tests post-fix) all pass.
- `typecheck`, `lint`, and `build` are clean across the monorepo.

---

## Open Items Carried Forward (Non-Blocking)

These were noted in `SPRINT_4_M2_FINAL_SIGNOFF.md` and require no M2 action:

| Item | Target |
|------|--------|
| F-31: Dynamic `import()` for `AppError` in repository | M3 cleanup |
| F-32: Unused `export type { TenantContext }` in service | M3 cleanup |
| F-33: PATCH test ordering dependency on preceding POST state | M3+ test refactor |

---

## Deliverables Shipped

| Ref | File | Status |
|-----|------|--------|
| CRM-4.1 (partial) | `apps/api/src/core/activities/activity.service.ts` | ✅ |
| CRM-2.1 | `apps/api/src/modules/leads/lead.repository.ts` | ✅ |
| CRM-2.2/2.3 | `apps/api/src/modules/leads/lead.service.ts` | ✅ |
| CRM-2.4 | `apps/api/src/modules/leads/lead.controller.ts` | ✅ |
| CRM-2.4 | `apps/api/src/modules/leads/lead.routes.ts` | ✅ |
| CRM-2.4 | `apps/api/src/modules/leads/index.ts` | ✅ |
| CRM-2.3/2.4 | `packages/shared/src/schemas/lead.ts` | ✅ |
| Coverage fix | `packages/shared/src/schemas/lead.test.ts` | ✅ |
| Integration | `apps/api/tests/integration/leads.integration.test.ts` (24 tests) | ✅ |
| Wiring | `apps/api/src/app.ts` | ✅ |

---

SPRINT 4 M2 APPROVED. M3 MAY BEGIN.
