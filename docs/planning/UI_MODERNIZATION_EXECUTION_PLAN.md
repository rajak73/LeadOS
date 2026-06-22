# LeadOS UI Modernization — Execution Plan

**Author:** Principal Engineer
**Date:** 2026-06-22
**Status:** PLAN ONLY — execution gated on approval. No code written.
**Companion to:** `UI_AUDIT_REPORT.md` (the root-cause diagnosis this plan remediates).

**Cross-referenced source plans (cited, not duplicated):**
- `SPRINT_7_UI_MODERNIZATION_PLAN.md` — premium-interaction items, cited as `S7-Fn` and by screen section (`§3`–`§7`).
- `LEADOS_UI_IMPLEMENTATION_ROADMAP.md` — feature-completeness items, cited as `Pn-n`.
- `SPRINT_6_UI_UX_PLAN.md` — the binding design-system reference (tokens, primitives, patterns).

> **Posture:** This is **composition and consistency** work, not a reskin. The audit proved the styling system is healthy; the unfinished feeling comes from page assembly. Phase 1 removes the prototype smell using only existing atoms; Phases 2–3 layer on the premium-CRM interactions already specified in Sprint 7.

---

## 0. Non-negotiable constraints (bind every item below)

1. **Reuse existing design tokens** (`apps/web/src/styles/tokens.css`) — no new color tokens, **no hardcoded hex**.
2. **Reuse existing primitives** (`apps/web/src/components/ui/*`: `Button`, `Badge`, `Modal`, `Select`, `Tabs`, `Spinner`, `Toast`). No new component library. New Radix primitives must be wrapped in `components/ui/` first.
3. **Reuse the existing Tailwind config** (`apps/web/tailwind.config.ts`). No new palette.
4. **No dashboard-shell redesign** (`(dashboard)/layout.tsx` stays; nav entries may be added in the existing style).
5. **No visual inconsistency between modules** — every screen shares the same page header + container scaffolding after Phase 1.
6. **`Spinner` only (no skeletons); dark-only; `transition-colors` only; emoji/plain-glyph icons only.**
7. **HubSpot/Attio/Pipedrive/Linear/Stripe are UX references only** — never copied visually.
8. **No regressions** — every touched page keeps existing tests green; new surfaces add their own tests. Per-phase gates: `tsc --noEmit`, `eslint`, `next build`, `vitest run`, plus manual happy/empty/loading + 375px mobile check (`LEADOS_UI_IMPLEMENTATION_ROADMAP.md` Approval Gates).

---

## Phase 1 — Foundation (removes the "raw internal tool" feeling)

**Goal:** eliminate root causes R1–R6 from `UI_AUDIT_REPORT.md` using only existing tokens/primitives. This phase is what makes the product stop looking like a prototype. Ordered by leverage.

### 1.1 — Shared page scaffolding atoms (`PageHeader` + `PageContainer`)
**Fixes:** R3 (inconsistent headings/widths), R6 (no shared container/rhythm).
**New files (wrapped atoms, token-only):**
- `apps/web/src/components/ui/PageHeader.tsx` — props `{ title, actions? }`; renders the canonical `text-xl font-semibold text-text-primary` H1 + an optional right-aligned actions slot, with consistent bottom rhythm.
- `apps/web/src/components/ui/PageContainer.tsx` — a single max-width + spacing wrapper (e.g. `max-w-screen-xl space-y-5`) so every module shares one width strategy; opt-out for full-bleed surfaces (Inbox/Pipeline board).

**Reuses:** token typography from `SPRINT_6_UI_UX_PLAN.md §1.1`; existing `space-y-5` list-page pattern (`LeadListPage.tsx:44`).
**Target files to migrate onto these atoms:**
- `app/(dashboard)/page.tsx` (drop `text-2xl` → canonical), `components/leads/LeadListPage.tsx` (already `text-xl` — adopt atom), `app/(dashboard)/settings/integrations/instagram/InstagramIntegrationView.tsx` (`text-lg`/`max-w-2xl` → canonical), `components/kanban/KanbanBoard.tsx` (add the missing page header), `app/(auth)/login/page.tsx` (`text-lg` → `text-xl`).
**Acceptance checks:**
- Every page `<h1>` is `text-xl font-semibold text-text-primary`; grep for `text-2xl`/`text-lg` page headings returns none.
- Leads, Pipeline, Instagram render inside one shared container width.
- No hex introduced; existing tests green.

### 1.2 — Designed `EmptyState` + spinner-loading consistency
**Fixes:** R4 (bare plain-text empty/loading states read as TODO stubs).
**Reuses / builds:** `EmptyState` (roadmap **P0-2**) — token heading/body + optional `Button` action.
**Target files (replace bare strings):**
- `components/deals/DealDetailPage.tsx:57,62` ("Coming soon" → `EmptyState`), `components/leads/LeadTable.tsx:171` ("No leads found"), `components/inbox/ConversationList.tsx:46` ("No conversations"), `components/inbox/InboxPage.tsx:116` ("Select a conversation"), and swap text "Loading…" for `<Spinner>` in `InstagramIntegrationView.tsx:55` + `instagram/page.tsx:9`.
**Acceptance checks:**
- No user-visible "Coming soon" / bare empty strings remain; all empties use `EmptyState`.
- All loading states use `<Spinner>` (no text "Loading…"); grep confirms.

### 1.3 — Real Dashboard (kill the placeholder)
**Fixes:** R1 (critical — the first screen is a stub).
**Spec source:** `SPRINT_7 §3` adopting roadmap **P2-1** as-is. Build `DashboardPage`, `KpiStrip` (reuses **P0-5 `StatCard`**), `MyTasksSection`, `RecentActivitySection`, `QuickActionsSection`, hook `useDashboardStats`, BFF + `GET /dashboard/stats`.
**Reuses:** `StatCard`, `Button`, existing `ForecastPanel` (read-only), `DealHealthBadge`, `LeadStatusBadge`, the new `PageHeader`/`PageContainer` (1.1), `EmptyState` (1.2).
**Target file:** `app/(dashboard)/page.tsx` (replace placeholder body) — **shell untouched** per constraint 4.
**Acceptance checks:**
- Home route renders real org-scoped KPIs + My-Day + recent activity + quick actions; no "arrives in a later sprint" text.
- KPI strip degrades to spinner/"—" on load/error; mobile 2×2 then 1×1 grid; tests green.

### 1.4 — Humane Leads filter (de-rawify the forms)
**Fixes:** R2 (critical — UUID input + comma tags = the rawest surface).
**Target file:** `components/leads/LeadFilters.tsx`.
**Reuses:** replace the **"Assigned to (user ID)" UUID input** (`LeadFilters.tsx:177-187`) with shared **`UserSelect`** (roadmap **P0-6**); replace **comma-separated Tags input** (`:159-175`) with **`TagChipInput`** (roadmap **P4-2**). Collapse the always-open 9-field panel into a compact filter bar (search + primary chips visible; advanced filters behind a "Filters" disclosure built on the existing `Modal`/Radix Dialog or an inline toggle — no new primitive).
**Acceptance checks:**
- No raw UUID text field and no comma-separated free-text tag field remain on the Leads page.
- Filters collapse so the table is above the fold on a 768px-tall viewport; existing preset save/load/delete still works; tests green.

### 1.5 — Tables & inline controls use primitives (not raw HTML controls)
**Fixes:** R5 (table reads like an HTML `<table>`), §2.8 component-composition PARTIAL.
**Target file:** `components/leads/LeadTable.tsx`.
**Reuses:** replace native `<select>` inline-status (`:59-72`) with the **`Select`** primitive; replace raw toolbar buttons (`:105-120`) and pagination chevrons (`:227-242`) with the **`Button`** primitive; normalize `text-[10px]` tag pills (`:192`) to the token scale (`text-xs`, default/semantic-glass `Badge`); add an identity column using **`AvatarInitials`** (roadmap **P0-1**).
**Acceptance checks:**
- No native `<select>` / ad-hoc `<button>` controls remain in `LeadTable`; all use primitives.
- Rows show an avatar/identity cell; tag pills are on the token type scale; tests green.

### 1.6 — Inbox row richness (avatar + preview)
**Fixes:** R7 (thin/wireframe rows), partial R4.
**Target file:** `components/inbox/ConversationItem.tsx`.
**Reuses:** replace inline `leadName.charAt(0)` avatar (`:28`) with **`AvatarInitials`** (P0-1); wire a real last-message `preview` (currently hardcoded `''` at `:18,:40`) into the row's second line.
**Acceptance checks:**
- Conversation rows show a real avatar and a non-empty last-message preview; `EmptyState` used for the empty list; tests green.

**Phase 1 exit criteria:** no placeholder home screen; one consistent page header + container across modules; no bare "Coming soon"/empty/text-Loading states; Leads filter has no developer-grade inputs; tables/inline controls use primitives; inbox rows carry identity + preview. The product no longer reads as an unfinished internal tool. **Zero hex, zero new libraries, shell unchanged, all four gates green.**

---

## Phase 2 — Premium CRM interactions (parity with best-in-class)

**Goal:** add the interaction-maturity layer from `SPRINT_7_UI_MODERNIZATION_PLAN.md §2` shared foundation + the per-screen surfaces. This is where LeadOS goes from "finished" to "premium". Cross-references Sprint 7 rather than re-specifying.

### 2.1 — Shared interaction foundation (build first; blocks the rest)
Implement the Sprint 7 shared atoms in this order (`SPRINT_7 §2`, §8 Stage A):
- **`S7-F1` SavedViews engine + `ViewBar`** — generalizes the existing Leads presets into a reusable bar. Reuses `Tabs` chip styling, `Button`, `Modal`. Files per `SPRINT_7 §2`.
- **`S7-F2` `BulkActionBar` + `useMultiSelect`** — sticky selection bar + checkbox affordance (`accent-primary-600` + token borders). Reuses semantic-glass + `Button`.
- **`S7-F5` `useKeyboardShortcuts` + `ShortcutHelp`** — central registry; `?` opens a `Modal` of bindings.
- **`S7-F4` GlobalSearch hook + BFF** (backend `GET /search?q=`) → then **`S7-F3` CommandPalette (⌘K)** built on the existing Radix Dialog behind `Modal` (no new dep), mounted in `(dashboard)/layout.tsx` **without restructuring the shell**.
**Acceptance:** `SPRINT_7 §10` criteria 1–3, 7 (saved views from one `ViewBar`; bulk from one `BulkActionBar`; ⌘K navigates/creates offline + live search when endpoint up; `g→i/l/p/d`, `c`, `?` work).

### 2.2 — Empty & loading states everywhere (extend Phase 1.2)
Apply the `EmptyState` atom to all remaining surfaces (Dashboard sections, Pipeline list view, Settings panes) so absence is always a designed state. Reuses `EmptyState` (P0-2). **Acceptance:** no surface renders a bare empty string; spinner-only loading throughout.

### 2.3 — Saved views on Leads / Pipeline / Inbox
Mount `ViewBar` (`S7-F1`) on all three list surfaces, migrating the existing Leads presets (`SPRINT_7 §4/§5/§6`). **Acceptance:** `SPRINT_7 §10` criterion 1.

### 2.4 — Bulk actions on Leads table + Pipeline list
Mount `useMultiSelect` + `BulkActionBar` (`S7-F2`) on `LeadTable` (`SPRINT_7 §6`, roadmap context) and the new `DealListView` (`SPRINT_7 §4`). Leads bulk API is already ready → fastest high-value win. **Acceptance:** `SPRINT_7 §10` criterion 2.

### 2.5 — Pipeline list↔board parity + filter bar
Build `PipelineViewToggle` + `DealListView` (mirror `LeadTable`) + `PipelineFilterBar` mounting `ViewBar`, sharing filter state with the board, per `SPRINT_7 §4`. **Acceptance:** `SPRINT_7 §10` criterion 4 (list view toggles without page reload).

**Phase 2 exit criteria:** `SPRINT_7 §10` criteria 1–4, 7 met; one `ViewBar`/`BulkActionBar`/CommandPalette implementation reused across surfaces; zero hex / no new libraries; gates green.

---

## Phase 3 — Productivity / Analytics / AI UX

**Goal:** complete the remaining productivity and record-completeness surfaces and the Settings section, plus the lightweight analytics/AI affordances. All cross-referenced.

### 3.1 — Inbox productivity (search · unread · SLA · assignee)
Per `SPRINT_7 §5` + roadmap `P5-1/2/3`: conversation search (`P5-1`), unread badges + tab counts (`P5-2`, needs `unreadCount`), `SlaChip` (semantic-glass, derived from `lastInboundAt`), assignee picker via `UserSelect` (`P5-3`), then `ViewBar` + bulk. **Acceptance:** inbox reaches HubSpot conversation-inbox parity; no new tokens; tests green.

### 3.2 — Record completeness (Deal & Lead detail)
Per `SPRINT_7 §4` + roadmap `P3-1/2/3`, `P4-1/2/3`: Deal Notes (`NotesList`, P3-1), Files (`FileUploadZone` stub, P3-2), `LinkedLeadPanel` (P3-3); Lead Files (P4-1), `TagChipInput` already landed in Phase 1.4 (P4-2), `LinkedConversationsPanel` (P4-3). **Acceptance:** no "Coming soon" tabs remain; record pages are relationship-rich; tests green.

### 3.3 — Pipeline analytics polish
Per `SPRINT_7 §4` + roadmap `P6-1/2/3`: in-board search (P6-1), board stats bar "N deals · ₹X" (P6-2), quick-add from column header (P6-3). Dashboard KPI→saved-view deep links (`SPRINT_7 §3` additions on top of P2-1). **Acceptance:** KPIs are deep links to filtered views (`SPRINT_7 §10` criterion 5); stats/search functional.

### 3.4 — Settings section (shell + Profile/Team/Billing)
Per `SPRINT_7 §7` + roadmap `P7-1/2`: `settings/layout.tsx` + `SettingsNav` (P7-1) turning Integrations into a pane; Profile pane (me + password + sessions revoke — backend-ready); read-only Team pane; Instagram reconnect for EXPIRED (P7-2); honest Billing stub via `EmptyState`. **Acceptance:** `SPRINT_7 §10` criterion 6 (navigable section with Integrations + Profile incl. session revoke).

### 3.5 — Lightweight AI/analytics affordances
AI Score explanation tooltip/popover on Leads (no ML change; `SPRINT_7 §6`, §11 scope) built on the existing `Modal`/Radix or a wrapped Popover. Keep scope to *explaining* the existing score. **Acceptance:** AI Score has an inline explanation affordance; no new ML, no new tokens.

**Phase 3 exit criteria:** `SPRINT_7 §10` criteria 5–6 met; Settings is a real section; record pages complete; pipeline analytics + AI tooltip in place. **Out of scope remains out** per `SPRINT_7 §11` (server-side views, BI builder, multi-channel inbox, billing integration, light mode, new icon library, new tokens, sidebar redesign).

---

## Sequencing rationale

Phase 1 is sequenced strictly by perception-leverage: scaffolding atoms (1.1) and designed empties (1.2) unblock and visually unify everything; the real Dashboard (1.3) removes the single worst signal (the placeholder home); the humane Leads filter (1.4) kills the rawest form; primitive-based tables (1.5) and richer inbox rows (1.6) finish the prototype-removal. Only after the product reads as "finished" do Phases 2–3 add premium interactions and completeness, in the exact order and with the exact components specified by `SPRINT_7_UI_MODERNIZATION_PLAN.md §8` (Stage A→F) and the `Pn-n` roadmap — this document orders and grounds those items in the audit's root causes rather than re-authoring them.

*No implementation performed. All target files and line numbers reference live source under `apps/web/src`. Every item reuses existing tokens, primitives, and Tailwind config; no new palette, no new library, no shell redesign.*
