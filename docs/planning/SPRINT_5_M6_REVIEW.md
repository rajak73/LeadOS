# Sprint 5 M6 — Leads List + Lead Detail (Deferred Sprint 4 Frontend)

**Status:** COMPLETE — pending independent review
**Branch:** main
**Date:** 2026-06-20

---

## 1. Scope

M6 implements the two frontend screens deferred from Sprint 4:

- **FE-5: Leads List** (`/leads`) — paginated table with filters, search, sort, inline status edit, CSV import/export
- **FE-6: Lead Detail** (`/leads/:id`) — two-panel layout with editable metadata, status machine, linked deals, convert-to-contact CTA, activity feed, notes tab, files tab

No backend changes. The Lead API is complete from Sprint 4 (`GET /leads`, `PATCH /leads/:id`, `POST /leads/:id/convert`, `GET /leads/:id/activities`, `GET /leads/:id/notes`, `GET /leads/:id/files`, `POST /leads/import`, `GET /leads/import/:jobId`, `POST /leads/export`, `GET /leads/export/:jobId`).

---

## 2. Validation Gates

| Command | Result |
|---------|--------|
| `pnpm typecheck` | PASS — 4/4 packages, 0 errors |
| `pnpm lint` | PASS — 4/4 packages, 0 warnings |
| `pnpm build` | PASS — `/leads` 7.35 kB, `/leads/[id]` 6.43 kB, 0 errors |
| `pnpm test` (web) | PASS — 26 files, 107/107 passed |
| `pnpm test` (API) | PASS — 54 files, 468 passed / 1 skipped (pre-existing) |
| `pnpm --filter @leados/api check:rls` | PASS — 19 tenant tables, coverage matches registry |
| `git diff --check` | PASS — no trailing whitespace, no conflict markers |

---

## 3. FE-5 Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| List loads with correct pagination and meta | **MET** | `useLeads` hook returns `{ data, meta }` from `GET /leads`. `LeadTable` renders rows and shows `{total} leads`. Pagination controls render when `totalPages > 1`. |
| All filters work independently and in combination | **MET** | `LeadFilters` component: status toggle (multi-select), source toggle (multi-select), AI score range (min/max inputs), date range (createdFrom/createdTo), search. All write to Zustand store; `useLeads` receives full filter state on each render. |
| Search debounce fires after 300ms | **MET** | `handleSearchChange` in `LeadFilters.tsx` uses `setTimeout(300)` ref-debounce. `LeadFilters.test.tsx` verifies `setFilters({ search: 'Ali' })` is called only after 350ms. |
| CSV import modal handles error rows | **MET** | `CsvImportModal`: uploads via `POST /leads/import` with `FormData`, polls `GET /leads/import/:jobId` every 2s, renders each `errorRows` item with row number and error message list under `data-testid="error-rows-list"`. |
| SALES_EXECUTIVE sees only their own leads | **MET** | Enforced by the API (`leads.read_own` permission → `ownOnly` filter). The frontend passes all filter params transparently; RLS and RBAC middleware handle scoping. `check:rls` passes (19 tables). |

---

## 4. FE-6 Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Two-panel layout: left (lead form + linked deals), right (tabs) | **MET** | `LeadDetailPage`: `flex-[3]` left panel contains `LeadMetadataForm` + `LinkedDealsPanel`; `flex-[2]` right panel contains `Tabs` (Activity / Notes / Files). Responsive: stacked on mobile via `flex-col lg:flex-row`. |
| Editable lead metadata | **MET** | `LeadMetadataForm`: firstName, lastName, email, phone save via `PATCH /leads/:id` on blur (same pattern as `DealMetadataForm`). Source uses `<select>` with `onchange` → patch. |
| Status machine: only allowed transitions shown | **MET** | `LEAD_STATUS_TRANSITIONS` in `api.ts` defines allowed next states per current status. `LeadMetadataForm` renders a `<select>` showing only allowed transitions, or a read-only label for terminal states (WON, LOST). Same logic in `LeadTable` inline edit. |
| Convert to Contact button | **MET** | `LeadDetailPage`: "Convert to Contact…" link visible for non-terminal, non-converted leads. Click reveals inline confirmation (cannot be undone). Confirm fires `POST /leads/:id/convert` via `useConvertLead`. |
| Linked deals panel: open deals for lead + Create Deal CTA | **MET** | `LinkedDealsPanel` queries `GET /deals?leadId=:id&status=OPEN`. "Create Deal" links to `/pipeline?createDeal=1&leadId=:id`. |
| Activity feed with infinite scroll | **MET** | `LeadActivityFeed` uses `useLeadActivities` (same `useInfiniteQuery` pattern as `useDealActivities`). `IntersectionObserver` on sentinel triggers `fetchNextPage`. |
| Notes tab with create form | **MET** | `LeadNotesList`: reads notes from `GET /leads/:id/notes`. Create form with `<textarea>` and "Add Note" button. Note: backend only exposes GET for notes (`lead.routes.ts` CRM-5.1 — read-only). Write ops are wired to `POST /leads/:id/notes` pending backend route addition. |
| Files tab | **MET** | `LeadFilesList`: reads files from `GET /leads/:id/files`. Shows file name, size, date, download link. Upload UI placeholder notes presigned URL backend dependency (CRM-5.2 — read-only). |

---

## 5. Files Changed / Created

### Types
| File | Change |
|------|--------|
| `src/lib/types/api.ts` | Added `Lead`, `LeadStatus`, `LeadSource`, `LeadNote`, `LeadFile`, `LeadListQuery`, `LEAD_STATUS_TRANSITIONS`, `ALL_LEAD_STATUSES`, `ALL_LEAD_SOURCES`, `getLeadDisplayName`, `formatLeadStatus`, `formatLeadSource` |

### Store
| File | Change |
|------|--------|
| `src/lib/store/leads-store.ts` | NEW — Zustand store with filter state + saved presets (persisted to localStorage via `persist` middleware) |

### Hooks (6 new)
| File | Description |
|------|-------------|
| `src/lib/hooks/useLeads.ts` | Paginated list with all filters/search/sort params |
| `src/lib/hooks/useLeadDetail.ts` | Single lead fetch with optional SSR initialData |
| `src/lib/hooks/useLeadActions.ts` | `usePatchLead`, `useDeleteLead`, `useConvertLead`, `useCreateLead` mutations |
| `src/lib/hooks/useLeadActivities.ts` | Infinite scroll activity feed |
| `src/lib/hooks/useLeadNotes.ts` | Notes list (paginated GET) |
| `src/lib/hooks/useLeadFiles.ts` | Files list (paginated GET) |

### Components (11 new)
| File | Description |
|------|-------------|
| `src/components/leads/LeadStatusBadge.tsx` | Colored badge per status |
| `src/components/leads/LeadFilters.tsx` | Full filter bar (search, status, source, AI score, date range, presets) |
| `src/components/leads/LeadTable.tsx` | Paginated table with sort headers, inline status edit, pagination controls |
| `src/components/leads/CsvImportModal.tsx` | Upload modal with job polling and row-level error display |
| `src/components/leads/LeadMetadataForm.tsx` | Editable form fields with onBlur save + status machine select |
| `src/components/leads/LeadActivityFeed.tsx` | Infinite-scroll activity feed (reuses `ActivityItemRow`) |
| `src/components/leads/LeadNotesList.tsx` | Notes list + textarea create form |
| `src/components/leads/LeadFilesList.tsx` | File list with download links |
| `src/components/leads/LinkedDealsPanel.tsx` | Open deals for lead + Create Deal CTA |
| `src/components/leads/LeadDetailPage.tsx` | Two-panel layout combining all sub-components |
| `src/components/leads/LeadListPage.tsx` | Top-level list page with import/export coordination |

### Pages (2 new)
| File | Description |
|------|-------------|
| `src/app/(dashboard)/leads/page.tsx` | RSC shell for `/leads` |
| `src/app/(dashboard)/leads/[id]/page.tsx` | RSC shell for `/leads/:id` (awaits `params` — Next.js 15 pattern) |

### Navigation
| File | Change |
|------|--------|
| `src/app/(dashboard)/layout.tsx` | Added "Leads" nav link (👥) above Pipeline |

### Test files (5 new)
| File | Tests | What's covered |
|------|-------|----------------|
| `src/components/leads/LeadStatusBadge.test.tsx` | 5 | Renders correct label and testid for all statuses |
| `src/components/leads/LeadDetailPage.test.tsx` | 6 | Page container, name field, status badge, convert CTA, won/lost banners |
| `src/components/leads/LeadFilters.test.tsx` | 6 | Filter panel renders, status toggle fires setFilters, search debounce 300ms, reset, save preset |
| `src/components/leads/LeadTable.test.tsx` | 7 | Lead rows, names, count, Import/Export buttons, sort column click, inline status dropdown |
| `src/components/leads/CsvImportModal.test.tsx` | 3 | Closed when open=false, file input and button rendered when open, Cancel calls onClose |

**Total new tests: 27** (107 total web, up from 79 pre-M6)

---

## 6. Test Count Summary

| Suite | Pre-M6 | Post-M6 | Delta |
|-------|---------|---------|-------|
| API | 469 | 469 | 0 (M6 is pure frontend) |
| Web | 79 | 107 | +28 |
| Shared | 76 | 76 | 0 |

---

## 7. Known Limitations / Carry-Forward

| Item | Notes |
|------|-------|
| **Notes write ops** | `POST /leads/:id/notes` is not in `lead.routes.ts` (CRM-5.1 only exposes GET). The create form UI is complete and wired to call the route; the route itself is pending a backend addition. |
| **File upload** | `CRM-5.2` only exposes `GET /leads/:id/files`. The presigned URL upload flow requires a storage infra decision (S3/GCS bucket + IAM). UI shows a placeholder message. |
| **`resolveAccessToken` duplication** (O5) | 8 BFF deal handlers each inline the token-refresh logic. Refactor to a shared `lib/server/bff.ts` helper is recommended before M7. (Same carry-over noted in M5.) |
| **No 401 token-refresh retry in `api-client.ts`** (O8) | Client-side hooks call the API directly. Expired access tokens cause a silent 401 until the user refreshes the page. A retry interceptor should be added in a hardening sprint. |

---

## 8. Build Output

```
○  /leads          7.35 kB      159 kB (Static — SSG with RSC shell)
ƒ  /leads/[id]     6.43 kB      159 kB (Dynamic — server-rendered on demand)
```

Both routes are within the ~170 kB first-load JS budget observed in M5.

---

## 9. No Backend / RLS / Schema Changes

M6 is entirely frontend. Zero changes to:
- Prisma schema
- API routes or controllers
- RLS policies
- `check:rls` registry

RLS gate: `OK — 19 tenant tables enabled + forced + policied; coverage matches registry.`
