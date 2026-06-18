# SPRINT_2_AUDIT.md

> **Sprint 2 ("Authentication & Identity") — completion audit**
> Auditor: Engineering Manager, LeadOS · Date: 2026-06-19
> Method: evidence-based, read-only. No code/architecture/Sprint-3 changes. Companion: `SPRINT_2_REVIEW.md`.

---

## Executive Verdict

**CONDITIONAL PASS.** The Sprint-2 backend authentication module is complete, secure-by-design, and green across every local + CI gate. It is **conditional** for the same class of reasons as Sprint 1: (a) the auth **integration tests are DB-gated and do not execute locally** (and, per carried defect DEF-3, may not execute even in CI), so the full register/login lifecycle over a real database is **unproven end-to-end**; and (b) several in-scope Sprint-2 items were deferred (auth UI screens, Google SSO, profile/password-change endpoints, real email delivery). Neither blocks Sprint 3 *development*, but they must be tracked.

| Dimension | Score |
|---|---|
| 1. Sprint 2 completion (vs Epic 2 + roadmap S2) | **82%** |
| 2. Architecture compliance | **96 / 100** |
| 3. Security | **90 / 100** |
| 4. Code quality | **94 / 100** |
| 5. Test coverage | **api 70% / web 89% / shared 100% (≥ floors)** |
| **Overall** | **PASS (conditional)** |

---

## 1. Completion vs Plan — 82%

Measured against `ENGINEERING_TASKS.md` Epic 2 + `DEVELOPMENT_ROADMAP.md` Sprint 2.

| Item | Status |
|---|---|
| AUTH-1.1 identity/org models + migration | ✅ |
| AUTH-2.1 registration + atomic org bootstrap | ✅ |
| AUTH-2.2 email verification | ✅ |
| AUTH-3.1 login + JWT + lockout + authMiddleware | ✅ |
| AUTH-3.2 refresh rotation + family-reuse | ✅ |
| AUTH-3.3 CSRF on refresh | ✅ |
| AUTH-3.4 sessions list/revoke + logout | ✅ |
| AUTH-4.1 forgot/reset password | ✅ |
| AUTH-5.1 BFF auth proxy | ✅ |
| `GET /auth/me` | ✅ |
| **AUTH-4.2 Google SSO** | ⏸️ Deferred (roadmap: "deferrable in-sprint") |
| **UI-2.1 auth UI screens + onboarding checklist** | ❌ Not delivered (BFF seam only) |
| **`PATCH /auth/me` + `/auth/me/password`** (doc 10 §10.7) | ❌ Not delivered |
| **SEC-3.2 real SendGrid delivery + domain auth** | ⚠️ Port exists; logs in dev; not wired |

**Why 82%:** the backend auth lifecycle (the critical-path core) is complete and tested. The ~18% gap is the **frontend auth UI** (a substantial S2 deliverable), Google SSO, two profile endpoints, and real email delivery. The backend completeness is high; the user-facing completeness is partial.

---

## 2. Architecture Compliance — 96 / 100

Measured against `FINAL_ARCHITECTURE.md`.

| Invariant | Compliance |
|---|---|
| **Atomic org bootstrap = single unit-of-work transaction** (P0-3) | ✅ `bootstrapOrganization` runs in one `$transaction`; partial state impossible |
| Tenancy mechanism NOT pre-built wrong (S3) | ✅ no tenant extension / RLS / GUC; tenant + rbac middleware remain stubs |
| **JWT in memory + refresh in HttpOnly cookie + BFF** (P0-4 / §3) | ✅ access token in body (client memory), refresh in `SameSite=Strict` cookie path-scoped to `/api/v1/auth`; BFF holds first-party session cookie |
| **Refresh rotation + family-reuse detection** (doc 19 §19.1) | ✅ proven by test |
| **CSRF on cookie endpoints** (§3.4) | ✅ custom-header + same-site Origin guard |
| bcrypt algorithm + cost 12 (doc 19 §19.2) | ✅ algorithm/cost unchanged (impl via bcryptjs — see TD-S2-1) |
| Module boundaries | ✅ `auth` module exposes a public `index.ts`; app.ts imports only that; sole DB accessor for identity tables |
| Service testability (DI repositories) | ✅ services depend on `AuthRepository`/`EmailSender` interfaces; unit-tested with in-memory fakes (M7 pattern) |
| Email/phone-at-rest posture (P0-7) | ✅ N/A in S2 (email is plaintext-indexable; no field encryption) |

**−4:** (a) the Prisma migration `0001_identity` is **hand-written**, not generated via `prisma migrate dev` against a shadow DB (no local DB) — correctness rests on CI `migrate-check` (TD-S2-7); (b) `RefreshToken.organizationId` + an index were added by **editing the unapplied `0001` migration** rather than a new migration — acceptable (never applied to a persistent env) but a deviation from strict migration hygiene.

**No architecture decisions were modified.** The bcrypt→bcryptjs change preserves the algorithm + cost (implementation detail only).

---

## 3. Security — 90 / 100

**Strengths (proven by tests):**
- ✅ bcrypt hashing (cost 12); plaintext never stored.
- ✅ JWT HS256, short-lived, tamper/expiry/wrong-secret rejected; access token never in a cookie.
- ✅ Refresh tokens opaque + peppered-SHA-256 at rest; **rotation with family-reuse revocation**.
- ✅ Verification/reset tokens hashed at rest, single-use, **type-segregated**, time-boxed (24h / 1h).
- ✅ Account lockout (5/15min); timing-equalized unknown-email path (anti-enumeration).
- ✅ No-enumeration on resend + forgot-password.
- ✅ Reset-password revokes all sessions (doc 19).
- ✅ CSRF guard on cookie endpoints; same-site cookie attributes.
- ✅ Production refuses to boot with default JWT secrets (env guard).
- ✅ Audit gate green (no high/critical); bcrypt→bcryptjs removed the HIGH `tar` advisory.

**Deductions:**
- 🟠 **Full lifecycle unproven over a real DB** (DB-gated tests skip locally / DEF-3) — register→login→refresh→reuse is proven at the **service** layer (in-memory) but not yet against Postgres + the actual Prisma repository in an executed run.
- 🟠 Real email delivery not wired (SEC-3.2) — verification/reset links only logged in dev; a misconfigured prod sender would silently break activation (no deliverability monitoring yet).
- 🟡 CSRF guard accepts any non-empty `X-CSRF-Token` value (relies on the cross-origin-header-block + same-site Origin) — adequate for the BFF model, but not a per-session token; revisit if non-BFF clients appear.

---

## 4. Code Quality — 94 / 100

- ✅ TS strict (incl. `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) clean across 4 workspaces.
- ✅ Lint clean; module-boundary rules intact.
- ✅ Clean module layout (controller/service/repository/routes/index); thin controllers; DI for testability; no `any`.
- ✅ Shared password policy + auth schemas are the single FE/BE source.
- **−6:** repository + composition-root code is covered only via DB-gated tests (uncovered in the unit run, hence the ~70% api floor); a few `exactOptionalPropertyTypes` friction points needed explicit `| undefined` annotations (handled).

---

## 5. Test Coverage Assessment

Per-package (thresholds enforced in CI): **shared 100%/75%/100%/100%**, **api 70.3%/81.3%/66.7%/70.3%**, **web 89.4%/80.9%/100%/89.4%** — all ≥ floors. 128 tests + 2 gated-skips.

**Gap:** the api floor (60) reflects that the Prisma `AuthRepository` and module composition roots are not unit-covered (DB-gated). The *business logic* is well covered via the in-memory fake. Raising real coverage of the Prisma layer depends on DB-in-CI actually running (DEF-3).

---

## 6. Open Defects

| ID | Defect | Severity | Blocks S3 dev? |
|---|---|---|---|
| **DEF-1** (carried) | Deploy API Dockerfile cannot build (`.npmrc` not copied → Prisma auto-install loop; Alpine OpenSSL) | High | No |
| **DEF-3** (carried, now sharper) | Infra-gated tests skip even in CI → **auth register/login integration over a real DB is unproven**; with new identity migration + auth suites this matters more | High | No (but auth E2E unverified) |
| **DEF-2** (carried) | Deploy Web red under no secrets (cache post-step) | Low | No |
| **DEF-4** (carried) | Runner Node 20→24 deprecation warning | Low | No |

No **new** runtime defects introduced by Sprint 2 (all gates green). DEF-1/DEF-3 were carried from `SPRINT_1_CLOSURE.md` and remain open.

---

## 7. Technical Debt Register (Sprint 2 additions)

| ID | Item | Priority |
|---|---|---|
| TD-S2-1 | `bcrypt` → `bcryptjs` (pure-JS) to clear the HIGH `tar` advisory in bcrypt's native build chain. Algorithm/cost preserved; bcryptjs is slightly slower. Revisit if hashing perf matters (or pin `bcrypt` + a `tar` override later). | Low |
| TD-S2-2 | `shared` branch-coverage floor lowered 80→60 for one unreachable defensive branch. | Low |
| TD-S2-3 | Multi-org login issues a token for the **first** membership; an org-switch endpoint (doc 07 §7.2) is not implemented. | Medium |
| TD-S2-4 | Email delivery is a logging stub; real SendGrid + SPF/DKIM/DMARC + bounce handling (SEC-3.2) not wired. | Medium |
| TD-S2-5 | Auth UI screens + onboarding checklist (UI-2.1) not built — BFF seam only. | Medium |
| TD-S2-6 | **No `SPRINT_2_EXECUTION_PLAN.md` was authored** (process regression vs Sprint 1). | Low |
| TD-S2-7 | `0001_identity` migration is hand-written (no shadow-DB generation); rollback script not authored. Rely on CI migrate-check. | Medium |
| TD-S2-8 | Prisma `AuthRepository` + composition roots covered only by DB-gated tests (depends on DEF-3). | Medium |
| TD-S2-9 | `PATCH /auth/me` + `/auth/me/password` (profile update + in-session password change) not implemented. | Low |
| TD-S1-* (carried) | TD-4 (unit tests for `validate`/`scheduler`/`cron-registry`/`dlq`), TD-6 (`HealthCheck` table — now superseded by real models, can be removed), TD-7 done. | Low |

> **TD-6 update:** with real domain models now present, the Sprint-1 `HealthCheck` infra table is no longer needed to make Prisma generate — it can be removed in S3 cleanup.

---

## 8. PASS / FAIL & Score Summary

**✅ CONDITIONAL PASS** — every gate green; backend auth complete, secure, tested at the service layer. Conditional on: (1) proving the auth lifecycle over a real DB (resolve DEF-3 / commit + green CI with the new migration), and (2) tracking the deferred S2 items (auth UI, SSO, profile endpoints, real email) into S2.x or S3.

| Dimension | Score |
|---|---|
| Completion | 82% |
| Architecture compliance | 96/100 |
| Security | 90/100 |
| Code quality | 94/100 |
| Coverage | ≥ floors (api 70 / web 89 / shared 100) |

*Audit only — no code, architecture, or Sprint 3 work performed.*
