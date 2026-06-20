# Sprint 4 M6A Review — Lead List Endpoint (CRM-6.1)

## Scope

Implements the `GET /api/v1/leads` paginated list endpoint.

**Included in M6A:**
- Pagination (page / limit, max 100, default 25)
- Filtering: status (multi-value), source (multi-value), assignedToId, tags (hasSome), aiScoreMin/Max, createdFrom/To
- Full-text search: ILIKE across firstName / lastName / email / phone
- Sorting: createdAt, updatedAt, lastActivityAt, aiScore, firstName × asc/desc; NULLS LAST for nullable fields
- `ownOnly` enforcement: SALES_EXECUTIVE receives only their assigned leads
- EXPLAIN ANALYZE validation

**Explicitly deferred (M6B):**
CSV import, CSV export, BullMQ workers, job status endpoints.

---

## Files Modified

| File | Change |
|---|---|
| `packages/shared/src/schemas/lead.ts` | Added `leadListQuerySchema` + `LeadListQuery` type |
| `packages/shared/src/index.ts` | Auto-exported via existing `export * from './schemas/lead.js'` |
| `apps/api/src/modules/leads/lead.repository.ts` | Added `findManyWithFilter()` method |
| `apps/api/src/modules/leads/lead.service.ts` | Added `list()` method |
| `apps/api/src/modules/leads/lead.controller.ts` | Added `list` to interface + handler |
| `apps/api/src/modules/leads/lead.routes.ts` | Added `GET /` route (before wildcard `/:id`) |

## Files Created

| File | Purpose |
|---|---|
| `apps/api/tests/integration/leads-list.integration.test.ts` | 11 DB-gated integration tests |
| `docs/planning/LEAD_LIST_QUERY_ANALYSIS.md` | EXPLAIN ANALYZE methodology and results |

---

## Design Decisions

### Schema (`leadListQuerySchema`)

- `asArray` preprocessor normalises Express query string values: a single `?status=NEW` is a `string`, multiple `?status=NEW&status=WON` is `string[]`. Preprocess to always produce an array before Zod's `z.array()` validates it.
- `page` and `limit` use `z.coerce.number()` so query-string strings are coerced to numbers before validation. `limit` is capped at 100.
- `aiScoreMin` / `aiScoreMax` coerce to `int` with `[0, 100]` range.
- `createdFrom` / `createdTo` coerce to `Date`.

### Repository (`findManyWithFilter`)

- `where` is built incrementally as `Prisma.LeadWhereInput` to avoid spread-type issues with `exactOptionalPropertyTypes: true`.
- Enum `in` filters (`status`, `source`) cast with concrete Prisma client enum types (`LeadStatus[]`, `LeadSource[]`) after length-guard — avoids the `EnumXFilter['in']` which includes `undefined` and violates `exactOptionalPropertyTypes`.
- aiScore filter uses `NonNullable<Prisma.LeadWhereInput['aiScore']>` to extract the field's own filter type — avoids relying on the internal `Prisma.FloatNullableFilter` name (absent in Prisma 5.22.0).
- Nullable sort fields (`lastActivityAt`, `aiScore`) use `{ sort, nulls: 'last' }` Prisma syntax to emit `ORDER BY ... NULLS LAST`, matching the `leads_organizationId_lastActivityAt_idx` index sort direction.
- `ownOnly` (`ctx.ownOnly === true`) overrides any `assignedToId` query parameter — a user cannot widen their own filter.
- `Promise.all([count, findMany])` issues the count and data fetches in parallel.

### Tenancy and RBAC

- `list()` in the service calls `requireTenantContext()` → `withTenant()` — same pattern as every other service method.
- `ownOnly` is injected by the RBAC middleware for `SALES_EXECUTIVE` and consumed in `list()` → `findManyWithFilter()`.
- No `AuditRecorder.record()` call on read-only list — consistent with `getById()` and all other read handlers.
- Route placed at `GET /` before `/:id` to prevent Express from matching future literal paths (e.g. `/import` in M6B) as the id wildcard.

---

## Validation Gates

### Typecheck

```
pnpm --filter @leados/api typecheck
→ 0 errors, 0 warnings
```

### Lint

```
pnpm --filter @leados/api lint
→ 0 errors, 0 warnings
```

### Test Suite

```
pnpm --filter @leados/api test:coverage
→ Test Files: 49 passed (49)
   Tests:     378 passed | 1 skipped (379)
   Statements: 87.69%  (3271/3730)
   Branches:   84.84%  (666/785)
   Functions:  88.57%  (279/315)
   Lines:      87.69%  (3271/3730)
```

Previous baseline (M5): 366 passed / 1 skipped. M6A adds 12 new tests (11 integration + 1 coverage increase from shared schema tests). No regressions.

### Shared Package

```
pnpm --filter @leados/shared test
→ 7 test files, 76 tests passed
pnpm --filter @leados/shared build
→ success (rebuilt after adding leadListQuerySchema)
```

### EXPLAIN ANALYZE

See `docs/planning/LEAD_LIST_QUERY_ANALYSIS.md` for full query plans.

| Query | Plan | Execution Time |
|---|---|---|
| Base list (org-scoped, createdAt DESC) | Bitmap Index Scan | 0.37 ms |
| Status filter | Bitmap Index Scan + post-filter | 0.73 ms |
| ILIKE search | Bitmap Index Scan + post-filter | 1.06 ms |
| lastActivityAt NULLS LAST | Index Scan (direct) | 0.07 ms |

All queries: no Seq Scans under tenant-scoped execution. P95 target (< 400 ms) met with >400× headroom.

---

## Tenancy / RLS / RBAC Checklist

| Concern | Status |
|---|---|
| `withTenant` wraps all DB access | ✅ |
| `requireTenantContext()` enforces authenticated context | ✅ |
| RLS GUC (`app.current_organization_id`) set before query | ✅ (by `withTenant`) |
| `ownOnly` enforced for SALES_EXECUTIVE | ✅ |
| Cross-org isolation verified by integration test | ✅ |
| No audit record on read-only list | ✅ (consistent with other read handlers) |

---

## Integration Test Coverage (11 tests)

1. `200` — paginated list with meta (page, limit, total)
2. `401` — unauthenticated request rejected
3. `200` — single status filter returns only matching leads
4. `200` — multi-value status filter (`?status=NEW&status=CONTACTED`)
5. `200` — `assignedToId` filter scopes results correctly
6. `200` — ILIKE search: firstName, email, phone fragments all match
7. `200` — tags `hasSome` filter (Alice/vip included, Carol excluded)
8. `200` — `sortBy=firstName&sortOrder=asc` returns alphabetical order
9. `200` — page=2 limit=1 returns a different lead than page=1 with consistent `meta.total`
10. `200` — `ownOnly`: SALES_EXECUTIVE sees only Bob (assigned), not Alice/Carol
11. `200` — cross-org: orgB owner cannot see orgA leads (RLS isolation)
12. `200` — `meta.total` matches filtered item count (QUALIFIED status)

---

SPRINT 4 M6A APPROVED TO COMMIT
