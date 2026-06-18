# DEVELOPMENT_ROADMAP.md

> Sprint-by-sprint execution plan. Two-week sprints. Aligned to roadmap doc 21 (V1 Months 1–4, V2 Months 5–9, V3 Months 10–18) and team plan (V1 = 3 full-stack engineers + 1 PM-founder + 1 designer).
> Each sprint lists **Backend**, **Frontend**, and **Infrastructure** milestones, plus an exit/demo criterion.
> Capacity assumption (doc 21 "Technical Debt Policy"): **20% of every sprint** reserved for tests, perf, docs, security, refactoring. Sprints below already assume this overhead.

---

## V1 — Foundation (Months 1–4, Sprints 1–8)

### Sprint 1 (Weeks 1–2) — Platform Spine
- **Backend:** Monorepo (`backend`/`frontend`/`packages/shared`); TS strict; ESLint(+security+module-boundary)/Prettier/Husky. Express app w/ middleware stack (cors→helmet→compression→rateLimit→requestLogger→errorHandler), `AppError` + global handler, response envelope. Prisma init + Neon dev branch. Redis client. BullMQ topology proof (API process + worker process). `/health` + `/health/deep`.
- **Frontend:** Next.js 15 App Router; `(auth)`/`(dashboard)` route groups; Tailwind + **design tokens from doc 17** (color/type/spacing); Shadcn baseline; Axios instance w/ interceptors; TanStack Query + Zustand providers; Socket.io client stub.
- **Infra:** GitHub Actions (lint→typecheck→test→build); Vercel preview deploys; Railway service; Sentry (FE+BE); Winston JSON + OpenTelemetry request middleware; `npm audit` gate; secrets via env (prod path to AWS Secrets Manager documented).
- **Exit/Demo:** request flows browser→API→Postgres with envelope+logging; a job enqueues and a separate worker processes it; CI green; preview URL live.

### Sprint 2 (Weeks 3–4) — Identity & Auth
- **Backend:** `users`/`organizations`/`organization_members`/`roles`/`permissions`/`refresh_tokens` models + migrations. Register (+org creation flow doc 07 §7.6: user→org→member(OWNER)→trial sub→default pipeline+stages→seeded roles→verify email→JWT). Login (rate-limit 5/15min + lockout). JWT access (15m) + opaque refresh (HttpOnly, SHA-256 hash, rotation, **family-reuse detection**). Password reset. Email verification. `/auth/me`, sessions list/revoke.
- **Frontend:** Auth screens (register/login/forgot/reset/verify), onboarding checklist shell, protected-route layout, token-refresh interceptor wiring, org-selection screen (multi-org).
- **Infra:** SendGrid (transactional) wired; refresh-token cookie domain/SameSite strategy validated across Vercel↔Railway domains (see R-SEC-1); Sentry user/org context.
- **Exit/Demo:** full signup→verify→login→refresh→logout lifecycle; lockout + reset proven; **M0/M1 (auth half) demoed.**

### Sprint 3 (Weeks 5–6) — Tenancy, RBAC, Audit (correctness sprint)
- **Backend:** `tenantMiddleware` + Prisma tenant extension + **RLS policies on all tenant tables**. RBAC middleware + full permission matrix (doc 11) + role seeding + own-only service filtering. Audit-log Prisma extension (before/after JSONB, PII masked). Super-admin path (separate claim, 2FA, time-limited, `platform_audit_logs`). **Cross-tenant isolation test suite (app + RLS layers).** **Performance benchmark of `SET LOCAL`/transaction pattern (R-ARCH-1) — accept or redesign before proceeding.**
- **Frontend:** role-aware nav/guards; "Access Denied" page; org switcher.
- **Infra:** RLS SQL test job in CI; PgBouncer/Neon pooling mode validated against the tenancy pattern; load smoke on tenant-scoped read.
- **Exit/Demo:** seeded multi-org dataset — org A provably cannot touch org B at app **and** DB layer; RBAC matrix enforced + unit-tested; **M1 complete (tenancy proven).** This is a gate: do not build domain modules on an unproven tenancy layer.

### Sprint 4 (Weeks 7–8) — CRM Core
- **Backend:** `leads`/`contacts`/`tasks`/`activities`/`notes`/`files` + custom-fields(JSONB). Lead lifecycle/status machine, source tracking, assignment(+round-robin hook), tags, dedup, list (filter/sort/FTS+pg_trgm), CSV import(async)+export. Contact CRUD + lead→contact conversion. Immutable activity feed wired to mutations. Tasks (my-tasks/manager views, completion→activity). Notes (rich text). Files (presigned direct-to-storage). Plan-limit enforcement on creates.
- **Frontend:** Leads List (Screen 2) w/ filters/saved presets/inline edit; Lead Detail (Screen 3) two-panel; Tasks views; Contacts list/detail; file upload UI.
- **Infra:** Cloudinary + S3 buckets + presigned-URL endpoints; FTS/trgm indexes; EXPLAIN ANALYZE on lead-list query (the most common query in the system).
- **Exit/Demo:** **M2** — full lead/contact/task/note/file lifecycle in UI, RBAC-scoped, with activity trails + audit logs, within plan limits.

### Sprint 5 (Weeks 9–10) — Pipeline & Deals + Async Backbone start
- **Backend:** `pipelines`/`pipeline_stages`/`deals`. Pipeline+stage CRUD (order/color/probability/won-lost). Deal CRUD/stage-move/won-lost+reason/weighted forecast. **Kanban API shaped per doc 10 §10.8.** Single-pipeline gate on Starter. **Start webhook subsystem:** `webhook_events` table, HMAC verify + raw-body buffering, persist-then-200, idempotency key, worker skeleton, DLQ.
- **Frontend:** Pipeline Kanban (Screen 4) @dnd-kit + Framer Motion + optimistic moves; Deal Detail (Screen 5); deal health indicators.
- **Infra:** BullMQ queues per doc 06 §6.5 provisioned with concurrencies; queue-depth metrics → Grafana; DLQ alerting.
- **Exit/Demo:** **M3** — drag-drop pipeline + deal lifecycle + forecast, plan-gated; webhook skeleton accepts+verifies+persists a test event idempotently.

### Sprint 6 (Weeks 11–12) — Instagram Inbox
- **Backend:** IG OAuth connect (doc 14 §14.2) + **AES-256-GCM token encryption** + webhook subscribe + **daily token-refresh cron**. Receive pipeline (account→org resolve, conversation upsert, message persist, lead find/create + IG profile enrichment, emit `instagram.message.received`). Send pipeline via `instagram-send` queue + Meta rate-limit guard. Status webhooks (delivered/read). `instagram_accounts`/`instagram_conversations`/`messages`, saved replies, labels, SLA `firstResponseAt`.
- **Frontend:** Social Inbox (Screen 6) three-panel; conversation list (cursor); thread view; compose/assign; create-lead-from-conversation; saved replies (`/`).
- **Infra:** **Realtime tier** (Socket.io + Redis adapter, org rooms); Meta sandbox/test app; **SUBMIT META APP REVIEW** (screen recording, privacy policy, ToS, business verification, test creds). Reconcile webhook path mismatch (doc 10 vs SETUP.md) before submission.
- **Exit/Demo:** **M4** — real sandbox DM → conversation+message+lead in UI in realtime; reply sends; idempotency+signature proven; **App Review in flight.**

### Sprint 7 (Weeks 13–14) — AI Scoring + Workflow Engine (V1 subset) + Notifications
- **Backend:** AI infra (OpenAI client timeout/retry, model routing, Redis prompt cache, per-plan limits, **circuit breaker**, graceful no-score). Lead-scoring worker (create/status/message/task/weekly triggers → `aiScore` + emit `LEAD_SCORE_CHANGED` on ±10). Workflow engine (`workflows`/`workflow_executions`, Trigger/Condition/Action evaluators, interpolation, `workflow-execution` queue, WAIT via delayed-job+resume) — **V1 catalog:** triggers {LeadCreated, DealWon, InstagramMessageReceived}, actions {CreateTask, CreateNotification, SendEmail}, ≤5/org. Notifications (`notifications`, in-app WS + email digest, per-user/type/channel prefs, badge).
- **Frontend:** AI score badges + recommendation card (lead/deal); Notifications center (Screen 12); minimal workflow UI (list + simple config + execution log).
- **Infra:** OpenAI cost dashboard (token usage/cost-per-hour, doc 18 §18.6 Dashboard 5); AI error-rate alert; workflow queue-depth alert.
- **Exit/Demo:** **M5** — new leads scored async; 3 workflows fire with retries+logs; notifications deliver in-app+email; verified nothing AI/workflow blocks a request.

### Sprint 8 (Weeks 15–17) — Billing, Analytics, Hardening, Launch
- **Backend:** Billing (`subscriptions`/`invoices`/`payments`, Stripe customer on org-create, Checkout w/ UPI/netbanking/card+INR+GST/Stripe-Tax, Customer Portal, **idempotent webhook handler as source-of-truth mirror**, subscription state machine, trial lifecycle + **read-only mode**, dunning, upgrade/downgrade w/ usage guardrails). Analytics V1 (dashboard KPIs, lead-source breakdown, basic pipeline) **on read replica**.
- **Frontend:** Billing Settings (Screen 10) + trial banner + usage meters; Dashboard (Screen 1); Analytics Overview/Leads tabs; Org Settings (Screen 11); Team Settings (Screen 9).
- **Infra:** **doc 20 full pass** — load test (k6, 1k concurrent), EXPLAIN ANALYZE hot queries, N+1 sweep, Lighthouse ≥90, backup+PITR restore drill, RLS/isolation re-verify, security checklist (headers, secrets→AWS Secrets Manager, audit, dep-audit), DR runbooks, `status.leados.com`, on-call/PagerDuty, DNS TTL reduction. Read replica routing live.
- **Exit/Demo:** **M6** — every doc 20 §20.1–20.6 box signed off; production smoke paths green; **V1 PUBLIC LAUNCH** (Product Hunt/social per doc 21 Month 4). Beta with 50 design partners precedes public by ~1 week.

> **Beta gate (mid-Sprint 8):** 50 design partners onboarded on staging-prod; collect activation funnel + NPS; only public-launch if Month-1 error rate < 2% in beta and smoke paths green.

---

## V2 — Scale (Months 5–9, Sprints 9–18)

### Sprint 9–10 — WhatsApp Integration
- **Backend:** WhatsApp Cloud API (embedded signup, `whatsapp_accounts`, `whatsapp_conversations` w/ **24h `windowExpiresAt` state machine**), receive/send (free-form in-window + template), template management + Meta approval workflow, status tracking, `whatsapp-send` queue + rate-limit.
- **Frontend:** WhatsApp inbox parity in unified inbox; **window-expiry countdown**; template picker; template management UI (Settings).
- **Infra:** WABA onboarding flow; Meta business verification; WhatsApp API dashboards; cost/conversation tracking.
- **Exit:** customer-initiated WA message → lead+conversation; in-window reply + out-of-window template send; window UX correct.

### Sprint 11–12 — Advanced Workflow Engine
- **Backend:** all 10 triggers + 10 actions (incl. WA send, IG DM, lead update, assign, tag, webhook); AND/OR condition chains; full operator set; WAIT/resume hardened; execution audit.
- **Frontend:** **visual drag-drop builder (React Flow)** with node types (trigger/condition/action/wait), node config panel, validation-before-save, **template library (10 templates, doc 12 §12.8)**.
- **Infra:** workflow execution metrics + per-workflow success rate; retention cron (executions >90d).
- **Exit:** non-technical user builds + tests + activates a multi-step branching workflow from a template.

### Sprint 13–14 — AI Expansion + Multiple Pipelines
- **Backend:** sentiment analysis (per-conversation), follow-up recommendations (on-demand + nightly batch), conversation summary (on close), opportunity detection (stale deal / score-jump). Multi-pipeline (Growth=5) + cross-pipeline deal view + per-pipeline analytics.
- **Frontend:** sentiment in inbox; next-best-action on lead/deal detail; AI summary card; opportunities in dashboard AI Insights panel; pipeline tabs/selector.
- **Infra:** AI cost scaling review; per-feature model-routing tuning.
- **Exit:** inbox shows sentiment; lead detail shows AI next-action; org runs ≥2 pipelines with independent analytics.

### Sprint 15–16 — Advanced Analytics + Email/Zapier/Webhooks
- **Backend:** stage velocity, conversion funnel, team performance, revenue forecast (weighted + AI-enhanced), inbox SLA; custom date ranges; 2-way Gmail/Outlook sync (IMAP/OAuth); Zapier connector; outbound webhook events; scheduled CSV digest.
- **Frontend:** full Analytics (Screen 7) all 6 tabs w/ comparison + export(PDF/CSV); email sync settings; outbound webhook config.
- **Infra:** read-replica query tuning for heavy analytics; analytics caching layer; export queue.
- **Exit:** managers get velocity/funnel/forecast/SLA; email syncs both ways; Zapier zap fires.

### Sprint 17–18 — Mobile Web + V2 Stabilization & Launch
- **Frontend:** fully responsive inbox + lead/deal views; **PWA + push notifications**.
- **Infra/Backend:** performance + reliability hardening at 5K-org scale; partitioning readiness review (leads/messages thresholds doc 08 §8.4); support tooling; **Growth-plan launch ($100K→$500K MRR push, doc 21 Month 8)**.
- **Exit:** **M8** — agents work the inbox on mobile; V2 metrics (doc 21) instrumented; WhatsApp adoption tracked.

---

## V3 — Enterprise (Months 10–18, Sprints 19–36, team scales to ~10 eng)

> Organized by workstream rather than strict sprint pairs, since the team is larger and streams run in parallel.

| Workstream | Sprints (approx) | Backend milestones | Frontend milestones | Infra milestones |
|---|---|---|---|---|
| **Native Mobile Apps (iOS+Android)** | 19–24 | mobile BFF endpoints; offline draft sync | RN/native inbox, push, offline drafts | app store pipelines, mobile crash reporting |
| **Public REST API platform** | 21–26 | API keys + scoped perms, rate-limit/usage, outbound webhook subscriptions | developer console, usage dashboard | Swagger UI, API gateway, partner sandbox |
| **Email Marketing module** | 23–28 | drip sequences, open/click tracking, unsubscribe, custom-domain send | WYSIWYG template editor, sequence builder | dedicated sending domain/IP warmup |
| **Advanced Team (custom roles/teams/shifts)** | 25–29 | custom-role engine, sub-teams, manager-on-behalf, shift routing | role editor, team management, shift config | — |
| **Marketplace & Integrations** | 26–32 | HubSpot/Zoho/Google import, Shopify/Calendly/Meta-Ads connectors, OAuth2 for 3rd-party apps | marketplace UI, migration wizards | webhook delivery w/ retries+logs, OAuth server |
| **Enterprise Security** | 24–34 | SAML 2.0 SSO, IP allowlist, custom retention, **SOC 2 Type II**, HIPAA BAA, DPA | SSO config, security settings | audit tooling, **begin service extraction: Workflow→AI→Webhook (doc 05 Phase 2)** |
| **Global Expansion** | 28–36 | multi-currency (USD/EUR/AED/BRL), EU data residency, Telegram, 20+ country WhatsApp | i18n (Hindi/Arabic/Spanish/Portuguese) + RTL | `eu-west-1` region, multi-region data strategy |

- **M9 milestones:** V3 launch + enterprise sales motion (Month 15); **SOC 2 Type II achieved (Month 18)**; first monolith→services extraction completed (Workflow Engine) validating the modular-monolith bet.

---

## Cross-Phase Standing Tracks (every sprint, all phases)

| Track | Cadence | Owner intent |
|---|---|---|
| **Test coverage** | every PR; ≥70% per module before ship (doc 21 policy), 80% services target (NFR 4.7) | no feature merges below module threshold |
| **Security** | Dependabot + `npm audit` in CI; quarterly secret rotation; annual pentest before raises (doc 19 §19.10) | OWASP ZAP on every staging deploy |
| **Performance** | EXPLAIN ANALYZE before prod for new hot queries; load test before each major launch | hold NFR 4.1 latency targets |
| **Observability** | new module ⇒ new metrics + dashboards + alerts | nothing ships unobserved |
| **DR** | quarterly backup-restore drill (NFR 4.8) | RTO 4h / RPO 1h validated |
| **Tech-debt 20%** | reserved each sprint (doc 21) | prevents architectural debt that blocks next version |

---

## Schedule Risks Embedded in This Roadmap (see RISK_ANALYSIS for full treatment)

1. **Meta App Review (Sprint 6)** gates public launch and is outside our control → submit at the *earliest* demonstrable point; have a sandbox/beta path that doesn't require full approval.
2. **Tenancy performance (Sprint 3)** — if the `SET LOCAL` pattern fails the benchmark, redesign costs ~1 sprint; it sits on the critical path so the slip propagates. Mitigated by benchmarking *before* building domain modules on top.
3. **3-engineer V1 team** building 8 sprints of breadth is tight. The two-stream parallelization (platform vs CRM/UX) assumes all 3 are senior full-stack. If not, P5 (AI+Workflow+Notifications in one sprint) is the most likely overflow → it can borrow from the beta buffer or push minimal-workflow polish to a fast-follow V1.1.
