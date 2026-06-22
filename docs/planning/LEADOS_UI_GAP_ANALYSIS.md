# LeadOS UI Gap Analysis

**Date:** 2026-06-21
**Scope:** All pages in the (dashboard) route group
**Method:** Full source-code audit of every page and component file
**Purpose:** Identify what exists, what is missing, and what needs production-grade polish before Sprint 7 UI work begins

---

## Design System Baseline

All design work must use these existing LeadOS tokens only. No hex colors. No new libraries.

| Token category | Examples |
|---------------|---------|
| Backgrounds | `bg-base`, `bg-elevated`, `bg-subtle`, `bg-muted` |
| Text | `text-primary`, `text-secondary`, `text-tertiary` |
| Borders | `border-subtle` (use sparingly) |
| Semantic glass | `bg-{color}-500/15 text-{color}-400 border border-{color}-500/30` |
| Spacing | Tailwind scale (p-3, p-4, p-6, gap-4, space-y-4) |
| Radius | `rounded`, `rounded-md`, `rounded-lg` |

Existing UI primitives that MUST be reused: `Button`, `Modal`, `Badge`, `Tabs`, `Spinner`, `Select`, `Toast`

---

## Page Audits

---

### 1. Dashboard (`/`)

#### Current state

The page renders two lines of text:
```
LeadOS
Platform spine online. Dashboard arrives in a later sprint.
```
No layout, no data, no components. The code comment explicitly marks it as a placeholder for Sprint 8.

#### What is missing

**KPI Strip (Row 1)**
- Total active leads (count, trend vs last 30d)
- Open deals (count + total pipeline value)
- Deals won this month (count + value)
- Average response time in inbox (minutes)
- Win rate (%) with trend indicator

**Pipeline Health (Row 2)**
- Kanban stage distribution: horizontal bar or stacked bar chart showing deal counts per stage
- Weighted forecast total (reuse ForecastPanel component from pipeline page)

**Recent Activity Feed (Row 3 — left 60%)**
- Unified feed across lead + deal + inbox activity
- Last 10–20 activity items
- ActivityItemRow reuse from leads/deals detail
- "View all" link to activity page

**Quick Actions (Row 3 — right 40%)**
- "Add Lead" → opens a quick-create modal
- "Add Deal" → reuses existing AddDealModal
- "Go to Inbox" → links to /inbox

**My Open Tasks (Row 4)**
- Deals assigned to current user that are overdue or stale
- Leads assigned to current user in CONTACTED or QUALIFIED
- Empty state: "No tasks outstanding"

#### Layout structure

```
┌──────────────────────────────────────────┐
│  KPI Strip (4 cards, flex row, gap-4)    │
├──────────────────────────────────────────┤
│  Pipeline health bar  │  Weighted total  │
├──────────────────────────────────────────┤
│  Recent activity (60%) │ Quick actions (40%) │
├──────────────────────────────────────────┤
│  My open tasks (full width)              │
└──────────────────────────────────────────┘
```

**Responsive:** KPI cards → 2×2 grid on tablet, 1×4 column on mobile. Two-column rows → single column on mobile.

#### Empty states
- New org (no data): "Welcome to LeadOS. Add your first lead to get started." + CTA button
- KPI cards with zero values show "0" not empty/broken

#### Loading states
- KPI cards: skeleton shimmer (4 cards, same size as real cards)
- Activity feed: spinner centered in the section

#### Component reuse strategy
- `ForecastPanel` (from pipeline) — drop in with read-only prop
- `ActivityItemRow` (from deals/leads) — already abstracted
- `AddDealModal` (from kanban) — import directly
- `DealHealthBadge` (from deals) — on overdue task rows
- `LeadStatusBadge` (from leads) — on lead rows
- KPI stat cards: new `StatCard` component (single reusable card with label + value + trend arrow)

---

### 2. Leads (`/leads`)

#### Current state

Fully implemented. `LeadListPage` → `LeadFilters` + `LeadTable` + `CsvImportModal`.

**Table columns:** Name, Email, Source, Status (inline edit), AI Score (color-coded), Created (relative time)
**Filters:** Search, status buttons, source buttons, AI score range, date range, tags, assigned-to, save/load presets
**Pagination:** Previous/next buttons
**Actions:** Import CSV, Export CSV

#### What is missing

**Table polish**
- No avatar/initials column (first column feels sparse — industry standard for CRM tables)
- Phone column: present in model, missing from table
- Last activity relative time: valuable for sales workflows, not shown
- Bulk actions: select-all checkbox, bulk status change, bulk assign, bulk tag, bulk delete — not present
- Row hover state: currently rows just highlight on hover with default cursor; needs explicit pointer + subtle right-arrow or chevron hint

**Filter panel polish**
- Assigned-to filter is a raw user ID text input — needs a user select dropdown
- Tags filter is a comma-separated raw text input — needs a tag chip input with autocomplete
- "Save preset" modal is inline text only — needs a proper modal with name field
- Mobile: filter panel is always visible, should be collapsible toggle on mobile

**Import modal polish**
- Column template section ("CSV must contain: firstName, lastName…") is plain text — needs a styled code block or example table
- Progress percentage from import job is shown as raw fraction — should be a progress bar

**Empty state polish**
- "No leads found" is unstyled plain text — needs centered empty state with icon, heading, and CTA

**Missing: Lead detail navigation from table**
- Row click goes to `/leads/[id]` — already works, but no visual affordance (no right-arrow or hover color)

#### Layout structure

```
┌─────────────────────────────────────────┐
│  Leads                    [Import][Export] │
├──────────┬──────────────────────────────┤
│  Filters │  Table                        │
│  (panel) │  ┌──────────────────────────┐│
│          │  │ [Search]    [Status] [Src]││
│          │  ├──────────────────────────┤│
│          │  │ ☐ Avatar Name Email Phone ││
│          │  │ ☐ …                      ││
│          │  ├──────────────────────────┤│
│          │  │ Prev  1 of N  Next       ││
│          │  └──────────────────────────┘│
└──────────┴──────────────────────────────┘
```

**Responsive:** Filters panel hidden (behind toggle button) on < 1024px. Table scrolls horizontally on mobile.

#### Empty states
- No results from filter: "No leads match your filters. Try adjusting the filters or clearing them."
- Zero leads in org: "No leads yet. Import a CSV or add your first lead manually." + Add Lead button + Import button

#### Loading states
- Spinner centered in table area
- Skeleton rows (5 rows, variable column widths) during initial fetch

#### Component reuse strategy
- Existing `LeadStatusBadge`, `Badge`, `Button`, `Select`, `Spinner`, `Modal` — all reused
- New `AvatarInitials` component for lead avatar column (reusable across leads + deals + inbox)
- New `TagChipInput` for tags filter
- New `UserSelect` for assigned-to filter (fetches org members)

---

### 3. Lead Detail (`/leads/[id]`)

#### Current state

Fully implemented two-column layout. Left: metadata form + linked deals + convert to contact. Right: tabs (Activity / Notes / Files).

- `LeadMetadataForm`: inline-editable fields, save on blur
- `LeadActivityFeed`: infinite scroll
- `LeadNotesList`: textarea + note cards
- `LeadFilesList`: placeholder "coming soon"

#### What is missing

**File upload**
- Currently shows "File upload coming soon — requires presigned URL infrastructure"
- Needs: drag-and-drop upload zone, progress bar, file list with preview icons

**Tags editing**
- Tags are displayed in LeadMetadataForm but are read-only — no way to add or remove tags from the detail page
- Needs: tag chip input inline in the metadata section

**Assignment display**
- Lead detail doesn't show who the lead is assigned to or allow reassignment from the detail view
- Needs: "Assigned to" field with UserSelect dropdown in metadata form

**Linked conversations panel**
- A lead can have Instagram conversations but the detail page has no panel linking to those
- Needs: "Conversations" section below LinkedDealsPanel showing linked inbox conversations

**Timeline/history navigation**
- Activity feed is infinite scroll but has no way to jump to a date or filter by type
- Needs: activity type filter pills (e.g., "Notes only", "Status changes only")

**Status banner polish**
- WON/LOST banners are implemented but use plain text with no icon or prominent styling
- Needs: colored full-width banner with icon (✓ for WON, ✗ for LOST)

#### Layout structure

```
┌──────────────────────────────────────────┐
│  ← Leads  [Status badge]  [Health badge] │
├─────────────────────┬────────────────────┤
│  LEFT (60%)         │  RIGHT (40%)       │
│  ─────────────────  │  ──────────────── │
│  Metadata form      │  Tabs              │
│  (name, email,      │  [Activity][Notes] │
│   phone, status,    │  [Files]           │
│   source, score)    │                    │
│  ─────────────────  │  Tab content:      │
│  Linked deals       │  - Activity feed   │
│  ─────────────────  │  - Notes list      │
│  Conversations      │  - File list       │
│  ─────────────────  │                    │
│  Convert to contact │                    │
└─────────────────────┴────────────────────┘
```

**Responsive:** Side-by-side (lg+). Stacked (mobile) — right panel below left, full width.

#### Empty states
- Activity feed: "No activity recorded yet for this lead."
- Notes: "No notes yet. Add a note to track your conversations."
- Files: "No files attached."
- Linked deals: "No open deals linked. Create a deal from this lead."
- Conversations: "No conversations on Instagram."

#### Loading states
- Full-page spinner on initial load (already implemented)
- Individual section spinners for notes and activity on refresh
- File upload progress: horizontal progress bar below the drop zone

#### Component reuse strategy
- All existing lead components reused
- `AvatarInitials` (new, shared) for note author avatars
- `FileUploadZone` (new) for the Files tab — drag-and-drop, reusable for deal files too

---

### 4. Pipeline / Kanban (`/pipeline`)

#### Current state

Fully implemented Kanban board with lazy loading (SSR=false). `KanbanBoard` → `KanbanColumn` → `DealCard`.

Features: pipeline selector, forecast panel, drag-and-drop, add deal modal, lost reason modal, mobile stage navigation, deal health badges, high-value indicators.

#### What is missing

**Pipeline management**
- No UI to create a new pipeline or rename stages
- PipelineSelector shows pipelines but there's no "Create pipeline" option
- Needs: pipeline settings modal or a settings page entry

**Deal search / filter on board**
- No search on the Kanban view — users can't filter by assigned user, deal value range, or keyword
- As deal count grows (50+ per column), navigation becomes difficult
- Needs: search bar above the board + optional filters (assignee, value range)

**Collapsed column mode**
- No way to hide or collapse a stage column on desktop
- High-stage-count pipelines will overflow horizontally
- Needs: column collapse toggle (arrow icon per column header)

**Quick-add deal from board header**
- "+ Add Deal" is at the bottom of each column — users must scroll to the bottom of long columns
- Needs: "+ Add Deal" in the column header (currently shows only name + count + value)

**Board-level statistics bar**
- No summary bar above the board (total deals, total pipeline value, filter-aware)
- ForecastPanel exists but is collapsed by default
- Needs: always-visible top stats row: "N deals · ₹X total" with expansion into ForecastPanel

**Empty board state**
- No deals in any stage: shows only EmptyColumn components
- No zero-state for the overall board (no pipeline created)
- Needs: "Your pipeline is empty. Add your first deal to get started." with CTA

#### Layout structure

```
┌────────────────────────────────────────────┐
│  Pipeline: [Selector▾]   N deals · ₹X     │
│  [Forecast panel toggle]                    │
│  [Search deals…]  [Assigned: All▾]         │
├────────────────────────────────────────────┤
│  Stage 1 (N)  │  Stage 2 (N)  │  Stage 3  │
│  ₹X           │  ₹X           │  ₹X        │
│  ─────────── │  ───────────  │ ─────────  │
│  DealCard    │  DealCard     │  + Add     │
│  DealCard    │               │            │
│  + Add       │               │            │
└────────────────────────────────────────────┘
```

**Responsive:** Mobile shows single column with previous/next navigation (already implemented). Desktop horizontal scroll.

#### Empty states
- Empty column: already implemented (`EmptyColumn` with icon + Add Deal button)
- Empty board: new component `EmptyBoard` — centered, icon, heading, CTA

#### Loading states
- `KanbanSkeleton` already implemented — 3 column skeletons with pulsing cards

#### Component reuse strategy
- All existing kanban components reused
- `ForecastPanel` already exists — make top stats row a simplified always-visible strip
- `AddDealModal` already exists and reused from column header button

---

### 5. Deal Detail (`/pipeline/deals/[id]`)

#### Current state

Fully implemented two-column layout. Left: stage timeline + metadata form + win/loss CTA. Right: tabs (Activity / Notes / Files).

- `StageTimeline`: horizontal scrollable with click-to-move
- `DealMetadataForm`: inline-editable, save on blur
- `ActivityFeed`: infinite scroll
- Notes tab: "Coming soon" placeholder
- Files tab: "Coming soon" placeholder

#### What is missing

**Notes tab implementation**
- Currently shows "Coming soon"
- Backend already has notes support (from lead notes implementation)
- Needs: identical to `LeadNotesList` — textarea + note cards

**Files tab implementation**
- Currently shows "Coming soon"
- Needs: same `FileUploadZone` component planned for lead detail

**Linked lead panel**
- Deal knows its `leadId` but there's no panel on the deal detail showing the linked lead
- Needs: "Linked Lead" section in left panel (lead name + status badge, link to lead detail)

**Assignment field**
- Deal doesn't show who it's assigned to
- Needs: "Owner" field in DealMetadataForm

**Comments / collaboration**
- Notes are single-user; no threading or @mentions
- Out of scope for now but worth noting

**Stage timeline polish**
- Stage buttons truncate long stage names with no tooltip
- Needs: `title` attribute on each button for tooltip on hover

#### Layout structure

```
┌──────────────────────────────────────────┐
│  ← Pipeline  [Health badge]              │
├─────────────────────┬────────────────────┤
│  LEFT (60%)         │  RIGHT (40%)       │
│  Stage timeline     │  Tabs              │
│  ─────────────────  │  [Activity][Notes] │
│  Metadata form      │  [Files]           │
│  ─────────────────  │                    │
│  Linked lead        │  Tab content       │
│  ─────────────────  │                    │
│  Win / Loss CTA     │                    │
│  Status banner      │                    │
└─────────────────────┴────────────────────┘
```

**Responsive:** Stacked (mobile). Side-by-side lg+.

#### Empty states
- Activity feed: "No activity yet for this deal."
- Notes (once implemented): "No notes yet."
- Files (once implemented): "No files attached."

#### Loading states
- Full-page spinner on initial load (already implemented)
- Notes: spinner during fetch
- Files: spinner during fetch, progress bar during upload

#### Component reuse strategy
- `LeadNotesList` (from leads) → extract to shared `NotesList` component, reuse in both Lead and Deal detail
- `FileUploadZone` (new shared) → used in both Lead and Deal files tabs
- `AvatarInitials` (new shared) → note author avatar

---

### 6. Inbox (`/inbox`)

#### Current state

Fully implemented and complete. Two-panel layout: conversation list sidebar + thread view. Features: real-time Socket.io, infinite scroll on both list and thread, status management, tab filtering (All / Mine / Unassigned), compose with saved replies, create lead from conversation, window expired banner, message status indicators.

#### What is missing

**Conversation search**
- No search input for finding a specific conversation by lead name or message content
- As conversation count grows, tab filtering alone is insufficient
- Needs: search input at top of ConversationList sidebar

**Unread count badge**
- No unread conversation indicator (dot or count badge per ConversationItem)
- Needs: red dot or count badge on conversations with unread messages

**Conversation filters beyond tabs**
- Tabs (All/Mine/Unassigned) exist but no date range or IG account filter
- For orgs with multiple IG accounts, mixing is confusing
- Needs: additional filter row: "Account: All ▾" filter below the tabs

**Draft persistence**
- If a user types a message and switches to another conversation, the draft is lost
- Needs: per-conversation draft state (Zustand or local map in InboxPage)

**Typing indicator**
- Standard in modern inbox UIs (HubSpot, Intercom)
- Out of scope until Meta webhook provides typing events

**"Assign to" full assignee picker**
- ConversationHeader shows "Assign to me" but no way to assign to a different team member
- Needs: dropdown of org members when clicking the assign area

#### Layout structure (already production-ready as-is)

```
┌────────────┬─────────────────────────────────┐
│  Sidebar   │  Thread                          │
│  [Search]  │  ConversationHeader              │
│  [All][Mine│  ─────────────────────────────  │
│  ][Unas]   │  Messages (scroll)               │
│  [Acct▾]   │  ─────────────────────────────  │
│  ─────────  │  ComposeBar / WindowBanner       │
│  Conv list  │                                  │
└────────────┴─────────────────────────────────┘
```

#### Empty states (already implemented)
- "No conversations"
- "Select a conversation to get started"
- "No replies match" (in SavedReplyPicker)

#### Loading states (already implemented)
- Spinner in conversation list
- Spinner in thread view

#### Component reuse strategy
- Existing components are complete
- `AvatarInitials` (new shared) — currently ConversationItem uses initials inline; extract to shared component
- `UserSelect` (new shared) — for assignee picker

---

### 7. Instagram Integration (`/settings/integrations/instagram`)

#### Current state

Fully implemented. `InstagramIntegrationView` → `InstagramAccountCard`.

Features: connected account list, + Connect account OAuth button, status badges (ACTIVE/EXPIRED/DISCONNECTED), token expiry date, disconnect with confirmation, plan-based account limits info, success/error banners from OAuth redirect.

#### What is missing

**Token refresh / re-auth flow**
- EXPIRED account cards show the status badge but no clear action to re-authenticate
- Needs: "Reconnect" button on EXPIRED cards (triggers same OAuth flow)

**Account list pagination**
- If an org has > 10 accounts (SCALE plan), the list is unbounded
- Needs: pagination or scrollable list with height constraint

**Account health details**
- Token expiry date is shown as plain text
- Needs: color-coded: green if >30 days, yellow 7–30 days, red <7 days

**Settings navigation**
- The settings area only has the Instagram integration page — no navigation between settings sections
- Needs: left-hand settings navigation sidebar (Integrations, Team, Billing, Profile)

#### Layout structure

```
┌──────────────────────────────────────────┐
│  Settings                                │
├────────────┬─────────────────────────────┤
│  Nav       │  Instagram Integration      │
│  Integrat. │  ─────────────────────────  │
│  Team      │  [Success/error banner]     │
│  Billing   │  Connected accounts (N)     │
│  Profile   │  AccountCard AccountCard    │
│            │  [+ Connect account]        │
│            │  ─────────────────────────  │
│            │  Plan limits info           │
└────────────┴─────────────────────────────┘
```

**Responsive:** Settings nav collapses to dropdown/tabs on mobile.

#### Empty states (already implemented)
- Dashed border box: "No Instagram accounts connected yet."

#### Loading states (already implemented)
- "Loading…" text

#### Component reuse strategy
- `Badge` for status badges (already done)
- `Button` for all actions (already done)
- New `SettingsNav` component (left-hand navigation, used across all settings pages)

---

### 8. Notifications (no route exists)

#### Current state

No page, no route, no component. The `NotificationPublisher` exists on the backend (Socket.io emitter), but there is no frontend UI to display notifications.

#### What is missing

**Notification bell (global)**
- Bell icon in the dashboard sidebar or header with unread count badge
- Clicking opens a dropdown or slide-out panel

**Notification panel / dropdown**
- List of recent notifications (newest first)
- Each row: icon, message text, relative timestamp, "mark as read" state (read = faded)
- Notification types needed:
  - New inbound message in inbox
  - Lead status changed (by another user)
  - Deal moved to a stage (by another user)
  - Deal won / lost (by another user)
  - Assignment changes (deal or conversation assigned to current user)
- "Mark all as read" action
- "View all notifications" link → full page

**Notification full page (`/notifications`)**
- Identical to the dropdown but full-page, paginated
- Filter by type (Messages / Leads / Deals / Assignments)
- Date range filter

**Socket integration**
- Backend already emits notification events via Socket.io to org rooms
- Frontend InboxPage already subscribes to the socket — notification subscription needs to be added at layout level (not just inbox)

#### Layout structure (dropdown)

```
┌──────────────────────────┐
│  Notifications  [Mark all]│
├──────────────────────────┤
│  [All][Messages][Deals]   │
├──────────────────────────┤
│  ● New message from Ana   │
│    2 min ago              │
│  ─────────────────────── │
│  ○ Deal moved: Proposal   │
│    1 hour ago             │
├──────────────────────────┤
│  View all notifications → │
└──────────────────────────┘
```

#### Layout structure (full page)

```
┌──────────────────────────────────────────┐
│  Notifications               [Mark all]  │
│  [All][Messages][Leads][Deals][Assign]   │
├──────────────────────────────────────────┤
│  Notification row (read/unread)          │
│  Notification row                        │
│  …                                       │
│  [Load more]                             │
└──────────────────────────────────────────┘
```

#### Empty states
- "You're all caught up. No new notifications."

#### Loading states
- Spinner below the filter tabs
- Optimistic mark-as-read (immediate UI update, background API call)

#### Component reuse strategy
- `Badge` for unread count
- `Spinner` for loading
- `Button` for mark all as read
- Socket subscription pattern from `InboxPage` — extract to a shared `useSocket` hook at layout level
- `ActivityItemRow` (from deals/leads) can be adapted for notification rows

---

### 9. Activity Feed (no standalone route exists)

#### Current state

Activity feeds exist embedded in Lead detail (LeadActivityFeed) and Deal detail (ActivityFeed). There is no standalone Activity Feed page.

#### What is missing

**Unified activity feed page (`/activity`)**
- Cross-entity feed: lead events + deal events + inbox events + assignment changes
- Filterable by type, entity, user, and date range
- Infinite scroll

**Sidebar navigation entry**
- Activity is not linked in the dashboard sidebar

#### Layout structure

```
┌──────────────────────────────────────────┐
│  Activity Feed                           │
│  [All][Leads][Deals][Inbox][Assignments] │
│  Date range: [From] [To]   [User: All▾] │
├──────────────────────────────────────────┤
│  ActivityItemRow (with entity link)      │
│  ActivityItemRow                         │
│  ActivityItemRow                         │
│  [Load more]                             │
└──────────────────────────────────────────┘
```

#### Empty states
- "No activity yet. Start by adding leads or deals."

#### Loading states
- Initial: spinner centered in content area
- Loading more: small spinner below last item

#### Component reuse strategy
- `ActivityItemRow` / `ActivityItem` (from deals) — already abstracted, needs a link to the parent entity
- Filter pills: reuse pattern from LeadFilters toggle buttons

---

## Consolidated Gap Summary

| Page | Status | Priority gaps |
|------|--------|--------------|
| Dashboard | ❌ Placeholder | Full implementation needed |
| Leads list | ✅ Functional | Avatar col, bulk actions, filter polish |
| Lead detail | ✅ Functional | File upload, tags editing, linked conversations |
| Pipeline / Kanban | ✅ Functional | Deal search, board-level stats, pipeline mgmt |
| Deal detail | ✅ Functional | Notes tab, Files tab, linked lead panel |
| Inbox | ✅ Complete | Conversation search, unread badges, assignee picker |
| Instagram settings | ✅ Functional | Reconnect flow, settings nav |
| Notifications | ❌ Missing | Full implementation needed (backend ready) |
| Activity Feed | ❌ Missing | Full implementation needed (components ready) |

---

## Shared Components Needed

These new components appear across multiple pages and should be built once:

| Component | Used by |
|-----------|---------|
| `AvatarInitials` | Leads table, Lead detail notes, Inbox ConversationItem |
| `StatCard` | Dashboard KPI strip |
| `NotesList` | Lead detail (replaces LeadNotesList), Deal detail Notes tab |
| `FileUploadZone` | Lead detail Files tab, Deal detail Files tab |
| `TagChipInput` | Lead filters, LeadMetadataForm tags edit |
| `UserSelect` | Lead filters assigned-to, ConversationHeader assignee picker, Deal metadata owner |
| `SettingsNav` | Instagram settings + future settings pages |
| `NotificationBell` | Dashboard layout sidebar/header |
| `NotificationPanel` | Layout-level dropdown |
| `NotificationRow` | NotificationPanel + /notifications page |
| `EmptyState` | Reusable empty state (icon + heading + optional CTA) |

---

## What Explicitly Must NOT Change

Per SPRINT_6_UI_UX_PLAN.md and user instructions:
- No hex colors anywhere
- No new icon libraries (use existing inline SVG or current icon set only)
- No new design system or component library
- No redesign of the existing sidebar
- No `transition-all` (use specific transition properties only)
- No introduction of skeleton loaders where spinners currently exist (do not regress existing loading UX)
- No dark-mode toggle (app is dark-first, always)
- No color token changes
- Keep all existing design tokens exactly as-is
