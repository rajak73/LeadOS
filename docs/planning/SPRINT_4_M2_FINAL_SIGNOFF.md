# Sprint 4 M2 — Final Signoff

**Date:** 2026-06-19  
**Reviewer:** Senior Staff Engineer  
**Verdict:** **PASS**

---

## Files Audited

| File | CRM Ref |
|------|---------|
| `apps/api/src/core/activities/activity.service.ts` | CRM-4.1 (partial) |
| `apps/api/src/modules/leads/lead.repository.ts` | CRM-2.1 |
| `apps/api/src/modules/leads/lead.service.ts` | CRM-2.2, CRM-2.3 |
| `apps/api/src/modules/leads/lead.controller.ts` | CRM-2.4 |
| `apps/api/src/modules/leads/lead.routes.ts` | CRM-2.4 |
| `apps/api/src/modules/leads/index.ts` | CRM-2.4 |
| `packages/shared/src/schemas/lead.ts` | CRM-2.3, CRM-2.4 |
| `apps/api/tests/integration/leads.integration.test.ts` | All |
| `apps/api/src/app.ts` | Wiring |
| `docs/planning/SPRINT_4_EXECUTION_PLAN.md` | Spec source |
| `docs/planning/SPRINT_4_M2_REVIEW.md` | Self-review |

Also read (for convention cross-checks): `core/audit/audit-recorder.ts`, `core/audit/pii-masking.ts`, `core/tenancy/tenant-repository.ts`, `packages/shared/src/errors/error-codes.ts`.

---

## Findings Table

| # | Check | Severity | Status | Evidence |
|---|-------|----------|--------|----------|
| F-1 | ActivityService does not open its own `withTenant` | — | ✅ PASS | `activity.service.ts:22–26` — signature is `append(db, ctx, input)`, receives caller's `TenantTransactionClient`. No `withTenant` call in the file. |
| F-2 | ActivityService has no `update()` or `delete()` method | — | ✅ PASS | Only `append()` exists. R-S4-6 belt-and-suspenders confirmed. |
| F-3 | `lastActivityAt` denormalization runs in same transaction as activity insert | — | ✅ PASS | `activity.service.ts:41–52` — `db.lead.update` and `db.contact.update` called on the same `db` (TenantTransactionClient) as the activity insert. |
| F-4 | Lead repository extends `TenantRepository` | — | ✅ PASS | `lead.repository.ts:14` — `class PrismaLeadRepository extends TenantRepository`. Constructor calls `super(db)` at line 16, which triggers `assertTenantScope()` in the base class. |
| F-5 | `asTenantCreate` used for tenant-scoped inserts | — | ✅ PASS | `lead.repository.ts:21` — `asTenantCreate<Prisma.LeadUncheckedCreateInput>(...)`. organizationId never passed by caller; injected by extension. |
| F-6 | All CRM-2.1 repository methods present | — | ✅ PASS | `create` (L19), `findById` (L39), `findByIdOrThrow` (L49), `update` (L58), `softDelete` (L79), `count` (L87), `findByEmail` (L92), `findByPhone` (L100). `findManyWithFilter` intentionally deferred to E6. |
| F-7 | `softDelete` marks `deletedAt`, does not hard delete | — | ✅ PASS | `lead.repository.ts:80–84` — `db.lead.update({ data: { deletedAt: new Date() } })`. |
| F-8 | `findById` is soft-delete aware (`deletedAt: null`) | — | ✅ PASS | `lead.repository.ts:43` — `deletedAt: null` in where clause. |
| F-9 | Email deduplication enforced in create path | — | ✅ PASS | `lead.service.ts:71–78` — `findByEmail` called before insert; 409 CONFLICT thrown with `existingLeadId` in details. |
| F-10 | Plan limit checked before insert | — | ✅ PASS | `lead.service.ts:57–68` — queries `db.subscription.findFirst`, defaults to TRIAL, calls `repo.count()`, checks `count >= limit`. |
| F-11 | Plan limit HTTP status: spec says 429; implementation returns 402 | LOW | ⚠ DIVERGENCE (NOT A DEFECT) | Execution plan (CRM-2.2) says "throw 429 PLAN_LIMIT_EXCEEDED." The platform error catalog (`error-codes.ts:23`) defines `PLAN_LIMIT_EXCEEDED: 402`. Implementation uses `ErrorCode.PLAN_LIMIT_EXCEEDED` → 402. 402 (Payment Required) is semantically correct for a billing-gate error; 429 (Too Many Requests) is rate-limit semantics. The error catalog takes precedence over the plan's notation. Tests assert 402 and pass. **No code change required.** |
| F-12 | WON blocked at schema layer | — | ✅ PASS | `schemas/lead.ts:21` — `PATCHABLE_STATUSES` = `['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'LOST']`. WON absent. Zod returns 422 before service is reached. |
| F-13 | WON blocked at service layer (double enforcement) | — | ✅ PASS | `lead.service.ts:22–27` — `assertValidStatusTransition` throws `VALIDATION_ERROR` if `next === 'WON'`. Belt-and-suspenders. |
| F-14 | Terminal state (WON, LOST) cannot transition | — | ✅ PASS | `lead.service.ts:30–36` — `if (current === 'WON' \|\| current === 'LOST')` → throws. |
| F-15 | Open → open (including backtrack) allowed | — | ✅ PASS | No restriction beyond the two guards above. NEW→NEGOTIATION and NEGOTIATION→NEW both pass. |
| F-16 | LOST requires lostReason | — | ✅ PASS | `lead.service.ts:131–136` — throws `VALIDATION_ERROR` with `field: 'lostReason'` when `input.status === 'LOST' && !input.lostReason && !existing.lostReason`. |
| F-17 | ownOnly filter in `getById` | — | ✅ PASS | `lead.service.ts:109` — `ownedByUserId = ctx.ownOnly === true ? ctx.userId : undefined`, passed to `findByIdOrThrow`. |
| F-18 | ownOnly filter in `update` | — | ✅ PASS | `lead.service.ts:121` — same pattern; PATCH on unowned lead returns 404. |
| F-19 | `softDelete` correctly omits ownOnly filter | — | ✅ PASS | `leads.delete` has no `_own` variant in the permission catalog (`permissions.ts`). The permission system never sets `ctx.ownOnly = true` for `leads.delete`. Correct by design. |
| F-20 | Activity emitted on lead create (LEAD_CREATED) | — | ✅ PASS | `lead.service.ts:84–89` — `activityService.append(db, ctx, { type: ActivityType.LEAD_CREATED, ... relatedLeadId: created.id })`. Same transaction as create. |
| F-21 | Activity emitted on status change (LEAD_STATUS_CHANGED) | — | ✅ PASS | `lead.service.ts:142–153` — guarded by `input.status !== undefined && input.status !== existing.status`. Metadata includes `from`/`to`. |
| F-22 | Activity emitted on assignment change (LEAD_ASSIGNED) | — | ✅ PASS | `lead.service.ts:155–169` — guarded by `input.assignedToId !== undefined && input.assignedToId !== existing.assignedToId`. |
| F-23 | No activity emitted on softDelete (correct per spec) | — | ✅ PASS | `lead.service.ts:187–201` — only `repo.softDelete()` and `this.audit.record()` called. Spec says "deletion is its own audit type. Emit audit log." |
| F-24 | AuditRecorder called post-withTenant (best-effort pattern) | — | ✅ PASS | `lead.service.ts:95–100, 175–179, 196–200` — all `this.audit.record(...)` calls are outside the `withTenant` callback. Matches established platform pattern. |
| F-25 | PII masking in audit snapshots | — | ✅ PASS | `audit-recorder.ts:37–38` — `maskPii()` applied to `before`/`after` at the recorder level. `pii-masking.ts:7–8` — `/email/i` and `/phone/i` keys are recursively masked. `sanitizeLead()` in service strips `customFields` (large JSON blob); email and phone are masked by the recorder. Full PII coverage confirmed. |
| F-26 | Route permissions match execution plan | — | ✅ PASS | `lead.routes.ts:24` POST→`leads.create`; `L31` GET→`leads.read` (middleware resolves `_own` via `decide()`); `L38` PATCH→`leads.update`; `L45` DELETE→`leads.delete`. All match CRM-2.4 table. |
| F-27 | `validate(schema, 'params')` applied for routes with `:id` param | — | ✅ PASS | GET (L32), PATCH (L39–40), DELETE (L46). POST omitted correctly (no path param). |
| F-28 | Module composition root wired correctly | — | ✅ PASS | `modules/leads/index.ts:13` — `new PrismaAuditRecorder()` → `new LeadService(...)` → `createLeadController(...)` → `buildLeadRouter(...)`. Same pattern as rbac module. |
| F-29 | Leads router mounted in app.ts under authenticated chain | — | ✅ PASS | `app.ts:62` — `v1.use('/leads', buildLeadsModule(rbac.requirePermission))`. Mounted after `authMiddleware` and `tenantMiddleware`. |
| F-30 | No TODOs, stubs, or skipped tests | — | ✅ PASS | Grep confirms zero `TODO` comments, no `it.skip`, no `describe.skip`, no `return` stubs in any M2 file. |
| F-31 | Dynamic `import()` for AppError in `findByIdOrThrow` | LOW | ⚠ NOTE | `lead.repository.ts:52` — `const { AppError } = await import('../../core/errors/app-error.js')`. Non-idiomatic; a static import is standard. No circular dependency exists. Functional impact: none (dynamic import resolves synchronously from module cache). No code change required; note for M3+ consistency. |
| F-32 | Unused `export type { TenantContext }` in service | LOW | ⚠ NOTE | `lead.service.ts:212` — no caller imports `TenantContext` from this file; they import directly from `context.ts`. Dead re-export. Harmless but should be removed during M3 cleanup. |
| F-33 | Test ordering dependency within describe blocks | LOW | ⚠ NOTE | `leads.integration.test.ts:201–208` — dedup 409 test depends on 201 test having previously created `aarav@example.com`. PATCH tests are similarly ordered. Vitest runs tests sequentially within a describe block by default, so this works but is fragile. Not a blocker. |
| F-34 | Cross-org DELETE test conflates two 404 reasons | INFO | ⚠ NOTE | `leads.integration.test.ts:468–475` — the lead is already soft-deleted, so both the owner and orgB user get 404. The test validates isolation but the lead being deleted is an additional cause. Comment in the test acknowledges this. |
| F-35 | ActivityService signature deviates from plan spec | INFO | ✅ INTENTIONAL IMPROVEMENT | Plan CRM-4.1 specifies `append(ctx, input)`. Implementation is `append(db, ctx, input)`. Passing the caller's `TenantTransactionClient` is architecturally correct: it ensures the activity row and `lastActivityAt` update are atomic with the parent mutation. If ActivityService opened its own `withTenant`, an activity could be written for a lead that rolled back. The deviation is a correct engineering decision. All future callers (M3 contacts, M4 tasks) must pass `db` as the first argument — this should be noted in M3 handoff. |
| F-36 | Integration test suite covers ≥20 tests as required | — | ✅ PASS | 24 tests confirmed: 6 POST, 6 GET, 8 PATCH, 4 DELETE. Execution plan minimum is 20. |

---

## Detailed Evidence by Requirement

### CRM-2.1: Lead Repository

All 8 specified methods are present. The spec lists `count(filter)` — the implementation is `count()` with no explicit filter parameter because the tenant extension implicitly scopes all queries to `organizationId`. Equivalent behavior. `findManyWithFilter` is intentionally deferred to E6 per the plan's explicit out-of-scope table.

`TenantRepository.assertTenantScope()` fires at construction time (`tenant-repository.ts:28`). Any attempt to instantiate `PrismaLeadRepository` outside a `withTenant` scope throws `TenantScopeError`. This is the runtime guard that prevents unscoped queries from ever reaching the DB.

### CRM-2.2: Lead Service CRUD

| Operation | Plan requirement | Implementation | Status |
|-----------|-----------------|----------------|--------|
| create: plan limit check | `count >= PLAN_LIMITS[plan].leads` → 429 | Lines 57–68; returns 402 (error catalog definition) | ✅ (status code per catalog) |
| create: email dedup | `findByEmail` → 409 with existingLeadId | Lines 71–78 | ✅ |
| create: emit LEAD_CREATED activity | Same transaction | Lines 84–89 | ✅ |
| create: emit audit | Post-transaction, best-effort | Lines 95–100 | ✅ |
| update: status machine | Per CRM-2.3 | Lines 127–136 | ✅ |
| update: emit LEAD_STATUS_CHANGED | If status changed | Lines 141–153 | ✅ |
| update: emit LEAD_ASSIGNED | If assignedToId changed | Lines 155–169 | ✅ |
| update: emit audit | Post-transaction | Lines 175–179 | ✅ |
| softDelete: emit audit | Post-transaction | Lines 196–200 | ✅ |

### CRM-2.3: Status Machine

The plan specifies:
- WON not reachable via direct PATCH → enforced at schema (Zod, `patchLeadSchema`) AND service (`assertValidStatusTransition`)
- Terminal states (WON, LOST) cannot transition → enforced at service, line 30–36
- Any open → any open (including backtrack) → implicitly allowed
- Any open → LOST → allowed; LOST requires lostReason → lines 131–136
- LOST → anything → blocked (terminal)

The `assertValidStatusTransition` function is clean and correct. Its two guards cover all invalid cases:
1. `next === 'WON'` → always reject via PATCH
2. `current === 'WON' || current === 'LOST'` → terminal cannot transition

Everything else (open→open, open→LOST) falls through without restriction.

### CRM-2.4: Endpoints

```
POST   /api/v1/leads       → leads.create     → validate(createLeadSchema) → create()  ✓
GET    /api/v1/leads/:id   → leads.read       → validate(params) → getById()           ✓
PATCH  /api/v1/leads/:id   → leads.update     → validate(params) + validate(body) → update() ✓
DELETE /api/v1/leads/:id   → leads.delete     → validate(params) → softDelete()        ✓
```

`leads.read` permission correctly resolves `leads.read_own` via `decide()` in `permission-check.ts:25–28` (the `OWN_SCOPABLE` set includes `read`). Same for `leads.update` / `leads.update_own`. Route only specifies the base permission; the RBAC middleware handles the `_own` fallback automatically.

### Integration Test Coverage

All scenarios from the execution plan acceptance criteria are covered:

| Execution plan criterion | Test evidence |
|--------------------------|---------------|
| POST → 201; same email → 409 | Lines 188–208 |
| GET from org B → 404 | Lines 274–282 |
| PATCH invalid status → 422 | Lines 361–378 |
| POST plan limit → 402 (spec: 429; see F-11) | Lines 211–218 |
| SALES_EXECUTIVE read_own → 404 for unassigned | Lines 313–323 |
| No token → 401 | Lines 230–235 |
| Wrong org token → 403 | Lines 237–245 |

---

## Architecture Conformance

| Pattern | Auth/RBAC precedent | M2 implementation | Conforms |
|---------|---------------------|-------------------|----------|
| Composition root (`buildXModule`) | `buildRbacModule()` | `buildLeadsModule()` | ✅ |
| Service receives deps via constructor | `AuthService(repo, emailSender, ...)` | `LeadService(audit)` | ✅ |
| Controller is a plain object, not class | `buildRbacModule` returns controller functions | `createLeadController(service)` returns object | ✅ |
| `asyncHandler` in routes, not controller | Auth routes | Lead routes | ✅ |
| `validate(schema)` middleware | Auth routes | Lead routes | ✅ |
| `sendSuccess` for all successful responses | Auth controller | Lead controller | ✅ |
| `AppError` for all errors | All modules | Lead service | ✅ |
| Audit: post-withTenant, best-effort | `PrismaAuditRecorder` pattern from M5 | Lead service | ✅ |
| No cross-module DB access | RBAC → no direct auth table access | Lead → no contact/task table access | ✅ |
| Schemas in `packages/shared/src/schemas/` | `auth.ts` | `lead.ts` | ✅ |

No architectural regressions detected.

---

## Production Readiness Assessment

| Dimension | Assessment |
|-----------|------------|
| **Correctness** | All business rules from the execution plan are implemented and verified. Status machine, dedup, plan limit, ownOnly, and WON-exclusion are all enforced at the right layers. |
| **Tenant isolation** | Confirmed end-to-end: withTenant + TenantRepository + RLS. Cross-org reads return 404 (RLS hides rows). TenantScopeError fires if repository is instantiated outside a withTenant scope. |
| **Security** | No unscoped DB access. PII masked in audit snapshots at recorder level. Permissions enforced at route entry. |
| **Atomicity** | Activity insert and `lastActivityAt` denormalization occur in the same transaction as the parent mutation (ActivityService receives caller's db client). Audit write is intentionally separate (best-effort). |
| **Observability** | Audit writes created for all mutations. Activity feed populated for create/status change/assignment events. Audit write failures are logged, not propagated. |
| **Test coverage** | 24 integration tests; all 312 tests passing (0 failures, 1 pre-existing Redis skip). |
| **Type safety** | `pnpm typecheck` passes clean. |
| **Lint** | `pnpm lint` passes clean. |
| **Build** | `pnpm build` produces clean bundle. |
| **Low-risk deferred items** | Dynamic `import()` in repository (F-31), unused TenantContext re-export (F-32), test ordering fragility (F-33). None are blockers. |
| **Missing from M2 scope (by design)** | `findManyWithFilter` (E6), `POST /leads/:id/convert` (E3), phone dedup (no DB unique constraint; email is the dedup key). All explicitly deferred per execution plan. |

---

SPRINT 4 M2 APPROVED TO COMMIT.
