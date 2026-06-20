# Sprint 5 M5 Implementation Plan — Pipeline Kanban + Deal Detail Frontend

Date: 2026-06-20  
Author: Engineering, LeadOS  
Dependencies: M1 APPROVED, M2 APPROVED, M3 APPROVED, M4 APPROVED  
Source of truth: `FINAL_ARCHITECTURE.md`, `SPRINT_5_EXECUTION_PLAN.md`  
Status: PLAN — do not write code until approved.

---

## 1. Scope

M5 delivers the first production frontend: Screen 4 (Pipeline Kanban) and Screen 5 (Deal Detail). Both screens are real — using live API data from the M2 and M3 backends.

**Included:**
- Pipeline Kanban board with drag-and-drop stage moves (`@dnd-kit`)
- Optimistic update on drag with revert-on-error
- Deal cards with health indicators (stale, overdue, high-value)
- "Mark Won" / "Mark Lost" flows from the board
- Deal Detail: metadata form, stage timeline, won/lost CTAs
- Deal Detail: activity feed with infinite scroll
- Deal Detail: stub tabs for Notes and Files
- BFF route handlers for pipeline and deal data
- One minimal backend change: wire `GET /api/v1/deals/:id/activities` (service method already exists in M3, route was intentionally deferred)
- Pipeline selector for orgs on GROWTH/SCALE plans
- Mobile layout (< 768px): single-column view with stage navigation
- `pnpm --filter web build` clean: zero TS errors, zero lint errors

**Excluded:**
- M6 (Leads List / Lead Detail screens)
- No new backend schema, no new migrations, no RLS changes
- No webhook changes
- No Instagram inbox implementation
- No real-time Socket.io updates (Sprint 6)
- Notes CRUD (deferred — shared component not yet built)
- File upload (deferred — shared component not yet built)
- Multiple pipeline management settings screen
- Saved filter presets (server-persisted)
- Bulk deal operations
- `@shadcn/ui` CLI setup — Radix primitives used directly; full Shadcn setup is Sprint 5.5 or Sprint 6 setup task

---

## 2. Backend Dependencies

All M5 frontend depends on the following already-approved backend surfaces:

| Endpoint | Approved In | Consumer |
|---|---|---|
| `GET /api/v1/pipelines` | M2 | BFF: pipeline list for Kanban selector + stage columns |
| `GET /api/v1/pipelines/:id` | M2 | BFF: full pipeline with stages |
| `GET /api/v1/deals?pipelineId=&limit=50` | M3 | Kanban: deals per column |
| `GET /api/v1/deals/:id` | M3 | Deal Detail: full deal record |
| `PATCH /api/v1/deals/:id` | M3 | Deal Detail: metadata edits |
| `POST /api/v1/deals/:id/move` | M3 | Kanban drag-and-drop |
| `POST /api/v1/deals/:id/won` | M3 | Kanban/Detail: mark won action |
| `POST /api/v1/deals/:id/lost` | M3 | Kanban/Detail: mark lost action |
| `POST /api/v1/deals` | M3 | "Add Deal" form |
| `GET /api/v1/deals/forecast` | M3 | Kanban forecast panel |
| `GET /api/v1/deals/:id/activities` | **M3 service, ROUTE NOT YET WIRED** | Activity feed — see §2.1 |

### 2.1 One Required Backend Change: Wire `/deals/:id/activities`

The M3 signoff (observation #2) confirmed that `DealService.listActivities()` exists and is complete but has no HTTP route. M5 cannot deliver the Deal Detail activity feed without it.

**Required change (minimal — no new service logic, no schema change):**

In `apps/api/src/modules/deals/deal.routes.ts`, add one GET route using `requirePermission('deals.read')`:

```
GET /api/v1/deals/:id/activities?page=1&limit=20
```

This proxies to the already-implemented `DealService.listActivities(id, ctx, { page, limit })` using the existing `asyncHandler` + `requirePermission` pattern. No new service method, no new repository method, no migration.

This is the ONLY backend modification in M5. It is not a backend redesign — it is completing a deferred route from M3.

---

## 3. Frontend Architecture

Following `FINAL_ARCHITECTURE.md §8`:

- **Next.js 15 App Router** with RSC for data-loading shells and Client Components for interactive surfaces
- **BFF pattern** (§3.3): Next.js route handlers on `app.leados.app` hold the session cookie and proxy authenticated data fetches. Client components call the API directly with the in-memory bearer token from `token-store.ts`
- **TanStack Query v5** for all server state (already configured in `providers.tsx` with 30s staleTime)
- **Zustand** for UI state (sidebar, active pipeline ID, modal open states)
- **`apiClient`** (existing `lib/api-client.ts`) for all client-side mutations
- **`callApi()`** (existing `lib/server/bff.ts`) for all BFF route handlers
- **Tailwind** design tokens (already configured in `tailwind.config.ts`) for all styling
- **`@dnd-kit`** (new dependency) for Kanban drag-and-drop
- **`framer-motion`** (new dependency) for card animations
- **Radix UI primitives** (new dependencies) for accessible modals, selects, tabs

**Component boundary rule:**
- RSC page files: fetch initial data via BFF, render layout skeleton, pass data to client subtrees as props
- Client Components (`'use client'`): all interactive surfaces, drag-and-drop, forms, modals, infinite scroll

---

## 4. Files to Create

### 4.1 BFF Route Handlers

| File | Method(s) | Proxies |
|---|---|---|
| `apps/web/src/app/api/bff/pipelines/route.ts` | GET | `GET /api/v1/pipelines` |
| `apps/web/src/app/api/bff/deals/route.ts` | GET, POST | `GET /api/v1/deals`, `POST /api/v1/deals` |
| `apps/web/src/app/api/bff/deals/forecast/route.ts` | GET | `GET /api/v1/deals/forecast` |
| `apps/web/src/app/api/bff/deals/[id]/route.ts` | GET, PATCH | `GET /api/v1/deals/:id`, `PATCH /api/v1/deals/:id` |
| `apps/web/src/app/api/bff/deals/[id]/move/route.ts` | POST | `POST /api/v1/deals/:id/move` |
| `apps/web/src/app/api/bff/deals/[id]/won/route.ts` | POST | `POST /api/v1/deals/:id/won` |
| `apps/web/src/app/api/bff/deals/[id]/lost/route.ts` | POST | `POST /api/v1/deals/:id/lost` |
| `apps/web/src/app/api/bff/deals/[id]/activities/route.ts` | GET | `GET /api/v1/deals/:id/activities` |

All BFF handlers follow the existing pattern in `callApi()`: read the session cookie, forward as Bearer, return the upstream response body and status unchanged.

### 4.2 API Hooks

| File | Purpose |
|---|---|
| `apps/web/src/lib/hooks/usePipelines.ts` | `usePipelines()` — fetch all pipelines |
| `apps/web/src/lib/hooks/useDeals.ts` | `useDeals(pipelineId)` — fetch deals for a pipeline (limit 50 per call) |
| `apps/web/src/lib/hooks/useMoveDeal.ts` | `useMoveDeal()` — mutation with optimistic update (see §9) |
| `apps/web/src/lib/hooks/useDealActions.ts` | `useMarkWon()`, `useMarkLost()`, `useCreateDeal()`, `usePatchDeal()` mutations |
| `apps/web/src/lib/hooks/useDealDetail.ts` | `useDealDetail(id)` — fetch single deal |
| `apps/web/src/lib/hooks/useDealActivities.ts` | `useDealActivities(id)` — `useInfiniteQuery` for activity feed |
| `apps/web/src/lib/hooks/useForecast.ts` | `useForecast(pipelineId?)` — weighted forecast |

### 4.3 Pages (App Router)

| File | Type | Purpose |
|---|---|---|
| `apps/web/src/app/(dashboard)/pipeline/page.tsx` | RSC | Kanban board page — loads initial pipeline list via BFF, renders KanbanBoard client component |
| `apps/web/src/app/(dashboard)/pipeline/deals/[id]/page.tsx` | RSC | Deal Detail page — loads initial deal via BFF, renders DealDetailPage client component |

### 4.4 Kanban Components

| File | Type | Purpose |
|---|---|---|
| `apps/web/src/components/kanban/KanbanBoard.tsx` | Client | DndContext, column grid, drag overlay |
| `apps/web/src/components/kanban/KanbanColumn.tsx` | Client | Single stage column with SortableContext |
| `apps/web/src/components/kanban/DealCard.tsx` | Client | Draggable deal card with health badges |
| `apps/web/src/components/kanban/PipelineSelector.tsx` | Client | Pipeline switcher dropdown (Radix Select) |
| `apps/web/src/components/kanban/AddDealModal.tsx` | Client | Modal form for creating a deal |
| `apps/web/src/components/kanban/LostReasonModal.tsx` | Client | Modal for entering lost reason |
| `apps/web/src/components/kanban/EmptyColumn.tsx` | Client | Empty state with "Add Deal" CTA |

### 4.5 Deal Detail Components

| File | Type | Purpose |
|---|---|---|
| `apps/web/src/components/deals/DealDetailPage.tsx` | Client | Two-panel layout shell |
| `apps/web/src/components/deals/DealMetadataForm.tsx` | Client | Inline-edit fields for title, value, dates, assignee |
| `apps/web/src/components/deals/StageTimeline.tsx` | Client | Horizontal stage breadcrumb with click-to-move |
| `apps/web/src/components/deals/ActivityFeed.tsx` | Client | Paginated, infinite-scroll activity list |
| `apps/web/src/components/deals/ActivityItem.tsx` | Client | Single activity row with icon per ActivityType |
| `apps/web/src/components/deals/DealHealthBadge.tsx` | Client | Stale/overdue/high-value badges |
| `apps/web/src/components/deals/ForecastPanel.tsx` | Client | Weighted forecast per stage for the active pipeline |

### 4.6 Shared UI Primitives

| File | Type | Purpose |
|---|---|---|
| `apps/web/src/components/ui/Modal.tsx` | Client | Radix `@radix-ui/react-dialog` wrapper |
| `apps/web/src/components/ui/Select.tsx` | Client | Radix `@radix-ui/react-select` wrapper |
| `apps/web/src/components/ui/Tabs.tsx` | Client | Radix `@radix-ui/react-tabs` wrapper |
| `apps/web/src/components/ui/Badge.tsx` | Client | Styled status/health badge |
| `apps/web/src/components/ui/Button.tsx` | Client | Styled button with size/variant props |
| `apps/web/src/components/ui/Spinner.tsx` | Client | Loading spinner |
| `apps/web/src/components/ui/Toast.tsx` | Client | Error/success toast (wraps Radix Toast or custom) |

### 4.7 Zustand Store Additions

| File | Purpose |
|---|---|
| `apps/web/src/lib/store/pipeline-store.ts` | `activePipelineId`, `setActivePipelineId`, `draggingDealId` |

### 4.8 Type Helpers

| File | Purpose |
|---|---|
| `apps/web/src/lib/types/api.ts` | Re-export and augment `@leados/shared` inferred types for use in components; define API response envelope type |

### 4.9 Tests

| File | Coverage |
|---|---|
| `apps/web/src/components/kanban/KanbanBoard.test.tsx` | Renders columns and cards; drag-and-drop fires mutation |
| `apps/web/src/components/kanban/DealCard.test.tsx` | Health badges render for stale/overdue/high-value |
| `apps/web/src/components/deals/DealDetailPage.test.tsx` | Renders metadata and stage timeline |
| `apps/web/src/components/deals/ActivityFeed.test.tsx` | Renders activity list; loads next page |
| `apps/web/src/components/deals/StageTimeline.test.tsx` | Current stage highlighted; click fires move mutation |

---

## 5. Files to Modify

| File | Change |
|---|---|
| `apps/web/package.json` | Add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `framer-motion`, `@radix-ui/react-dialog`, `@radix-ui/react-select`, `@radix-ui/react-tabs`, `@radix-ui/react-toast`, `@testing-library/react`, `@testing-library/user-event`, `@vitest/browser` or `jsdom` for tests |
| `apps/web/src/app/(dashboard)/layout.tsx` | Add sidebar nav with Pipeline link; wire `sidebarOpen` from Zustand `useUiStore`; add active-route highlighting |
| `apps/web/src/components/providers.tsx` | Add Zustand hydration barrier if needed; add Toast provider |
| `apps/api/src/modules/deals/deal.routes.ts` | Add `GET /:id/activities` route (deferred from M3, now required by M5 — see §2.1) |

**Note on `deal.routes.ts`:** This is the only API file modified in M5. The service method and repository method for `listActivities` are already implemented in M3. The change is a single `router.get` call following the existing pattern.

---

## 6. Kanban Board Architecture

### Layout

```
(dashboard)/pipeline/page.tsx  [RSC]
  └── KanbanBoard.tsx  ['use client']
        ├── PipelineSelector.tsx         ← visible if org has > 1 pipeline
        ├── ForecastPanel.tsx            ← total weighted value for active pipeline
        └── DndContext (dnd-kit)
              ├── KanbanColumn.tsx       ← one per pipeline stage
              │     ├── column header: stage name, deal count, sum value
              │     ├── SortableContext (per column)
              │     │     └── DealCard.tsx  [useSortable]
              │     │           ├── title, assignee avatar, value, expected close date
              │     │           └── DealHealthBadge.tsx
              │     └── EmptyColumn.tsx / AddDeal button
              └── DragOverlay
                    └── DealCard.tsx (shadow copy while dragging)
```

### Data Flow

1. RSC `page.tsx` calls `callApi({ path: '/api/v1/pipelines', accessToken })` via BFF cookie session.
2. Serializes the pipeline list as a prop to `KanbanBoard` (eliminates the first client-side fetch for pipelines).
3. `KanbanBoard` initializes TanStack Query with `useDeals(activePipelineId)` — populates per-column lists by filtering `stageId`.
4. On mount, `usePipelines()` also runs on the client to keep the pipeline list fresh (30s staleTime).

### Column Population

The `GET /api/v1/deals?pipelineId=<id>&status=OPEN&limit=50` endpoint is called once per board render. The client distributes deals to columns by `deal.stageId`. This avoids N+1 column requests.

**Column limit:** Fetch max 50 deals per board render. If a column has more, show "50 shown — filter to see all". The column header always shows the true count from the server response total.

---

## 7. @dnd-kit Integration Plan

### Packages

```
@dnd-kit/core      ^6.x   — DndContext, DragOverlay, sensors, collision detection
@dnd-kit/sortable  ^8.x   — SortableContext, useSortable
@dnd-kit/utilities ^3.x   — CSS.Transform helpers
```

### Sensor Configuration

```typescript
const sensors = useSensors(
  useSensor(PointerSensor, {
    activationConstraint: { distance: 8 }, // prevent accidental drag on click
  }),
  useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates, // a11y keyboard DnD
  }),
);
```

### DndContext Handlers

```typescript
// KanbanBoard.tsx
const [activeId, setActiveId] = useState<string | null>(null);

onDragStart({ active }) {
  setActiveId(active.id as string);
}

onDragEnd({ active, over }) {
  setActiveId(null);
  if (!over) return;
  const toStageId = getStageIdFromDroppableId(over.id);
  const deal = findDealById(active.id);
  if (!deal || deal.stageId === toStageId) return;
  moveDeal({ dealId: deal.id, stageId: toStageId });
}
```

### Droppable Columns

Each `KanbanColumn` uses `useDroppable({ id: \`stage-${stageId}\` })`. The column body is the droppable area. A deal card dropped anywhere in the column triggers the `onDragEnd` with the column's droppable ID.

### DragOverlay

While `activeId !== null`, render `DragOverlay` with the active deal's card at full opacity (z-50). The source card renders at 40% opacity via `useSortable`'s `isDragging` flag: `style={{ opacity: isDragging ? 0.4 : 1 }}`.

### Collision Detection

Use `closestCenter` (standard for Kanban). Pairs with `rectIntersection` as fallback for empty columns via `pointerWithin`:
```typescript
collisionDetection={pointerWithin}
```
Actually: use `closestCorners` for more natural column detection when columns are wide.

---

## 8. Framer Motion Usage Plan

### Install

```
framer-motion  ^11.x   (not yet in package.json — must be added)
```

### Usage Locations

**DealCard enter/exit animation:**
```typescript
// KanbanColumn.tsx — wraps deal list
<AnimatePresence mode="popLayout">
  {deals.map((deal) => (
    <motion.div
      key={deal.id}
      layout                            // smooth reflow when card moves columns
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.15 }}
    >
      <DealCard deal={deal} />
    </motion.div>
  ))}
</AnimatePresence>
```

**Column header value counter animation:**
```typescript
// KanbanColumn.tsx — animate count and total value changes
<motion.span layout key={totalValue}>
  ₹{formatCurrency(totalValue)}
</motion.span>
```

**DragOverlay shadow:**
```typescript
// DragOverlay card has a subtle box-shadow scale animation to indicate "lifted":
<motion.div
  initial={{ boxShadow: '0 4px 12px rgba(0,0,0,0.15)', scale: 1.02 }}
  style={{ cursor: 'grabbing' }}
>
  <DealCard deal={activeDeal} />
</motion.div>
```

**Constraint:** No animations on `DragOverlay`'s `transform` (dnd-kit owns the transform). Only shadow and scale are animated. `layout` animations on the source column list handle the gap that opens when dragging starts.

---

## 9. Optimistic Update Strategy

### Move Deal (Critical Path)

TanStack Query v5 `useMutation` with full rollback:

```typescript
// useMoveDeal.ts
const queryClient = useQueryClient();

return useMutation({
  mutationFn: ({ dealId, stageId }: { dealId: string; stageId: string }) =>
    apiClient.post(`/deals/${dealId}/move`, { stageId }),

  onMutate: async ({ dealId, stageId }) => {
    // 1. Cancel any in-flight refetches for this pipeline's deals
    await queryClient.cancelQueries({ queryKey: ['deals', pipelineId] });

    // 2. Snapshot the current state (for rollback)
    const previousDeals = queryClient.getQueryData<Deal[]>(['deals', pipelineId]);

    // 3. Optimistically update the local cache
    queryClient.setQueryData<Deal[]>(['deals', pipelineId], (old = []) =>
      old.map((d) => (d.id === dealId ? { ...d, stageId } : d)),
    );

    return { previousDeals };  // context for onError
  },

  onError: (_err, _vars, context) => {
    // Revert to snapshot
    if (context?.previousDeals) {
      queryClient.setQueryData(['deals', pipelineId], context.previousDeals);
    }
    toast.error('Failed to move deal — position reverted');
  },

  onSettled: () => {
    // Always re-sync from server
    void queryClient.invalidateQueries({ queryKey: ['deals', pipelineId] });
  },
});
```

**The board does not re-fetch during an active drag sequence.** The `cancelQueries` call in `onMutate` cancels any background refetch that might fire and overwrite the optimistic state mid-drag.

### Mark Won / Mark Lost

Same pattern. On `onMutate`, remove the deal from the deals array (optimistic removal from board). On `onError`, restore it. On `onSettled`, invalidate.

### PATCH Deal (Metadata Form)

Debounced PATCH on blur. No optimistic update needed here — field value is stored in local form state, server response updates TanStack Query cache on settle.

---

## 10. Deal Detail Screen Architecture

### Route

`apps/web/src/app/(dashboard)/pipeline/deals/[id]/page.tsx` [RSC]

### Layout

```
DealDetailPage.tsx ['use client']
  ├── Left panel (60%)
  │     ├── StageTimeline.tsx       — horizontal stage nav, click to move
  │     ├── DealMetadataForm.tsx    — inline-edit: title, value, currency, expected close
  │     │     ├── Assignee select
  │     │     └── Read-only: createdAt, updatedAt, closedAt, createdBy
  │     └── WonLostBar.tsx          — "Mark Won" button, "Mark Lost" button (if status=OPEN)
  │                                   WON/LOST status banner (if closed)
  └── Right panel (40%)
        └── Tabs (Radix Tabs)
              ├── Activity tab (default) → ActivityFeed.tsx
              ├── Notes tab → "Coming soon" stub
              └── Files tab  → "Coming soon" stub
```

### Navigation

Back-link: `← Back to Pipeline` → pushes to `/pipeline` with the active pipeline ID preserved in Zustand.

### Initial Data Load

RSC `page.tsx` calls `callApi({ path: \`/api/v1/deals/${id}\`, accessToken })`. The client `DealDetailPage` initializes TanStack Query with `useDealDetail(id)` — the initial data from the RSC prop seeds the cache via `initialData`, so the page renders immediately without a loading state.

---

## 11. Activity Feed Integration

### Component: `ActivityFeed.tsx`

```
ActivityFeed.tsx
  └── useDealActivities(dealId)  ←  useInfiniteQuery
        queryFn: ({ pageParam = 1 }) =>
          apiClient.get(`/deals/${dealId}/activities?page=${pageParam}&limit=20`)
        getNextPageParam: (lastPage) =>
          lastPage.meta.page < lastPage.meta.totalPages
            ? lastPage.meta.page + 1
            : undefined
  └── <IntersectionObserver ref={sentinelRef}>  →  fetchNextPage()
  └── ActivityItem.tsx  (one per activity)
        ├── Icon per ActivityType (see §11.1)
        ├── Description text (constructed from metadata)
        └── Relative timestamp (e.g. "2 hours ago")
```

### 11.1 Activity Icons and Descriptions

| ActivityType | Icon | Description template |
|---|---|---|
| `DEAL_CREATED` | ✦ (star/diamond) | "Deal created with value ₹{value}" |
| `DEAL_UPDATED` | ✎ (pencil) | "Updated {fields.join(', ')}" |
| `DEAL_STAGE_MOVED` | → (arrow) | "Moved from {fromStageName} to {toStageName}" |
| `DEAL_WON` | ✓ (trophy) | "Deal marked as Won" |
| `DEAL_LOST` | ✗ (x-circle) | "Deal marked as Lost — {reason}" |

Stage names are resolved from the pipeline stages list (already loaded in cache from the Kanban).

### 11.2 Backend Route Required

`GET /api/v1/deals/:id/activities?page=1&limit=20` — add to `deal.routes.ts` (see §2.1). Response shape follows the existing `sendSuccess` pagination envelope from `ActivityService.listForEntity`.

---

## 12. Deal Health Indicators

All health logic is computed **client-side** from deal fields. No additional API calls.

### `DealHealthBadge.tsx` — utility function

```typescript
const STALE_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000;   // 14 days
const HIGH_VALUE_THRESHOLD = 50_000;                      // INR

function getDealHealth(deal: Deal): ('stale' | 'overdue' | 'high-value')[] {
  const health: ('stale' | 'overdue' | 'high-value')[] = [];
  if (deal.status !== 'OPEN') return health;

  const updatedAt = new Date(deal.updatedAt).getTime();
  if (Date.now() - updatedAt > STALE_THRESHOLD_MS) health.push('stale');

  if (deal.expectedCloseDate && new Date(deal.expectedCloseDate) < new Date()) {
    health.push('overdue');
  }

  if (deal.value && Number(deal.value) > HIGH_VALUE_THRESHOLD) health.push('high-value');

  return health;
}
```

### Rendering

**On DealCard (Kanban):**
- `stale`: yellow left-border on card + "No activity in N days" tooltip
- `overdue`: red badge `OVERDUE` on card bottom
- `high-value`: diamond icon (◆) on card top-right

**On Deal Detail (metadata panel):**
- `stale`: yellow callout banner "No activity for N days"
- `overdue`: red callout banner "Expected close date passed"
- `high-value`: no banner needed on detail (value is already prominent)

---

## 13. Forecast Integration

### `ForecastPanel.tsx`

Displayed in the Kanban header area (collapsible). Shows a condensed table of weighted values per stage for the active pipeline.

```
Stage          | Deals | Total Value | Probability | Weighted
Prospecting    |   12  | ₹4,80,000   |     10%     | ₹48,000
Qualified      |    8  | ₹6,40,000   |     30%     | ₹1,92,000
Proposal       |    4  | ₹9,60,000   |     60%     | ₹5,76,000
─────────────────────────────────────────────────────────────
Pipeline Total |   24  | ₹20,80,000  |     —       | ₹8,16,000
```

`useForecast(pipelineId)` calls `GET /api/v1/deals/forecast?pipelineId=<id>`. Refetch is triggered automatically when `pipelineId` changes or when a deal move/won/lost mutation settles (`onSettled: invalidateQueries(['forecast', pipelineId])`).

### In Deal Detail

The Deal Detail page does not show the full forecast table. Instead, `StageTimeline.tsx` shows the stage's probability inline (e.g. "Proposal — 60%"). This comes from the pipeline stages data already in the TanStack Query cache.

---

## 14. API Consumption Strategy

### Client-side mutations

All mutations call `apiClient` (Axios singleton in `lib/api-client.ts`) directly from client components with the in-memory bearer token. This follows `FINAL_ARCHITECTURE.md §3.3`: "Client components may call the API directly with the in-memory bearer token."

```typescript
// Pattern for all mutations:
apiClient.post('/deals/abc123/move', { stageId: 'stage-xyz' })
// Authorization header is injected by the existing request interceptor.
```

### Server-side data (RSC initial load)

RSC pages call `callApi()` from `lib/server/bff.ts`. The access token is retrieved from the session cookie by the BFF. The result is passed as `initialData` to TanStack Query on the client.

### BFF route handlers

Each BFF route handler in `app/api/bff/**` follows this pattern:
1. Read session (access token from cookie or Authorization header forwarded from the RSC)
2. Call `callApi({ path, method, body, accessToken })`
3. Return `Response.json(result.body, { status: result.status })`

No transformation of the upstream response. The frontend consumes the `{ success, data, meta }` envelope directly.

### Query Key Convention

```
['pipelines']                         — all pipelines for the org
['pipeline', pipelineId]              — single pipeline with stages
['deals', pipelineId]                 — all deals for a pipeline (board)
['deal', dealId]                      — single deal detail
['deal-activities', dealId, page]     — activity pages
['forecast', pipelineId]              — weighted forecast
```

Consistent query keys enable precise `invalidateQueries` targeting after mutations.

---

## 15. State Management Strategy

### TanStack Query (server state)

| Data | Key | staleTime |
|---|---|---|
| Pipelines list | `['pipelines']` | 60s |
| Single pipeline + stages | `['pipeline', id]` | 60s |
| Deals for board | `['deals', pipelineId]` | 30s |
| Single deal detail | `['deal', id]` | 30s |
| Deal activities | `['deal-activities', id]` | 60s |
| Forecast | `['forecast', pipelineId]` | 60s |

### Zustand (UI state — `pipeline-store.ts`)

```typescript
interface PipelineStore {
  activePipelineId: string | null;
  setActivePipelineId: (id: string) => void;

  // Modal state
  addDealModalOpen: boolean;
  addDealTargetStageId: string | null;
  openAddDealModal: (stageId: string) => void;
  closeAddDealModal: () => void;

  lostReasonModalOpen: boolean;
  lostReasonDealId: string | null;
  openLostReasonModal: (dealId: string) => void;
  closeLostReasonModal: () => void;
}
```

### Local React State (ephemeral drag state)

`activeId: string | null` in `KanbanBoard.tsx`. Reset on `onDragEnd` or `onDragCancel`. Not persisted in Zustand — drag state is fully ephemeral and component-local.

### What is NOT in state

- Deal data: owned by TanStack Query
- Form field values during edit: controlled input local state (cleared on blur/submit)
- Pipeline selector dropdown open state: Radix Select handles internally

---

## 16. Error Handling Strategy

### Mutation Errors (move, won, lost, PATCH)

All mutation `onError` handlers:
1. Revert optimistic update (see §9)
2. Show toast: `toast.error('Failed to move deal — position reverted')` or context-specific message
3. Log error to console in development

**No redirect on mutation failure** — the user stays on the board. The toast disappears after 4 seconds.

### API 4xx/5xx on reads (useQuery)

- `401`: The existing Axios interceptor in `api-client.ts` catches this. Sprint 2 wired a `/auth/refresh` retry, but the interceptor slot exists for Sprint 5 to wire a redirect to `/login` on 401.
- `403`: Show a "Permission denied" inline message (replace the board content).
- `404` on deal detail: redirect to `/pipeline` with a toast "Deal not found".
- `5xx`: TanStack Query retries once (configured in `providers.tsx: retry: 1`). On final failure, show an error boundary message with a "Try again" button.

### Loading States

- **Kanban initial load**: Skeleton column placeholders (3 columns × 3 card skeletons). Rendered while `useDeals` is in loading state.
- **Deal Detail initial load**: Skeleton for the two-panel layout. Controlled by `useDealDetail` loading state.
- **Drag-and-drop**: No loading state shown (optimistic update makes the move feel instant).

### Form Validation

Client-side: Zod schemas from `@leados/shared` validate form inputs before submission (e.g. `createDealSchema`, `patchDealSchema`). Server validation errors (422) are displayed inline under the relevant field.

---

## 17. Testing Strategy

### Framework

- **Vitest + jsdom** (add `jsdom` environment config to `vitest.config.ts` if not yet configured)
- **`@testing-library/react` + `@testing-library/user-event`** (new dependencies)
- Tests run as part of `pnpm --filter web test`

### Test Files (minimum 5, targeting 8+)

| Test File | What It Covers |
|---|---|
| `KanbanBoard.test.tsx` | Renders N columns for N stages; deals appear in correct column; drag-end fires `moveDeal` mutation; revert fires on mutation error |
| `DealCard.test.tsx` | Health badges render: no badge for healthy deal; stale badge for 15-day-old deal; overdue badge for past close date; diamond for high-value |
| `DealDetailPage.test.tsx` | All metadata fields render; stage timeline shows current stage highlighted; "Mark Won" button fires won mutation; "Mark Lost" opens reason modal |
| `StageTimeline.test.tsx` | Clicking a non-current stage fires `moveDeal`; won stage click fires `markWon`; closed deals show read-only timeline |
| `ActivityFeed.test.tsx` | Renders activity list; loads next page on sentinel intersection; correct icon per ActivityType |
| `DealMetadataForm.test.tsx` | Title field editable; PATCH fires on blur; server 422 shows inline error |
| `PipelineSelector.test.tsx` | Hidden when org has 1 pipeline; renders options for GROWTH org; changing pipeline updates `activePipelineId` in Zustand |
| `ForecastPanel.test.tsx` | Renders weighted values; totals correct; refetches on pipeline change |

### Mocking Strategy

- TanStack Query: wrap tests in a `QueryClientProvider` with a fresh `QueryClient` (no cache)
- Axios `apiClient`: mock at the module level using `vi.mock`
- Framer Motion: mock `AnimatePresence`/`motion.div` as pass-through divs to avoid animation-related timing issues in tests
- `@dnd-kit`: use `@dnd-kit/core`'s test utilities where available; otherwise trigger `onDragEnd` callbacks directly via test setup

### Build Validation

After all components are built:
1. `pnpm --filter web typecheck` — zero TS errors
2. `pnpm --filter web lint` — zero lint errors
3. `pnpm --filter web build` — Next.js production build clean
4. `pnpm --filter web test` — all component tests pass

---

## 18. Risks and Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| **R-M5-1** | **@dnd-kit + React 18 hydration mismatch.** `DndContext` renders differently on server vs client if not wrapped in `'use client'` correctly. | M | M | `KanbanBoard` is fully a Client Component. The RSC page passes only serializable props (pipeline data). `DndContext` never renders on the server. |
| **R-M5-2** | **Kanban performance at 50+ deals.** 50 deal cards with Framer Motion layout animations may cause layout thrash on lower-end devices. | M | M | Benchmark with 50 cards in dev. If P95 layout time > 16ms, remove `layout` from card animations (keep only opacity/y enter/exit). TanStack Virtual is the fallback for columns with > 20 cards. |
| **R-M5-3** | **Activity route not yet wired (backend).** Deal Detail activity feed depends on `GET /deals/:id/activities` which has no HTTP route in M3. | H | H | This is addressed in §2.1 and §5. The route must be wired before M5 tests can pass. It is the only required backend change in M5. Include it in the M5 implementation, not as a separate blocker. |
| **R-M5-4** | **No auth redirect in `(dashboard)/layout.tsx`.** Sprint 2 wired auth but the layout still has a comment saying "route guard wired in Sprint 2". Must confirm the redirect exists before M5 ships; otherwise unauthenticated users can access the Kanban page. | M | H | Read `(dashboard)/layout.tsx` at implementation start. If the guard is not wired, add it as the first task (it's a Sprint 2 deliverable that needs to be verified). |
| **R-M5-5** | **Radix UI version conflicts with React 18.** Some Radix packages require React 18+; package.json shows `react: ^18.3.11`. Verify each Radix package's peer dep before install. | L | L | Radix UI v1.x supports React 18. Pin to `^1.x` across all Radix packages. |
| **R-M5-6** | **TanStack Query v5 API changes.** The installed version is `^5.59.16` which uses `useInfiniteQuery` with `initialPageParam` and `getNextPageParam`. All hook files must use the v5 API (not v4). | L | M | All hook implementations in §4.2 use the v5 API. No v4 patterns (no `cacheTime`, `keepPreviousData`). `staleTime` → `staleTime`. `onSuccess`/`onError` in `useQuery` are removed in v5 — use `select` + `useEffect` or mutation callbacks instead. |
| **R-M5-7** | **Mobile layout complexity.** The single-column mobile Kanban with stage navigation arrows requires a separate layout path. | M | L | Implement a `KanbanMobileView` component that renders one `KanbanColumn` at a time with prev/next stage arrows. Gate it via `useMediaQuery('(max-width: 768px)')`. Renders the same data — just different layout. |
| **R-M5-8** | **Lost reason modal blocking drag end.** If a user drags to the "Lost" column and the modal opens immediately, it may conflict with the drag end sequence. | L | M | Do not open the modal from a drag event. "Mark Lost" is only triggered via the "..." card menu or the "Mark Lost" CTA button — never from a column drop. |

---

## 19. Acceptance Criteria

All of the following must be true before M5 is considered complete.

### Kanban Board (FE-2)

| Criterion | Verification |
|---|---|
| Board renders all stages as columns with correct deal counts | Manual + component test |
| Each deal card shows: title, value, expected close date, assignee initial | Component test |
| Dragging a card between columns fires `POST /deals/:id/move` | Component test: spy on `apiClient.post` |
| Optimistic update moves card immediately, without waiting for API | Component test: mock API delay, assert card position changes on drag end |
| On API error, card reverts to original column with toast | Component test: mock 500, assert revert |
| "Mark Won" removes card from board and fires `POST /deals/:id/won` | Component test |
| "Mark Lost" opens reason modal; submit fires `POST /deals/:id/lost` | Component test |
| Pipeline selector hidden when org has 1 pipeline; visible with 2+ | Component test |
| Empty column (no deals) shows "Add Deal" CTA | Component test |
| SALES_EXECUTIVE only sees deals assigned to them | Manual: login as SALES_EXECUTIVE with restricted deals data |
| Health indicator: stale deal shows yellow border / badge | Component test with fabricated `updatedAt` 15 days ago |
| Health indicator: overdue deal shows red OVERDUE badge | Component test with `expectedCloseDate` yesterday |
| Health indicator: high-value deal shows diamond icon | Component test with `value > 50000` |
| Board is horizontally scrollable below 1280px | Manual |
| Mobile (< 768px): single column view with prev/next arrows | Manual on devtools mobile |

### Deal Detail (FE-3)

| Criterion | Verification |
|---|---|
| Deal Detail opens by clicking a Kanban card (link to `/pipeline/deals/:id`) | Manual |
| All metadata fields render with correct values | Component test |
| Title field is editable inline; PATCH fires on blur | Component test |
| Value and expected close date fields editable | Component test |
| Assignee select fires PATCH with new `assignedToId` | Component test |
| Stage timeline shows all stages; current stage highlighted | Component test |
| Clicking a non-current stage fires `POST /deals/:id/move` | Component test |
| "Mark Won" CTA fires `POST /deals/:id/won` and shows WON banner | Component test |
| "Mark Lost" CTA opens modal; submit fires `POST /deals/:id/lost` | Component test |
| Won/lost deal shows read-only timeline with closed status | Component test |
| Activity feed loads first page of activities | Component test |
| Activity feed loads next page on scroll | Component test (IntersectionObserver mock) |
| Activity feed shows correct icon and text per ActivityType | Component test |
| Notes tab shows "Coming soon" stub | Manual |
| Files tab shows "Coming soon" stub | Manual |
| `← Back to Pipeline` link navigates to Kanban | Manual |

### Build Gates

| Criterion | Command | Expected |
|---|---|---|
| No TypeScript errors | `pnpm --filter web typecheck` | exit 0 |
| No lint errors | `pnpm --filter web lint` | exit 0 |
| Production build clean | `pnpm --filter web build` | exit 0 |
| All component tests pass | `pnpm --filter web test` | ≥ 8 tests, all passing |
| API build still clean | `pnpm --filter @leados/api typecheck` | exit 0 (after adding `/deals/:id/activities` route) |
| API tests still pass | `pnpm --filter @leados/api test` | 0 regressions |
| RLS unchanged | `pnpm --filter @leados/api check:rls` | 19 tables |

---

## Appendix A — New Dependencies Summary

| Package | Version | Reason |
|---|---|---|
| `@dnd-kit/core` | `^6.1.0` | DnD context and sensors |
| `@dnd-kit/sortable` | `^8.0.0` | useSortable, SortableContext |
| `@dnd-kit/utilities` | `^3.2.2` | CSS.Transform helpers |
| `framer-motion` | `^11.x` | Card animations, layout transitions |
| `@radix-ui/react-dialog` | `^1.1.x` | AddDeal, LostReason modals |
| `@radix-ui/react-select` | `^2.1.x` | Pipeline selector, assignee select |
| `@radix-ui/react-tabs` | `^1.1.x` | Deal Detail right panel tabs |
| `@radix-ui/react-toast` | `^1.2.x` | Error/success toasts |
| `@testing-library/react` | `^16.x` | Component tests |
| `@testing-library/user-event` | `^14.x` | User interaction simulation |

All are `devDependencies` except the first 6 (runtime). No packages require Radix version conflicts with React 18.

---

## Appendix B — Implementation Order (Recommended)

```
Day 1 (Setup):
  - Add dependencies to package.json; pnpm install
  - Wire GET /api/v1/deals/:id/activities route in deal.routes.ts
  - Verify (dashboard)/layout.tsx auth guard; wire if missing
  - Create lib/types/api.ts type helpers
  - Create pipeline-store.ts

Day 2 (BFF + Hooks):
  - Create all BFF route handlers (§4.1)
  - Create all API hooks (§4.2)

Day 3 (Kanban Shell):
  - Create KanbanBoard.tsx — DndContext, column grid (no animations yet)
  - Create KanbanColumn.tsx — static layout, deal list
  - Create DealCard.tsx — static card
  - Create pipeline/page.tsx RSC wrapper
  - Verify board renders with real API data

Day 4 (DnD + Optimistic Updates):
  - Wire @dnd-kit sensors, DragOverlay in KanbanBoard
  - Implement useMoveDeal with optimistic update
  - Wire onDragEnd → mutation
  - Add Framer Motion animations to KanbanColumn card list

Day 5 (Kanban Features):
  - PipelineSelector (pipeline switcher)
  - AddDealModal + useCreateDeal
  - LostReasonModal
  - Won/Lost card menu actions
  - EmptyColumn
  - Health indicators (DealHealthBadge)
  - ForecastPanel

Day 6 (UI Primitives + Deal Detail Shell):
  - Build ui/Modal, ui/Select, ui/Tabs, ui/Badge, ui/Button, ui/Toast
  - Create DealDetailPage two-panel layout
  - Create deals/[id]/page.tsx RSC wrapper
  - DealMetadataForm — static display

Day 7 (Deal Detail Interactive):
  - DealMetadataForm — inline edit + PATCH
  - StageTimeline — display + click-to-move
  - WonLostBar — buttons + modal flows
  - ActivityFeed — useInfiniteQuery + scroll

Day 8 (Mobile + Polish):
  - Mobile single-column Kanban (KanbanMobileView)
  - Sidebar nav Pipeline link in (dashboard)/layout.tsx
  - Loading skeletons for board and detail
  - Error boundary states

Day 9 (Tests + Build):
  - All 8 test files
  - pnpm --filter web typecheck
  - pnpm --filter web lint
  - pnpm --filter web build
  - pnpm --filter @leados/api typecheck
  - pnpm --filter @leados/api test
  - pnpm --filter @leados/api check:rls
  - Write SPRINT_5_M5_FINAL_SIGNOFF.md (by reviewer)
```

---

*Planning only. No code. No file changes.*  
*Stop and wait for approval before implementation begins.*
