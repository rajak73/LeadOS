# Sprint 5 M5 — Pipeline Kanban UI + Deal Detail UI
## Implementation Review

**Status:** COMPLETE — all validation gates passed (including R1 + R2 remediation)
**Branch:** main
**Date:** 2026-06-20 (remediation pass: 2026-06-20)

---

## Features Delivered

### 1. Pipeline Kanban Board (Screen 4)
- Horizontal scrollable stage columns with real-time deal counts and column-level weighted value
- Drag-and-drop via `@dnd-kit/core` + `@dnd-kit/sortable`: `PointerSensor` (8px activation distance) + `KeyboardSensor` for a11y
- `closestCorners` collision detection; `DragOverlay` renders active card at full opacity while source shows at 40%
- Framer Motion `AnimatePresence mode="popLayout"` with `motion.div layout` transitions (150ms) on card enter/exit per column
- Optimistic UI: drag triggers `cancelQueries → snapshot → setQueryData` and reverts on error with Toast
- Quick Won/Lost action buttons on each card (hover-revealed)
- Pipeline switcher dropdown hidden when organisation has only one pipeline
- Weighted forecast panel (collapsible) above the board

### 2. Deal Detail Page (Screen 5)
- 60/40 two-panel layout (metadata left, activity timeline right)
- Inline-edit fields (title, value, expected close date): PATCH on blur, ignored when no change
- Horizontal stage navigator: click to move deal, click Won stage to trigger won flow
- Won / Lost CTA buttons with confirmation modal for lost reason (500-char limit)
- Deal health badges: OVERDUE (past expected close + OPEN) and stale age indicator (>14d no update + OPEN)
- Lost-reason display when `deal.lostReason` is set
- Status banners for WON / LOST closed deals

### 3. Activity Timeline
- Infinite scroll via `IntersectionObserver` sentinel
- `useInfiniteQuery` with `initialPageParam: 1` and `getNextPageParam` from `meta.totalPages`
- Activity type icons and human-readable descriptions for: DEAL_CREATED, DEAL_UPDATED, DEAL_STAGE_MOVED, DEAL_WON, DEAL_LOST
- Relative time display (just now / Xm ago / Xh ago / Xd ago)

### 4. Backend: `GET /api/v1/deals/:id/activities`
- Wired `DealController.listActivities` with page/limit query params
- Route: `GET /:id/activities` with `requirePermission('deals.read')` + UUID param validation
- Completes the M3 deferred item

---

## Files Changed

### Modified (tracked)
| File | Change |
|------|--------|
| `apps/api/src/modules/deals/deal.controller.ts` | Added `listActivities` to interface + implementation |
| `apps/api/src/modules/deals/deal.routes.ts` | Added `GET /:id/activities` route |
| `apps/web/package.json` | Added `@dnd-kit/*`, `framer-motion`, `@radix-ui/*`, `@testing-library/*`, `jsdom`, `@vitejs/plugin-react` |
| `apps/web/src/app/(dashboard)/layout.tsx` | Replaced placeholder; added sidebar nav with Pipeline link |
| `apps/web/src/components/providers.tsx` | Wrapped children in `ToastProvider` |
| `apps/web/src/lib/api-client.ts` | Fixed pre-existing `.js` extension on `token-store` import (webpack incompatible) |
| `apps/web/tsconfig.json` | Added `"types": ["@testing-library/jest-dom"]` |
| `apps/web/vitest.config.ts` | Added `@vitejs/plugin-react`, `environmentMatchGlobs`, `setupFiles`, `include` |

### Created (untracked)
**BFF Route Handlers** (`apps/web/src/app/api/bff/`)
- `pipelines/route.ts`
- `deals/route.ts`
- `deals/forecast/route.ts`
- `deals/[id]/route.ts`
- `deals/[id]/move/route.ts`
- `deals/[id]/won/route.ts`
- `deals/[id]/lost/route.ts`
- `deals/[id]/activities/route.ts`

**API Hooks** (`apps/web/src/lib/hooks/`)
- `usePipelines.ts`
- `useDeals.ts`
- `useDealDetail.ts`
- `useMoveDeal.ts`
- `useDealActions.ts` (`useMarkWon`, `useMarkLost`, `useCreateDeal`, `usePatchDeal`)
- `useDealActivities.ts`
- `useForecast.ts`

**Store / Types**
- `apps/web/src/lib/store/pipeline-store.ts` (Zustand: activePipelineId, modal states)
- `apps/web/src/lib/types/api.ts` (Pipeline, Deal, ActivityItem, ForecastRow, getDealHealth, formatCurrency, formatRelativeTime)

**UI Primitives** (`apps/web/src/components/ui/`)
- `Button.tsx`, `Badge.tsx`, `Spinner.tsx`, `Modal.tsx`, `Select.tsx`, `Tabs.tsx`, `Toast.tsx`

**Kanban Components** (`apps/web/src/components/kanban/`)
- `DealCard.tsx`, `EmptyColumn.tsx`, `KanbanColumn.tsx`, `KanbanBoard.tsx`
- `KanbanBoardLoader.tsx` (lazy-loads KanbanBoard via `next/dynamic` for LCP optimisation)
- `PipelineSelector.tsx`, `AddDealModal.tsx`, `LostReasonModal.tsx`

**Deal Detail Components** (`apps/web/src/components/deals/`)
- `DealHealthBadge.tsx`, `DealDetailPage.tsx`, `DealMetadataForm.tsx`
- `StageTimeline.tsx`, `ActivityFeed.tsx`, `ActivityItem.tsx`, `ForecastPanel.tsx`

**Pages**
- `apps/web/src/app/(dashboard)/pipeline/page.tsx`
- `apps/web/src/app/(dashboard)/pipeline/deals/[id]/page.tsx`

**Tests**
- `apps/web/src/test-setup.ts`
- `apps/web/src/test-utils.tsx`
- `apps/web/src/components/kanban/DealCard.test.tsx` (6 tests)
- `apps/web/src/components/kanban/KanbanBoard.test.tsx` (7 tests — 4 mobile nav tests added during remediation)
- `apps/web/src/components/deals/StageTimeline.test.tsx` (5 tests)
- `apps/web/src/components/deals/DealDetailPage.test.tsx` (5 tests)
- `apps/web/src/components/deals/ActivityFeed.test.tsx` (3 tests)

---

## Validation Results

### TypeScript
```
pnpm typecheck → 0 errors
```

### Lint
```
pnpm lint → 0 errors, 0 warnings
```

### Build
```
pnpm build → success (Next.js 15 production build, all 17 routes compiled)

Route (app)                                 Size  First Load JS
├ ○ /pipeline                             1.53 kB         104 kB   ← KanbanBoard lazy-loaded (was 72.2 kB / 232 kB)
└ ƒ /pipeline/deals/[id]                  44 kB          166 kB
```

### Tests
```
pnpm test → 46 passed, 0 failed (11 test files)

  Pre-existing:  20 tests across 6 files — all green (no regressions)
  New M5 suite:  26 tests across 5 files — all green (4 mobile nav tests added)
```

### API RLS check
```
pnpm --filter @leados/api check:rls
→ OK — 19 tenant tables enabled + forced + policied; coverage matches registry.
```

### Git
```
git diff --check → clean (no trailing whitespace, no conflict markers)
```

---

## Notable Fixes Applied During Implementation

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| `token-store.js` webpack module-not-found | Pre-existing `.js` ESM extension not resolved by Next.js webpack | Changed to extensionless `./auth/token-store` |
| Test DOM accumulation across `it()` blocks | `@testing-library/react` auto-cleanup wasn't triggering under vitest's mixed-env setup | Added explicit `afterEach(cleanup)` in `test-setup.ts` |
| `IntersectionObserver is not defined` in jsdom | jsdom doesn't implement Intersection Observer | Added no-op global stub in `test-setup.ts` |
| TS2742 non-portable `RenderResult` | TypeScript couldn't name inferred return type without referencing a deep `.pnpm/` path | Added explicit `: RenderResult` annotation |
| TS exactOptionalPropertyTypes on `initialData` | `useQuery` overloads reject `Deal \| undefined` under `exactOptionalPropertyTypes: true` | Conditional spread: `initialData !== undefined ? { ...base, initialData } : base` |
| Radix Select `disabled: boolean \| undefined` | Radix types `disabled` as `boolean`, not `boolean \| undefined` | Conditional props object instead of direct prop |
| `LostReasonModal reason` exactOptionalPropertyTypes | Mutation payload `{ reason: string \| undefined }` not assignable under exact optional types | Conditional payload construction |

---

## Architecture Decisions

- **BFF token-exchange**: All client hooks call `/api/bff/*` route handlers that exchange the session cookie (refresh token) for an access token, then proxy to the API. Access tokens never reach browser storage.
- **Zustand for UI-only state**: `pipeline-store.ts` holds activePipelineId and modal open states. All server state is in TanStack Query.
- **Optimistic drag**: `useMoveDeal` follows the `cancelQueries → snapshot → setQueryData → onError revert → onSettled invalidate` pattern from the M5 plan.
- **Deal health is client-computed**: `getDealHealth(deal)` in `lib/types/api.ts` derives stale/overdue from `updatedAt` and `expectedCloseDate` — no backend change required.
- **High-value threshold**: `>50,000 INR` as specified in plan §4. Threshold exported as `HIGH_VALUE_THRESHOLD` constant.

---

## Risks

| Risk | Severity | Notes |
|------|----------|-------|
| `/pipeline` first-load bundle (71.9 kB) | Low | dnd-kit + framer-motion. Within acceptable range for a data-heavy page; lazy-load candidate in M6. |
| IntersectionObserver test stub is no-op | Low | Infinite scroll isn't exercised in automated tests; relies on manual QA. |
| No E2E drag-and-drop test | Medium | jsdom pointer events don't exercise real dnd-kit gestures. Drag correctness = manual QA only. |
| Radix Dialog renders all tab content | Low | `ActivityFeed` mounts immediately, not deferred. Fine at current scale; extract lazy tab in future. |

---

## Remediation Pass (2026-06-20) — Blocking Items from NOT APPROVED Review

### R1 — Mobile Kanban layout (RESOLVED)

**Change:** `KanbanBoard.tsx` now renders two layout trees controlled by Tailwind breakpoint utilities:

- **Mobile (`md:hidden`):** Shows a single `KanbanColumn` for `stages[mobileStageIndex]`. A navigation row with `‹` / `›` buttons (type="button", accessible `aria-label`) and a "Stage Name (X / Y)" indicator sits above the column. The previous button is `disabled` at index 0; the next button is `disabled` at the last stage. `mobileStageIndex` resets to 0 on pipeline switch via `useEffect([activePipelineId])`.

- **Desktop (`hidden md:flex gap-4 overflow-x-auto pb-4`):** Unchanged horizontal scroll layout with all stage columns rendered.

Both layout trees are wrapped in the same `DndContext`, so drag-and-drop within the visible mobile column works correctly.

4 new tests cover mobile nav in `KanbanBoard.test.tsx`:
- Nav controls render (`data-testid="mobile-stage-nav"`)
- Previous button disabled at first stage
- Next button enabled when not at last stage
- Clicking next advances the stage index (verified via "2 / 3" text)

### R2 — Lighthouse performance ≥ 90 (RESOLVED)

**Optimization:** Introduced `KanbanBoardLoader.tsx` — a `'use client'` wrapper that lazy-loads `KanbanBoard` via `next/dynamic({ ssr: false, loading: KanbanSkeleton })`. The pipeline page (`pipeline/page.tsx`) now imports `KanbanBoardLoader` instead of `KanbanBoard` directly.

**Effect:**
- `/pipeline` first-load JS: **72.2 kB → 1.53 kB** (KanbanBoard bundle split to a lazy chunk)
- SSR-rendered skeleton provides an LCP element immediately on first paint
- Actual Kanban content loads asynchronously after hydration

**Lighthouse result** (`next start`, port 3099, `--headless=new --no-sandbox`):

| Metric | Score | Value |
|--------|-------|-------|
| **Performance** | **99** | |
| First Contentful Paint | 100 | 0.8 s |
| Largest Contentful Paint | 97 | 2.0 s |
| Total Blocking Time | 100 | 0 ms |
| Cumulative Layout Shift | 100 | 0 |
| Speed Index | 100 | 1.1 s |
| Time to Interactive | 99 | 2.0 s |

### O1 — isLost stage in StageTimeline (APPLIED)

`StageTimeline.tsx` now accepts an optional `onMarkLost?: () => void` prop. When `stage.isLost === true`, clicking that stage calls `onMarkLost?.()` instead of `moveDeal`.

### O2 — HIGH_VALUE_THRESHOLD in DealCard (APPLIED)

`DealCard.tsx` now imports and uses `HIGH_VALUE_THRESHOLD` from `@/lib/types/api` instead of an inline `50_000` literal.

### O3 — deal.pipelineId in DealDetailPage (APPLIED)

`DealDetailPage.tsx` now calls `useMarkWon(deal?.pipelineId ?? null)` instead of `useMarkWon(activePipelineId)`. Direct URL navigation to a deal no longer silently skips the optimistic board update.

### O4 — listActivities route validation (APPLIED)

`deal.routes.ts` now applies `validate(activitiesQuerySchema, 'query')` on `GET /:id/activities`. The schema coerces and validates page (int ≥ 1, default 1) and limit (int 1–100, default 20). `deal.controller.ts` reads the coerced values via typed cast.

### O6 — git diff --check trailing whitespace (APPLIED)

Removed trailing Markdown line-break spaces from lines 4–5 of this document.

---

## Not Implemented (explicitly out of M5 scope)
- Contact/Lead association on DealMetadataForm — M6
- Assignee selection — M6
- Notes tab (placeholder shown) — M6
- Files tab (placeholder shown) — M6
- Real-time WebSocket board push — M6
