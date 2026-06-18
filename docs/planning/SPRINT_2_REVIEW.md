# SPRINT_2_REVIEW.md

> **Sprint 2 ("Authentication & Identity") — implementation review**
> Reviewer: Engineering Manager, LeadOS · Date: 2026-06-19
> Method: read-only review of the working tree + fresh validation run (Node 20.20.2 / pnpm 9.15.9). No code changed.
> Baseline (de facto execution plan): `ENGINEERING_TASKS.md` Epic 2 (AUTH-1.1…AUTH-5.1), `DEVELOPMENT_ROADMAP.md` Sprint 2, `SPRINT_1_CLOSURE.md` §8 recommended start. **Note:** no `SPRINT_2_EXECUTION_PLAN.md` was authored (process gap vs Sprint 1 — see Audit TD-S2-6).

---

## 1. Scope Delivered (6 milestones, dependency-ordered)

Sprint 2 was built in 6 milestones (M1→M6), each validated (typecheck/lint/test/build) before the next.

| Milestone | Task IDs | Delivered |
|---|---|---|
| **M1 — Identity model + auth primitives** | AUTH-1.1 | Prisma models: `users`, `organizations`, `organization_members`, `roles`, `permissions`, `refresh_tokens`, `verification_tokens`, `subscriptions` + migration `0001_identity`. Primitives: bcrypt(js) password hashing (cost 12), HS256 JWT sign/verify, opaque token generation + peppered/SHA-256 hashing. Shared auth Zod schemas + password policy (doc 19 §19.2). |
| **M2 — Registration + verification** | AUTH-2.1, AUTH-2.2 | `POST /register` with **atomic org bootstrap** (single transaction: user → org → 4 seeded system roles + permission rows → OWNER member → trial subscription). Email verification (`POST /verify-email`, `POST /resend-verification`) with hashed, single-use, 24h tokens. No-enumeration resend. |
| **M3 — Login + middleware** | AUTH-3.1 | `POST /login` with credential check, **account lockout** (5 fails → 15 min), email-verified gate, status gate; JWT access issuance + refresh token creation. **Real `authMiddleware`** (verify-if-present, attach `req.auth`, 401 on invalid) replacing the Sprint 1 stub; `requireAuth` guard. Timing-equalized unknown-email path. |
| **M4 — Refresh + sessions** | AUTH-3.2, AUTH-3.3, AUTH-3.4 | `POST /refresh` with **rotation + token-family reuse detection** (replayed used token → revoke entire family + alert). **CSRF guard** (custom header + same-site Origin) on cookie endpoints. `GET /sessions`, `DELETE /sessions/:id`, `POST /logout`, revoke-all. Org-scoped refresh token; cookie-parser wired. |
| **M5 — Password reset + me** | AUTH-4.1 | `POST /forgot-password` (no-enumeration, 1h token) + `POST /reset-password` (single-use; **revokes all sessions** on change, doc 19). `GET /auth/me` (profile + organizations). |
| **M6 — BFF auth proxy** | AUTH-5.1 | Next.js BFF routes `POST /api/auth/{login,refresh,logout}` — hold the refresh token in a **first-party HttpOnly session cookie**, proxy to the API with CSRF header, never expose the refresh token to client JS (FINAL_ARCHITECTURE §3.3). Server-side cookie utils. |

### Endpoints delivered (`/api/v1/auth/*` + BFF `/api/auth/*`)
`register`, `login`, `refresh`, `logout`, `verify-email`, `resend-verification`, `forgot-password`, `reset-password`, `me`, `sessions` (GET), `sessions/:id` (DELETE) · BFF: `login`, `refresh`, `logout`.

### Explicitly deferred (in Sprint 2 scope, NOT delivered — see Audit)
- **AUTH-4.2 Google SSO** — roadmap marks it "deferrable in-sprint"; deferred.
- **UI-2.1 auth UI screens + onboarding checklist** — the BFF seam is built; the actual login/register/forgot React forms are not. (Frontend S2 deliverable.)
- **`PATCH /auth/me` + `PATCH /auth/me/password`** (profile update + in-session password change, doc 10 §10.7) — not implemented.
- **SEC-3.2 real SendGrid delivery** — an `EmailSender` port exists and logs the link in dev; production SendGrid + domain auth not wired.

### Correctly out of scope (Sprint 3+, not implemented — by design)
Tenant Prisma extension / RLS / per-request GUC (S3) · RBAC enforcement middleware + own-only filtering (S3, still stubs) · super-admin (S3) · Stripe integration (S8 — only a trial `subscription` row) · default pipeline creation (S5).

---

## 2. Test Evidence (fresh run, Node 20.20.2 / pnpm 9.15.9)

**Totals: 128 passing + 2 gated-skips** (up from 55 at Sprint 1 close).

| Package | Tests | Notable suites added in S2 |
|---|---|---|
| `@leados/shared` | **18 passed** | auth schema/password-policy tests (10) |
| `@leados/api` | **90 passed, 2 skipped** | password hashing, JWT, tokens, auth.service (register/verify/resend), login (lockout/verification/rememberMe), refresh (rotation/**reuse detection**/sessions/logout), password reset + me, authMiddleware, CSRF, auth route guards |
| `@leados/web` | **20 passed** | BFF cookie utils, BFF login route, BFF refresh route |

**Security-critical behaviors proven by tests:**
- Passwords stored as bcrypt hashes (never plaintext); verification round-trips; salted.
- JWT tampering / wrong-secret / expiry all rejected.
- Verification + reset tokens stored hashed; single-use; type-segregated (an email token can't reset a password).
- Login lockout after 5 fails; locked account rejects even a correct password; counter resets on success.
- **Refresh family-reuse attack** → entire family revoked, rotated token also dead.
- Reset password → all sessions revoked.
- No-enumeration on resend-verification and forgot-password (silent no-op for unknown emails).
- CSRF guard rejects missing header + cross-site Origin.
- BFF stores the refresh token first-party, returns only the access token to the client.

**Gated (run in CI with Postgres/Redis, skipped locally — DEF-3 caveat):** the full `register` happy-path over a real DB and the Sprint-1 `queue-roundtrip`. Service logic is fully unit-tested via injected in-memory repositories, so the gated DB tests are wiring confirmation, not the primary coverage.

---

## 3. Coverage Evidence (thresholds enforced in CI)

| Package | Statements | Branches | Functions | Lines | Threshold | Result |
|---|---|---|---|---|---|---|
| `@leados/shared` | 100% | 75% | 100% | 100% | 80/60/70/80 | ✅ |
| `@leados/api` | 70.31% | 81.25% | 66.66% | 70.31% | 60/60/60/60 | ✅ |
| `@leados/web` | 89.44% | 80.85% | 100% | 89.44% | 60/60/60/60 | ✅ |

- The api `functions` (66.7%) and `statements` (70.3%) are comfortably above the 60 floor; the uncovered surface is concentrated in the **Prisma repository implementation + module composition roots**, which are exercised only by the DB-gated integration tests (the service logic is covered by the in-memory fake).
- `shared` branches floor was lowered 80→60 (Audit TD-S2-2) for one unreachable defensive branch in `registerSchema`.

---

## 4. Validation Results (all green)

| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ 4/4 workspaces (TS strict, `exactOptionalPropertyTypes`) |
| `pnpm lint` | ✅ 4/4 (module-boundary rules intact) |
| `pnpm test` | ✅ 128 passed, 2 gated-skip |
| `pnpm build` | ✅ 3/3 (shared + api server/worker + web incl. 3 BFF routes) |
| `pnpm test:coverage` | ✅ all thresholds met |
| `pnpm audit --audit-level=high` | ✅ PASS (1 residual moderate — OTel core, below gate) |
| `pnpm check:enum-parity` | ✅ OK (5 shared enums now matched to Prisma) |

---

## 5. Change Set Summary

**31 changed/new files** (uncommitted in the working tree). New: the `auth` module (11 files), `core/auth` (jwt/tokens/cookies + tests), `core/crypto/password`, `core/middleware/csrf`, `core/http/async-handler`, the in-memory auth repo test helper, web `lib/server/*` + 3 BFF route handlers, `prisma/migrations/0001_identity`, shared `schemas/auth`. Modified: prisma schema, env config, app.ts wiring, auth middleware (stub→real), express type augmentation, shared permissions (+catalog/role-map), tsconfig (api include tests), vitest configs, package manifests.

> **Housekeeping:** these Sprint 2 changes — plus the Sprint-1-era closure/deploy-analysis docs — are **uncommitted**. They must be committed/pushed for CI to run the new migration + auth suites (the auth integration tests only execute in CI with services).

*Review only — no code, architecture, or Sprint 3 work performed.*
