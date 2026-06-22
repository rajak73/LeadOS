# Sprint 7 — Risk Assessment

**Author:** Principal Engineer
**Date:** 2026-06-21
**Status:** REVIEW — companion to `SPRINT_7_ARCHITECTURE_REVIEW.md` and `SPRINT_7_EXECUTION_PLAN.md`
**Scope:** AI Lead Scoring · Workflow Automation · Smart Follow-ups · Notification Engine · Analytics · Productivity

---

## Classification

| Class | Meaning |
|-------|---------|
| **P0** | Could cause data corruption, cross-tenant leak, runaway cost, or block the sprint. Mitigation mandatory before the dependent milestone merges. |
| **P1** | Significant correctness/UX/operational risk. Mitigation required within the milestone. |
| **P2** | Quality/tech-debt risk. Track and address opportunistically. |

Each risk: cause → impact → mitigation → owning milestone.

---

## P0 — Blocking Risks

### R-AI-1 · Runaway AI cost / unbounded spend
**Cause:** scoring triggers on `LEAD_CREATED`/`LEAD_STATUS_CHANGED`/`MESSAGE_RECEIVED`; a CSV import of 5,000 leads or a webhook storm could fan out thousands of OpenAI calls.
**Impact:** surprise bill; provider rate-limit lockout; degraded service.
**Mitigation (D-2):** (1) durable `aiCallsPerMonth` counter in `ai_usage_counters` + Redis hourly sliding window (`aiCallsPerHour`) — both enforced **before** enqueue *and* re-checked in the worker; (2) platform-wide `AI_MONTHLY_HARD_CAP_USD` backstop independent of per-org limits; (3) Redis prompt cache so identical lead-feature hashes don't re-call; (4) model routing (4o-mini default, 4o only on low confidence); (5) bulk import enqueues a **single batched** rescore, not per-row; (6) circuit breaker opens on provider error spikes. Over-cap → job SKIPPED with activity, never a user error.
**Owner:** M2. **Gate:** integration test proves over-quota import creates zero AiScore rows beyond the cap.

### R-WF-1 · Workflow infinite loops / trigger storms
**Cause:** a workflow action (`update_lead_status`) emits a domain event that re-triggers the same or another workflow → unbounded recursion; or duplicate event delivery double-runs actions.
**Impact:** runaway writes, duplicated tasks/notifications/sends, DB and queue saturation.
**Mitigation (D-4):** (1) execution-depth counter in the job payload, hard cap (e.g. 5) → over-depth runs `SKIPPED` + logged; (2) Redis idempotency key per `(workflowId, triggerEntityId, dedupeKey)` + DB unique constraint on `WorkflowRun` → duplicate delivery is a no-op; (3) external-effect actions (IG send, email) are themselves idempotent/rate-limited; (4) per-org workflow concurrency bounded by `WORKFLOW_EXECUTION` queue (c=10).
**Owner:** M3. **Gate:** integration tests for recursive-trigger cap and duplicate-delivery single-run.

### R-SEC-1 · Cross-tenant leak via new tables / replica / AI context
**Cause:** five new tenant tables, a new read-replica client, and AI prompts that embed lead data — any missed RLS/scoping leaks across orgs.
**Impact:** confidentiality breach (a P0 launch gate).
**Mitigation:** (1) all new tables added to `TENANT_TABLES` + RLS enable+force+policy, verified by `check:rls` (24→25→27); (2) analytics replica client uses the **same** tenant extension + GUC + RLS as primary (RLS applies on replica); (3) AI worker loads lead context strictly through `withTenant(orgId)`; prompt cache keys are **org-scoped** (no cross-org cache hits); (4) workflow engine can only act on entities in the trigger's org; (5) cross-org denial tests per new table + analytics + AI cache.
**Owner:** M1/M2/M3/M5. **Gate:** `check:rls` count + cross-org integration tests per feature.

### R-WF-2 · Workflow acts on stale or unauthorized entity state
**Cause:** async gap between trigger event and worker execution; the entity may have changed (deleted, reassigned) or the action may exceed what the creator could do.
**Impact:** acting on deleted leads; privilege escalation via automation.
**Mitigation:** (1) worker re-loads the entity inside `withTenant` and re-validates it still matches conditions before each action (no acting on `deletedAt` rows); (2) actions execute with the **workflow creator's** permission scope, validated at activation and re-checked at run; (3) `WorkflowRun.actionLog` records each action's outcome for audit.
**Owner:** M3. **Gate:** test that a deleted-after-trigger entity yields a `SKIPPED` run.

---

## P1 — Significant Risks

### R-AI-2 · OpenAI provider outage / latency / nondeterminism
**Cause:** external dependency; variable latency, occasional errors, nondeterministic outputs.
**Impact:** scoring stalls; flaky tests; user confusion if scores swing.
**Mitigation:** circuit breaker (skip + retry-later when open); BullMQ 3-attempt backoff → DLQ; **all CI tests use `MockAiAdapter`** (one env-gated live smoke test only); store `modelVersion` + `confidence` on each `AiScore` so swings are explainable; scores are advisory, never gate any automation hard.
**Owner:** M2.

### R-EMAIL-1 · Email deliverability / domain not authenticated
**Cause:** SendGrid requires SPF/DKIM/DMARC on the sending domain (FINAL_ARCHITECTURE M3); unverified domains land in spam or bounce.
**Impact:** follow-up/notification emails silently fail.
**Mitigation:** in-app notifications are the **primary** channel and ship independent of email; email behind `notifications.email.enabled` flag (default off until domain auth verified); bounce handling + `EMAIL_FROM` verification are an ops pre-gate; Noop adapter in dev/CI.
**Owner:** M1 + infra.

### R-WF-3 · Workflow definition complexity / invalid definitions
**Cause:** user-authored trigger/condition/action JSON can be malformed, contradictory, or reference nonexistent fields.
**Impact:** runtime failures; confusing UX.
**Mitigation:** Zod schema in `packages/shared/src/types/workflow.ts` validates on save (reject with `WORKFLOW_INVALID_DEFINITION`); `GET /workflows/meta` drives the builder so only valid triggers/fields/actions are selectable; condition evaluator is total (unknown operator → false, logged); form-based builder (D-8) constrains input.
**Owner:** M3.

### R-ANALYTICS-1 · Aggregate query cost on growing tables
**Cause:** dashboard aggregates scan `leads`/`deals`/`activities`/`messages` which grow unbounded.
**Impact:** slow dashboards; primary-DB load.
**Mitigation:** queries run on `DATABASE_REPLICA_URL` (off the primary); Redis-cached per-org with short TTL; covering indexes verified by EXPLAIN; **no materialized views in Sprint 7** is an accepted scope cut — revisit in Sprint 8 if P95 regresses. Logged explicitly so "fast now" isn't mistaken for "scales forever."
**Owner:** M5. **Gate:** EXPLAIN ANALYZE on each aggregate; P95 < 400ms on seeded volume.

### R-NOTIF-1 · Notification volume / noise → users disable everything
**Cause:** scoring, workflows, follow-ups, and inbox all generate notifications; unbounded volume trains users to ignore the bell.
**Impact:** the engine becomes noise; real alerts missed.
**Mitigation:** per-type `notification_preferences` (in-app/email toggles) from day one; sensible defaults (assignment + new-message in-app on, score-delta off by default); dedupe/digest in `notification-delivery.worker`; follow-up sweep dedupes per entity.
**Owner:** M1/M4.

### R-FU-1 · Follow-up sweep duplication or storms
**Cause:** hourly cron over a large org could create many tasks; a missed idempotency check duplicates on each run.
**Impact:** task spam; user distrust.
**Mitigation:** sweep is idempotent — skip if an **open** follow-up task already exists for the entity; single-flight cron (stable `jobId`, proven by `instagram-token-refresh`); per-run cap with logged truncation (no silent drop); staleness thresholds configurable.
**Owner:** M4. **Gate:** re-running sweep twice creates no duplicates.

### R-RT-1 · Socket init move breaks inbox realtime
**Cause:** moving socket initialization from `InboxPage` to the dashboard layout (for app-wide notifications) could regress the working Sprint 6 inbox realtime.
**Impact:** inbox stops updating live — a shipped feature regresses.
**Mitigation:** layout owns one socket; inbox + notifications both subscribe via `useSocketEvent`; keep the Sprint 6 reconnect/disconnect→refresh handling (signoff §3.8); regression test that `instagram:message` still invalidates conversation queries.
**Owner:** M1.

### R-PARITY-1 · Enum / event / metadata drift
**Cause:** five new activity types across four files; a miss silently disables workflow triggers (the exact failure FINAL_ARCHITECTURE §10 warns about).
**Impact:** automations never fire; no error.
**Mitigation:** add all new types in `enums.ts` + `events.ts` + `schema.prisma` + `activity-metadata.ts` in one M1 change; `check:enum-parity` gates every milestone; scaffold all five Sprint 7 types in M1 even though some are used later.
**Owner:** M1.

---

## P2 — Quality / Tech-Debt Risks

### R-UI-1 · Charts tempt a new dependency (constraint violation)
**Cause:** analytics naturally wants a charting library; "no new component library" forbids it.
**Impact:** either a constraint breach or hand-rolled charts.
**Mitigation (D-9):** token-styled SVG/CSS charts (bar/line/funnel/donut) using existing tokens; if a charting dependency is genuinely wanted, it is a **separate explicit approval**, not smuggled in. Surfaced here so the trade-off is a conscious decision.
**Owner:** M5.

### R-UI-2 · Workflow builder scope creep toward a canvas
**Cause:** "automation builder" evokes drag-and-drop node canvases (n8n/Zapier), which need a library and large effort.
**Impact:** scope blowout + constraint breach.
**Mitigation (D-8):** form-based builder only (Trigger→Conditions→Actions rows). HubSpot/Linear are UX references for *rule semantics*, not canvas UI.
**Owner:** M3.

### R-COST-1 · Prompt cache staleness vs accuracy
**Cause:** caching scores by feature-hash can serve stale scores when context changed subtly.
**Impact:** mildly outdated scores.
**Mitigation:** short cache TTL; cache key includes status + last-activity bucket; manual `POST /rescore` always bypasses cache. Acceptable trade for cost.
**Owner:** M2.

### R-TEST-1 · Flaky tests from async fan-out timing
**Cause:** event→queue→worker chains are async; tests asserting side effects may race.
**Impact:** CI flakiness.
**Mitigation:** integration tests drive workers synchronously (invoke the processor directly with a payload, the Sprint 6 pattern) rather than waiting on real queue timing; deterministic clocks where staleness is computed.
**Owner:** all.

### R-PERF-1 · New high-write tables (`notifications`, `workflow_runs`) growth
**Cause:** every event can write a notification and/or a workflow run.
**Impact:** table bloat over time.
**Mitigation:** range-ready structure (FINAL_ARCHITECTURE §7.3 posture); retention/cleanup cron deferred to Sprint 8 but indexes + `createdAt` partitioning-readiness in place now; `removeOnComplete` already bounds queue history.
**Owner:** M1/M3 (structure), Sprint 8 (retention).

### R-REPLICA-1 · Replica lag shows stale analytics
**Cause:** read replica lags primary by seconds.
**Impact:** dashboard slightly behind reality right after a mutation.
**Mitigation:** acceptable for analytics (seconds-stale tolerated); dev falls back to primary when `DATABASE_REPLICA_URL` unset; never read transactional decisions off the replica.
**Owner:** M5.

---

## External / Schedule Risks

| Risk | Impact | Mitigation | Owner |
|------|--------|-----------|-------|
| OpenAI key/billing not ready | M2 live path blocked | Mock adapter unblocks all dev/CI; live path flips on when key lands | PM |
| SendGrid domain auth slow | Email channel delayed | In-app channel primary; email flag-gated off until verified | Infra |
| Replica not provisioned | M5 live path | Dev fallback to primary; provision before M5 staging | Infra |
| Plan-limit values unconfirmed (`aiCallsPerMonth`, `activeWorkflows`) | Wrong gating | Confirm with PM in pre-sprint gate; values are constants, one-line change | PM |

---

## Risk Burn-Down Gate (per milestone)

A milestone cannot be signed off while any of **its** P0 mitigations lack a passing test:

- **M1:** R-SEC-1 (notifications RLS), R-RT-1 (inbox realtime regression), R-PARITY-1.
- **M2:** R-AI-1 (quota cap), R-SEC-1 (AI cache org-scoping), R-AI-2 (breaker).
- **M3:** R-WF-1 (loop/idempotency), R-WF-2 (stale entity), R-SEC-1 (workflow org isolation).
- **M4:** R-FU-1 (sweep idempotency).
- **M5:** R-SEC-1 (replica RLS), R-ANALYTICS-1 (EXPLAIN + P95).
- **M6:** token-compliance gate; bulk-endpoint cross-org tests.

---

*Risks derive from the Sprint 7 architecture and the source-verified current state. P0 mitigations are mandatory and test-gated; P1 within-milestone; P2 tracked. This document is updated as risks are retired or discovered during implementation.*
