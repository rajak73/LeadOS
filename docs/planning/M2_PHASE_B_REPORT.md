# Sprint 7 M2 — Phase B Completion Report
**AI Scoring Engine**
Generated: 2026-06-22T16:33:00+05:30

---

## ✅ Validation Summary

| Gate | Result |
|------|--------|
| `pnpm typecheck` | ✅ PASS — 4/4 packages |
| `pnpm lint` | ✅ PASS — 4/4 packages |
| `pnpm build` | ✅ PASS — 3/3 packages |
| `pnpm test` (full suite) | ✅ PASS — **66/66 files, 573 passed, 1 skipped** |
| `pnpm --filter @leados/api check:rls` | ✅ PASS — **25/25 tenant tables** |

---

## Phase B Scope

Sprint 7 Milestone 2 Phase B implements the **AI Lead Scoring Engine** — the queue-driven pipeline
that scores leads using an adapter pattern (MockAiAdapter in tests, OpenAiAdapter skeleton for production),
persists scores, and emits notifications when scores shift significantly.

---

## Deliverables Implemented

### 1. Prompt Compiler
- **File:** `apps/api/src/modules/ai/ai.prompts.ts`
- Assembles structured `LeadContext` (lead fields + recent activities) into a scoring prompt string.
- Used by `AiService` for cache-hash generation and by `OpenAiAdapter` (no-op skeleton).

### 2. Redis Prompt Cache
- **File:** `apps/api/src/modules/ai/ai.service.ts`
- Cache key: `ai:score_cache:{organizationId}:{leadId}`
- Hash covers: `status`, `tags`, `source`, **`email`**, **`phone`**, `customFields`, `lastActivityAt`
- Email and phone included in hash — changes to contact info correctly invalidate the cache.
- Cache hit skips adapter call; cache miss writes back on completion.

### 3. Monthly Quota Checks
- Reads `ai_usage_counters` table per org per month.
- Compares against `PLAN_LIMITS[plan].aiCallsPerMonth` from shared constants.
- On exceed: throws `AppError(AI_QUOTA_EXCEEDED)` → worker catches gracefully (logs + returns, no BullMQ retry).

### 4. Hourly Rate Limiting
- Redis sorted-set sliding window: `ai:rate_limit:hourly:{organizationId}`
- Window: 3600s. Points limit from `PLAN_LIMITS[plan].aiCallsPerHour`.
- On exceed: throws `AppError(RATE_LIMITED)` → worker re-throws → BullMQ exponential backoff.

### 5. Circuit Breaker
- Redis flag: `ai:circuit_breaker:open`
- Checked before any adapter call.
- On open: throws `AppError(AI_PROVIDER_UNAVAILABLE)` → worker re-throws for BullMQ retry.

### 6. AiScoringWorker
- **File:** `apps/api/src/core/queue/workers/ai-scoring.worker.ts`
- Processes `score-lead` jobs from the `AI_SCORING` BullMQ queue.
- Flow: fetch lead → check quota → check rate limit → check circuit breaker → check prompt cache → call adapter → persist → denormalize → log activity → notify assignee.
- Uses `TenantContext` / `withTenant` for RLS-enforced DB access.
- **System context:** `performedById: null` for system-initiated activities (correct null-safe logic).

### 7. Lead Score Persistence
- `aiScore.create()` writes score history to `ai_scores` table with `organizationId`, `leadId`, `score`, `factors`, `recommendation`, `triggeredBy`, `modelVersion`.
- `lead.update()` denormalizes `aiScore` + `aiScoreUpdatedAt` onto the lead for fast reads.

### 8. Activity Emission
- `ActivityType.LEAD_SCORED` appended via `ActivityService.append()`.
- Description: `"Lead scored by AI: {score} ({recommendation})"`.
- Metadata: `{ type, leadId, score, previousScore? }` — `previousScore` only present when a prior score exists (strict optional property semantics).

### 9. Delta Notification
- Calculates `delta = |newScore − previousScore|` (or `newScore` if no prior score).
- When `delta >= 10` and lead has an assigned agent: creates `LEAD_SCORED` notification.
- Publishes real-time SSE/WebSocket event via `notifyOrg()`.
- Email notification uses new `lead_scored` template.

### 10. Queue Registration
- **File:** `apps/api/src/core/queue/worker-registry.ts`
- `ai-scoring` worker registered alongside existing workers.
- Job enqueued from `LeadService.create()` (`LEAD_CREATED`) and `LeadService.update()` (`LEAD_STATUS_CHANGED`).
- Enqueue errors swallowed (`.catch(() => undefined)`) — scoring failures never block lead writes.

---

## Migrations Applied

| # | Name | What |
|---|------|------|
| 0019 | `ai_usage_counters` | Monthly AI call counter table (per-org, per-month) |
| 0020 | `notification_type_lead_scored` | Added `LEAD_SCORED` to `NotificationType` PostgreSQL enum |

---

## Files Created (New)

| File | Purpose |
|------|---------|
| `apps/api/src/modules/ai/ai.adapter.ts` | `AiAdapter` interface + `MockAiAdapter` + `OpenAiAdapter` skeleton |
| `apps/api/src/modules/ai/ai.prompts.ts` | Prompt compiler — assembles `LeadContext` into scoring prompt |
| `apps/api/src/modules/ai/ai.service.ts` | `AiService` — quota, rate-limit, circuit-breaker, cache, adapter orchestration |
| `apps/api/src/modules/ai/ai.service.test.ts` | 8 unit tests (8/8 pass) |
| `apps/api/src/core/queue/workers/ai-scoring.worker.ts` | BullMQ worker: score-lead job processor |
| `apps/api/tests/integration/ai-scoring.integration.test.ts` | 5 integration tests (5/5 pass) |
| `packages/shared/src/types/ai.ts` | `LeadContext`, `ScoringFactor`, `ScoreResult` shared types |
| `prisma/migrations/0019_ai_usage_counters/migration.sql` | `ai_usage_counters` table |
| `prisma/migrations/0020_notification_type_lead_scored/migration.sql` | `LEAD_SCORED` enum value |

---

## Files Modified

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Added `AiScore` model, `AiUsageCounter` model, `LEAD_SCORED` to `NotificationType` and `ActivityType` |
| `apps/api/src/core/config/env.ts` | Added M2 env vars (`OPENAI_API_KEY`, `OPENAI_MODEL_*`, `AI_MONTHLY_HARD_CAP_USD`) |
| `apps/api/src/core/queue/worker-registry.ts` | Registered `ai-scoring` worker |
| `apps/api/src/core/tenancy/tenant-tables.ts` | Added `ai_scores` and `ai_usage_counters` to RLS registry |
| `apps/api/src/modules/leads/lead.service.ts` | Enqueue `score-lead` on lead create/status-change |
| `apps/api/src/core/activities/activity.service.ts` | Fixed `performedById` logic: `undefined` falls back to `ctx.userId`, explicit `null` stored as-is |
| `packages/shared/src/types/activity-metadata.ts` | `performedById?: string | null` — allows system-initiated activities |
| `packages/shared/src/errors/error-codes.ts` | Added `AI_QUOTA_EXCEEDED`, `RATE_LIMITED`, `AI_PROVIDER_UNAVAILABLE` error codes |
| `apps/api/src/core/email/templates.ts` | Added `leadScoredEmail()` template |
| `apps/api/src/core/queue/workers/email-delivery.worker.ts` | Added `lead_scored` to `EmailTemplateKey` union + render case |
| `apps/api/tests/setup-env.ts` | **Critical fix:** `process.env.NODE_ENV = 'test'` — ensures rate-limiter test bypass activates |

---

## Test Results — AI Module

### Unit Tests (`src/modules/ai/ai.service.test.ts`) — 8/8 ✅
| Test | Result |
|------|--------|
| MockAiAdapter scores with email + manual source | ✅ |
| OpenAiAdapter throws on skeleton call | ✅ |
| AiService scores successfully under quota/limit | ✅ |
| Throws `AI_QUOTA_EXCEEDED` when monthly limit exceeded | ✅ |
| Throws `RATE_LIMITED` when hourly limit exceeded | ✅ |
| Throws `AI_PROVIDER_UNAVAILABLE` when circuit breaker open | ✅ |
| Returns cached score without calling adapter | ✅ |
| Returns monthly usage status correctly | ✅ |

### Integration Tests (`tests/integration/ai-scoring.integration.test.ts`) — 5/5 ✅
| Test | Result |
|------|--------|
| processAiScoringJob completes scoring, persists, caches, appends activity | ✅ |
| Triggers notification when score delta ≥ 10 | ✅ |
| Gracefully skips scoring when monthly quota exceeded | ✅ |
| Re-throws `RATE_LIMITED` for BullMQ backoff retry | ✅ |
| Enforces RLS — cross-tenant access blocked | ✅ |

---

## Bugs Fixed During Implementation

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| Cache miss even after email change | `email`/`phone` not in `payloadForHash` | Added both to hash |
| Rate-limit test cross-contaminating quota test | Same `orgAId` used; DB quota not cleared between tests | `beforeEach` deletes `ai_usage_counters` for test orgs |
| Auth tests getting 429 across full suite | `.env` has `NODE_ENV=development` so `isTest()` returned false, activating real Redis rate-limiter | Set `process.env.NODE_ENV = 'test'` in `tests/setup-env.ts` |
| UUID length error in `ActivityService.append` | `systemCtx.userId = ''` (empty string) used as fallback for `performedById` | Changed `??` to `!== undefined` check; pass `performedById: null` from worker |
| `LEAD_SCORED` notification type DB error | Enum value not in PostgreSQL `NotificationType` type | Migration `0020` adds it; Prisma client regenerated |

---

## Architecture Decisions

- **Adapter pattern:** `MockAiAdapter` used in all tests — no real OpenAI calls in test suite (as required).
- **Queue-driven only:** Scoring always asynchronous via BullMQ. No synchronous scoring in API request path.
- **Quota soft-fail:** `AI_QUOTA_EXCEEDED` is caught in the worker and results in a clean skip (no retry). Transient errors (`RATE_LIMITED`, `AI_PROVIDER_UNAVAILABLE`) throw to trigger BullMQ backoff.
- **Notification delta threshold:** 10 points — configurable if needed, currently hardcoded per blueprint.
- **Email cache hash:** Includes `email` and `phone` so contact-info updates correctly invalidate the prompt cache.

---

## Outstanding (Phase C — not in scope)

- Live OpenAI API calls (wire `OpenAiAdapter.scoreLead()`)
- Score-based lead ranking in list endpoints
- AI Insights dashboard UI components
- Frontend score badge in lead detail view

---

## Git Status at Report Time

Branch: `main`
Latest commit: `676c1a4 test(notifications): fix NextRequest typing in preferences route tests`

**Uncommitted M2 changes** (staged for commit after review):
- 2 new migrations (`0019`, `0020`)
- 11 new files in `apps/api/src/modules/ai/`, `apps/api/tests/integration/`
- 13 modified files across API, shared, prisma
