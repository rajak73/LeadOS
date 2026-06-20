# Sprint 6 — UI/UX Design Consistency Plan

**Author:** Principal Engineer (source-code audit)
**Date:** 2026-06-21
**Status:** PLAN — companion to SPRINT_6_EXECUTION_PLAN.md
**Scope:** Instagram Inbox, OAuth settings, all new Sprint 6 screens

> **Prime directive:** Every Sprint 6 screen must feel like it was always part of LeadOS. An agent switching from the Leads list to the Inbox should never notice a design handoff boundary.

---

## 1. Existing Design System Audit

All values below are sourced from live source files, not from documentation.

---

### 1.1 Design Token Reference (`apps/web/src/styles/tokens.css`)

These are the only colours, radii and semantic values permitted. No new tokens. No hardcoded hex values in Sprint 6 components.

**Background scale** — deepest dark is base; UI surface lifts in steps:

| Token | Value | Usage |
|-------|-------|-------|
| `bg-base` | `#0a0a0f` | Page background, input fills |
| `bg-elevated` | `#111118` | Cards, sidebar, modals, filter panels |
| `bg-overlay` | `#16161e` | Hover surfaces, context menus |
| `bg-subtle` | `#1c1c26` | Column backgrounds, list row hover, section fills |
| `bg-muted` | `#22222f` | Deepest interactive surface (rarely needed) |

**Border scale** — use in ascending specificity:

| Token | Value | Usage |
|-------|-------|-------|
| `border-subtle` | `#1e1e2a` | Hairline separators within cards |
| `border` (default) | `#27273a` | All card borders, input borders, dividers |
| `border-strong` | `#353545` | Hover/focus state for cards |

**Text scale:**

| Token | Value | Usage |
|-------|-------|-------|
| `text-primary` | `#f0f0fa` | Headings, values, names, primary content |
| `text-secondary` | `#9898b8` | Body text, descriptions, labels in lists |
| `text-tertiary` | `#6262a0` | Timestamps, form field labels, placeholders, counts |

**Brand:**

| Token | Usage |
|-------|-------|
| `primary-500` (#6366f1) | Focus rings, active indicators, links, active tab underline |
| `primary-600` (#4f46e5) | Primary button background |
| `primary-700` (#4338ca) | Primary button hover |

**Semantic (Tailwind Arbitrary-Opacity Pattern):**

The codebase uses `bg-{color}-500/15 text-{color}-400 border border-{color}-500/30` for all semantic states — a "coloured glass" pattern. Always follow this three-part formula.

| State | Background | Text | Border |
|-------|-----------|------|--------|
| Success / WON | `bg-green-500/15` | `text-green-400` | `border-green-500/30` |
| Danger / error / LOST | `bg-red-500/15` | `text-red-400` | `border-red-500/30` |
| Warning / stale | `bg-yellow-500/15` | `text-yellow-400` | `border-yellow-500/30` |
| Info / open / active | `bg-blue-500/15` | `text-blue-400` | `border-blue-500/30` |
| Brand highlight | `bg-primary-500/10` | — | `border-primary-500/30` |

**Radii:**

| Token | Value | Usage |
|-------|-------|-------|
| `rounded` (Tailwind default) | 0.25rem | Badges, small chips, tag-size elements |
| `rounded-lg` → `var(--radius-lg)` | 0.75rem | Inputs, buttons (md/lg), dropdown items |
| `rounded-xl` → `var(--radius-xl)` | 1rem | Cards, modals, panel containers |

**Typography:**

| Class | Usage |
|-------|-------|
| `text-xl font-semibold text-text-primary` | Page heading (`<h1>`) |
| `text-base font-semibold text-text-primary` | Modal title, section heading |
| `text-sm font-medium text-text-primary` | Card title, nav item, column header, button md |
| `text-sm text-text-secondary` | Body text, descriptions |
| `text-sm text-text-tertiary` | Empty state messages |
| `text-xs text-text-tertiary` | Form labels (`block mb-1`), timestamps, count badges |
| `text-xs font-medium` | Badge content |

---

### 1.2 Reusable Primitive Components (`apps/web/src/components/ui/`)

These components must be used as-is in Sprint 6. Do not create variants unless a genuinely new semantic is needed, and document the reason.

**`Button`** — variants: `primary`, `secondary`, `ghost`, `danger`; sizes: `sm`, `md`, `lg`

Primary button exact class breakdown:
```
bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50
inline-flex items-center gap-1.5 font-medium transition-colors cursor-pointer
px-3.5 py-1.5 text-sm rounded-lg   ← size md
```

Secondary (default) button:
```
bg-bg-elevated border border-border text-text-primary hover:bg-bg-subtle disabled:opacity-50
```

Ghost button: `text-text-secondary hover:text-text-primary hover:bg-bg-subtle`
Danger button: `bg-red-600 text-white hover:bg-red-700`

**`Badge`** — variants: `default`, `overdue`, `stale`, `won`, `lost`, `open`
- Base: `inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded`
- New variants needed in Sprint 6: `active` (Instagram account connected — use `open` variant), `expired` (token expired — use `overdue` variant), `unread` (new message — use `open` variant with a dot prefix)

**`Modal`** — `max-w-md bg-bg-elevated border border-border rounded-xl p-6 shadow-2xl`
- All create/confirm dialogs use this. Do not build custom dialog boxes.
- Overlay: `fixed inset-0 bg-black/60 z-40`

**`Select`** — Radix Select with:
- Trigger: `bg-bg-elevated border border-border rounded-lg hover:bg-bg-subtle`
- Content: `bg-bg-elevated border border-border rounded-lg shadow-xl`
- Items: `text-text-primary hover:bg-bg-subtle`

**`Tabs`** — Radix Tabs with:
- List: `flex gap-1 border-b border-border px-1 shrink-0`
- Trigger: `px-3 py-2 text-sm text-text-secondary data-[state=active]:text-text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary-500 -mb-px`

**`Spinner`** — `animate-spin text-primary-500`. Use `size="sm"` in inline contexts, `size="md"` in card bodies, `size="lg"` for full-page loading states.

**`Toast`** — bottom-right, `rounded-lg`, `bg-green-600/red-600 text-white`, 4-second auto-dismiss. Called via `useToast()` hook.

---

### 1.3 Layout Patterns

**Dashboard shell** (from `DashboardLayout`):
```
flex min-h-screen bg-bg-base text-text-primary
├── <aside> w-56 shrink-0 border-r border-border bg-bg-elevated
│   ├── Logo area: px-4 py-5 border-b border-border
│   └── <nav> flex-1 px-2 py-4 space-y-0.5
│       └── Nav item: flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm
│                     text-text-secondary hover:text-text-primary hover:bg-bg-subtle transition-colors
└── <main> flex-1 overflow-auto p-6
```

**Two-panel detail layout** (from `LeadDetailPage`, `DealDetailPage`):
```
flex flex-col lg:flex-row gap-6 h-full
├── Left (primary, 60%): flex-[3] min-w-0 space-y-6
└── Right (secondary, 40%): flex-[2] min-w-0 min-h-[400px] lg:min-h-0
                             border border-border rounded-xl overflow-hidden
```
Right panel always contains a `<Tabs>` component. This is the established pattern for detail pages.

**List page layout** (from `LeadListPage`):
```
space-y-5
├── Page header: flex items-center justify-between
│   └── <h1> text-xl font-semibold text-text-primary
├── Filter section (collapsible or inline)
└── Table / list
```

**Section dividers within a panel:**
- Between major sections: `border-t border-border/50 pt-4`
- Between list rows: `border-b border-border/40 last:border-0`

---

### 1.4 Card Patterns

**Standard card** (used for DealCard, LinkedDeals row):
```
bg-bg-elevated border border-border rounded-lg p-3
hover:border-border-strong transition-colors
```

**Larger surface card / panel** (filter panel, forecast panel):
```
bg-bg-elevated border border-border rounded-xl p-4
```
or for subtle backgrounds:
```
bg-bg-subtle/50 border border-border rounded-xl p-3
```

**Card with hover-reveal actions** (DealCard pattern):
```
group  ← on the card
opacity-0 group-hover:opacity-100 transition-opacity  ← on the action row
```

**Interactive card (link-card)**:
```
flex items-center justify-between p-2.5 rounded-lg border border-border
hover:border-border/80 hover:bg-bg-elevated/50 transition-colors
```

---

### 1.5 Form Patterns

**Standard input:**
```
w-full px-3 py-1.5 text-sm bg-bg-base border border-border rounded-lg
text-text-primary placeholder:text-text-tertiary
focus:outline-none focus:border-primary-500
transition-colors
```

**Ghost / inline-edit input** (used in metadata forms — border appears only on hover/focus):
```
w-full text-sm text-text-primary bg-transparent
border-b border-transparent hover:border-border focus:border-primary-500
focus:outline-none pb-0.5 transition-colors
```

**Textarea:**
```
w-full px-3 py-2 text-sm bg-bg-base border border-border rounded-lg
text-text-primary placeholder:text-text-tertiary
focus:outline-none focus:border-primary-500 resize-none transition-colors
```

**Form field label:**
```
text-xs text-text-tertiary block mb-1
```

**Form field grid:**
```
grid grid-cols-2 gap-4  ← two-column form sections
space-y-4              ← stacked sections within a form
```

**Submit row in a form:**
```
flex gap-2 justify-end pt-2  ← within a Modal
flex gap-2 pt-2 border-t border-border/50  ← within a detail page panel
```

---

### 1.6 Activity Feed Pattern

Source: `ActivityItem.tsx`, `LeadActivityFeed.tsx`.

**Activity row:**
```
flex gap-3 py-3 border-b border-border/40 last:border-0
├── Icon circle: w-6 h-6 rounded-full bg-bg-subtle
│               flex items-center justify-center text-xs text-text-secondary shrink-0 mt-0.5
└── Content: flex-1 min-w-0
    ├── Primary text: text-sm text-text-primary
    └── Timestamp: text-xs text-text-tertiary mt-0.5
```

**Infinite scroll sentinel:**
```
<div ref={sentinelRef} className="py-1">
  {isFetchingNextPage && <Spinner size="sm" />}
</div>
```
The IntersectionObserver on `sentinelRef` triggers `fetchNextPage()` at threshold 0.1.

**Empty state:**
```
<div className="py-8 text-center text-sm text-text-tertiary">No activity yet</div>
```

---

### 1.7 Framer Motion Patterns (from KanbanColumn)

Used for list item enter/exit and drag overlay:
```typescript
initial={{ opacity: 0, y: -8 }}
animate={{ opacity: 1, y: 0 }}
exit={{ opacity: 0, scale: 0.96 }}
transition={{ duration: 0.15 }}
```
Use `AnimatePresence mode="popLayout"` when items can be added or removed from a list.

Drag active ring: `ring-1 ring-primary-500/40 shadow-2xl`

---

### 1.8 Page-Level Back Navigation

Consistent pattern across all detail pages:
- Desktop: `← Back` as a `text-sm text-text-secondary hover:text-text-primary` link, `hidden lg:inline`
- Mobile: same link, `lg:hidden`, placed at the top of the page above the content

---

### 1.9 Interaction Conventions

| Convention | Implementation |
|-----------|---------------|
| All transitions | `transition-colors` (never `transition-all` — it fires on layout shifts) |
| Card border on hover | `hover:border-border-strong` |
| Ghost actions on hover | `opacity-0 group-hover:opacity-100 transition-opacity` on parent `group` |
| Disabled states | `disabled:opacity-50` on buttons; `cursor-not-allowed` on non-interactive states |
| Focus ring on inputs | `focus:border-primary-500 focus:outline-none` (border replaces outline) |
| Loading state | `<Spinner>` centred; no skeleton loaders exist — do not introduce them |
| Destructive confirmation | Use `Button variant="danger"` + a second click to confirm (see `LeadDetailPage` convert CTA) |
| Toast on mutation success/error | `useToast()` hook always; never `alert()` or console.log |

---

## 2. New Sprint 6 Components — Design Specification

Every new component defined below cites the exact existing pattern it follows. No guessing. No new patterns without explicit rationale.

---

### 2.1 Dashboard Sidebar Navigation — Inbox Entry

**File:** `apps/web/src/app/(dashboard)/layout.tsx`

The Inbox entry follows the identical pattern as "Leads" and "Pipeline":

```jsx
<Link
  href="/inbox"
  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm
             text-text-secondary hover:text-text-primary hover:bg-bg-subtle transition-colors"
>
  <span>💬</span>
  <span>Inbox</span>
  {/* Unread count badge — only rendered when unread > 0 */}
  {unreadCount > 0 && (
    <span className="ml-auto text-xs font-medium bg-primary-500/15 text-primary-400
                     border border-primary-500/30 px-1.5 py-0.5 rounded">
      {unreadCount}
    </span>
  )}
</Link>
```

Active state: Add `data-[state=active]:bg-bg-subtle data-[state=active]:text-text-primary` — or use Next.js `usePathname()` to conditionally apply `bg-bg-subtle text-text-primary` when the current path starts with `/inbox`.

---

### 2.2 Inbox Page — Three-Panel Layout

**File:** `apps/web/src/components/inbox/InboxPage.tsx`

The Inbox is the most complex page in the product. It must feel like a wider variant of the detail-page pattern rather than a new product.

```
flex flex-col lg:flex-row h-full gap-0  ← no gap; panels share a border
├── Left panel (conversation list): w-72 shrink-0 border-r border-border flex flex-col
├── Center panel (thread view): flex-1 min-w-0 flex flex-col border-r border-border
└── Right panel (conversation metadata): w-64 shrink-0 hidden xl:flex flex-col
```

On mobile (`< lg`): stacked — list view first, then thread view (back button to return to list). The right (metadata) panel is hidden on mobile entirely — metadata lives in a collapsible bottom drawer instead.

**Outer container** sits directly inside `<main className="flex-1 overflow-auto p-6">`. Override padding on this page:
- The `<main>` tag has `p-6`. The Inbox must fill the full `<main>` height without extra padding.
- The Inbox page RSC shell (`page.tsx`) should render `<InboxPage className="-m-6 h-[calc(100vh-0px)]" />` or similar to offset the parent padding and fill the viewport.
- Rationale: The Kanban board does the same — it needs controlled column heights.

**Panel border treatment:** No `rounded-xl` on individual panels. The Inbox layout is a flat grid with `border` separators between panels — not floating cards. This is intentional: it creates the "inbox application" visual register distinct from the "detail page" register, while still using the same colours.

---

### 2.3 Conversation List Panel

**File:** `apps/web/src/components/inbox/ConversationList.tsx`

**Panel header:**
```
flex items-center justify-between px-4 py-3 border-b border-border shrink-0
├── <h2> text-sm font-medium text-text-primary  "Inbox"
└── Filter tabs: same Radix Tabs pattern as Tabs.tsx but inline (no content panel)
    Tab trigger: px-2.5 py-1 text-xs text-text-secondary
                 data-[state=active]:text-text-primary data-[state=active]:bg-bg-subtle
                 rounded transition-colors
    Tabs: "All" | "Mine" | "Unassigned"
```

**Search bar:**
```
px-3 py-2 border-b border-border shrink-0
└── <input> w-full px-3 py-1.5 text-sm bg-bg-base border border-border rounded-lg
            text-text-primary placeholder:text-text-tertiary focus:outline-none
            focus:border-primary-500 transition-colors
```
Follows exact `LeadFilters` search input pattern.

**Scroll area:** `flex-1 overflow-y-auto` — list of `ConversationItem` components.

---

### 2.4 Conversation Item

**File:** `apps/web/src/components/inbox/ConversationItem.tsx`

Each conversation row follows the `LinkedDealsPanel` interactive card pattern but is a list row, not a card:

```
flex items-start gap-3 px-4 py-3 border-b border-border/40 last:border-0
cursor-pointer hover:bg-bg-subtle transition-colors
data-[selected=true]:bg-bg-subtle  ← active/selected state
├── Avatar circle (40px): w-10 h-10 rounded-full bg-bg-muted
│   flex items-center justify-center text-sm font-medium text-text-secondary shrink-0
│   (shows initials if no profile picture; <img> with rounded-full if picture exists)
├── Content: flex-1 min-w-0
│   ├── Row 1: flex items-center justify-between gap-2
│   │   ├── Name: text-sm font-medium text-text-primary truncate
│   │   └── Timestamp: text-xs text-text-tertiary shrink-0
│   └── Row 2: flex items-center justify-between gap-2 mt-0.5
│       ├── Preview: text-xs text-text-secondary truncate
│       └── Unread dot: w-2 h-2 rounded-full bg-primary-500 shrink-0 (hidden when read)
```

**Unread indicator:** A 2px left border accent `border-l-2 border-primary-500` on the unread item, plus the unread dot in row 2. When read, both disappear.

**Account badge** (if org has multiple IG accounts): small `Badge` with the `@handle` below the name row, using `variant="default"`.

---

### 2.5 Thread View Panel

**File:** `apps/web/src/components/inbox/ThreadView.tsx`

**Panel structure:**
```
flex flex-col h-full
├── ConversationHeader: shrink-0 border-b border-border
├── Message list: flex-1 overflow-y-auto px-4 py-4 flex flex-col-reverse
│   (newest at bottom, scroll to bottom on load, col-reverse for anchor-to-bottom)
│   └── MessageBubble × n
├── WindowExpiredBanner OR ComposeBar: shrink-0 border-t border-border
```

**Loading state:**
```
flex items-center justify-center h-full
└── <Spinner size="lg" />
```

**Empty (no conversation selected):**
```
flex items-center justify-center h-full
└── <p className="text-sm text-text-tertiary">Select a conversation to start</p>
```

---

### 2.6 Message Bubble

**File:** `apps/web/src/components/inbox/MessageBubble.tsx`

Direction-aware layout:

**INBOUND (customer message):**
```
flex items-end gap-2 mb-3
├── Avatar (24px): same circle pattern as ConversationItem
└── Bubble: max-w-[75%] px-3.5 py-2.5 rounded-xl rounded-bl-md
           bg-bg-elevated border border-border text-sm text-text-primary
```
Round all corners except bottom-left (standard chat bubble convention).

**OUTBOUND (agent reply):**
```
flex items-end gap-2 mb-3 flex-row-reverse
└── Bubble: max-w-[75%] px-3.5 py-2.5 rounded-xl rounded-br-md
           bg-primary-600 text-white text-sm
```
Uses `primary-600` background with white text for agent messages — consistent with the brand primary colour. Round all corners except bottom-right.

**Message footer (status + timestamp):**
```
flex items-center gap-1 mt-0.5 text-xs text-text-tertiary  ← for INBOUND
flex items-center gap-1 mt-0.5 text-xs text-white/60       ← for OUTBOUND
```
Status icons: `·` SENT, `✓` DELIVERED, `✓✓` READ (double-check). These are plain text characters — no icon library required.

**Failed state:**
```
Bubble background: bg-red-500/15 border border-red-500/30 text-red-400
Footer: "Failed to send · Retry" (Retry is a ghost button, size sm)
```
Follows the existing `Badge variant="overdue"` glass pattern.

**Date separator between days:**
```
flex items-center gap-3 my-4
├── <div> flex-1 h-px bg-border
├── <span> text-xs text-text-tertiary px-2  "Today" / "Yesterday" / "12 Jun"
└── <div> flex-1 h-px bg-border
```

---

### 2.7 Conversation Header

**File:** `apps/web/src/components/inbox/ConversationHeader.tsx`

```
flex items-center justify-between px-4 py-3 gap-3
├── Left: flex items-center gap-3
│   ├── Back button (mobile only): Button variant="ghost" size="sm" "← Back"
│   ├── Avatar (32px): same circle pattern
│   ├── Name + handle: flex flex-col
│   │   ├── text-sm font-medium text-text-primary  (lead name or IG handle)
│   │   └── text-xs text-text-tertiary  "@handle"
│   └── Open/Closed badge: Badge variant="open"/"default"
└── Right: flex items-center gap-2
    ├── Assignee select: Select component (existing primitive)
    │   Placeholder: "Unassigned"
    │   Size: compact trigger px-2 py-1 text-xs
    ├── Close conversation: Button variant="ghost" size="sm" "✕ Close"
    └── Lead link (if linked): Button variant="ghost" size="sm" "→ Lead"
```

The `Select` component is used as-is for assignee. No custom dropdown.

---

### 2.8 Compose Bar

**File:** `apps/web/src/components/inbox/ComposeBar.tsx`

```
flex flex-col gap-2 p-3 bg-bg-elevated border-t border-border
├── <textarea>: standard textarea pattern (rows=3, resize-none)
│   On keydown "/": show SavedReplyPicker above the textarea
│   On Ctrl+Enter or Cmd+Enter: submit
└── Action row: flex items-center justify-between gap-2 mt-1
    ├── Left: text-xs text-text-tertiary "/ for saved replies"
    └── Right: Button variant="primary" size="sm" "Send"
               disabled when textarea empty OR window closed OR isPending
```

**Pending state:** Send button shows `Spinner size="sm"` replacing the label. No disabled spinner overlay on the whole compose area.

**Character/context:** No word count, no emoji picker in Sprint 6. Plain text only. The compose textarea follows the exact `LeadNotesList.tsx` textarea pattern with `bg-bg-base border border-border rounded-lg`.

---

### 2.9 Window Expired Banner

**File:** `apps/web/src/components/inbox/WindowExpiredBanner.tsx`

Replaces `ComposeBar` when the messaging window is closed. Follows the `Badge`/semantic status pattern:

```
flex items-center gap-3 p-3 border-t border-border
bg-yellow-500/15 border-yellow-500/20
├── <span> text-xs text-yellow-400  "⚠ 24-hour messaging window closed"
└── <p> text-xs text-text-secondary ml-1
    "The customer must send a new message to reopen the conversation."
```

Uses the existing `warning` glass pattern. Not a `Badge` component (too wide) — a full-width banner within the compose area slot.

---

### 2.10 Saved Reply Picker

**File:** `apps/web/src/components/inbox/SavedReplyPicker.tsx`

Floating panel anchored above the compose bar. Mirrors the `Select` component's dropdown aesthetic but is wider and has a search input.

```
absolute bottom-full left-0 right-0 mb-1 z-20
bg-bg-elevated border border-border rounded-xl shadow-xl overflow-hidden
max-h-64
├── Search: px-3 py-2 border-b border-border
│   └── <input> same standard input pattern, placeholder "Search replies…"
└── List: overflow-y-auto
    └── Item row: flex flex-col px-3 py-2 cursor-pointer
                  hover:bg-bg-subtle transition-colors border-b border-border/40 last:border-0
        ├── Shortcut + title: flex items-center gap-2
        │   ├── text-xs font-medium text-primary-400  "/shortcut"
        │   └── text-sm text-text-primary  "Reply title"
        └── Preview: text-xs text-text-secondary line-clamp-1 mt-0.5
```

Keyboard navigation: `ArrowUp/Down` to highlight (use `bg-bg-subtle`), `Enter` to select, `Escape` to close. The highlighted item should have `bg-bg-subtle` — same as the `Select` item hover state.

---

### 2.11 Instagram Account Connect Card

**File:** `apps/web/src/components/settings/InstagramAccountCard.tsx`

Follows the `LinkedDealsPanel` link-card pattern for display of connected accounts, and `AddDealModal` for the connect flow.

**Connected account card:**
```
flex items-center justify-between p-3 rounded-lg border border-border
hover:border-border-strong transition-colors bg-bg-elevated
├── Left: flex items-center gap-3
│   ├── Avatar (36px): rounded-full img or initial circle
│   └── Info: flex flex-col
│       ├── text-sm font-medium text-text-primary  "@username"
│       └── text-xs text-text-tertiary  "Connected · expires in 45 days"
├── Center: Badge variant (status)
│   ACTIVE: Badge variant="open" "Active"
│   EXPIRED: Badge variant="overdue" "Token Expired"
│   DISCONNECTED: Badge variant="default" "Disconnected"
└── Right: Button variant="ghost" size="sm" "Disconnect"
           (Danger confirmation pattern: second click or small modal)
```

**Connect CTA (no accounts yet):**
```
flex flex-col items-center gap-3 py-8 border border-dashed border-border rounded-xl
├── text-sm text-text-secondary  "No Instagram account connected"
└── Button variant="primary" size="sm" "Connect Instagram"
    (triggers GET /api/v1/instagram/auth → redirect)
```

Dashed border is the only place a dashed border appears. It signals "add something here" — a common affordance. Colour: `border-border` (same as solid borders, just dashed).

---

### 2.12 Settings / Integrations Page

**File:** `apps/web/src/app/(dashboard)/settings/integrations/instagram/page.tsx`

Page structure follows `LeadListPage` list-page pattern:

```
space-y-5
├── Header row: flex items-center justify-between
│   ├── <h1> text-xl font-semibold text-text-primary  "Instagram"
│   └── plan badge: Badge variant="default" "1 of 1 connected"
├── Section card: bg-bg-elevated border border-border rounded-xl p-4 space-y-3
│   ├── Section heading: text-sm font-medium text-text-primary  "Connected Accounts"
│   ├── Description: text-xs text-text-tertiary  "Connect your business Instagram account…"
│   └── Account list (InstagramAccountCard × n) OR connect CTA
└── (future) Section card for webhook status / meta debug info
```

---

### 2.13 Create Lead from Conversation Modal

**File:** `apps/web/src/components/inbox/CreateLeadModal.tsx`

Uses the existing `Modal` primitive exactly. Same `AddDealModal` form pattern:

```
<Modal title="Create Lead from Conversation">
  <form className="space-y-3">
    <div>
      <label className="text-xs text-text-secondary block mb-1">First name</label>
      <input className="w-full px-3 py-1.5 text-sm bg-bg-base border border-border rounded-lg …" />
    </div>
    <div>
      <label className="text-xs text-text-secondary block mb-1">Instagram handle</label>
      <input readOnly className="… opacity-60 cursor-not-allowed" />  ← pre-filled, read-only
    </div>
    <div>
      <label className="text-xs text-text-secondary block mb-1">Source</label>
      <!-- Select with INSTAGRAM_DM pre-selected, disabled -->
    </div>
    <div className="flex gap-2 justify-end pt-2">
      <Button variant="ghost">Cancel</Button>
      <Button variant="primary" disabled={isPending}>
        {isPending ? 'Creating…' : 'Create Lead'}
      </Button>
    </div>
  </form>
</Modal>
```

Pre-filled fields are `readOnly` with `opacity-60 cursor-not-allowed` — visually indicates they are derived from the conversation context, not editable here.

---

### 2.14 Right Metadata Panel (Conversation Detail)

Sprint 6 ships the right panel **hidden on all screens except `xl` (1280px+)**. On xl screens it shows conversation metadata — not a separate component, just content in the panel:

```
flex flex-col p-4 gap-4
├── Section: Linked Lead
│   Same pattern as LinkedDealsPanel (link card or "No lead linked" + Create Lead CTA)
├── Divider: border-t border-border/50
├── Section: Assignee
│   <label> text-xs text-text-tertiary mb-1  "Assigned to"
│   <Select> with team member options
├── Divider: border-t border-border/50
└── Section: Labels
    flex flex-wrap gap-1 (label badges using Badge variant="default")
```

---

## 3. Component-to-Pattern Mapping

The following table is the reference for engineers implementing Sprint 6. "Source" is the existing file that defines the pattern to follow.

| Sprint 6 Component | Design Pattern | Source |
|-------------------|---------------|--------|
| `InboxPage.tsx` | Two-panel detail layout (wider, 3-column) | `DealDetailPage.tsx` |
| `ConversationList.tsx` | Scrollable list + search bar | `LeadFilters.tsx` + `LeadTable.tsx` |
| `ConversationItem.tsx` | List row with hover + selected state | `LinkedDealsPanel.tsx` row |
| `ThreadView.tsx` | Tab content with scroll + sentinel | `LeadActivityFeed.tsx` |
| `MessageBubble.tsx` (INBOUND) | Surface card `bg-bg-elevated border border-border rounded-xl` | `DealCard.tsx` |
| `MessageBubble.tsx` (OUTBOUND) | `bg-primary-600 text-white` with `rounded-xl` | `Button variant="primary"` |
| `ComposeBar.tsx` | Textarea + button row | `LeadNotesList.tsx` |
| `WindowExpiredBanner.tsx` | Warning glass `bg-yellow-500/15` | `Badge variant="stale"` |
| `SavedReplyPicker.tsx` | Floating dropdown list | `Select.tsx` content |
| `ConversationHeader.tsx` | Title + action buttons row | `DealDetailPage.tsx` header row |
| `InstagramAccountCard.tsx` (connected) | Interactive card with status badge | `LinkedDealsPanel.tsx` deal row |
| `InstagramAccountCard.tsx` (empty) | Dashed border CTA | New (documented above) |
| `CreateLeadModal.tsx` | Form in Modal primitive | `AddDealModal.tsx` |
| `InboxPage` unread badge (nav) | Count chip in nav item | `Badge variant="open"` inline |
| Conversation metadata (right panel) | Metadata label+value sections | `LeadMetadataForm.tsx` sections |
| Date separator in thread | Horizontal rule + label | New (documented above) |
| Message status icons (· ✓ ✓✓) | Text characters in footer | (no existing pattern) |
| Account ACTIVE/EXPIRED badge | `Badge variant="open"/"overdue"` | `Badge.tsx` |

---

## 4. What NOT to Do

These are explicit prohibitions based on the audit.

| Prohibited | Why |
|-----------|-----|
| New background colours (any hex not in tokens.css) | Breaks the dark-first token scale; makes the Inbox feel like a different product |
| Skeleton loaders (loading shimmer animations) | The codebase uses `<Spinner>` only; introducing skeletons adds inconsistency |
| New radius values | Only `rounded`, `rounded-lg`, `rounded-xl` are in use; match existing elements |
| Light mode toggle | `html` element has `class="dark"` hardcoded in root layout; the product is dark-only |
| Icon library (Heroicons, Lucide, etc.) | Current codebase uses emoji (`👥`, `📊`, `💬`) and plain text characters (`→`, `✓`, `✗`, `·`) only |
| Shadcn component variants not already in use | The `Select`, `Tabs`, `Dialog` from Radix are already wrapped; do not add new Radix primitives without wrapping them in a `components/ui/` file first |
| Custom CSS classes or inline styles (other than `style={{ backgroundColor: stage.color }}`) | The KanbanColumn uses an inline style for stage colour dots; that is the only exception. All else uses Tailwind. |
| `transition-all` | Use `transition-colors` only; `transition-all` causes jank on layout-affecting properties |
| Multi-level nested dropdowns | No pattern exists for them; keep interactions flat |
| `z-index` values above 50 | The existing modal uses `z-50`; nothing should go higher without understanding the full stacking context |
| Full-page loading spinners blocking content | Existing pages show `<Spinner size="lg">` in a centred flex container — not an overlay |

---

## 5. Responsive Breakpoints

Existing breakpoints in use (mobile-first):

| Breakpoint | Tailwind prefix | What changes |
|------------|----------------|-------------|
| < 768px | (default) | Single column; detail pages stack vertically; Inbox shows list OR thread |
| 768px+ | `md:` | Not heavily used in existing code |
| 1024px+ | `lg:` | Two-panel detail layout activates; back nav changes from mobile to desktop variant; Kanban shows all columns |
| 1280px+ | `xl:` | Inbox right metadata panel appears |

Sprint 6 must not introduce new breakpoints. Use the existing `lg:` / `xl:` cutpoints.

---

## 6. Inbox Page — Viewport Filling Strategy

The existing Kanban board fills the viewport by escaping the `p-6` padding on `<main>`. The Inbox must do the same, because the three-panel layout needs to fill the full available height to prevent double scrollbars.

Approved approach (matches Kanban):
- In the Inbox RSC `page.tsx`, wrap `<InboxPage>` in a `<div className="-m-6 h-[calc(100svh-0px)]">` or equivalent to counteract `p-6` and set full height.
- Or: add `data-full-bleed` attribute and handle at the layout level.

**Do not change `DashboardLayout`** to accommodate this — that breaks all other pages. The escape is local to the Inbox page.

---

## 7. Sprint 6 UI/UX Acceptance Criteria

These must pass before any M5 milestone is marked done:

1. **Token compliance:** No hex colour values appear in any Sprint 6 `.tsx` file. All colour references use `text-*`, `bg-*`, `border-*` Tailwind utilities backed by tokens.
2. **Component reuse:** `Button`, `Badge`, `Modal`, `Select`, `Tabs`, `Spinner`, `Toast` are imported from `@/components/ui/` — not reimplemented inline.
3. **Typography consistency:** Page headings use `text-xl font-semibold text-text-primary`. Section headings use `text-sm font-medium text-text-primary`. Labels use `text-xs text-text-tertiary block mb-1`. No other heading sizes introduced.
4. **Card consistency:** All Inbox panel containers use `bg-bg-elevated border border-border` (with `rounded-xl` for floated cards; flat borders for the panel layout itself).
5. **Interaction parity:** All hover, focus, and transition states use `transition-colors`. Disabled states use `disabled:opacity-50`.
6. **Responsive:** Inbox degrades gracefully to a single-column stacked view on `< lg` screens (list → thread, back button navigates).
7. **Navigation:** Inbox entry in the sidebar is visually indistinguishable in style from "Leads" and "Pipeline" entries. Active state uses the same `bg-bg-subtle text-text-primary` as the other nav items.
8. **No new design tokens:** Running `grep -r "\"#\|'#" apps/web/src/components/inbox/` produces zero results.

---

*All design values in this document were extracted from live source files. No values were guessed or taken from a separate design file.*
