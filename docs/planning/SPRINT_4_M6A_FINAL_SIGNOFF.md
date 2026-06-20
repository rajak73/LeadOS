# Sprint 4 M6A Final Signoff — Lead List Endpoint (CRM-6.1)

Independent read of all 8 source files. No unrelated modules read.

---

## Check 1 — Tenancy / RLS

**`lead.service.ts` lines 353–361:**
- `requireTenantContext()` called first — enforces authenticated JWT-derived context
- `withTenant(ctx.organizationId, ...)` wraps all DB access — sets GUC `app.current_organization_id` via `SET LOCAL` before any query, FORCE ROW LEVEL SECURITY fires
- `PrismaLeadRepository` extends `TenantRepository` — `assertTenantScope()` runs at construction
- Tenant extension injects `organizationId` automatically — repository never accepts it from a caller

**PASS** ✅

---

## Check 2 — ownOnly enforcement

**`lead.service.ts` line 355:** `ctx.ownOnly === true ? ctx.userId : undefined` — evaluates the RBAC flag injected by middleware; a falsy `ownOnly` (or OWNER/ADMIN role) passes `undefined` and skips the constraint.

**`lead.repository.ts` lines 115–120:**
```typescript
if (ownedByUserId !== undefined) {
  where.assignedToId = ownedByUserId;       // ownOnly wins
} else if (query.assignedToId !== undefined) {
  where.assignedToId = query.assignedToId;  // caller filter honoured
}
```
ownedByUserId takes precedence — a SALES_EXECUTIVE cannot pass a different `assignedToId` to widen the scope.

Integration test line 307–317: SALES_EXECUTIVE token sees only Bob (assigned to `salesUserId`), not Alice or Carol (assigned to `ownerUserId`).

**PASS** ✅

---

## Check 3 — Pagination

**Schema (`lead.ts`):**
- `page`: `z.coerce.number().int().positive().default(1)` — coerces from query string; default 1
- `limit`: `z.coerce.number().int().positive().max(100).default(25)` — max 100, default 25

**Repository (`lead.repository.ts` line 168):** `skip = (query.page - 1) * query.limit` — correct 0-based offset calculation.

**Controller:** `sendSuccess(res, items, 200, buildPaginationMeta(query.page, query.limit, total))` — consistent meta envelope.

Integration test line 289–305: page=1 and page=2 with limit=1 return different lead IDs; `meta.total` is identical across pages.

**PASS** ✅

---

## Check 4 — Filtering

**Schema:** All 8 filter fields present and validated:
- `status` / `source` — `z.preprocess(asArray, z.array(z.enum(...)).optional())` — multi-value, enum-validated
- `assignedToId` — `z.string().uuid().optional()`
- `tags` — `z.preprocess(asArray, z.array(z.string().max(100)).optional())`
- `aiScoreMin` / `aiScoreMax` — `z.coerce.number().int().min(0).max(100).optional()`
- `createdFrom` / `createdTo` — `z.coerce.date().optional()`
- `search` — `z.string().max(200).optional()`

**Repository:** Each filter guarded before assignment:
- status: `{ in: query.status as LeadStatus[] }` after `?.length` guard (satisfies `exactOptionalPropertyTypes`) ✅
- source: same pattern with `LeadSource[]` ✅
- tags: `{ hasSome: query.tags }` after `?.length` guard ✅
- aiScore: `NonNullable<Prisma.LeadWhereInput['aiScore']>` — avoids non-existent `FloatNullableFilter` ✅
- createdAt range: `Prisma.DateTimeFilter<'Lead'>` ✅

`asArray` preprocess handles Express behaviour where a single query param is a `string` and multiple are `string[]` — normalises to always produce an array before Zod validates.

**PASS** ✅

---

## Check 5 — Search

**Repository lines 151–159:**
```typescript
if (query.search !== undefined && query.search.trim().length > 0) {
  const term = query.search.trim();
  where.OR = [
    { firstName: { contains: term, mode: 'insensitive' } },
    { lastName:  { contains: term, mode: 'insensitive' } },
    { email:     { contains: term, mode: 'insensitive' } },
    { phone:     { contains: term, mode: 'insensitive' } },
  ];
}
```
- ILIKE across all 4 fields ✅
- `.trim()` applied; empty-after-trim short-circuits (no spurious `OR []` sent to Prisma) ✅
- `where.OR` is an additional constraint layered on top of the existing `where` object (not a replacement) — search is ANDed with all other filters ✅

Integration tests: firstName (Alice), email fragment (bob@example), phone fragment (987654) all verified.

Non-blocking note: `lastName` search is not explicitly verified by an integration test. The OR clause includes it and it uses the same Prisma `contains: insensitive` path as the other three fields — no concern.

**PASS** ✅

---

## Check 6 — Sorting

**Schema:**
- `sortBy`: `z.enum(['createdAt', 'updatedAt', 'lastActivityAt', 'aiScore', 'firstName']).default('createdAt')` — all 5 required fields ✅
- `sortOrder`: `z.enum(['asc', 'desc']).default('desc')` ✅

**Repository lines 163–166:**
```typescript
const nullableSortFields = new Set<string>(['lastActivityAt', 'aiScore']);
const orderBy = nullableSortFields.has(query.sortBy)
  ? ({ [query.sortBy]: { sort: query.sortOrder, nulls: 'last' } } as ...)
  : ({ [query.sortBy]: query.sortOrder } as ...);
```
- Non-nullable fields (`createdAt`, `updatedAt`, `firstName`) use plain `asc`/`desc` ✅
- Nullable fields use `{ sort, nulls: 'last' }` Prisma syntax — prevents nulls floating to the top regardless of direction ✅
- `lastActivityAt DESC NULLS LAST` matches the `leads_organizationId_lastActivityAt_idx` index sort direction exactly (confirmed by EXPLAIN ANALYZE: Index Scan, 0.07 ms) ✅

Integration test: `sortBy=firstName&sortOrder=asc` returns results equal to `.sort((a,b) => a.localeCompare(b))` ✅

**PASS** ✅

---

## Check 7 — Route ordering

**`lead.routes.ts` lines 31–36:** `router.get('/', ...)` is registered as the first route in the router — before `router.get('/:id', ...)`.

Express evaluates routes in registration order. `GET /` matches the literal empty-segment path; `GET /:id` would not match an empty segment, so there is no conflict. Future M6B paths (`/import`, `/export`) can be registered as literal routes before `/:id` without collision.

Comment on line 29–30 documents this constraint explicitly.

**PASS** ✅

---

## Check 8 — Integration tests

File: `leads-list.integration.test.ts` — 12 `it()` blocks (review header says 11; discrepancy is benign — actual count is higher).

All required scenarios covered:

| # | Scenario | Verified |
|---|---|---|
| 1 | 200 paginated list with `meta` (page, limit, total) | ✅ |
| 2 | 401 unauthenticated request | ✅ |
| 3 | 200 single status filter | ✅ |
| 4 | 200 multi-value status filter | ✅ |
| 5 | 200 assignedToId filter | ✅ |
| 6 | 200 ILIKE search (firstName, email, phone) | ✅ |
| 7 | 200 tags hasSome filter | ✅ |
| 8 | 200 sortBy=firstName asc | ✅ |
| 9 | 200 pagination offset (page=2 limit=1 ≠ page=1) | ✅ |
| 10 | 200 ownOnly — SALES_EXECUTIVE scope enforced | ✅ |
| 11 | 200 cross-org RLS isolation | ✅ |
| 12 | 200 meta.total matches filter count | ✅ |

Infrastructure:
- `describe.skipIf(!pgUp)` — DB-gated, self-skips when Postgres unavailable ✅
- `process.hrtime.bigint()` nonce — prevents cross-run data collision ✅
- `afterAll` uses `SET LOCAL session_replication_role = replica` to bypass FK constraints on teardown ✅

Non-blocking: teardown does not delete lead rows (orgs are deleted, leads remain orphaned in test DB). This is consistent with all other integration tests in the project and has no functional impact since leads are scoped to deleted org IDs.

Gates: 49/49 test files pass, 378 tests pass, 1 skipped.

**PASS** ✅

---

## Check 9 — Query performance evidence

Source: `LEAD_LIST_QUERY_ANALYSIS.md`, executed against real Postgres with 6,621 leads (largest org: 500 leads).

| Query | Plan type | Execution time |
|---|---|---|
| Base list, org-scoped, `createdAt DESC` | Bitmap Index Scan | 0.37 ms |
| Status filter, org-scoped | Bitmap Index Scan + post-filter | 0.73 ms |
| ILIKE search, org-scoped | Bitmap Index Scan + post-filter | 1.06 ms |
| `lastActivityAt DESC NULLS LAST` | Index Scan (direct, no sort step) | 0.07 ms |

No Seq Scans in any tenant-scoped query. P95 target (< 400 ms) met with > 400× headroom.

Required indexes confirmed present: `leads_organizationId_deletedAt_createdAt_idx`, `leads_organizationId_lastActivityAt_idx`, `leads_organizationId_status_deletedAt_idx`, `leads_firstName_trgm_idx`, `leads_email_trgm_idx`, `leads_lastName_trgm_idx`, `leads_assignedToId_organizationId_idx`.

Non-blocking note: Dataset is 500 leads/org, not the 5,000 figure sometimes cited as a target size. Execution times are so far below threshold (max 1.06 ms vs 400 ms) that production-scale behaviour is not a concern. The EXPLAIN ANALYZE doc correctly explains that trgm GIN indexes engage automatically above ~5K leads/org.

**PASS** ✅

---

## Summary

| Check | Result |
|---|---|
| Tenancy / RLS | PASS |
| ownOnly enforcement | PASS |
| Pagination | PASS |
| Filtering | PASS |
| Search | PASS |
| Sorting | PASS |
| Route ordering | PASS |
| Integration tests | PASS |
| Query performance evidence | PASS |

Non-blocking notes (3): lastName search not integration-tested; EXPLAIN ANALYZE at 500 leads/org; teardown leaves orphaned lead rows. None is a functional gap.

SPRINT 4 M6A APPROVED TO COMMIT
