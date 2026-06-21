# Sprint 6 M2 Review — Instagram OAuth + Account Management

## Files Changed

### New — API
| File | Purpose |
|---|---|
| `apps/api/src/modules/instagram/instagram.adapter.ts` | `InstagramAdapter` interface + `MetaInstagramAdapter` (real Meta Graph API) + `SandboxInstagramAdapter` (deterministic, test-swapped singleton) |
| `apps/api/src/modules/instagram/instagram.repository.ts` | `PrismaInstagramAccountRepository` — TenantRepository subclass; CRUD for `InstagramAccount` |
| `apps/api/src/modules/instagram/instagram.service.ts` | OAuth initiation (Redis nonce + state JWT signed with `OAUTH_STATE_SECRET`), callback (all error paths throw `OAuthCallbackError` → controller redirects), list/disconnect, `refreshAllActiveTokens` (cron handler) |
| `apps/api/src/modules/instagram/instagram.controller.ts` | Thin HTTP layer; `handleCallback` catches `OAuthCallbackError` and calls `res.redirect(302, ...)` — never returns JSON |
| `apps/api/src/modules/instagram/instagram.routes.ts` | Two Express routers: public `GET /callback` + authenticated `GET /auth`, `GET /accounts`, `DELETE /accounts/:id` |
| `apps/api/src/modules/instagram/index.ts` | Module composition root |
| `apps/api/tests/integration/instagram-oauth.integration.test.ts` | 13 integration tests covering all OAuth paths, encryption verification, plan limits, replay protection |

### Modified — API
| File | Change |
|---|---|
| `apps/api/src/app.ts` | Mount public `/api/instagram` callback router + authenticated `/api/v1/instagram` router |
| `apps/api/src/core/queue/worker-registry.ts` | Route `instagram-token-refresh` cron + `instagram-webhook-subscribe` webhook job |
| `apps/api/src/core/queue/workers/webhook.worker.ts` | Add `processInstagramWebhookSubscribeJob` (retry path for failed webhook subscriptions) |
| `apps/api/src/core/scheduler/cron-registry.ts` | Register `instagram-token-refresh` (03:00 UTC daily) |

### New — Frontend
| File | Purpose |
|---|---|
| `apps/web/src/app/(dashboard)/settings/integrations/instagram/page.tsx` | Server component wrapper with `Suspense` boundary |
| `apps/web/src/app/(dashboard)/settings/integrations/instagram/InstagramIntegrationView.tsx` | Client component — reads `?connected`/`?error` params, renders account list, connect button |
| `apps/web/src/app/api/bff/instagram/auth/route.ts` | BFF `GET /api/v1/instagram/auth` |
| `apps/web/src/app/api/bff/instagram/accounts/route.ts` | BFF `GET /api/v1/instagram/accounts` |
| `apps/web/src/app/api/bff/instagram/accounts/[id]/route.ts` | BFF `DELETE /api/v1/instagram/accounts/:id` |
| `apps/web/src/components/settings/InstagramAccountCard.tsx` | Account card — status badge, two-click confirm disconnect |
| `apps/web/src/lib/hooks/useInstagramAccounts.ts` | React Query hooks: `useInstagramAccounts`, `useConnectInstagram`, `useDisconnectInstagramAccount` |

### Modified — Frontend
| File | Change |
|---|---|
| `apps/web/src/app/(dashboard)/layout.tsx` | Added Settings link to sidebar |
| `apps/web/src/lib/types/api.ts` | Added `InstagramAccount`, `InstagramAccountStatus` types |

## Validation Results

| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ PASS (0 errors) |
| `pnpm lint` | ✅ PASS |
| `pnpm build` | ✅ PASS |
| `pnpm test` (instagram-oauth.integration) | ✅ 13/13 PASS |
| `pnpm test` (full suite) | ✅ No new failures vs baseline |
| `check:rls` | ✅ 22 tenant tables — coverage matches registry |
| `check:enum-parity` | ✅ 21 shared enums checked |

## Acceptance Criteria Checklist

- [x] `GET /api/v1/instagram/auth` returns `{ redirectUrl }` with signed state JWT for OWNER; 403 for SALES_EXECUTIVE
- [x] `GET /api/instagram/callback` — all error paths (ACCESS_DENIED, INVALID_STATE, STATE_EXPIRED, ALREADY_CONNECTED, PLAN_LIMIT_EXCEEDED) redirect browser with `?error=<CODE>` — never return JSON
- [x] OAuth state nonce is single-use: deleted from Redis on first retrieval; replay returns STATE_EXPIRED
- [x] `userId`/`orgId` stored in Redis only, never in browser-visible JWT (JWT contains only `{ nonce }`)
- [x] Access token encrypted with AES-256-GCM (`v1:...`) before DB write; encryption verified by integration test
- [x] Duplicate `igUserId` check returns ALREADY_CONNECTED
- [x] Plan limit check returns PLAN_LIMIT_EXCEEDED (TRIAL=1, STARTER=1, GROWTH=3, SCALE=10)
- [x] Webhook subscription retried via `QUEUE.WEBHOOK_PROCESSING` / `instagram-webhook-subscribe` job (signoff A13)
- [x] `GET /api/v1/instagram/accounts` strips `accessToken` from response
- [x] `DELETE /api/v1/instagram/accounts/:id` soft-deletes + sets `status=DISCONNECTED`; verified in DB
- [x] Daily token refresh cron registered (`instagram-token-refresh`, `0 3 * * *`)
- [x] `org.connect_social` permission: OWNER and ADMIN only — SALES_EXECUTIVE returns 403
- [x] Frontend uses only existing LeadOS design tokens and components (Button, Badge); no new colors or component library
- [x] Settings page added to sidebar navigation
- [x] `useSearchParams()` wrapped in `Suspense` boundary — Next.js build succeeds
- [x] Commit pushed to GitHub: `555b6c9`
