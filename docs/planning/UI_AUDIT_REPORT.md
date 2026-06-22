# LeadOS UI Audit Report — "Why does it still feel like a raw internal tool?"

**Author:** Principal Engineer (live source-code audit)
**Date:** 2026-06-22
**Status:** AUDIT + PLAN ONLY — no implementation performed. Companion to `UI_MODERNIZATION_EXECUTION_PLAN.md`.
**Scope:** Login · Dashboard shell · Leads · Pipeline · Deal Detail · Inbox · Instagram Integration · Settings

**Binding design context (read first):**
- `SPRINT_6_UI_UX_PLAN.md` — canonical design-system reference (tokens, primitives, patterns). All constraints there remain binding.
- `SPRINT_7_UI_MODERNIZATION_PLAN.md` — the interaction-maturity roadmap (saved views, ⌘K, bulk actions, list/board parity, dashboard). Referenced by `S7-Fn` / screen section throughout.
- `LEADOS_UI_IMPLEMENTATION_ROADMAP.md` — the feature-completeness roadmap (`Pn-n` items).

---

## 0. Non-negotiable constraints (honored throughout this audit and the companion plan)

These come from `SPRINT_6_UI_UX_PLAN.md §4` and the live token audit, and they bind every recommendation below:

1. **Reuse existing LeadOS design tokens** (`apps/web/src/styles/tokens.css`). No new color tokens, **no hardcoded hex** in components.
2. **Reuse existing components** (`apps/web/src/components/ui/*`): `Button`, `Badge`, `Modal`, `Select`, `Tabs`, `Spinner`, `Toast`. No new component library. Any new Radix primitive must be wrapped in `components/ui/` first.
3. **Reuse the existing Tailwind config** (`apps/web/tailwind.config.ts`) — it already maps tokens onto the theme. No new palette.
4. **No dashboard-shell redesign.** Nav entries may be added in the existing style; the sidebar is not restructured.
5. **No visual inconsistency between modules** — an operator moving from Leads to Inbox must never see a design handoff boundary.
6. **No skeleton loaders** (`<Spinner>` only); **dark-only** (`html.dark` hardcoded); **`transition-colors` only**; **emoji/plain-glyph icons only** (no icon library).
7. **HubSpot / Attio / Pipedrive / Linear / Stripe are UX references only** — cited for interaction patterns and information hierarchy, never to copy their visual designs.

---

## 1. Executive Summary — Root-Cause Diagnosis (ranked)

**Headline: the styling *system* is healthy. The product feels unfinished because of how pages are *composed*, not because Tailwind/tokens are broken.**

Tailwind compiles, tokens are defined and wired into the theme, `html.dark` is applied, and the `components/ui/*` primitives are clean and token-driven. There is **no "Tailwind isn't loading" bug** — that hypothesis is disproven below (see §2.1). The "raw HTML / internal tool" perception comes from a ranked set of *composition* gaps:

| # | Root cause | Severity | Evidence (representative) |
|---|-----------|:--------:|---------------------------|
| **R1** | **The first screen a user lands on is a literal placeholder.** `(dashboard)/page.tsx` renders one `<h1>` + one `<p>` ("Dashboard arrives in a later sprint"). Every session opens on what looks like an unstyled stub. | **Critical** | `apps/web/src/app/(dashboard)/page.tsx:3-12` |
| **R2** | **Raw, always-expanded forms instead of progressive UI.** The Leads filter panel is a permanently-open 9-field stacked form including a literal **"Assigned to (user ID)"** UUID text input and **"Tags (comma-separated)"** — these are developer affordances, not product UI. This single panel dominates the Leads page and reads as a config screen. | **Critical** | `apps/web/src/components/leads/LeadFilters.tsx:177-187` (UUID input), `:159-175` (comma tags), whole panel `:49-237` |
| **R3** | **Inconsistent page-level scaffolding (heading sizes + container widths) across modules.** Three different `<h1>` sizes and three different width strategies mean each screen looks like a different app. | **High** | h1: Dashboard `text-2xl` (`page.tsx:6`), Leads `text-xl` (`LeadListPage.tsx:46`), Instagram/Login `text-lg` (`InstagramIntegrationView.tsx:24`, `login/page.tsx:53`); Pipeline has no `<h1>` at all. Widths: Instagram `max-w-2xl`, Leads/Pipeline full-bleed, Auth `max-w-md`. |
| **R4** | **Empty / loading / placeholder states are bare plain-text, not designed states.** "Coming soon", "No leads found", "No conversations", "Select a conversation", "Loading…" are unstyled centered strings. Best-in-class CRMs use illustrated/structured empty states; here they read as TODO stubs. | **High** | "Coming soon" `DealDetailPage.tsx:57,62`; "No leads found" `LeadTable.tsx:171`; "No conversations" `ConversationList.tsx:46`; "Select a conversation" `InboxPage.tsx:116`; text "Loading…" `InstagramIntegrationView.tsx:55`, `instagram/page.tsx:9` |
| **R5** | **The data table looks like an HTML `<table>`, not a CRM grid.** No avatar/identity column, no row affordances, a bare native `<select>` for inline status, native pagination chevrons, tiny `text-[10px]` tag pills. Functional but visually "raw". Attio/HubSpot grids carry identity + density + hover affordances. | **Medium-High** | `LeadTable.tsx:59-72` (native select), `:192` (`text-[10px]` pill), `:221-247` (pagination), no avatar column anywhere in `<tbody>` |
| **R6** | **Density & rhythm are uneven.** Some surfaces are airy (`space-y-6`), others cramped (`px-1.5 py-0.5`); the dashboard `<main>` has no max-width so wide content sprawls edge-to-edge while detail pages are constrained. No shared page-header / page-container atom enforces vertical rhythm. | **Medium** | `<main>` no max-width `(dashboard)/layout.tsx:25`; mixed spacing across `LeadFilters.tsx`, `ForecastPanel.tsx`, detail pages |
| **R7** | **Missing identity/visual texture.** No avatars (initials), no per-row iconography, no subtle elevation/shadow on cards beyond borders. `ConversationItem` builds initials inline (`leadName.charAt(0)`) instead of a shared avatar; there is no `AvatarInitials` atom yet (roadmap P0-1). The UI is all borders + text, which reads as wireframe. | **Medium** | `ConversationItem.tsx:28` inline initial; no `AvatarInitials` in `components/ui/` |

**One-sentence diagnosis:** LeadOS has a correct, well-wired dark token system and clean primitives, but the *pages* are still assembled like an engineering prototype — a placeholder home screen, raw developer-style forms, bare plain-text empty/loading states, and inconsistent page scaffolding (heading sizes, widths, density) — so the eye reads "unfinished internal tool" even though no styling is technically broken.

**What this means for the fix:** the remedy is **composition and consistency work, not a reskin** — exactly the posture of `SPRINT_7_UI_MODERNIZATION_PLAN.md`. The execution plan (Phase 1) front-loads the scaffolding atoms (page header/container, designed `EmptyState`, real Dashboard, humane Leads filter) that remove the prototype smell, before the premium-interaction work (Phase 2/3).

---

## 2. Styling System Health Check

Each row is PASS / PARTIAL / FAIL with live file evidence.

### 2.1 Tailwind loading — **PASS**
- `apps/web/tailwind.config.ts:6` — `content: ['./src/**/*.{ts,tsx}']` correctly globs all source, so utilities are not being purged.
- `apps/web/postcss.config.mjs:1-6` — `tailwindcss` + `autoprefixer` plugins present and standard.
- `apps/web/src/app/globals.css:2-4` — `@tailwind base; @tailwind components; @tailwind utilities;` all three layers imported, in order, after the token import.
- `apps/web/package.json:47` — `tailwindcss ^3.4.14` (stable Tailwind 3; PostCSS pipeline matches).
- **Conclusion:** Tailwind IS compiling. The "raw HTML" feeling is **not** a missing-stylesheet bug. This disproves the most common hypothesis up front.

### 2.2 `globals.css` — **PASS**
- `globals.css:1` imports `../styles/tokens.css` *before* the Tailwind layers (correct order so `var(--color-*)` resolve).
- `globals.css:6-12` sets `html, body` background/text/font to token values + antialiasing. Body defaults are token-driven, so even unstyled regions inherit the dark theme.

### 2.3 `tokens.css` — **PASS**
- `tokens.css:2-35` defines the full documented scale: backgrounds (`--color-bg-base`…`muted`), borders (`subtle`/`default`/`strong`), text (`primary`/`secondary`/`tertiary`), brand (`primary-500/600/700`), semantics, and radii. Matches `SPRINT_6_UI_UX_PLAN.md §1.1` exactly.
- **Minor note (not a failure):** tokens are declared on `:root` only, not gated behind `.dark`. Because the app is dark-only (`html.dark` hardcoded) this is harmless today, but it means the `darkMode: 'class'` config in Tailwind is effectively decorative.

### 2.4 Tailwind theme wiring — **PASS**
- `tailwind.config.ts:10-41` maps every token onto the theme: `colors.bg.*`, `colors.border.*` (with `DEFAULT`), `colors.text.*`, `colors.primary.*`, plus `borderRadius.lg/xl` → `var(--radius-*)` and Inter font. So `bg-bg-elevated`, `border-border`, `text-text-secondary`, `rounded-xl` all resolve to tokens. **The token→utility bridge is correct and complete.**

### 2.5 `dark` class applied on `<html>` — **PASS**
- `apps/web/src/app/layout.tsx:13` — `<html lang="en" className="dark">`. Dark mode is hardcoded as designed.

### 2.6 shadcn / Radix integration — **PASS (token-styled)**
- The wrapped primitives in `components/ui/` are all token-driven, not raw shadcn defaults:
  - `Modal.tsx:18-19` — Radix Dialog styled `bg-bg-elevated border border-border rounded-xl shadow-2xl`, overlay `bg-black/60`.
  - `Select.tsx:24,30,36` — Radix Select trigger/content/items all `bg-bg-elevated border border-border`, hover `bg-bg-subtle`.
  - `Tabs.tsx:21-26` — Radix Tabs with the documented active underline `data-[state=active]:border-primary-500`.
  - `Button.tsx:10-21`, `Badge.tsx:9-16`, `Spinner.tsx:7` — all token classes, correct variants/sizes.
- **No raw/unstyled Radix primitives leak into pages.** Integration is healthy.

### 2.7 Design-token usage vs hardcoded values — **PASS (effectively hex-free)**
- A full search for literal `#rrggbb` in components returns **no prohibited hardcoded hex**. The semantic colors that appear (`text-green-400`, `bg-red-500/15`, `text-yellow-400`, etc.) are **the sanctioned Tailwind "colored-glass" semantic pattern** from `SPRINT_6_UI_UX_PLAN.md §1.1` — these are allowed, not violations. Examples: `LeadDetailPage.tsx:109-119`, `DealDetailPage.tsx:110`, `Badge.tsx:9-16`.
- The only inline `style` usages are sanctioned/necessary: stage-color dot `KanbanColumn.tsx:31` (the one documented exception), dnd-kit drag transform `DealCard.tsx:24-30`, and the drag-overlay shadow `KanbanBoard.tsx:200` (a `boxShadow`/`scale` on the floating overlay — acceptable, though it could move to a token-able utility).
- **Conclusion:** token discipline is genuinely good. This is *not* the source of the raw feeling.

### 2.8 Component styling consistency — **PARTIAL**
- Primitives are consistent and reused widely (PASS at the atom level).
- **But page-level composition diverges:** the Leads toolbar re-implements button-like elements as raw `<button class="px-3 py-1.5 text-xs border …">` (`LeadTable.tsx:105-120`) instead of the `Button` primitive; the Leads inline status uses a native `<select>` (`LeadTable.tsx:59-72`) instead of the `Select` primitive; pagination uses bare chevron buttons (`LeadTable.tsx:227-242`). These ad-hoc controls are *token-colored* but bypass the primitive system, producing subtle inconsistency in radius/padding/hover vs the rest of the app.

### 2.9 Layout consistency between modules — **FAIL**
- **Heading scale is inconsistent:** Dashboard `text-2xl` (`page.tsx:6`), Leads `text-xl` (`LeadListPage.tsx:46`), Instagram & Login `text-lg` (`InstagramIntegrationView.tsx:24`, `login/page.tsx:53`), Pipeline has **no page `<h1>`** (only an `<h2 text-sm>` inside the board, `KanbanBoard.tsx:123`). The canonical spec (`SPRINT_6_UI_UX_PLAN.md §1.1`) says page headings are `text-xl font-semibold` — only Leads complies.
- **Container width is inconsistent:** Instagram `max-w-2xl` (`InstagramIntegrationView.tsx:22`), Leads/Pipeline full-bleed, dashboard `<main>` has `p-6` but **no max-width** (`(dashboard)/layout.tsx:25`). No shared page-container atom, so each module sets its own scaffolding.
- This is the single clearest "different app per screen" signal and the strongest driver of the unfinished feeling after the placeholder dashboard.

**Health-check verdict:** **System = healthy (7 PASS / 1 PARTIAL). Composition = the problem (layout consistency FAIL, component-composition PARTIAL).** The fix is scaffolding + consistency, not plumbing.

---

## 3. Per-Screen Audit

Each screen uses the exact subsections requested. Reference Inspiration is **UX-only** (information hierarchy, affordances, interaction model) — never a visual copy, per the constraints.

---

### 3.1 Login page — `app/(auth)/login/page.tsx`

**Current State**
- A single elevated card: `bg-bg-elevated border border-border rounded-xl p-8 space-y-6` (`login/page.tsx:51`) centered by the auth layout's `max-w-md` wrapper (`(auth)/layout.tsx:6-9`). Token-styled inputs with `focus:border-primary-500` (`:70,:86`), the `Button` primitive (`:96-104`), and a token-glass error block (`:91`). This is actually the **most finished-looking screen** in the app.

**Problems**
- Heading is `text-lg` (`:53`) — below the spec's `text-xl` page heading, contributing to the cross-module size drift (R3).
- No product identity above the form (no logomark/wordmark beyond the H1 text); the card floats on a flat `bg-bg-base` with no texture.
- No "forgot password" / secondary affordance, so it reads as a bare auth stub.

**UX Gaps**
- No loading affordance beyond the button label swap (acceptable per spinner rules, but no inline `Spinner`).
- No field-level validation messaging (only a single top error).

**Visual Gaps**
- Card lacks the subtle elevation/branding that makes auth screens feel "designed"; it is structurally correct but minimal.

**Reference Inspiration (UX only)**
- **Linear / Stripe** auth: a centered card with a small wordmark above, generous vertical rhythm, single primary CTA. We already match the structure — borrow only the *hierarchy* (brand → heading → subtext → fields → CTA).

**Recommended Improvements** (reuse only existing tokens/primitives)
- Promote heading to the canonical `text-xl font-semibold text-text-primary` for cross-app consistency.
- Add a small wordmark line above the H1 reusing existing `text-sm font-semibold text-text-primary` (matches the sidebar logo treatment in `(dashboard)/layout.tsx:10`).
- Keep everything else; this screen is close. Lowest priority — it is not a root cause.

---

### 3.2 Dashboard shell — `app/(dashboard)/layout.tsx` + `app/(dashboard)/page.tsx`

**Current State**
- **Shell:** correct and clean — `flex min-h-screen`, `w-56` sidebar `border-r border-border bg-bg-elevated`, token nav items with active state via `usePathname` (`NavLinks.tsx:12-29`), Settings pinned to the bottom (`layout.tsx:15-23`), `<main className="flex-1 overflow-auto p-6">` (`:25`). Matches `SPRINT_6_UI_UX_PLAN.md §1.3`. **Per constraints, the shell is NOT to be redesigned.**
- **Home page:** a placeholder — `<h1 text-2xl> LeadOS </h1>` + one `<p>` "Dashboard arrives in a later sprint." (`page.tsx:3-12`).

**Problems**
- **R1 (critical):** the home route is the first thing every authenticated user sees and it is a literal stub. This single fact dominates the "unfinished" perception more than anything else.
- `<main>` has no max-width (`layout.tsx:25`), so when real content lands it will sprawl edge-to-edge on wide monitors (R6).
- Dashboard H1 is `text-2xl` while every other page is smaller (R3).

**UX Gaps**
- No KPIs, no "what needs me today", no recent activity, no quick actions — the operator has nowhere to land. (Specified in `SPRINT_7 §3` and roadmap `P2-1`.)

**Visual Gaps**
- Zero visual content density on the home screen; an empty page reads as broken.

**Reference Inspiration (UX only)**
- **HubSpot / Pipedrive** open on an operator dashboard: a KPI strip + a "today / rotting deals" focus list. Borrow the *information model* (KPIs → my-day → recent activity → quick actions), not the visuals.

**Recommended Improvements**
- Build the real dashboard exactly as specified in `SPRINT_7_UI_MODERNIZATION_PLAN.md §3` (adopting roadmap `P2-1`): `KpiStrip` (reuse `StatCard` P0-5), `MyTasksSection`, `RecentActivitySection`, `QuickActionsSection`, fed by `GET /dashboard/stats`. Do **not** redesign the shell.
- Add a shared page-container max-width (see §3.3 / R6) so dashboard content does not sprawl.
- Keep heading at the canonical `text-xl` to align with all modules.

---

### 3.3 Leads — `app/(dashboard)/leads/page.tsx` → `LeadListPage` / `LeadFilters` / `LeadTable`

**Current State**
- `LeadListPage.tsx:44-54`: `space-y-5`, header row with `text-xl` H1 (the one spec-compliant heading), then the always-rendered `LeadFilters` panel, then `LeadTable`.
- `LeadFilters.tsx:49-237`: a permanently-expanded `bg-bg-elevated border border-border rounded-xl p-4` panel containing search, status pills, source pills, AI min/max, date from/to, **comma-separated tags input** (`:159-175`), and **"Assigned to (user ID)" raw UUID input** (`:177-187`), plus preset save/load/delete chips.
- `LeadTable.tsx`: an HTML `<table>` with sortable headers, native `<select>` inline status edit (`:59-72`), `text-[10px]` tag pills (`:192`), and chevron pagination (`:221-247`).

**Problems**
- **R2 (critical):** the always-open mega-form with a **UUID text field** and **comma-separated tags** is the most "internal tool / raw HTML form" surface in the product. It is developer ergonomics surfaced as product UI.
- **R5:** the table has no identity column (no avatar/initials), uses a native `<select>` (un-themed across browsers) instead of the `Select` primitive, and re-implements toolbar buttons as raw `<button>`s instead of `Button` (`LeadTable.tsx:105-120`).
- Filter panel consumes huge vertical space above the data, pushing the actual table below the fold.

**UX Gaps**
- No bulk actions / multi-select despite API readiness (`SPRINT_7 §6`, `S7-F2`).
- No saved *views* (only ad-hoc presets) — should graduate to the shared `ViewBar` (`S7-F1`).
- No column control / density toggle (`SPRINT_7 §6`).
- AI Score is an unexplained raw number (`LeadTable.tsx:204-212`).

**Visual Gaps**
- Bare-table register; `text-[10px]` pills are off-scale vs the token typography ladder; no row hover affordances beyond a background tint.

**Reference Inspiration (UX only)**
- **Attio** data grid: identity-first rows (avatar + name), collapsed filter bar with chips, inline-edit cells, column control, density toggle, bulk-select. Borrow the *interaction model* (filters collapse into a bar; selection + bulk bar; identity column), not the visuals.

**Recommended Improvements**
- **Collapse `LeadFilters` into a compact filter bar** (search + a small set of chips) with advanced filters behind a "Filters" affordance; replace the **UUID input** with the shared `UserSelect` (roadmap P0-6) and the **comma tags** with `TagChipInput` (roadmap P4-2). This is the single highest-leverage visual fix on this screen.
- Replace native `<select>` inline-status with the `Select` primitive; replace raw toolbar/pagination `<button>`s with the `Button` primitive (token consistency, §2.8).
- Add an identity column using a shared `AvatarInitials` (roadmap P0-1); normalize tag pills to the token scale (`text-xs`, semantic-glass) instead of `text-[10px]`.
- Layer `ViewBar` (`S7-F1`) + `useMultiSelect`/`BulkActionBar` (`S7-F2`) per `SPRINT_7 §6`. (Premium interactions land in Phase 2 of the execution plan.)

---

### 3.4 Pipeline — `app/(dashboard)/pipeline/page.tsx` → `KanbanBoard` / `DealCard`

**Current State**
- `KanbanBoard.tsx:113-228`: a genuinely strong kanban — `PipelineSelector`, `ForecastPanel`, dnd-kit columns, mobile single-column carousel with prev/next, drag overlay. `DealCard.tsx:32-81` uses the standard card pattern (`bg-bg-elevated border border-border rounded-lg`, hover `border-border-strong`, hover-reveal Won/Lost, `DealHealthBadge`). This is the most *mature* surface in the app.

**Problems**
- **R3:** the Pipeline page has **no page `<h1>`** — only `<h2 text-sm font-medium text-text-secondary>` inside the board (`KanbanBoard.tsx:123`). Against the other modules this makes Pipeline feel header-less and unframed.
- Board-only: no list view, status hardcoded to `OPEN` (`SPRINT_7 §4`).
- Drag-overlay shadow is an inline `rgba` `boxShadow` (`KanbanBoard.tsx:200`) — acceptable but the lone non-token visual.

**UX Gaps**
- No list↔board toggle, no saved filters, no in-board search, no board stats bar, no bulk actions (all in `SPRINT_7 §4` + roadmap `P6-1/2/3`).

**Visual Gaps**
- Minimal vs the rest; mostly a missing page header and the absence of a list view's density option. Cards themselves are fine.

**Reference Inspiration (UX only)**
- **Pipedrive** pipeline: keep the kanban (already at the bar), add a list↔board segmented toggle, a filter/stats bar, and "rotting" signals (we already have `DealHealthBadge`). Borrow the *toggle + filter-bar model* only.

**Recommended Improvements**
- Add a standard page header (canonical `text-xl font-semibold` H1 + the shared page container) so Pipeline is framed like Leads/Inbox — pure consistency fix.
- Add `PipelineViewToggle` + `DealListView` (mirroring `LeadTable`) and `PipelineFilterBar` mounting `ViewBar`, per `SPRINT_7 §4`. (Phase 2/3 of the execution plan.)
- Move the drag-overlay shadow to a reusable token-based ring/shadow utility consistent with `DealCard`'s `ring-1 ring-primary-500/40`.

---

### 3.5 Deal Detail — `app/(dashboard)/pipeline/deals/[id]/page.tsx` → `DealDetailPage`

**Current State**
- `DealDetailPage.tsx:66-130`: the canonical two-panel detail layout (`flex flex-col lg:flex-row gap-6`, left `flex-[3]`, right `flex-[2]` in a `border border-border rounded-xl` `Tabs` panel). `StageTimeline`, `DealMetadataForm`, Won/Lost CTAs with token-glass status banners (`:108-114`). Structurally solid and consistent with `LeadDetailPage`.

**Problems**
- **R4:** the Notes and Files tabs render **"Coming soon"** plain text (`DealDetailPage.tsx:57,62`). User-visible TODO stubs are a direct "unfinished" signal.
- No linked-lead panel (roadmap `P3-3`), so the record feels less "relationship-rich" than the lead detail.

**UX Gaps**
- Notes/Files are non-functional placeholders; no inline-edit on as many fields as a mature record page.

**Visual Gaps**
- The right panel's two stub tabs look empty; the bare centered "Coming soon" is the antithesis of a designed empty state.

**Reference Inspiration (UX only)**
- **Attio / HubSpot** record pages: relationship panels (linked lead/contact), notes, files, activity — all as designed empty states when absent. Borrow the *panel composition*, not visuals.

**Recommended Improvements**
- Replace "Coming soon" with the real `NotesList` (roadmap P3-1) and `FileUploadZone` stub (P3-2), and a `LinkedLeadPanel` (P3-3). Until then, at minimum swap the bare strings for the shared `EmptyState` atom (roadmap P0-2) so they read as designed, not broken.

---

### 3.6 Inbox — `app/(dashboard)/inbox/page.tsx` → `InboxPage` / `ConversationList` / `ConversationItem` / `ThreadView`

**Current State**
- `InboxPage.tsx:79-122`: a real split-pane application — `-m-6 h-[calc(100svh-0px)]` full-bleed, All/Mine/Unassigned tab bar with the token active-underline, list + thread panels with `border-r border-border`. `ConversationList` has infinite scroll + `Spinner`. `ThreadView` and message bubbles follow the Sprint 6 spec. This is a strong, finished-feeling surface.

**Problems**
- **R7:** `ConversationItem.tsx:28` builds the avatar as a single inline initial (`leadName.charAt(0)`) rather than a shared `AvatarInitials` atom — and `preview` is hardcoded to `''` (`:18,:40`), so every row's second line is empty. Rows therefore look sparse (name + time only), reinforcing the "thin/wireframe" feel.
- **R4:** empty states are bare strings — "No conversations" (`ConversationList.tsx:46`), "Select a conversation to get started" (`InboxPage.tsx:116`).

**UX Gaps**
- No conversation search, no unread badges, single "Assign to me" instead of a full assignee picker, no SLA/response-time chip, no bulk actions (all in `SPRINT_7 §5` + roadmap `P5-1/2/3`).

**Visual Gaps**
- Conversation rows lack a message preview (empty `preview`), unread indicator, and a real avatar — so the list looks emptier than HubSpot's inbox.

**Reference Inspiration (UX only)**
- **HubSpot conversation inbox / Intercom:** rows carry avatar + name + last-message preview + unread + SLA chip; search atop the list. Borrow the *row information model* only.

**Recommended Improvements**
- Wire a real last-message `preview` into `ConversationItem` and replace the inline initial with `AvatarInitials` (P0-1); add unread badges (`P5-2`) and an `SlaChip` (`SPRINT_7 §5`).
- Replace the two bare empty strings with the shared `EmptyState` atom (P0-2).
- Add search (`P5-1`) and the `UserSelect` assignee picker (`P5-3`). (Phase 2/3.)

---

### 3.7 Instagram Integration — `app/(dashboard)/settings/integrations/instagram/*`

**Current State**
- `InstagramIntegrationView.tsx:21-78`: a clean settings surface — `max-w-2xl`, `text-lg` heading, a "Connected accounts" section with the `Button` primitive `+ Connect account`, token-glass success/error banners (`:31,:36`), a dashed-border empty state (`:57`), `InstagramAccountCard` rows, and a plan-limit footnote. Functionally and visually one of the more finished screens.

**Problems**
- **R3:** heading is `text-lg` (`:24`) and the page is `max-w-2xl` while Leads/Pipeline are full-bleed `text-xl` — so Settings reads as a narrower, differently-scaled "different app".
- **R4 (minor):** loading is the plain text "Loading…" (`:55` and the Suspense fallback `page.tsx:9`) instead of `<Spinner>`, which violates the spinner convention.
- This page exists as an **orphan** — there is no settings shell/nav, so it reads as a single stray page rather than a Settings section (see §3.8).

**UX Gaps**
- No reconnect for EXPIRED accounts (roadmap `P7-2`); no surrounding settings navigation.

**Visual Gaps**
- Text "Loading…" vs the app-wide `Spinner`; width/heading mismatch with other modules.

**Reference Inspiration (UX only)**
- **Stripe / HubSpot** integrations pane: a card list inside a settings section with a left rail. Borrow the *section framing*, not visuals.

**Recommended Improvements**
- Swap "Loading…" for `<Spinner>` (cheap consistency win).
- Bring heading + width into the shared page scaffolding (canonical `text-xl`, shared container) once the page-header/container atoms exist (Phase 1).
- Nest under a real Settings shell with left-rail nav (`SPRINT_7 §7`, roadmap `P7-1`) and add reconnect (`P7-2`).

---

### 3.8 Settings — section shell (currently only the Instagram orphan)

**Current State**
- There is **no `settings/layout.tsx`, no `SettingsNav`, and no Team/Profile/Billing surfaces.** The only Settings route is the Instagram integration page; the sidebar "Settings" link (`(dashboard)/layout.tsx:16-22`) deep-links straight to `/settings/integrations/instagram`. So "Settings" is a single page masquerading as a section.

**Problems**
- Clicking "Settings" lands on one integration page with no sibling navigation — the hallmark of an unfinished product area.
- No Profile/sessions, Team, or Billing — common, expected settings panes are simply absent.

**UX Gaps**
- No settings IA at all: no left rail, no Profile/security pane (sessions revoke), no Team roster, no Billing stub. (`SPRINT_7 §7`, roadmap `P7-1`.)

**Visual Gaps**
- The section has no frame; it inherits the Instagram page's `max-w-2xl`/`text-lg` so it doesn't even match the other modules' scaffolding.

**Reference Inspiration (UX only)**
- **Linear / HubSpot / Attio** settings: a left-rail section (Profile · Team · Integrations · Billing) with multiple panes. Borrow the *left-rail IA model* only.

**Recommended Improvements**
- Build `settings/layout.tsx` + `SettingsNav` (roadmap `P7-1`) so Integrations becomes one pane of a real section; add Profile (me + password + sessions revoke — backend-ready), read-only Team, and an honest Billing stub via `EmptyState`, exactly per `SPRINT_7 §7`. (Phase 3 of the execution plan.)

---

## 4. Audit Conclusion

The styling **system** is not the problem — Tailwind compiles, tokens are defined and theme-wired, `html.dark` is applied, primitives are clean and token-driven, and the codebase is effectively hex-free. The product feels like an unfinished internal tool because of **composition and consistency**: a placeholder home screen (R1), raw developer-style forms with a UUID input and comma-separated tags (R2), inconsistent page scaffolding across modules (R3), bare plain-text empty/loading states (R4), an HTML-table-grade Leads table (R5), uneven density with no shared page container (R6), and missing identity/avatars (R7).

Every remedy reuses the existing tokens, the existing `components/ui/*` primitives, and the existing Tailwind config — no new palette, no new library, no shell redesign. The companion `UI_MODERNIZATION_EXECUTION_PLAN.md` sequences these fixes: **Phase 1** removes the prototype smell (scaffolding, real dashboard, humane Leads filter, designed empty states), then Phases 2–3 add the premium-CRM interactions cross-referenced to `SPRINT_7_UI_MODERNIZATION_PLAN.md`.

*All findings extracted from live source files under `apps/web/src`. No implementation was performed; this document is an audit + plan only.*
