# Sprint 7 — UI Modernization Plan

**Author:** Principal Engineer (source-code + competitive audit)
**Date:** 2026-06-21
**Status:** PLAN ONLY — no implementation. Execution gated on approval.
**Scope:** Dashboard · Pipeline · Inbox · Leads · Settings

**Companion documents (read alongside):**
- `SPRINT_6_UI_UX_PLAN.md` — the canonical design-system reference (tokens, primitives, patterns). **All constraints there remain binding.**
- `LEADOS_UI_GAP_ANALYSIS.md` — per-page functional gap audit.
- `LEADOS_UI_IMPLEMENTATION_ROADMAP.md` — the *feature-completeness* roadmap (missing pages, notifications, file upload). Sprint 7 **layers on top of** that work; where they overlap, this document cites the relevant `Pn-n` item rather than redefining it.

> **Prime directive for Sprint 7:** LeadOS already has the right *bones* (dark token system, inline-edit detail pages, a drag-drop kanban with deal-health, an assignment-based inbox). Modernization is **not** a reskin. It is closing the interaction-maturity gap against best-in-class CRMs — saved views, command palette, list/board parity, bulk actions, global search, keyboard-first flow, and a real dashboard — **using the existing token system and primitives only.**

---

## 0. Benchmark Summary — What "Modern CRM" Means in 2026

The three reference products and the single capability each is best known for:

| Product | Signature strength | What LeadOS must learn from it |
|---------|-------------------|--------------------------------|
| **Attio** | Data-dense, **customizable saved views**; **⌘K command palette**; keyboard-first; relationship-rich record pages; inline editing everywhere | Saved views + column control on Leads; command palette; record-page relationship panels |
| **HubSpot** | **Dashboards & reporting widgets**; conversation inbox with assignment/SLA; **bulk actions**; board↔list toggle; association cards | Real dashboard; bulk actions across list surfaces; inbox SLA/response-time surfacing |
| **Pipedrive** | **Best-in-class pipeline kanban**; "rotting" (stale) deal signals; focus-driven deal page; list↔board toggle; saved filters | Pipeline list view + saved filters; sharpen the already-good kanban; activity scheduling |

**LeadOS today vs the bar:**

| Capability | LeadOS today | Attio | HubSpot | Pipedrive | Sprint 7 target |
|-----------|--------------|:-----:|:-------:|:---------:|-----------------|
| Drag-drop kanban + stale/overdue health | ✅ strong | ➖ | ✅ | ✅ | Polish only |
| Inline-edit detail records | ✅ | ✅ | ➖ | ➖ | Extend to more fields |
| Forecast / weighted pipeline | ✅ basic | ➖ | ✅ | ✅ | Surface on dashboard |
| **Dashboard / KPIs** | ❌ placeholder | ➖ | ✅ | ✅ | **Build** |
| **Saved views / saved filters** | ⚠️ leads filter presets only | ✅ | ✅ | ✅ | **Build (shared)** |
| **Command palette (⌘K)** | ❌ | ✅ | ➖ | ➖ | **Build** |
| **Global search** | ❌ | ✅ | ✅ | ✅ | **Build** |
| **Bulk actions / multi-select** | ❌ | ✅ | ✅ | ✅ | **Build (shared)** |
| **List/board toggle on pipeline** | ❌ board only | ✅ | ✅ | ✅ | **Build** |
| Keyboard shortcuts | ⚠️ `/` in compose only | ✅ | ➖ | ✅ | Establish framework |
| Density / column control | ❌ | ✅ | ✅ | ➖ | Leads table only |

---

## 1. Constraints (unchanged from Sprint 6 — restated because they bind Sprint 7)

These are hard rules. They come from `SPRINT_6_UI_UX_PLAN.md §4` and the live token audit.

1. **No new color tokens, no hardcoded hex.** Use only `bg-base/elevated/overlay/subtle/muted`, `border-subtle/DEFAULT/strong`, `text-primary/secondary/tertiary`, `primary-500/600/700`, and the semantic glass pattern (`bg-{c}-500/15 text-{c}-400 border-{c}-500/30`).
2. **No new icon library.** Emoji + plain-text glyphs only (`👥 📊 💬 → ✓ ✗ ·`), consistent with the existing nav and message-status conventions.
3. **No skeleton loaders.** `<Spinner>` only.
4. **Dark-only.** `html.dark` is hardcoded; no light-mode toggle.
5. **Reuse primitives.** `Button, Badge, Modal, Select, Tabs, Spinner, Toast` from `@/components/ui/`. Any new Radix primitive must be wrapped in a `components/ui/` file before use (this is the sanctioned path for the command palette — see §7).
6. **No sidebar redesign.** Nav entries may be *added* (matching the existing item style) but the shell is not restructured.
7. **`transition-colors` only**, `disabled:opacity-50`, focus = `focus:border-primary-500 focus:outline-none`.
8. **No regressions.** Every touched page keeps all existing tests green; new surfaces add their own tests.

> Any item below that *appears* to need a new pattern explicitly states the decision and routes it through the "wrap a Radix primitive in `components/ui/` first" rule. There are exactly two such primitives in this plan: **CommandPalette** (Radix Dialog + cmdk-style list, but built on the existing `Modal`/Radix Dialog — no new dep) and **multi-select checkbox affordance** (native input, styled with tokens).

---

## 2. Shared Foundation for Sprint 7 (build first — blocks the screen work)

These are net-new shared atoms specific to *modernization* (distinct from the gap-roadmap's Phase 0 atoms like `AvatarInitials`, `EmptyState`, `StatCard`, `UserSelect`, which remain prerequisites and should land first if not already built).

### S7-F1 · `SavedViews` engine + `ViewBar`
- **Files:** `apps/web/src/components/ui/ViewBar.tsx`, `apps/web/src/lib/hooks/useSavedViews.ts`, `apps/web/src/lib/views/view-types.ts`
- **What:** A horizontal bar of saved-view chips (`All`, `Mine`, `+ custom`) plus a "Save current view" affordance. Generalizes the existing **Leads filter presets** (`LeadFilters` already saves/loads/deletes presets) into a reusable contract any list surface can mount.
- **Persistence decision:** Start **client-side (localStorage, per-user-per-surface)** to avoid backend scope creep; contract designed so a future `GET/POST /api/v1/views` can back it without UI change. State shape: `{ id, name, surface: 'leads'|'pipeline'|'inbox', filters, sort, columns? }`.
- **Reuses:** `Tabs` trigger styling for chips, `Button` for save, `Modal` for "name this view".
- **Benchmark:** Attio/Pipedrive saved views.

### S7-F2 · `BulkActionBar` + `useMultiSelect`
- **Files:** `apps/web/src/components/ui/BulkActionBar.tsx`, `apps/web/src/lib/hooks/useMultiSelect.ts`
- **What:** A sticky bottom bar that appears when ≥1 row is selected: `"N selected"` + contextual action buttons + clear. `useMultiSelect` manages a `Set<id>` with select-all/range-select (shift-click).
- **Selection affordance:** a checkbox cell (native `<input type="checkbox">` styled with `accent-primary-600` + token borders) on the left of table rows; on cards, a hover-revealed checkbox top-left (`opacity-0 group-hover:opacity-100`, persists once checked).
- **Reuses:** semantic glass for the bar (`bg-bg-elevated border border-border`), `Button` variants for actions.
- **Benchmark:** HubSpot/Attio bulk operations.

### S7-F3 · `CommandPalette` (⌘K)
- **Files:** `apps/web/src/components/ui/CommandPalette.tsx`, `apps/web/src/lib/hooks/useCommandPalette.ts`, `apps/web/src/lib/commands/registry.ts`
- **What:** Global `⌘K` / `Ctrl-K` overlay. Two zones: **navigation/actions** (static registry: "Go to Inbox", "Add Lead", "Add Deal", "Open Settings") and **search results** (live, debounced — feeds from the global-search endpoint in §6/S7-F4).
- **Built on:** the existing Radix Dialog that backs `Modal` — **no new dependency**. List + keyboard nav (`↑↓ Enter Esc`) reuse the `SavedReplyPicker` keyboard pattern already in the codebase.
- **Mount point:** `(dashboard)/layout.tsx`, alongside the (roadmap P1-1) notification socket migration.
- **Benchmark:** Attio/Linear command palette.

### S7-F4 · `GlobalSearch` hook + BFF
- **Files:** `apps/web/src/lib/hooks/useGlobalSearch.ts`, `apps/web/src/app/api/bff/search/route.ts`
- **Backend dependency (new):** `GET /api/v1/search?q=` returning typed hits `{ type: 'lead'|'deal'|'conversation', id, label, sublabel }`, org-scoped, capped (e.g. 8 per type). Implementable as 3 `ILIKE`/indexed queries across `leads`, `deals`, `conversations`.
- **Consumed by:** CommandPalette results zone (and optionally a top-bar search later).

### S7-F5 · `useKeyboardShortcuts` framework + `ShortcutHelp`
- **Files:** `apps/web/src/lib/hooks/useKeyboardShortcuts.ts`, `apps/web/src/components/ui/ShortcutHelp.tsx`
- **What:** A central registry so shortcuts don't collide. Global set: `⌘K` palette, `g then i/l/p/d` go-to (inbox/leads/pipeline/dashboard), `c` create (context-aware), `?` opens `ShortcutHelp` (a `Modal` listing bindings).
- **Benchmark:** Pipedrive/Attio keyboard-first navigation.

> **Dependency note:** S7-F1, F2, F5 are pure-frontend. S7-F3 depends on F4's endpoint for the *search* zone but the *navigation/action* zone ships without it. Build order: F1, F2, F5 → F4 (backend) → F3.

---

## 3. Screen 1 — Dashboard

### Current state
`(dashboard)/page.tsx` is a **placeholder** ("Dashboard arrives in a later sprint"). No KPIs, no data. This is the single largest perceived-maturity gap vs HubSpot/Pipedrive, both of which open on a dashboard.

### Target UX (benchmarked)
A focused **operator home**, not a BI tool. HubSpot-style KPI strip + Pipedrive-style "what needs me today":
- **KPI strip:** Active Leads · Open Deals (+ pipeline value) · Won This Month (+ value) · Win Rate %.
- **Weighted forecast:** reuse the existing `ForecastPanel` read-only.
- **My Day:** overdue/stale deals assigned to me + leads pending follow-up — the actionable core (Pipedrive "rotting" + activity focus).
- **Recent activity:** last 15 cross-entity events with entity links → `/activity`.
- **Quick actions:** Add Lead / Add Deal / Go to Inbox.

### Components to build
This screen is already specified in the gap roadmap **P2-1** — Sprint 7 **adopts that spec as-is** rather than re-authoring it: `DashboardPage`, `KpiStrip` (uses shared `StatCard`), `RecentActivitySection`, `QuickActionsSection`, `MyTasksSection`, hook `useDashboardStats`.
- **Sprint 7 additions on top of P2-1:** make each `StatCard` a saved-view deep link (clicking "Open Deals" routes to the new pipeline **list view** filtered to OPEN — see §4) and wire the KPI strip's "Won This Month" to a date-scoped pipeline view.

### API dependencies
- **New backend:** `GET /api/v1/dashboard/stats` → `{ activeLeads, openDeals, pipelineValue, wonThisMonth, wonValueThisMonth, winRate, avgResponseTimeMinutes }`, org-scoped, 4–5 Prisma aggregates. (No analytics module exists today — confirmed in audit.)
- **New BFF:** `apps/web/src/app/api/bff/dashboard/stats/route.ts`.
- **Reuse:** existing `/bff/deals` (health/assignee filters), `/bff/deals/forecast`, and the cross-entity activity feed (roadmap P1-3 `/bff/activity`).

### Implementation order
1. Backend `dashboard/stats` endpoint + tests → 2. BFF proxy → 3. `KpiStrip` + `StatCard` wiring → 4. `MyTasksSection` (highest operator value) → 5. `RecentActivitySection` → 6. `QuickActionsSection` → 7. KPI→view deep links (after §4 list view exists).

---

## 4. Screen 2 — Pipeline

### Current state
`(dashboard)/pipeline/page.tsx` + `pipeline/deals/[id]` are **fully built and strong**: multi-pipeline selector, drag-drop columns with count/value headers, `DealCard` with `DealHealthBadge` (OVERDUE/STALE = Pipedrive "rotting"), `ForecastPanel`, Add/Lost modals, mobile carousel. Deal detail has stage timeline, inline metadata, activity tab.
**Gaps:** board-only (no list view), no saved filters, status hardcoded to `OPEN`, no bulk actions, Notes/Files tabs are "Coming soon", no in-board search.

### Target UX (benchmarked)
Keep the kanban (it's already at the bar) and add the two things Pipedrive/HubSpot users expect alongside it:
- **List ↔ Board toggle.** A dense, sortable deal **list view** (table) sharing the same filter/saved-view state as the board. This is the biggest single pipeline gap.
- **Saved filters + filter bar** above both views (`S7-F1 ViewBar`): pipeline, status, assignee, health, value range.
- **In-board search** (client-side filter on loaded cards) — roadmap P6-1.
- **Board stats bar** ("N deals · ₹X pipeline") — roadmap P6-2.
- **Bulk actions** on list view: bulk-move-stage, bulk mark lost, bulk reassign (`S7-F2`).
- **Deal detail completion:** wire Notes (`NotesList`) and Files (`FileUploadZone` stub) tabs + Linked-Lead panel — roadmap P3-1/P3-2/P3-3.

### Components to build
- `apps/web/src/components/pipeline/PipelineViewToggle.tsx` — Board | List segmented control (reuses inline-`Tabs` styling).
- `apps/web/src/components/pipeline/DealListView.tsx` — sortable table (mirror `LeadTable` structure): columns Title, Stage, Value, Owner, Health, Updated; row → deal detail; checkbox column from `useMultiSelect`.
- `apps/web/src/components/pipeline/PipelineFilterBar.tsx` — mounts `ViewBar` (S7-F1) + `UserSelect` + status/health/value controls.
- Mount `BulkActionBar` (S7-F2) on `DealListView`.
- Reuse roadmap items for in-board search/stats/quick-add (P6-1/2/3) and detail tabs (P3-1/2/3).

### API dependencies
- **Reuse existing:** `GET /bff/deals` already accepts filters (`pipelineId`, `status`, `limit`) — extend query to accept `assignedToId`, `health`, `sort`, and remove the hardcoded `status=OPEN` so the list view can show WON/LOST.
- **New (small) backend:** bulk endpoints — `POST /api/v1/deals/bulk/move`, `POST /api/v1/deals/bulk/lost`, `POST /api/v1/deals/bulk/assign` (or a generic `POST /deals/bulk { ids, op, payload }`). BFF proxies under `/bff/deals/bulk/*`.
- **Deal notes (new):** `GET/POST /api/v1/deals/:id/notes` + BFF (roadmap P3-1).

### Implementation order
1. `PipelineViewToggle` + `DealListView` (read-only, reuse `/bff/deals`) → 2. `PipelineFilterBar` + `ViewBar` saved filters → 3. bulk endpoints + `BulkActionBar` on list → 4. in-board search + stats bar (P6) → 5. deal-detail Notes/Files/Linked-Lead (P3).

---

## 5. Screen 3 — Inbox

### Current state
`(dashboard)/inbox` is **fully built**: split-pane, All/Mine/Unassigned tabs, infinite-scroll conversation list, real-time socket messages, `ThreadView` with delivery status + retry, `WindowExpiredBanner`, `ComposeBar` with `/` saved-reply picker, create-lead-from-conversation. This is already close to HubSpot's conversation inbox.
**Gaps:** no conversation search, no per-conversation unread badges, "Assign to me" is a single action (not a full assignee picker), no SLA/response-time surfacing, no bulk conversation actions, right metadata panel only at `xl`.

### Target UX (benchmarked)
Bring it to HubSpot conversation-inbox parity:
- **Conversation search** across the list — roadmap P5-1.
- **Unread badges** per conversation + aggregate counts on tabs — roadmap P5-2 (requires `unreadCount` in list response).
- **Full assignee picker** in `ConversationHeader` via shared `UserSelect` — roadmap P5-3.
- **Response-time / SLA chip** on conversation rows ("⚠ awaiting reply 3h") — the operator signal HubSpot/Intercom surface. Derived from `lastInboundAt` vs now; client-computed initially.
- **Bulk conversation actions** (mark read, assign, close) via `S7-F2` on the list.
- **Saved views** (`S7-F1`): "Unassigned", "Awaiting reply", "Mine open" as view chips replacing/augmenting the current 3 tabs.

### Components to build
- Roadmap-owned: search (P5-1), unread badges (P5-2), assignee picker (P5-3).
- `apps/web/src/components/inbox/SlaChip.tsx` — semantic glass chip computed from `lastInboundAt`; green <1h, yellow <24h, red expired-window. No new tokens.
- Mount `ViewBar` (S7-F1) into `ConversationList` header; mount `BulkActionBar` (S7-F2) for multi-select conversations.

### API dependencies
- **Backend additions:** conversation list response must include `unreadCount` and `lastInboundAt` per conversation (P5-2 already calls for `unreadCount`). Search adds `q` param to `GET /api/v1/inbox/conversations` → BFF passthrough (BFF route exists).
- **Bulk (new):** `POST /api/v1/inbox/conversations/bulk { ids, op }` for mark-read/assign/close + BFF.
- **Reuse:** existing assignment PATCH, saved-replies endpoints, socket channel.

### Implementation order
1. `q` search param + P5-1 search input → 2. `unreadCount`/`lastInboundAt` in API + P5-2 badges + `SlaChip` → 3. `UserSelect` assignee (P5-3) → 4. `ViewBar` views → 5. bulk endpoint + `BulkActionBar`.

---

## 6. Screen 4 — Leads

### Current state
`(dashboard)/leads` is **fully built**: `LeadFilters` (search + multi-select status/source + **save/load/delete presets** — the seed of saved views), `LeadTable` (sortable Name/Created/AI-Score, inline status edit, pagination), CSV import/export with job polling. Lead detail has inline metadata, linked deals, activity/notes/files tabs, convert-to-contact.
**Gaps:** no bulk actions (despite API readiness), no column control/density, tags read-only (no edit UI), file upload stubbed, no saved *views* (only filter presets), AI Score unexplained, no linked-conversations panel.

### Target UX (benchmarked)
This is where Attio's data-grid maturity is the bar:
- **Bulk actions** on the table — bulk status change, bulk tag, bulk assign, bulk export-selected, bulk delete (`S7-F2`). The API already supports the operations per the audit; this is the highest-leverage Leads gap.
- **Saved views** — promote the existing `LeadFilters` presets to the shared `ViewBar` (`S7-F1`) so "My new leads", "Qualified this week" become one-click chips with sort + (later) columns baked in.
- **Column control + density toggle** — Attio-style: show/hide columns, comfortable/compact row height. Persist per-user via the saved-view contract.
- **Tags editing** — `TagChipInput` (roadmap P4-2) inline in `LeadMetadataForm`.
- **Linked conversations panel** on lead detail (roadmap P4-3) — closes the Inbox↔Lead loop.
- **AI Score affordance** — a tooltip/popover explaining the score factors (lightweight; no new ML).

### Components to build
- `apps/web/src/components/leads/LeadBulkActions.tsx` — config of `BulkActionBar` for lead ops.
- Add checkbox column to `LeadTable` via `useMultiSelect`.
- `apps/web/src/components/ui/ColumnControl.tsx` — popover (built on Radix Dialog/`Modal` or a wrapped Popover) listing toggleable columns + density radio.
- Migrate `LeadFilters` presets onto `ViewBar` (S7-F1) — keep backward compatibility with existing saved presets in localStorage.
- Roadmap-owned: `TagChipInput` (P4-2), `LinkedConversationsPanel` (P4-3), `FileUploadZone` wire-up (P4-1).

### API dependencies
- **Bulk (new):** `POST /api/v1/leads/bulk { ids, op, payload }` (status/tag/assign/delete) + BFF. Bulk-export-selected can reuse the existing export job with an `ids` filter.
- **Reuse:** existing `/leads` list (already supports `status[]`, `source[]`, `tags[]`, `search`, sort, pagination), convert, import/export, notes, activities.
- **Linked conversations:** `GET /api/v1/leads/:id/conversations` (new, small) or filter existing conversations by `leadId` + BFF.

### Implementation order
1. `useMultiSelect` checkbox column + `LeadBulkActions` + bulk endpoint → 2. `ViewBar` migration of presets → 3. `ColumnControl` + density → 4. `TagChipInput` (P4-2) → 5. linked conversations (P4-3) → 6. AI-score tooltip + file upload wire-up.

---

## 7. Screen 5 — Settings

### Current state
Only `settings/integrations/instagram` exists, and it is **fully built** (account cards, connect/disconnect, status badges, plan-limit footnote). There is **no settings shell/nav**, and no Team/Billing/Profile surfaces — so Settings reads as a single orphan page rather than a section.

### Target UX (benchmarked)
Every reference CRM presents Settings as a **left-rail section** with multiple panes. Sprint 7 builds the *shell* and the panes that are backend-ready, stubbing the rest honestly:
- **Settings layout with left-rail nav** (roadmap P7-1): Integrations · Team · Profile · Billing.
- **Profile pane** (backend-ready: `/api/v1/auth/me`, sessions) — view/edit name, change password, **active sessions list with revoke** (Attio/HubSpot security pane). This is genuinely buildable now and high-trust.
- **Team pane** — list org members + roles (RBAC module exists); invite flow stubbed if no invite endpoint.
- **Instagram pane polish** — reconnect button for EXPIRED accounts (roadmap P7-2).
- **Billing pane** — honest stub ("Managed by your account team") until a billing module exists; do not fake it.

### Components to build
- `apps/web/src/app/(dashboard)/settings/layout.tsx` + `apps/web/src/components/settings/SettingsNav.tsx` (roadmap P7-1).
- `apps/web/src/app/(dashboard)/settings/profile/page.tsx` + `ProfilePane` (name form reuses inline-edit pattern; password form; `SessionsList`).
- `apps/web/src/app/(dashboard)/settings/team/page.tsx` + `TeamMembersList` (read-only roles first).
- Stub `settings/billing/page.tsx` using `EmptyState`.
- Roadmap-owned: `InstagramAccountCard` reconnect (P7-2).

### API dependencies
- **Reuse:** `GET /api/v1/auth/me`, `GET/DELETE /api/v1/auth/sessions` (sessions audit confirmed these exist in the auth module), Instagram endpoints.
- **New BFF:** `/bff/auth/me`, `/bff/auth/sessions`, `/bff/org/members` (the last also unblocks shared `UserSelect`, roadmap P0-6).
- **Team:** read org members + roles from RBAC/org module (read endpoint may need adding); invite flow out of scope unless an endpoint exists.

### Implementation order
1. `SettingsNav` + `settings/layout.tsx` (turns Integrations into a section) → 2. Profile pane (me + password + sessions) → 3. `/bff/org/members` + Team read-only pane → 4. Instagram reconnect (P7-2) → 5. Billing stub.

---

## 8. Consolidated Implementation Order (strict, cross-screen)

Modernization shares atoms across screens, so the global order front-loads shared foundation, then sequences screens by **value × backend-readiness**.

```
STAGE A — Shared foundation (blocks everything)
  Prereq: gap-roadmap Phase 0 atoms (AvatarInitials, EmptyState, StatCard, UserSelect, NotesList, FileUploadZone)
  S7-F1  SavedViews engine + ViewBar           (pure FE)
  S7-F2  BulkActionBar + useMultiSelect          (pure FE)
  S7-F5  useKeyboardShortcuts + ShortcutHelp     (pure FE)
  S7-F4  Global search endpoint + BFF + hook     (backend)
  S7-F3  CommandPalette (⌘K) mounted in layout   (depends F4 for search zone)

STAGE B — Dashboard (highest perceived-maturity gain; backend stat endpoint)
  §3 / roadmap P2-1  dashboard/stats → KpiStrip → MyTasks → RecentActivity → QuickActions

STAGE C — Leads modernization (API already bulk-ready → fastest high-value win)
  §6  multiselect+bulk → ViewBar migration → ColumnControl/density → TagChipInput → linked convos

STAGE D — Pipeline modernization (list view is the marquee addition)
  §4  ViewToggle+DealListView → FilterBar/ViewBar → bulk endpoints → board search/stats → detail tabs

STAGE E — Inbox modernization (mostly roadmap P5 + SLA chip)
  §5  search → unread/SLA → assignee picker → ViewBar → bulk

STAGE F — Settings section (shell + Profile/Team/Billing)
  §7  SettingsNav+layout → Profile/sessions → Team → IG reconnect → Billing stub
```

**Rationale for ordering:** Stage A is unavoidable shared plumbing. Dashboard (B) is the biggest *perception* jump for the least backend (one aggregate endpoint). Leads (C) before Pipeline (D) because the Leads bulk API is already in place per the audit, making it the fastest high-value win, and it exercises `BulkActionBar`/`ViewBar` before the larger pipeline list build. Inbox (E) is largely the existing P5 roadmap plus the SLA chip. Settings (F) last — it's structurally isolated and lower-traffic.

---

## 9. Backend Work Introduced by This Plan (for capacity planning)

Modernization is mostly frontend, but it pulls in a bounded set of new endpoints. None require new modules; all extend existing ones.

| Endpoint | Module | Size | Unblocks |
|----------|--------|------|----------|
| `GET /dashboard/stats` | new thin `dashboard` (aggregates) | S | Dashboard KPIs |
| `GET /search?q=` | cross-module (leads/deals/inbox) | M | Command palette, global search |
| `POST /leads/bulk` | leads | S | Leads bulk actions |
| `POST /deals/bulk` | deals | S | Pipeline bulk actions |
| `POST /inbox/conversations/bulk` | inbox | S | Inbox bulk actions |
| `unreadCount` + `lastInboundAt` on conversation list | inbox | S | Unread badges, SLA chip |
| `assignedToId`/`health`/`sort` on `GET /deals`; drop hardcoded `OPEN` | deals | S | Pipeline list view |
| `GET /deals/:id/notes`, `POST` | deals/notes | S | Deal notes tab (P3-1) |
| `GET /org/members` | rbac/org | S | UserSelect, Team pane |
| `GET /leads/:id/conversations` | leads/inbox | S | Lead linked-conversations |

S = small (<½ day), M = medium (~1 day). All org-scoped via existing auth/RBAC middleware.

---

## 10. Acceptance Criteria (Sprint 7)

In addition to the Sprint 6 design-compliance criteria (token compliance, primitive reuse, typography, `transition-colors`, responsive degradation — all still enforced):

1. **Saved views** work on Leads, Pipeline, and Inbox from the same `ViewBar` component (one implementation, three mounts).
2. **Bulk actions** work on Leads table and Pipeline list from the same `BulkActionBar`/`useMultiSelect` (one implementation).
3. **⌘K command palette** opens globally, navigates and runs create-actions without a network call, and shows live search results when the search endpoint is up.
4. **Pipeline has a working List view** sharing filter/view state with the Board, toggled without a page reload.
5. **Dashboard** renders real org-scoped KPIs, My-Day actionables, and recent activity; every KPI is a deep link.
6. **Settings is a navigable section** with at least Integrations + Profile (with session revoke) functional.
7. **Keyboard:** `⌘K`, `g→i/l/p/d`, `c`, and `?` (help) all work and are discoverable via `ShortcutHelp`.
8. **Zero hex** in any new `.tsx`; **zero new icon libraries**; **zero skeleton loaders**; all four `tsc/eslint/test/build` gates green.
9. **No regressions:** existing Pipeline board, Inbox thread, and Leads table behavior unchanged where not explicitly modernized.

---

## 11. Explicitly Out of Scope for Sprint 7

- Server-side saved views (localStorage contract only; backend persistence deferred).
- Reporting/BI dashboards beyond the single operator KPI strip (no custom report builder).
- Email channel / multi-channel inbox (Instagram DM only, per current product).
- Typing indicators, read receipts beyond existing delivery status (needs Meta webhook events).
- AI scoring changes (only a tooltip explaining the existing score).
- Billing/payments integration (honest stub only).
- Team invite/role-edit write flows unless an endpoint already exists (read-only Team pane otherwise).
- Light mode, new icon library, new color tokens, sidebar redesign — **permanently out**, per standing constraints.
- File upload to S3 (FileUploadZone stays a stub until presigned-URL infra is confirmed).

---

*All current-state findings were extracted from live source files (`apps/web/src`, `apps/api/src`) and the existing token/primitive audit in `SPRINT_6_UI_UX_PLAN.md`. Competitive targets reflect Attio, HubSpot, and Pipedrive as of 2026. No implementation has been performed — this document is a plan only.*
