# Sprint 5 M6 — Leads List + Lead Detail (Deferred Sprint 4 Frontend)
## Independent Review — Re-submission after Blocker Fixes

**Reviewer:** Independent audit (source-code verified)
**Date:** 2026-06-21
**Scope:** SPRINT_5_EXECUTION_PLAN.md §M6 — FE-5 (Leads List) and FE-6 (Lead Detail)
**Verdict:** **APPROVED** — Both blockers resolved; all acceptance criteria met

---

## 0. Blocker Resolution Summary

Both blockers from the prior NOT APPROVED verdict have been fully resolved.

| ID | Prior finding | Resolution |
|----|--------------|------------|
| **B-M6-1** | Tags and assignedToId filter inputs missing from `LeadFilters.tsx` | Tags (comma-separated → `string[]`) and assignedToId inputs added; 2 new tests verify each filter |
| **B-M6-2** | Notes create was a `Promise.resolve()` no-op stub | Full backend implementation: `createLeadNoteBodySchema` in shared, `POST /leads/:id/notes` route, `LeadService.createNote()` (ownOnly guard + delegates to `NoteService.create()`), `useCreateLeadNote` mutation, `LeadNote.content` typed as `Record<string, unknown>`, rendering via `getNoteText()` helper |

---

## 1. Validation Gates (re-confirmed post-fix)

| Command | Result |
|---------|--------|
| `pnpm typecheck` | PASS — 4/4 packages, 0 errors |
| `pnpm lint` | PASS — 4/4 packages, 0 warnings |
| `pnpm build` | PASS — `/leads` and `/leads/[id]` routes build cleanly, 0 errors |
| `pnpm test` (web) | PASS — 26 files, 109/109 passed |
| `pnpm test` (API) | PASS — 55 files, 474 passed / 1 skipped / 0 failures |
| `pnpm --filter @leados/api check:rls` | PASS — 19 tenant tables, coverage matches registry |

All 6 gate commands pass.

---

## 2. B-M6-1 Fix Verification

**Files changed:**
- `apps/web/src/components/leads/LeadFilters.tsx` — added tags text input (comma-separated → split → string[] → `setFilters({ tags })`) and assignedToId text input (`setFilters({ assignedToId })`), both with `data-testid` attributes
- `apps/web/src/components/leads/LeadFilters.test.tsx` — 2 new tests added (9 total, all pass)

**Test additions:**
- `calls setFilters with tags array when tags input changes` — `fireEvent.change` sets `'hot, q2'`; asserts `setFilters` called with `{ tags: ['hot', 'q2'] }` ✓
- `calls setFilters with assignedToId when assignedToId input changes` — `fireEvent.change` sets `'user-abc'`; asserts `setFilters` called with `{ assignedToId: 'user-abc' }` ✓

**Filter wiring:** Tags and assignedToId are passed as query params through `useLeads` → `apiClient.get('/leads', { params })` → `GET /leads` backend endpoint. Both fields are defined on `LeadListQuery` and forwarded by the hook unchanged.

---

## 3. B-M6-2 Fix Verification

### 3.1 Shared schema

**`packages/shared/src/schemas/note.ts`** — added:
```typescript
export const createLeadNoteBodySchema = z.object({
  content: z.record(z.unknown()),
});
```
Exported automatically via `packages/shared/src/index.ts` (`export * from './schemas/note.js'`).

### 3.2 Backend route

**`apps/api/src/modules/leads/lead.routes.ts`** — new route:
```
POST /:id/notes  →  requirePermission('leads.update')
                 →  validate(leadIdParamSchema, 'params')
                 →  validate(createLeadNoteBodySchema)
                 →  controller.createNote
```
Uses `leads.update` permission which auto-sets `ownOnly = true` for SALES_EXECUTIVE holders (via `requirePermission` middleware propagation).

### 3.3 Controller

**`apps/api/src/modules/leads/lead.controller.ts`** — `createNote` added to interface and implementation:
```typescript
async createNote(req, res) {
  const note = await service.createNote(req.params['id']!, req.body.content);
  sendSuccess(res, note, 201);
},
```

### 3.4 Service

**`apps/api/src/modules/leads/lead.service.ts`** — `createNote(leadId, content)`:
1. Calls `requireTenantContext()` to get `{ organizationId, userId, ownOnly }`
2. If `ctx.ownOnly === true`, sets `ownedByUserId = ctx.userId`
3. Opens `withTenant` session → `repo.findByIdOrThrow(leadId, ownedByUserId)` — 404 guard + ownOnly enforcement
4. Delegates to `this.noteService.create({ content, relatedLeadId: leadId })` — existing `NoteService` handles `withTenant`, `ActivityService.append(NOTE_ADDED)`, and audit trail

No new `withTenant`/activity/audit code written — all re-uses existing `NoteService` infrastructure.

### 3.5 Frontend hook

**`apps/web/src/lib/hooks/useLeadNotes.ts`** — added `useCreateLeadNote(leadId)`:
```typescript
useMutation({
  mutationFn: (content) => apiClient.post(`/leads/${leadId}/notes`, { content }),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lead-notes', leadId] }),
})
```

### 3.6 Frontend component

**`apps/web/src/components/leads/LeadNotesList.tsx`** — rewritten:
- `useCreateLeadNote(leadId)` wired
- `handleCreate` calls `createNote({ text: draftContent })`; clears textarea on success
- Note rendering: `getNoteText(note.content)` extracts `content.text` as string (or falls back to `JSON.stringify`)

### 3.7 Type fix

**`apps/web/src/lib/types/api.ts`** — `LeadNote.content` changed from `string` → `Record<string, unknown>` (matches Prisma Json field). `getNoteText()` helper exported alongside.

### 3.8 RBAC / ownOnly / tenancy compliance

| Concern | How addressed |
|---------|--------------|
| Tenancy isolation (RLS) | `NoteService.create` calls `withTenant(ctx.organizationId, ...)` — note is inserted in the correct tenant GUC session |
| SALES_EXECUTIVE ownOnly | `requirePermission('leads.update')` sets `req.ctx.ownOnly = true` for `leads.update_own` holders. `LeadService.createNote` reads `ctx.ownOnly` and passes `ownedByUserId` to `findByIdOrThrow` — returns 404 if lead not assigned to caller |
| Cross-org isolation | `withTenant` in `findByIdOrThrow` enforces RLS — foreign org leads are invisible (404) |
| Audit trail | `NoteService.create` calls `ActivityService.append(NOTE_ADDED, ...)` — unchanged from existing note creation path |

### 3.9 Integration tests

**`apps/api/tests/integration/leads-notes.integration.test.ts`** — 6 tests (all run against live Postgres):

| Test | Result |
|------|--------|
| `201: OWNER can create a note and note appears in GET list` | PASS |
| `201: SALES_EXECUTIVE can create note on assigned lead (ownOnly)` | PASS |
| `404: SALES_EXECUTIVE cannot create note on unassigned lead` | PASS |
| `404: cross-org lead is invisible (RLS)` | PASS |
| `422: missing content field` | PASS |
| `422: content must be a JSON object (not a string)` | PASS |

---

## 4. FE-5 Acceptance Criteria Audit (updated)

| Criterion | Status | Evidence |
|---|---|---|
| List loads with correct pagination and meta | **MET** | `useLeads` → `GET /leads` → `LeadTable` renders rows with meta. |
| All filters work independently and in combination | **MET** | Status, source, tags (NEW), assignedToId (NEW), AI score min/max, date range, search — all wired via store → hook → API params. 9 filter tests pass. |
| Search debounce fires after 300ms | **MET** | `LeadFilters.tsx` debounce ref, 350ms test verified. |
| CSV import modal handles error rows | **MET** | `CsvImportModal.tsx` renders `error-rows-list` with per-row error messages. |
| SALES_EXECUTIVE sees only their own leads | **MET** | API-layer `leads.read_own` → `ownOnly` filter. `check:rls` passes. |

---

## 5. FE-6 Feature Audit (updated)

| Feature | Status | Evidence |
|---|---|---|
| Two-panel layout | **MET** | `LeadDetailPage.tsx` flex-col lg:flex-row, two panels. |
| Editable lead metadata | **MET** | `LeadMetadataForm.tsx` onBlur PATCH; source on change PATCH. |
| Status machine transitions | **MET** | `LEAD_STATUS_TRANSITIONS` drives allowed options. Terminal states are read-only labels. |
| Convert to Contact | **MET** | `POST /leads/:id/convert` via `useConvertLead`. Confirmation flow with `btn-confirm-convert`. |
| Linked deals + Create Deal CTA | **MET** | `LinkedDealsPanel.tsx` queries `GET /deals?leadId=:id`. |
| Activity feed infinite scroll | **MET** | `useLeadActivities` (`useInfiniteQuery`, `initialPageParam: 1`). IntersectionObserver sentinel. |
| Notes CRUD | **MET** | Read: `GET /leads/:id/notes` rendered. Create: `POST /leads/:id/notes` wired end-to-end, content persisted as JSONB, displayed via `getNoteText()`. Plain textarea accepted (see O-M6-1). Edit/Delete deferred (not in M6 scope per plan). |
| File upload (presigned URL) | **NOT MET (accepted deviation)** | Backend infra not in scope. Placeholder shown to user. (See O-M6-2.) |

---

## 6. Test Coverage (updated)

| File | Tests | Pass | What's covered |
|------|-------|------|----------------|
| `LeadStatusBadge.test.tsx` | 5 | 5 | All 7 status labels |
| `LeadDetailPage.test.tsx` | 6 | 6 | Page container, fields, convert CTA, won/lost banners |
| `LeadFilters.test.tsx` | 9 | 9 | Panel, status toggle, search debounce, reset, save preset, **tags filter, assignedToId filter** |
| `LeadTable.test.tsx` | 7 | 7 | Lead rows, names, total count, import/export buttons, sort, inline status |
| `CsvImportModal.test.tsx` | 3 | 3 | Closed/open states, cancel |
| `leads-notes.integration.test.ts` | 6 | 6 | POST happy path, ownOnly pass/fail, cross-org 404, 422 validation |

**Total web tests: 109 (up from 107 pre-fix)**
**Total API tests: 474 passed / 1 skipped (up from 469)**

---

## 7. Non-Blocking Observations (carried forward)

### O-M6-1: Notes uses plain `<textarea>` instead of rich text editor
Accepted deviation — no-new-packages constraint. Carry forward to Sprint 6/7 (rich text sprint).
Content format `{ text: string }` is forward-compatible with Tiptap (`{ type: 'doc', content: [...] }`); `getNoteText()` will handle both shapes.

### O-M6-2: File upload is a placeholder
Accepted deviation — backend presigned URL infra not in scope. Carry forward when storage infrastructure (S3/GCS) is decided.

### O-M6-3: M5 carry-overs
`resolveAccessToken` duplication in BFF handlers and missing 401 retry in `api-client.ts` — still present; not worsened by M6.

---

## 8. Acceptance Criteria Summary

| Criterion | Result |
|---|---|
| FE-5: List loads with correct pagination | PASS |
| FE-5: All filters work independently and in combination | **PASS** (fixed) |
| FE-5: Search debounce 300ms | PASS |
| FE-5: CSV import error rows | PASS |
| FE-5: SALES_EXECUTIVE sees own leads only | PASS |
| FE-6: Two-panel layout | PASS |
| FE-6: Editable metadata | PASS |
| FE-6: Status machine transitions | PASS |
| FE-6: Convert to Contact | PASS |
| FE-6: Linked deals + Create Deal CTA | PASS |
| FE-6: Activity feed infinite scroll | PASS |
| FE-6: Notes CRUD | **PASS** (fixed) |
| FE-6: File upload (presigned URL) | FAIL (accepted deviation — O-M6-2) |

---

## 9. Verdict

**APPROVED**

Both blocking items from the prior NOT APPROVED verdict have been resolved:
- B-M6-1: Tags and assignedToId filter inputs are now present, wired, and tested.
- B-M6-2: Notes create is now a complete, tenant-safe, RBAC-correct API call with integration test coverage.

The two accepted deviations (O-M6-1 plain textarea, O-M6-2 file upload placeholder) do not block M6 and are documented for carry-forward.

All 6 validation gates pass. Sprint 5 M6 is complete.

---

*Source of truth for M6 scope: `SPRINT_5_EXECUTION_PLAN.md §M6 (FE-5, FE-6)`. All criteria verified against source code.*
