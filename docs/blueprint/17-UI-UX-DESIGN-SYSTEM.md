# 17 — UI/UX Design System

---

## 17.1 Design Language

**Inspiration Sources:**
- **Linear**: Dark, minimal, keyboard-driven, fast
- **Attio**: Modern CRM feel, data density without overwhelm
- **Notion**: Flexible layouts, inline editing
- **Stripe Dashboard**: Data clarity, trust, professionalism

**Core Design Principles:**
1. **Speed over decoration**: Every interaction must feel instant
2. **Context is king**: Show the right information at the right moment
3. **Progressive disclosure**: Start simple, reveal complexity on demand
4. **Dark by default**: Dark mode is the primary theme; light mode is secondary
5. **Data density**: Show more information with less chrome

---

## 17.2 Color System

```css
/* ============================================
   LeadOS Design Tokens
   ============================================ */

:root {
  /* === BACKGROUND SCALE === */
  --color-bg-base: #0a0a0f;         /* Page background */
  --color-bg-elevated: #111118;      /* Cards, panels */
  --color-bg-overlay: #16161e;       /* Modals, dropdowns */
  --color-bg-subtle: #1c1c26;        /* Hover states, inputs */
  --color-bg-muted: #22222f;         /* Disabled states */

  /* === BORDER SCALE === */
  --color-border-subtle: #1e1e2a;    /* Dividers */
  --color-border-default: #27273a;   /* Card borders */
  --color-border-strong: #353545;    /* Focused inputs */

  /* === TEXT SCALE === */
  --color-text-primary: #f0f0fa;     /* Headings, primary content */
  --color-text-secondary: #9898b8;   /* Labels, supporting text */
  --color-text-tertiary: #6262a0;    /* Placeholders, disabled */
  --color-text-inverse: #0a0a0f;     /* On primary buttons */

  /* === BRAND PRIMARY (Indigo-Violet) === */
  --color-primary-50: #eeeeff;
  --color-primary-100: #d9d9ff;
  --color-primary-200: #b8b8ff;
  --color-primary-300: #9898ff;
  --color-primary-400: #7c7cff;
  --color-primary-500: #6366f1;      /* Primary action */
  --color-primary-600: #4f46e5;      /* Hover */
  --color-primary-700: #4338ca;      /* Active/pressed */
  --color-primary-800: #3730a3;
  --color-primary-900: #312e81;

  /* === SEMANTIC COLORS === */
  --color-success-light: #10b981;    /* Won, positive */
  --color-success-dark: #059669;
  --color-success-bg: #0a1f18;
  --color-warning-light: #f59e0b;    /* At-risk, warning */
  --color-warning-dark: #d97706;
  --color-warning-bg: #1f160a;
  --color-danger-light: #ef4444;     /* Lost, error, urgent */
  --color-danger-dark: #dc2626;
  --color-danger-bg: #1f0a0a;
  --color-info-light: #3b82f6;       /* Info, in-progress */
  --color-info-dark: #2563eb;
  --color-info-bg: #0a111f;

  /* === AI SCORE COLORS === */
  --color-score-hot: #ef4444;        /* 80-100 */
  --color-score-warm: #f59e0b;       /* 60-79 */
  --color-score-neutral: #6366f1;    /* 40-59 */
  --color-score-cold: #6262a0;       /* 0-39 */

  /* === SHADOW === */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
  --shadow-glow: 0 0 20px rgba(99, 102, 241, 0.3);  /* Primary glow */
}
```

---

## 17.3 Typography

```css
/* === FONTS === */
/* Primary: Inter (headings, UI) */
/* Monospace: JetBrains Mono (IDs, code, dates) */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

/* === TYPE SCALE === */
:root {
  --font-family-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-family-mono: 'JetBrains Mono', 'Fira Code', monospace;

  /* Display */
  --text-4xl: 2.25rem;   /* 36px — Page titles */
  --text-3xl: 1.875rem;  /* 30px — Section headings */
  --text-2xl: 1.5rem;    /* 24px — Card headings */
  --text-xl: 1.25rem;    /* 20px — Subsection */
  --text-lg: 1.125rem;   /* 18px — Prominent labels */
  --text-base: 1rem;     /* 16px — Body text */
  --text-sm: 0.875rem;   /* 14px — Secondary text, table rows */
  --text-xs: 0.75rem;    /* 12px — Badges, timestamps, captions */
  --text-2xs: 0.625rem;  /* 10px — Labels, tiny badges */

  /* Weights */
  --font-light: 300;
  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;

  /* Line heights */
  --leading-tight: 1.2;
  --leading-normal: 1.5;
  --leading-relaxed: 1.7;

  /* Letter spacing */
  --tracking-tight: -0.02em;
  --tracking-normal: 0;
  --tracking-wide: 0.05em;
  --tracking-wider: 0.1em;
}
```

---

## 17.4 Spacing System

```css
/* 4px base unit system */
:root {
  --space-px: 1px;
  --space-0: 0;
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-5: 1.25rem;   /* 20px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */
  --space-10: 2.5rem;   /* 40px */
  --space-12: 3rem;     /* 48px */
  --space-16: 4rem;     /* 64px */
  --space-20: 5rem;     /* 80px */
  --space-24: 6rem;     /* 96px */

  /* Border radius */
  --radius-sm: 0.25rem;   /* 4px — small badges */
  --radius-md: 0.5rem;    /* 8px — buttons, inputs */
  --radius-lg: 0.75rem;   /* 12px — cards */
  --radius-xl: 1rem;      /* 16px — modals */
  --radius-2xl: 1.5rem;   /* 24px — feature cards */
  --radius-full: 9999px;  /* Pills, avatars */
}
```

---

## 17.5 Component Guidelines

### Button Variants
```
PRIMARY  : bg-primary-500, hover: bg-primary-600, text: white
SECONDARY: bg-bg-subtle, border: border-default, text: text-primary
GHOST    : bg-transparent, hover: bg-bg-subtle, text: text-secondary
DANGER   : bg-danger-bg, border: border-danger, text: danger-light
```

### Card Component
```
Background: bg-elevated
Border: 1px solid border-default
Border-radius: radius-lg
Padding: space-6
Shadow: shadow-md
Hover state: border: border-strong, shadow: shadow-lg
```

### Lead/Deal Card (Kanban)
```
Background: bg-elevated
Border: 1px solid border-default + left accent bar (4px, stage color)
Padding: space-4
Min-height: 96px
Contains:
  - Contact name (text-sm, font-medium)
  - Company/handle (text-xs, text-secondary)
  - Value badge (text-xs, monospace)
  - AI Score badge (color-coded: hot/warm/neutral/cold)
  - Avatar (24px circle)
  - Last activity time (text-2xs, text-tertiary)
  - Quick action icons (call, email, move) — visible on hover
Hover: shadow-glow (subtle), translate-y(-2px)
Drag state: shadow-lg, opacity-90, rotate(1.5deg)
```

### AI Score Badge
```
Hot (80-100)  : bg-danger-bg, text-danger-light, "🔥 {score}"
Warm (60-79)  : bg-warning-bg, text-warning-light, "⚡ {score}"
Neutral (40-59): bg-primary-bg, text-primary-400, "{score}"
Cold (0-39)   : bg-bg-muted, text-tertiary, "{score}"
Size: text-xs, px-2 py-0.5, rounded-full
```

### Input Fields
```
Background: bg-subtle
Border: 1px solid border-default
Focus: border-primary-500, box-shadow: 0 0 0 2px rgba(99,102,241,0.2)
Placeholder: text-tertiary
Text: text-primary
Border-radius: radius-md
Height: 40px (default), 36px (compact)
```

### Toast Notifications
```
Position: top-right, fixed
Max-width: 380px
Border-radius: radius-lg
Shadow: shadow-lg
Animation: slide-in-from-right 200ms ease-out
Auto-dismiss: 4s (success), 6s (error), manual (warning)
```

---

## 17.6 Animation Guidelines

```typescript
// Motion tokens — Framer Motion presets
export const MOTION = {
  // Page transitions
  pageTransition: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
    transition: { duration: 0.2, ease: 'easeOut' }
  },
  
  // Card/item entrance
  cardEntrance: {
    initial: { opacity: 0, scale: 0.97 },
    animate: { opacity: 1, scale: 1 },
    transition: { duration: 0.15, ease: 'easeOut' }
  },
  
  // Stagger children
  staggerContainer: {
    animate: { transition: { staggerChildren: 0.05 } }
  },
  
  // Kanban card drop
  kanbanDrop: {
    transition: { type: 'spring', stiffness: 500, damping: 30 }
  },
  
  // Sidebar slide
  sidebarSlide: {
    initial: { x: -20, opacity: 0 },
    animate: { x: 0, opacity: 1 },
    transition: { duration: 0.2 }
  },
  
  // Modal
  modalBackdrop: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 }
  },
  
  modalContent: {
    initial: { opacity: 0, scale: 0.95, y: 10 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.95, y: 10 },
    transition: { duration: 0.2, ease: 'easeOut' }
  }
};

// Rule: NEVER use animations that take > 300ms for interactive elements
// Rule: Prefer transform + opacity only (GPU composited)
// Rule: Respect prefers-reduced-motion
```

---

## 17.7 Accessibility Standards

- **WCAG 2.1 Level AA** compliance required
- All interactive elements: visible focus ring (2px primary-500 outline)
- Color contrast: minimum 4.5:1 for normal text, 3:1 for large text
- All images: descriptive alt text
- All form inputs: visible labels (no placeholder-as-label)
- All icon buttons: `aria-label` attribute
- Keyboard navigation: full functionality without mouse
- Screen reader support: semantic HTML + ARIA landmarks
- No reliance on color alone to convey information (use icon + color)
- Focus management: modals trap focus, restore focus on close

---

## 17.8 Screen Inventory

### Screen 1: Dashboard
**Purpose:** Executive overview of pipeline health, team performance, and key metrics.

**Components:**
- KPI strip: New Leads, Deals Won, Revenue Won, Pipeline Value, Response Rate
- Lead source chart (donut/bar)
- Pipeline health bar (deals per stage)
- AI Insights panel: top 3 opportunities detected
- Team leaderboard: top 5 reps by deals/leads
- Recent activity feed
- Quick action buttons: Add Lead, Go to Inbox, Create Task

**Data Sources:** `/api/v1/analytics/dashboard?period=30d`

**Permissions:** analytics.read_own (own data), analytics.read_all (all team)

---

### Screen 2: Leads List
**Purpose:** Browse, filter, search all leads in the organization.

**Components:**
- Search bar (full-text)
- Filter bar: Status, Source, Assignee, Score Range, Tags, Date Range
- Save filter preset button
- List/grid view toggle
- Lead cards: Name, Source badge, Status chip, Score badge, Assignee avatar, Last activity
- Quick actions: Assign, Change Status, Delete
- Import button
- Export button
- Pagination

**Data Sources:** `/api/v1/leads`

**Permissions:** leads.read (or leads.read_own for Sales Executive)

---

### Screen 3: Lead Detail
**Purpose:** Full 360° view of a single lead with all context.

**Layout:** Two-panel — Left (70%): timeline + messages | Right (30%): lead info + tasks

**Components:**
- Header: Name, avatar, source badge, status selector, AI score gauge
- AI recommendation card: "Next best action" highlighted
- Activity timeline: All touchpoints chronologically
- Instagram/WhatsApp conversation preview (click to open full inbox)
- Tasks panel: upcoming tasks + create task button
- Notes panel: rich text notes
- Files panel: uploaded documents
- Related deals list
- Lead info sidebar: all fields (editable inline)
- Convert to Contact button (if status = WON)

**Data Sources:** `/api/v1/leads/:id`, `/api/v1/leads/:id/activities`, `/api/v1/leads/:id/tasks`

**Permissions:** leads.read

---

### Screen 4: Pipeline (Kanban)
**Purpose:** Visual drag-and-drop deal management.

**Components:**
- Pipeline selector (tabs if multiple pipelines)
- Filter bar: Assignee, Tags, Value range
- Stage columns with: Stage name, deal count badge, total value
- Deal cards (draggable)
- Empty state per stage: "Drop a deal here"
- "Add Deal" button per stage
- Quick-win/Quick-lose buttons on hover
- Stage probability displayed in header
- Collapsed stage option for wide pipelines
- List view toggle

**Data Sources:** `/api/v1/pipelines/:id`

**Permissions:** pipelines.read, deals.read

---

### Screen 5: Deal Detail
Same layout as Lead Detail but for deals. Includes:
- Pipeline stage selector (move to stage inline)
- Deal health indicator: Green (on track), Yellow (at risk), Red (stale)
- Mark Won / Mark Lost buttons
- Revenue contribution to forecast (shown if deal value > 0)

---

### Screen 6: Social Inbox
**Purpose:** Unified messaging hub — all channels in one view.

**Layout:** Three-panel
- Left (200px): Channel selector (All, Instagram, WhatsApp, filters)
- Center (380px): Conversation list
- Right (flex): Active conversation

**Conversation List Item:**
- Contact name + avatar (or Instagram handle)
- Preview of last message (truncated)
- Timestamp (relative: "2m ago", "Yesterday")
- Unread count badge
- Channel icon (IG/WA)
- SLA status dot (green/red)
- Assignee avatar

**Conversation View:**
- Header: Contact name, lead/contact link, status selector, assign button
- Message thread (scrollable, newest at bottom)
- Message bubbles: Inbound (left, gray), Outbound (right, primary)
- Typing indicator
- Read receipts (tick icons)
- Compose area: text input + emoji + attach + send
- Quick replies button (/ shortcut)
- Window expiry warning (WhatsApp)
- Create Lead button (if not yet linked)
- AI summary card (collapsible)

**Data Sources:** `/api/v1/inbox/instagram`, `/api/v1/inbox/whatsapp`

**Permissions:** inbox.read

---

### Screen 7: Analytics
**Purpose:** Data-driven insights for managers and owners.

**Tabs:**
1. **Overview**: KPIs, pipeline summary, team summary
2. **Leads**: Volume by source/status, lead age, score distribution
3. **Pipeline**: Stage velocity, conversion rates, drop-off
4. **Team**: Individual performance, response times
5. **Revenue**: Won revenue, forecast, deal size distribution
6. **Inbox**: SLA performance, message volume by channel

**Components per tab:**
- Date range picker (7d, 30d, 90d, custom)
- Comparison toggle (vs previous period)
- Charts: Line, Bar, Donut, Heatmap
- Data tables (downloadable)
- Export button (PDF/CSV)

---

### Screen 8: Workflow Automation
**Purpose:** Create and manage no-code automation rules.

**Components:**
- Workflow list: Name, Status (active/inactive badge), trigger type, last run, execution count
- "Create Workflow" button
- Workflow execution log table
- Template library modal

**Workflow Builder (full page / sheet):**
- Visual canvas with nodes connected by arrows
- Node types: Trigger (purple), Condition (yellow), Action (blue), Wait (gray)
- Node detail panel (right side): configure selected node
- Save / Activate / Test buttons
- Validation: show errors before save ("Email action requires a valid template")

---

### Screen 9: Team Settings
**Purpose:** Manage team members and roles.

**Components:**
- Member table: Avatar, Name, Email, Role, Status, Last Active, Actions
- "Invite Member" button → modal (email + role selection)
- Role management tab: view/edit permissions per role (Admin only)
- Pending invitations section

---

### Screen 10: Billing Settings
**Purpose:** Manage subscription, view invoices.

**Components:**
- Current plan card: Plan name, price, renewal date, seats used/total
- Usage meters: Leads, Contacts, AI calls (progress bars)
- Upgrade/Downgrade CTA buttons
- Invoice table: Date, Number, Amount, Status, Download PDF link
- "Manage Billing" → Stripe Customer Portal link
- Trial countdown banner (if trialing)

---

### Screen 11: Organization Settings
**Sections:**
- General: Name, Logo, Industry, Timezone, Currency, Language
- Business Hours: Days + hours configuration
- Custom Fields: Create/manage custom fields per object
- Social Connections: Instagram + WhatsApp connected accounts
- Email Configuration: SendGrid sender domain
- Notifications: Org-wide notification rules
- Danger Zone: Delete organization (with confirmation)

---

### Screen 12: Notifications Center
**Purpose:** Notification feed with actions.

**Components:**
- Bell icon in nav bar with unread badge count
- Notification panel (flyout): recent notifications, "Mark all read"
- Full notifications page: paginated list, type filters
- Each notification: Icon (type-based), Title, Body, Timestamp, Action link
- Empty state: "You're all caught up! 🎉"
