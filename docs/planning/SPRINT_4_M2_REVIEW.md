# Sprint 4 M2 — Lead Module Implementation Review

**Date:** 2026-06-19  
**Milestone:** Sprint 4 M2 (Lead Module — CRM-2.1 through CRM-2.4)  
**Status:** COMPLETE

---

## Deliverables

| Ref | Deliverable | File | Status |
|-----|-------------|------|--------|
| CRM-4.1 (partial) | ActivityService — append-only write path | `apps/api/src/core/activities/activity.service.ts` | ✓ |
| CRM-2.1 | Lead Zod schemas (shared) | `packages/shared/src/schemas/lead.ts` | ✓ |
| CRM-2.1 | Lead repository | `apps/api/src/modules/leads/lead.repository.ts` | ✓ |
| CRM-2.2 | Lead service (CRUD) | `apps/api/src/modules/leads/lead.service.ts` | ✓ |
| CRM-2.3 | Status machine (in service) | `apps/api/src/modules/leads/lead.service.ts` | ✓ |
| CRM-2.4 | Lead controller | `apps/api/src/modules/leads/lead.controller.ts` | ✓ |
| CRM-2.4 | Lead routes | `apps/api/src/modules/leads/lead.routes.ts` | ✓ |
| CRM-2.4 | Module composition root | `apps/api/src/modules/leads/index.ts` | ✓ |
| — | Shared package re-export | `packages/shared/src/index.ts` | ✓ |
| — | App wiring | `apps/api/src/app.ts` | ✓ |
| — | Integration tests (24 tests) | `apps/api/tests/integration/leads.integration.test.ts` | ✓ |

---

## Architecture Decisions

### ActivityService placement
`ActivityService` lives in `core/activities/` (not inside the leads module) because it is a shared cross-module concern. Contact, Task, Note, and File services (M3–M6) will import it from the same location. Its `append()` method accepts the caller's `TenantTransactionClient` rather than opening its own `withTenant`, which is the correct pattern for atomicity: the activity row and the `lastActivityAt` denormalization are committed in the same transaction as the parent mutation.

### WON exclusion from PatchLeadInput
`WON` is intentionally absent from `patchLeadSchema.status` enum. It is only reachable via `POST /leads/:id/convert` (M3). Sending `{ status: "WON" }` via PATCH returns 422 VALIDATION_ERROR from Zod before the service is reached. This is enforced at the schema layer (not just the service) so there is no code path that can accept WON via direct PATCH.

### Status machine
Terminal states (WON, LOST) cannot transition to any other state. WON → anything throws, LOST → anything throws. Any open state → any open state (including backwards: NEGOTIATION → NEW) is allowed. LOST requires `lostReason` when neither the incoming body nor the existing row already has one.

### ownOnly filter
The `requirePermission('leads.read')` guard sets `ctx.ownOnly = true` when the member holds `leads.read_own` but not `leads.read`. The service reads `ctx.ownOnly` and passes `ownedByUserId` to the repository's `findById` / `findByIdOrThrow`, which appends `assignedToId = ctx.userId` to the query. The RLS layer already restricts by `organizationId`; this is an additional application-level filter.

### Plan limit check
The service queries `db.subscription.findFirst({ select: { plan: true } })` inside the `withTenant` transaction (the tenant extension filters it to the active org automatically). If no subscription row exists, it defaults to `TRIAL` (500 leads). Count check is `count >= limit` before the INSERT.

### Audit recorder
`AuditRecorder.record()` is called **after** the `withTenant` transaction returns. This matches the existing pattern in `audit-recorder.ts`: it creates its own withTenant internally (best-effort; errors are logged, not propagated). The audit record contains a sanitized lead snapshot (customFields stripped).

---

## Validation Evidence

### Gate 1 — pnpm typecheck

```
@leados/shared typecheck: ✓ (no errors)
@leados/api typecheck:    ✓ (no errors)
```

Two type issues were found and fixed during development:
- `ActivityMetadata → Prisma.InputJsonValue` required double cast via `unknown` (discriminated union vs index-signature mismatch)
- Unused `OPEN_STATUSES` constant removed from `lead.service.ts`

### Gate 2 — pnpm lint

```
@leados/api lint: ✓ (no errors, no warnings)
```

### Gate 3 — pnpm build

```
@leados/shared build: ✓  dist/index.js 12.54 KB, dist/index.d.ts 22.27 KB
@leados/api build:    ✓  dist/server.js 63.30 KB (build success in 30ms)
```

### Gate 4 — pnpm test (force, no Turbo cache)

```
Test Files  44 passed (44)
Tests       312 passed | 1 skipped (313)
Duration    20.97s
```

The 1 skipped test is the pre-existing `queue-roundtrip.test.ts` skip (Redis not required locally).

---

## Integration Test Coverage (leads.integration.test.ts)

24 tests across 4 describe blocks:

| # | Scenario | Expected |
|---|----------|----------|
| 1 | POST happy path (OWNER) | 201, organizationId = orgA |
| 2 | POST email duplicate | 409 CONFLICT |
| 3 | POST plan limit exceeded (TRIAL org seeded to 500) | 402 PLAN_LIMIT_EXCEEDED |
| 4 | POST missing firstName | 422 VALIDATION_ERROR, fields.firstName |
| 5 | POST no auth | 401 |
| 6 | POST non-member token claims orgA | 403 (tenant middleware rejects) |
| 7 | GET OWNER fetches own org's lead | 200 |
| 8 | GET orgB user requests orgA lead ID | 404 (RLS isolation) |
| 9 | GET unknown UUID | 404 NOT_FOUND |
| 10 | GET invalid UUID param | 422 |
| 11 | GET SALES_EXECUTIVE (ownOnly), assigned lead | 200 |
| 12 | GET SALES_EXECUTIVE (ownOnly), unassigned lead | 404 |
| 13 | PATCH open → open (NEW → CONTACTED) | 200, status updated |
| 14 | PATCH open → LOST with lostReason | 200, lostReason persisted |
| 15 | PATCH status WON (Zod rejects) | 422 VALIDATION_ERROR |
| 16 | PATCH LOST → NEW (terminal cannot transition) | 422 VALIDATION_ERROR |
| 17 | PATCH LOST without lostReason (no existing lostReason) | 422 |
| 18 | PATCH empty body | 422 |
| 19 | PATCH orgB user requests orgA lead | 404 (RLS isolation) |
| 20 | PATCH field update without status change | 200, firstName updated |
| 21 | DELETE soft delete | 204 |
| 22 | GET after soft delete | 404 |
| 23 | DELETE already-deleted lead | 404 |
| 24 | DELETE orgB user requests orgA lead | 404 (RLS isolation) |

### Cross-org isolation behavior (tests 8, 19, 24)
RLS returns 404 (not 403) for cross-org data access when the requesting user is a valid member of their own org — the row simply does not exist from their perspective. This is the correct and expected behavior. 403 is reserved for membership failures (test 6: user claims orgA membership but has none).

### Plan limit test methodology
`orgLimited` is seeded at exactly 500 leads via a single `generate_series` bulk INSERT in `beforeAll`. The plan limit test then fires a POST via HTTP — the service queries the count (500), compares against `PLAN_LIMITS.TRIAL.leads` (500), and rejects with 402. Cleanup uses `SET LOCAL session_replication_role = replica` inside a transaction to bypass the activities immutability trigger during cascade deletion.

---

## Files Changed

```
apps/api/src/app.ts                                         (modified — leads router wired)
apps/api/src/core/activities/activity.service.ts            (new)
apps/api/src/modules/leads/index.ts                         (new)
apps/api/src/modules/leads/lead.controller.ts               (new)
apps/api/src/modules/leads/lead.repository.ts               (new)
apps/api/src/modules/leads/lead.routes.ts                   (new)
apps/api/src/modules/leads/lead.service.ts                  (new)
apps/api/tests/integration/leads.integration.test.ts        (new)
packages/shared/src/index.ts                                (modified — re-exports lead schemas)
packages/shared/src/schemas/lead.ts                         (new)
```

---

## Known Constraints and Deferred Items

| Item | Reason deferred |
|------|-----------------|
| `pipelineStageId` on Lead | Schema field exists but pipeline module (M5) not yet built |
| `mergedIntoLeadId` on Lead | Merge operation not in M2 scope |
| `POST /leads/:id/convert` (WON) | Contact module (M3) prerequisite |
| Lead list / pagination endpoint | Not in M2 scope per execution plan |
| Phone dedup | Schema has no unique constraint on phone; email is the dedup key |

---

## Readiness Recommendation

**APPROVED for commit.**

All 5 validation gates pass. 24 integration tests cover the full happy path, all error branches in the execution plan (plan limit, dedup, status machine, ownOnly, RBAC), and RLS isolation. No skipped CRM suites. Architecture matches the M1-established patterns exactly (withTenant, TenantRepository, asyncHandler, validate, sendSuccess, AuditRecorder).
