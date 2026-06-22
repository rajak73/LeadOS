# LeadOS UI Implementation Roadmap

**Date:** 2026-06-21
**Prerequisite reading:** LEADOS_UI_GAP_ANALYSIS.md (read first — this document references it throughout)
**Purpose:** Ordered, sprint-sized implementation plan for transforming LeadOS from engineering prototype to production-quality SaaS CRM UI

---

## Guiding Principles

1. **Reuse over reinvent.** Every new component must check existing primitives first.
2. **No regressions.** Every page touched must keep all existing tests green.
3. **Bottom-up shared components first.** Build shared atoms (`AvatarInitials`, `NotesList`, `EmptyState`, `StatCard`) before assembling page-level layouts.
4. **Highest-value gaps first.** Notifications and Dashboard have zero functionality — those are higher priority than polish on working pages.
5. **No hex, no new libraries, no skeleton loaders where spinners exist, no redesign of the sidebar.**

---

## Phase 0 — Shared Foundation (implement first, blocks everything else)

These components are used across ≥2 pages. Build them before touching any page.

### P0-1: `AvatarInitials` component

**File:** `apps/web/src/components/ui/AvatarInitials.tsx`

**Spec:**
- Props: `name: string`, `size?: 'xs' | 'sm' | 'md'`, `className?: string`
- Derives initials from name (first + last initial, max 2 chars)
- Background: `bg-primary-600/30 text-primary-400` (semantic glass pattern)
- Sizes: `xs` = h-6 w-6 text-xs, `sm` = h-8 w-8 text-sm, `md` = h-10 w-10 text-base
- Shape: `rounded-full`
- No external image support (initials only)
- Replace inline initials in: `ConversationItem`, future notification rows, lead table rows

### P0-2: `EmptyState` component

**File:** `apps/web/src/components/ui/EmptyState.tsx`

**Spec:**
- Props: `heading: string`, `body?: string`, `action?: { label: string; onClick: () => void }`
- Layout: flex-col items-center, py-12, gap-3
- Icon slot: SVG inline (pass as prop or use a default inbox/folder icon using existing approach)
- Heading: `text-base font-medium text-text-primary`
- Body: `text-sm text-text-secondary text-center max-w-xs`
- Action: `Button` variant `primary` size `sm`
- Used to replace all plain-text empty states across the app

### P0-3: `NotesList` component (extracted from `LeadNotesList`)

**File:** `apps/web/src/components/ui/NotesList.tsx`

**Spec:**
- Props: `entityType: 'lead' | 'deal'`, `entityId: string`
- Extracts the pattern from `LeadNotesList` exactly — same UI
- Textarea (3 rows) + "Add Note" button + scrollable note cards
- Note card: text (pre-wrap), author initials (`AvatarInitials` xs), relative timestamp
- Loading state: `Spinner` centered
- Empty state: `EmptyState` with "No notes yet. Add a note to track context."
- The existing `LeadNotesList` becomes a thin wrapper: `<NotesList entityType="lead" entityId={leadId} />`
- Deal detail Notes tab uses: `<NotesList entityType="deal" entityId={dealId} />`

### P0-4: `FileUploadZone` component (stub first)

**File:** `apps/web/src/components/ui/FileUploadZone.tsx`

**Spec:**
- Props: `entityType: 'lead' | 'deal'`, `entityId: string`
- For now: dashed border box with icon, "File upload available once presigned URL infrastructure is wired"
- Maintains the contract so the Files tab can be filled in later without interface change
- Existing files list below (reads existing attached files — may be empty)
- Empty state: `EmptyState` with "No files attached."
- Note: do not implement actual upload logic — stub is sufficient until S3 infrastructure is confirmed

### P0-5: `StatCard` component

**File:** `apps/web/src/components/ui/StatCard.tsx`

**Spec:**
- Props: `label: string`, `value: string | number`, `trend?: { delta: number; period: string }`, `loading?: boolean`
- Layout: `bg-elevated border rounded-lg p-4` — standard card
- Label: `text-xs text-text-tertiary uppercase tracking-wide`
- Value: `text-2xl font-semibold text-text-primary`
- Trend (optional): `text-xs` — green arrow up if delta > 0, red arrow down if delta < 0, neutral if 0
- Loading: `Spinner` sm centered in card, same card dimensions
- Used by Dashboard KPI strip only initially; designed to be generic

### P0-6: `UserSelect` component

**File:** `apps/web/src/components/ui/UserSelect.tsx`

**Spec:**
- Props: `value: string | null`, `onChange: (userId: string | null) => void`, `placeholder?: string`, `nullable?: boolean`
- Fetches org members from `/api/bff/org/members` (BFF route needed)
- Renders using existing `Select` primitive with member name options
- Optional "Unassigned" option when `nullable` is true
- Used by: Leads filter assigned-to, ConversationHeader assignee picker, Deal metadata owner field, Lead metadata assigned-to field

---

## Phase 1 — Missing Pages (highest value, backend ready)

### P1-1: Notifications — Bell + Panel

**Priority:** High — backend emitter exists (NotificationPublisher), zero frontend

**Files to create:**
- `apps/web/src/components/notifications/NotificationBell.tsx`
- `apps/web/src/components/notifications/NotificationPanel.tsx`
- `apps/web/src/components/notifications/NotificationRow.tsx`
- `apps/web/src/lib/hooks/useNotifications.ts`
- `apps/web/src/app/api/bff/notifications/route.ts` (BFF proxy)

**Files to modify:**
- `apps/web/src/app/(dashboard)/layout.tsx` — add `NotificationBell` to header/sidebar, move socket init here from InboxPage

**NotificationBell spec:**
- Bell SVG icon (existing icon approach — no new icon library)
- Red badge with unread count (capped at "9+")
- Click: toggles `NotificationPanel`
- Location: top of sidebar or top-right of main header area
- Uses `useNotifications` hook for unread count

**NotificationPanel spec:**
- Slide-out or dropdown anchored to bell icon
- Width: 360px on desktop, full-screen sheet on mobile
- Header: "Notifications" + "Mark all read" button (text-xs ghost)
- Filter pills: All / Messages / Leads / Deals
- `NotificationRow` list (newest first, max 20 in panel)
- "View all →" link at bottom → `/notifications`
- Close on click-outside (Radix Popover or manual)
- Loading state: `Spinner` centered

**NotificationRow spec:**
- Layout: flex gap-3, py-3, border-b
- Icon: semantic glass circle (same pattern as `ActivityItemRow`)
- Unread dot: absolute positioned, bg-primary-500, w-2 h-2, rounded-full
- Message text: `text-sm text-text-primary` (bold if unread, normal if read)
- Timestamp: `text-xs text-text-tertiary`
- Click: navigates to the source entity (lead detail, deal detail, or inbox conversation)
- Read state: `opacity-60` on read rows

**useNotifications hook spec:**
- Fetches recent notifications from BFF
- Subscribes to socket events at layout level (moved from InboxPage)
- Provides: `notifications`, `unreadCount`, `markAllRead()`, `markRead(id)`
- React Query with staleTime 30s

**Socket migration:**
- Move socket initialization from `InboxPage.tsx` to `layout.tsx` or a new `useSocket()` hook
- InboxPage subscribes to inbox-specific events only
- Layout subscribes to notification events for the org room

### P1-2: Notifications — Full Page

**Files to create:**
- `apps/web/src/app/(dashboard)/notifications/page.tsx`
- `apps/web/src/app/(dashboard)/notifications/NotificationsPage.tsx`

**Spec:**
- Page heading: "Notifications" + "Mark all read" button (top-right)
- Filter tabs: All / Messages / Leads / Deals / Assignments
- Date range filter (two date inputs, same pattern as LeadFilters)
- Infinite scroll list of `NotificationRow` components
- Sidebar nav entry needed: add "Notifications" link with unread badge to sidebar

**Sidebar nav change:**
- Add link between "Inbox" and "Settings" in PrimaryNavLinks
- Link label: "Notifications" with `NotificationBell` badge inline

### P1-3: Activity Feed — Full Page

**Priority:** Medium — components exist, no API route needed (reuse existing activity API)

**Files to create:**
- `apps/web/src/app/(dashboard)/activity/page.tsx`
- `apps/web/src/app/(dashboard)/activity/ActivityFeedPage.tsx`
- `apps/web/src/app/api/bff/activity/route.ts` (BFF proxy — fetches cross-entity activity)

**Spec:**
- Page heading: "Activity"
- Filter pills: All / Leads / Deals / Inbox / Assignments
- Date range filter (same pattern as notifications)
- User filter: `UserSelect` for "by user" filtering
- Infinite scroll `ActivityItemRow` list
- Each row must include entity name + link (e.g., "Deal: Q4 Enterprise → [link]")
- Empty state: `EmptyState` with "No activity yet."
- Loading state: `Spinner`

**Sidebar nav change:**
- Add "Activity" link to sidebar nav (below Notifications)

---

## Phase 2 — Dashboard KPI Page

**Priority:** High — currently a placeholder with no content

### P2-1: Dashboard page

**Files to modify:**
- `apps/web/src/app/(dashboard)/page.tsx` — replace placeholder with `DashboardPage`

**Files to create:**
- `apps/web/src/app/(dashboard)/DashboardPage.tsx`
- `apps/web/src/components/dashboard/KpiStrip.tsx`
- `apps/web/src/components/dashboard/RecentActivitySection.tsx`
- `apps/web/src/components/dashboard/QuickActionsSection.tsx`
- `apps/web/src/components/dashboard/MyTasksSection.tsx`
- `apps/web/src/lib/hooks/useDashboardStats.ts`
- `apps/web/src/app/api/bff/dashboard/stats/route.ts` (BFF proxy to new API endpoint)

**API endpoint needed (backend):** `GET /api/v1/dashboard/stats`
- Returns: `{ activeleads: number, openDeals: number, pipelineValue: number, wonThisMonth: number, wonValueThisMonth: number, avgResponseTimeMinutes: number, winRate: number }`
- Scoped to organizationId from auth context
- No joins needed — can be implemented as 4–5 Prisma aggregate queries

**KpiStrip spec:**
- 4 `StatCard` components in a flex row (gap-4, flex-wrap)
- Cards: Active Leads, Open Deals (+ pipeline value subtext), Won This Month (+ value), Win Rate %
- Loading: each card shows `loading` prop → Spinner
- Error: each card shows "—" value

**DashboardPage layout:**
```
Row 1: KpiStrip (4 StatCards)
Row 2: ForecastPanel (read-only, imported from pipeline)
Row 3: RecentActivitySection (60%) | QuickActionsSection (40%)
Row 4: MyTasksSection
```

**RecentActivitySection spec:**
- Title: "Recent Activity"
- Last 15 cross-entity activities
- `ActivityItemRow` per item (reuse existing)
- "View all →" link → `/activity`
- Empty state: `EmptyState`

**QuickActionsSection spec:**
- Title: "Quick Actions"
- 3 buttons stacked: "Add Lead" (opens modal), "Add Deal" (opens `AddDealModal`), "Go to Inbox" (link)
- Each button: full width, secondary variant, left-aligned icon + label

**MyTasksSection spec:**
- Title: "My Tasks"
- Two sub-lists:
  - Overdue/stale deals (from existing `/deals` API with health=overdue&assignedToMe=true)
  - Leads pending follow-up (status=CONTACTED | QUALIFIED, assignedToMe=true)
- `DealHealthBadge` on deal rows
- `LeadStatusBadge` on lead rows
- Empty state: `EmptyState` with "No outstanding tasks."

**Responsive:**
- Row 3: flex-col on mobile (activity then quick actions stacked)
- KPI strip: 2×2 grid on md, 1×1 stack on sm

---

## Phase 3 — Deal Detail Completions

**Priority:** High — "coming soon" placeholders are visible to users

### P3-1: Deal detail Notes tab

**Files to modify:**
- `apps/web/src/components/deals/DealDetailPage.tsx` — replace "Coming soon" with `<NotesList entityType="deal" entityId={dealId} />`

**Backend needed:** `GET /api/v1/deals/:id/notes` and `POST /api/v1/deals/:id/notes`
- Same shape as Lead notes
- BFF routes: `apps/web/src/app/api/bff/deals/[id]/notes/route.ts`
- Hook: `apps/web/src/lib/hooks/useDealNotes.ts`

### P3-2: Deal detail Files tab

**Files to modify:**
- `apps/web/src/components/deals/DealDetailPage.tsx` — replace "Coming soon" with `<FileUploadZone entityType="deal" entityId={dealId} />`

Note: `FileUploadZone` is stubbed (P0-4). This just wires the stub in.

### P3-3: Linked lead panel in Deal detail

**Files to modify:**
- `apps/web/src/components/deals/DealDetailPage.tsx` — add `LinkedLeadPanel` to left column
- `apps/web/src/components/deals/LinkedLeadPanel.tsx` (new)

**LinkedLeadPanel spec:**
- Shows the lead linked to this deal (from `deal.leadId`)
- Lead name + `LeadStatusBadge`
- Click navigates to `/leads/[id]`
- Empty state: "No lead linked to this deal."

---

## Phase 4 — Lead Detail Completions

**Priority:** Medium — file upload is stubbed, tags editing missing

### P4-1: Lead detail Files tab

**Files to modify:**
- `apps/web/src/components/leads/LeadDetailPage.tsx` — replace `LeadFilesList` with `<FileUploadZone entityType="lead" entityId={leadId} />`

### P4-2: Tags editing in Lead detail

**Files to modify:**
- `apps/web/src/components/leads/LeadMetadataForm.tsx` — replace read-only tags display with `TagChipInput`

**TagChipInput spec:**
- Props: `value: string[]`, `onChange: (tags: string[]) => void`
- Chip display for each tag with × remove button
- Text input at end of chips for adding new tags (Enter or comma to add)
- Design: `bg-primary-500/15 text-primary-400 border border-primary-500/30 rounded px-2 py-0.5` per chip
- On change: calls `usePatchLead` to persist

### P4-3: Lead detail — linked conversations panel

**Files to modify:**
- `apps/web/src/components/leads/LeadDetailPage.tsx` — add `LinkedConversationsPanel`
- `apps/web/src/components/leads/LinkedConversationsPanel.tsx` (new)

**LinkedConversationsPanel spec:**
- Shows Instagram conversations where `leadId` matches this lead
- Conversation item: IG handle, last message preview (truncated), relative time
- Click: navigates to `/inbox` with conversation pre-selected (via URL param or Zustand)
- Empty state: "No Instagram conversations linked."

---

## Phase 5 — Inbox Polish

**Priority:** Medium — core functionality is complete

### P5-1: Conversation search

**Files to modify:**
- `apps/web/src/components/inbox/ConversationList.tsx` — add search input above the list

**Spec:**
- Input: `bg-subtle border-0 rounded px-3 py-2 text-sm` (matches design system)
- Debounced 300ms
- Passes `q` query param to conversation list API
- Clears with × button

### P5-2: Unread count badges on conversations

**Files to modify:**
- `apps/web/src/components/inbox/ConversationItem.tsx` — add unread dot/badge

**Spec:**
- Backend must return `unreadCount` per conversation in the list response
- If `unreadCount > 0`: red dot (w-2 h-2, bg-red-500, rounded-full) in top-right of avatar OR a count badge
- ConversationList tab bar: show aggregate unread count on "All" and "Mine" tabs

### P5-3: Assignee picker in ConversationHeader

**Files to modify:**
- `apps/web/src/components/inbox/ConversationHeader.tsx` — replace "Assign to me" with `UserSelect`

**Spec:**
- When `conversation.assignedToId` is null: show `UserSelect` with placeholder "Assign…"
- When assigned: show assignee name, clicking opens `UserSelect` pre-selected
- On change: calls PATCH conversation assignee API
- Uses shared `UserSelect` (P0-6)

---

## Phase 6 — Pipeline Polish

**Priority:** Low — kanban is functional and usable

### P6-1: Deal search on board

**Files to modify:**
- `apps/web/src/components/kanban/KanbanBoard.tsx` — add search input + filter row above board

**Spec:**
- Search input: debounced, filters deal cards in all columns (client-side filter on loaded data)
- Assignee filter: `UserSelect` (All or specific user)
- Filter bar: `flex gap-3 mb-4 items-center`

### P6-2: Board-level stats bar

**Files to modify:**
- `apps/web/src/components/kanban/KanbanBoard.tsx` — add slim stats row above the board

**Spec:**
- Always visible: "N deals · ₹X total pipeline"
- Text: `text-sm text-text-secondary`
- ForecastPanel toggle remains below this

### P6-3: Quick add deal from column header

**Files to modify:**
- `apps/web/src/components/kanban/KanbanColumn.tsx` — add `+ Add` button to column header (in addition to existing bottom button)

---

## Phase 7 — Instagram Settings Polish

**Priority:** Low — settings are functional

### P7-1: Settings navigation sidebar

**Files to create:**
- `apps/web/src/components/settings/SettingsNav.tsx`
- `apps/web/src/app/(dashboard)/settings/layout.tsx` (wraps all settings pages with SettingsNav)

**SettingsNav spec:**
- Left-column nav (w-48): links to Integrations, Team (stub), Billing (stub), Profile (stub)
- Active link: `text-text-primary bg-bg-subtle`
- Inactive: `text-text-tertiary hover:text-text-primary`
- Mobile: horizontal tabs above content

### P7-2: Reconnect button for expired accounts

**Files to modify:**
- `apps/web/src/components/settings/InstagramAccountCard.tsx` — add "Reconnect" button for EXPIRED status

**Spec:**
- Same OAuth flow as "Connect account" button
- Shows on cards with `status === 'EXPIRED'`
- Replaces the disconnect button for expired accounts (or shows both)

---

## Implementation Order (strict)

```
Phase 0 (shared foundation)
  → P0-1 AvatarInitials
  → P0-2 EmptyState
  → P0-3 NotesList
  → P0-4 FileUploadZone (stub)
  → P0-5 StatCard
  → P0-6 UserSelect

Phase 1 (missing pages)
  → P1-1 Notifications bell + panel + socket migration
  → P1-2 Notifications full page + sidebar nav entry
  → P1-3 Activity feed page + sidebar nav entry

Phase 2 (dashboard)
  → P2-1 Dashboard KPI page (backend stat endpoint + BFF + DashboardPage)

Phase 3 (deal detail completions)
  → P3-1 Deal notes tab (backend + BFF + NotesList wire-up)
  → P3-2 Deal files tab (FileUploadZone stub wire-up)
  → P3-3 Linked lead panel

Phase 4 (lead detail completions)
  → P4-1 Lead files tab (FileUploadZone stub wire-up)
  → P4-2 Tags editing (TagChipInput)
  → P4-3 Linked conversations panel

Phase 5 (inbox polish)
  → P5-1 Conversation search
  → P5-2 Unread badges
  → P5-3 Assignee picker

Phase 6 (pipeline polish)
  → P6-1 Deal search on board
  → P6-2 Board stats bar
  → P6-3 Quick-add from column header

Phase 7 (settings polish)
  → P7-1 Settings nav sidebar
  → P7-2 Reconnect button for expired IG accounts
```

---

## Approval Gates (per phase)

Before any phase is merged:
1. `tsc --noEmit` — 0 errors
2. `eslint` — 0 errors on changed files
3. `next build` — successful
4. `vitest run` — all existing tests pass + new tests for new hooks/components
5. Visual: load the page in a browser, test happy path + empty state + loading state
6. Visual: resize to 375px mobile width — no horizontal overflow, no broken layouts

---

## What Is Explicitly Out of Scope

- New color tokens (use existing only)
- New icon library (use existing inline SVG approach)
- New component library (use existing primitives only)
- Sidebar redesign
- Dark/light mode toggle
- File upload actual S3 integration (stub only)
- Typing indicators in inbox (requires Meta webhook events)
- AI-powered features (Sprint 8)
- Billing page (settings nav has stub entry only)
- Team management page (settings nav has stub entry only)
- Profile page (settings nav has stub entry only)
