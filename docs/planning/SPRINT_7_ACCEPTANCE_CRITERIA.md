# Sprint 7 — Acceptance Criteria

**Author:** Principal Engineer
**Date:** 2026-06-21
**Status:** REVIEW — companion to `SPRINT_7_ARCHITECTURE_REVIEW.md`, `SPRINT_7_EXECUTION_PLAN.md`, `SPRINT_7_RISK_ASSESSMENT.md`
**Purpose:** the testable bar each milestone must clear to be signed off. Every criterion is objective (a test, a command, or an observable behavior).

---

## Global Gates (apply to EVERY milestone — all must pass)

| ID | Gate | Verification |
|----|------|--------------|
| G-1 | `pnpm typecheck` — 0 errors (all packages) | CI |
| G-2 | `pnpm lint` — 0 errors | CI |
| G-3 | API tests pass (no regressions; new tests included) | `vitest run` (api) |
| G-4 | Web tests pass | `vitest run` (web) |
| G-5 | `check:rls` reports the milestone's expected table count | `pnpm --filter @leados/api check:rls` |
| G-6 | `check:enum-parity` OK after any enum/event change | `pnpm --filter @leados/api check:enum-parity` |
| G-7 | `next build` succeeds | CI |
| G-8 | **Token compliance:** `grep` for hex (`"#` / `'#`) in new component dirs returns zero | grep gate |
| G-9 | New `ui/` usage imports from `@/components/ui/` (no reimplemented primitives) | review |
| G-10 | Disabling a feature flag (`ai.scoring.enabled`, `workflows.execution.enabled`, `notifications.email.enabled`) **skips work, never errors a user request** | flag tests |
| G-11 | No external provider (OpenAI/SendGrid/Meta) called in CI; mocks only | review + test config |
| G-12 | Branch coverage ≥70% per new module (≥90% for AI quota/breaker + workflow loop-guard) | coverage report |

**Expected `check:rls` counts:** M1 → **24**, M2 → **25**, M3 → **27**, M4 → **27**, M5 → **27**, M6 → **27**.

---

## M1 — Notification Engine + Email + Foundations

### Functional
1. A new inbound Instagram message creates a **persistent** `notifications` row for the assigned/owning user (not only an ephemeral socket emit).
2. `GET /api/v1/notifications` returns the user's notifications, cursor-paginated, newest-first; `?unread=true` filters to unread.
3. `POST /notifications/:id/read` sets `readAt`; `POST /notifications/read` marks all (or a supplied id set) read.
4. `GET/PUT /notifications/preferences` reads and updates per-type in-app/email toggles; defaults are applied for types with no row.
5. An email is enqueued to `EMAIL_DELIVERY` **only** when the user's preference for that type has `email=true` **and** `notifications.email.enabled` is on; otherwise no email job is created.
6. The `notification-delivery` worker fans out per preference; the `email-delivery` worker calls the `EmailAdapter` (mock in CI).

### Foundations / deferred-item cleanup
7. **B-2:** creating/updating/deleting a pipeline or stage produces an `activities` row via `ActivityService.append()` (previously missing). Verified by an integration test asserting the row exists with the correct `relatedPipelineId`.
8. **§5.1:** `activities.relatedConversationId` column exists (migration 0018), is nullable, indexed, and additive (no backfill).
9. All five Sprint 7 `ActivityType`/`DomainEvent` values are present in `enums.ts`, `events.ts`, `schema.prisma`, and `activity-metadata.ts` (G-6 passes).

### Frontend
10. A notification bell renders in the dashboard layout with an unread-count badge (capped "9+"); the panel lists recent notifications and supports mark-all-read.
11. A `/notifications` page lists all notifications with read/unread states.
12. Socket initialization lives in the dashboard layout; **the Sprint 6 inbox realtime still works** — a new DM invalidates conversation queries live (regression test R-RT-1).

### Security
13. Cross-org isolation: a user in org B never sees org A's notifications (`check:rls` = 24 + integration test).

---

## M2 — AI Lead Scoring

### Functional
1. `LEAD_CREATED` (and `LEAD_STATUS_CHANGED`) enqueues an `AI_SCORING` job; the `ai-scoring` worker writes a new immutable `AiScore` row and updates `Lead.aiScore` + `aiScoreUpdatedAt` in one transaction, and appends a `LEAD_SCORED` activity.
2. `GET /leads/:id/score` returns the current score plus history (all `ai_scores` rows for the lead).
3. `POST /leads/:id/rescore` enqueues a rescore (202), bypassing the prompt cache; returns `FEATURE_DISABLED` when the flag is off and `AI_QUOTA_EXCEEDED` when over limit.

### Cost & resilience (P0 R-AI-1, R-AI-2)
4. **Monthly cap:** with `aiCallsPerMonth` exhausted, further scoring jobs are **skipped** (no `AiScore` written) and record a quota activity — proven by importing more leads than the cap and asserting AiScore count ≤ cap.
5. **Hourly burst:** Redis sliding window blocks bursts beyond `aiCallsPerHour`; blocked jobs retry later, not error.
6. **Circuit breaker:** when the provider mock errors above threshold, the breaker opens, jobs are skipped/retried, and no unhandled error surfaces to the request path.
7. **Prompt cache:** a second scoring for an unchanged feature-hash does not call the provider (assert adapter call count); cache keys are org-scoped (no cross-org hit).
8. **Determinism:** all CI scoring tests use `MockAiAdapter`; zero live OpenAI calls (G-11). One env-gated live smoke test exists but is skipped in CI.

### Frontend
9. The lead score renders as a `Badge` on `LeadTable` and `LeadDetailPage`; a popover shows factors + recommendation + score history. No hex, existing primitives only (G-8/G-9).

### Security
10. AI worker loads lead context only via `withTenant(orgId)`; cross-org scoring/cache leak test passes (`check:rls` = 25).

---

## M3 — Workflow Automation

### Functional
1. A workflow with trigger `LEAD_CREATED`, a matching condition, and a `create_task` action: when a lead is created, a `WorkflowRun` is recorded as `COMPLETED` and the task exists.
2. A non-matching condition yields a `WorkflowRun` `SKIPPED` with **no** side effects.
3. Each action executor works end-to-end: `update_lead_status`, `assign_lead`, `add_tag`, `create_task`, `send_notification` (→ M1 notification row), `send_instagram_message` (window-checked, reuses inbox send), `rescore_lead` (→ M2 enqueue).
4. `GET /workflows/meta` returns the catalog of triggers/conditions/actions that drives the builder.
5. Activating more than `activeWorkflows` (plan limit) returns `WORKFLOW_LIMIT_EXCEEDED`.
6. Invalid definitions are rejected on save with `WORKFLOW_INVALID_DEFINITION` (Zod-validated).

### Safety (P0 R-WF-1, R-WF-2)
7. **Loop guard:** a workflow whose action re-triggers itself stops at the depth cap; the over-depth run is `SKIPPED` with `WORKFLOW_DEPTH_EXCEEDED` logged.
8. **Idempotency:** duplicate delivery of the same trigger event produces exactly **one** `WorkflowRun` (DB unique + Redis key).
9. **Stale entity:** if the trigger entity is deleted/changed before the worker runs, actions that no longer match are skipped (no action on `deletedAt` rows).
10. Actions run with the workflow creator's permission scope; an action exceeding that scope is rejected and logged in `actionLog`.

### Frontend
11. A **form-based** workflow builder (Trigger select → Condition rows → Action rows) creates/edits/activates/pauses workflows and shows run history — using `Select`/`Tabs`/`Modal`/`Button` + `LeadFilters`-style rows. No node-canvas, no new library (G-9, D-8).

### Security
12. Cross-org: a workflow in org A never fires on or acts upon org B entities (`check:rls` = 27 + test).

---

## M4 — Smart Follow-ups

### Functional
1. The `follow-up-sweep` cron (hourly, single-flight) creates a `Task type=FOLLOW_UP` for: a lead with no activity past the staleness threshold, a deal past `expectedCloseDate`, and an unreplied conversation past its window — each with an owner notification.
2. **Idempotency (P0 R-FU-1):** re-running the sweep creates **no duplicate** follow-up when an open follow-up already exists for the entity.
3. Completing a follow-up allows a new one to form in the next window (not permanently suppressed).
4. Reactive follow-ups via the M3 `create_task` action work (covered in M3 but exercised here in a follow-up scenario).
5. `GET /tasks?type=FOLLOW_UP&due=overdue|today|week` returns the correct filtered set.
6. `GET /leads/:id/follow-up-suggestion` returns an AI-drafted suggestion when `ai.scoring.enabled`/AI is available and within quota; degrades gracefully (clear empty state) when disabled or over-quota.

### Frontend
7. A "Follow-ups"/Tasks surface lists due/overdue items with snooze + complete; suggestion button appears on lead/deal detail. Reuses `LeadTable`/`DealHealthBadge`/`EmptyState`. No hex.

### Operational
8. The new cron is registered without disturbing `instagram-token-refresh` (single-flight verified; both crons run independently).

---

## M5 — Analytics & Insights

### Functional
1. `GET /analytics/dashboard` returns org-scoped KPIs (active leads, open deals, pipeline value, won-this-month, win rate, avg response time) that are **numerically correct** against seeded data.
2. `/analytics/funnel`, `/lead-sources`, `/response-times`, `/ai-scores` return correct aggregates.
3. `POST /analytics/export` is gated by the `dataExport` plan flag (denied → forbidden/feature error on plans without it).
4. `analytics.read_own` scopes a SALES_EXECUTIVE to their own records; `analytics.read_all` (MANAGER+) sees org-wide.

### Performance & isolation (P1 R-ANALYTICS-1, P0 R-SEC-1)
5. Aggregates read from `DATABASE_REPLICA_URL` when set (dev falls back to primary, documented); the analytics client is tenant-scoped and RLS-enforced — cross-org isolation test passes (`check:rls` = 27).
6. EXPLAIN ANALYZE on each aggregate uses indexes; P95 < 400ms on seeded volume.
7. Redis cache returns identical results within TTL and is per-org keyed.

### Frontend
8. The dashboard page **replaces the placeholder** and renders the KPI strip (`StatCard`), funnel/source/response charts as **token-styled SVG** (no charting library — G-9, D-9), `ForecastPanel` reuse, and recent activity. Zero hex; matches existing page patterns.

---

## M6 — Productivity Features + Hardening

### Functional (per `SPRINT_7_UI_MODERNIZATION_PLAN.md`)
1. **Command palette (⌘K)** opens globally on the existing Radix Dialog, navigates and runs create-actions without a network call, and shows live `/search` results when the search endpoint is up. No new dependency.
2. **Saved views** work on Leads, Pipeline, and Inbox from one shared `ViewBar`.
3. **Bulk actions** work on the Leads table and Pipeline list from one shared `BulkActionBar`/`useMultiSelect`; backed by `POST /leads/bulk`, `/deals/bulk`, `/inbox/conversations/bulk`.
4. `GET /search` returns typed, org-scoped, capped hits across leads/deals/conversations.
5. `GET /org/members` powers `UserSelect`; `GET /dashboard/stats` (if not already in M5) powers KPI deep links.
6. Notification preferences UI lets users toggle in-app/email per type.
7. Keyboard shortcuts (`⌘K`, `g→i/l/p/d`, `c`, `?`) work and are discoverable via `ShortcutHelp`.

### Hardening
8. Coverage ≥ thresholds (G-12) across all Sprint 7 modules.
9. Load test of the new endpoints (analytics, bulk, scoring enqueue) meets P95 < 400ms (FINAL_ARCHITECTURE §9.2).
10. All kill switches verified: turning off `ai.scoring.enabled`, `workflows.execution.enabled`, and email each cleanly disables the feature with no user-facing errors (G-10).
11. OpenAPI regenerated from Zod schemas; new endpoints documented.

### Security / cross-org
12. Bulk endpoints reject ids outside the caller's org (partial-failure handling tested); `/search` never returns cross-org hits.

---

## Sprint-Level Definition of Done

The sprint is DONE when:
1. All six milestones meet their acceptance criteria above **and** the Global Gates (G-1…G-12).
2. Every **P0 risk** in `SPRINT_7_RISK_ASSESSMENT.md` has a passing mitigation test (the per-milestone Risk Burn-Down Gate).
3. `check:rls` = 27 and `check:enum-parity` OK at sprint end.
4. The four non-negotiable UI/UX constraints hold across all new surfaces: existing tokens/components, no new palette, no hex, no new component library, no dashboard-shell redesign, consistency with Pipeline/Deal/Inbox/Instagram pages.
5. Feature flags allow shipping AI, workflows, and email **dark** (off) and enabling per-org without redeploy.
6. A Sprint 7 retrospective signs off M1–M6; any accepted deviations are documented (mirroring the Sprint 6 signoff process).

---

*Every criterion here is intended to be a test or an observable command result, not a subjective judgment. Where a criterion lacks an obvious automated check, the milestone review must record how it was verified.*
