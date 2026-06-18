# 20 — Production Readiness Checklists

---

> Every checklist item must be signed off by the Engineering Lead and CTO before launch.
> ❌ = Not started | ⚠️ = In Progress | ✅ = Complete

> **⚠ UPDATED per `docs/planning/P0_FIXES.md`.** The **P0 Launch Gate** below is mandatory and supersedes a generic pass — all seven P0 remediations must be green. Consolidated architecture: `docs/planning/FINAL_ARCHITECTURE.md`.

---

## 20.0 P0 Launch Gate (MANDATORY — blocks public launch)

- [ ] **P0-1/2 Tenant isolation:** cross-tenant suite passes at app **and** RLS layers, covering `update`/`delete`/`upsert`/`aggregate`/`groupBy` (not just read/create); RLS **denies** a query whose `app.current_organization_id` GUC is deliberately unset or wrong.
- [ ] **P0-1 Pooling/perf:** Sprint-3 benchmark of the per-unit-of-work transaction + `set_config` pattern accepted against the production pooling mode (transaction mode).
- [ ] **P0-3 Atomicity:** org onboarding and lead→contact conversion proven atomic (partial-failure rolls back fully).
- [ ] **P0-4 Auth topology:** end-to-end refresh tested on the real same-site staging domains (`app.`/`api.leados.app`); cookie is sent; CSRF check on `/auth/refresh` verified.
- [ ] **P0-5 Instagram:** integration validated against the **current** Meta Graph API version (spike done, doc 14 patched); Meta App Review approved; webhook HMAC verified with raw-body capture.
- [ ] **P0-6 Billing:** webhook ordering + idempotency verified; nightly reconciliation job live; proven that a missed webhook does NOT lock out a paying org (fail-open) and does NOT free a delinquent org beyond one cycle.
- [ ] **P0-7 Encryption posture:** docs corrected; email/phone confirmed indexable/searchable; only OAuth tokens app-encrypted; no false compliance claim ships.

---

## 20.1 Launch Readiness Checklist

### Authentication & Access
- [ ] JWT secrets are 256-bit+ random strings (not default values)
- [ ] JWT secrets stored in AWS Secrets Manager (not .env files in production)
- [ ] Refresh token rotation implemented and tested
- [ ] Account lockout after 5 failed attempts verified working
- [ ] Password reset flow tested end-to-end
- [ ] Email verification enforced before access
- [ ] All admin routes protected by isSuperAdmin check

### API & Backend
- [ ] All API endpoints require authentication (no unprotected endpoints except /health, /webhooks)
- [ ] All endpoints tested against unauthorized access (401, 403 responses correct)
- [ ] Input validation (Zod) on all request bodies/params
- [ ] Error messages sanitized — no stack traces in production responses
- [ ] Rate limiting active on all endpoints
- [ ] CORS configured to allow only production domains
- [ ] Health check endpoints `/health` and `/health/deep` returning correctly
- [ ] API versioning implemented (`/api/v1/`)
- [ ] Response compression (gzip) enabled
- [ ] Request timeout configured (30s default, 120s for file uploads)

### Database
- [ ] PostgreSQL on Neon with SSL enforced
- [ ] All migrations applied and rolled back cleanly in staging
- [ ] Row Level Security policies enabled on all tenant tables
- [ ] Database backups configured (daily full, continuous WAL)
- [ ] Backup restore tested successfully
- [ ] Read replica configured and working for analytics queries
- [ ] All critical indexes created (verify with EXPLAIN ANALYZE on key queries)
- [ ] Connection pool configured (PgBouncer or Neon's built-in)
- [ ] Soft delete implemented and verified (no accidental hard deletes)

### Multi-Tenancy
- [ ] Tenant isolation tested: user from Org A cannot access Org B data
- [ ] Prisma tenant extension applied to all tenant-scoped queries
- [ ] RLS policies verified with SQL tests
- [ ] Plan limits enforced (lead limits, seat limits, workflow limits)
- [ ] Cross-tenant data leakage test: try accessing UUID of another org's record

### Billing
- [ ] Stripe integration tested in test mode with all card scenarios
- [ ] Trial creation and expiry tested
- [ ] Plan upgrade and downgrade tested
- [ ] Payment failure handling tested (dunning flow)
- [ ] Stripe webhooks verified (signature validation working)
- [ ] Invoice PDF generation working
- [ ] GST calculation correct for Indian businesses
- [ ] Stripe Customer Portal working

### Instagram Integration
- [ ] Meta App Review approved (messaging permissions)
- [ ] OAuth flow tested end-to-end
- [ ] Webhook signature verification working
- [ ] Message receive flow tested with real Instagram account
- [ ] Message send flow tested
- [ ] Token refresh cron job scheduled and tested
- [ ] Webhook idempotency verified (duplicate events ignored)
- [ ] Rate limiting on Instagram API calls (< 200 calls/hour/page)

### Workflow Engine
- [ ] All trigger types tested with real events
- [ ] Condition evaluation logic tested with edge cases
- [ ] All action types tested (email, DM, task, notification)
- [ ] Failed action handling verified (doesn't stop pipeline)
- [ ] BullMQ retry logic working
- [ ] Workflow execution logs populated correctly
- [ ] Plan limits on workflow count enforced

### AI Layer
- [ ] OpenAI API key configured in production
- [ ] Lead scoring running asynchronously (not blocking API)
- [ ] AI result caching in Redis working
- [ ] Usage limits per plan enforced
- [ ] AI call failures handled gracefully (no score = no crash)

### Notifications
- [ ] In-app notifications delivered via WebSocket
- [ ] WebSocket reconnection handled client-side
- [ ] Email notifications delivered via SendGrid
- [ ] Notification preferences saved and respected
- [ ] Badge count accurate

---

## 20.2 Security Checklist

### Authentication Security
- [ ] bcrypt cost factor = 12 in production
- [ ] Refresh tokens stored as SHA-256 hashes (never plaintext)
- [ ] Refresh token family reuse attack detection implemented
- [ ] HttpOnly, Secure, SameSite=Strict cookies for refresh token
- [ ] CSRF protection on all state-changing requests
- [ ] 2FA available for Super Admin accounts

### API Security
- [ ] All security headers present (CSP, HSTS, X-Frame-Options, etc.)
- [ ] `npm audit` shows 0 high/critical vulnerabilities
- [ ] No secrets committed to git history (verify with trufflehog)
- [ ] No debug endpoints accessible in production
- [ ] SQL injection prevention: all queries via Prisma (no raw SQL)
- [ ] XSS prevention: input sanitized before storage, output escaped

### Data Security
- [ ] Instagram/WhatsApp tokens encrypted at rest (AES-256-GCM)
- [ ] PII excluded from application logs
- [ ] PII excluded from Sentry error reports
- [ ] Database connection uses SSL
- [ ] Backup files encrypted

### Infrastructure Security
- [ ] Production database not accessible from internet (only from VPC)
- [ ] API server behind load balancer + WAF
- [ ] DDoS protection active (Cloudflare)
- [ ] Security groups / firewall rules: minimal open ports
- [ ] SSH access restricted to bastion host + key-only auth
- [ ] No root credentials in use (IAM roles with minimal permissions)

---

## 20.3 Performance Checklist

### API Performance
- [ ] P95 response time < 400ms verified under load testing
- [ ] Load test performed: 1,000 concurrent users simulated (Artillery/k6)
- [ ] No N+1 query issues (use Prisma select/include carefully)
- [ ] Critical queries verified with EXPLAIN ANALYZE (no sequential scans on large tables)
- [ ] Database connection pool sized correctly for traffic
- [ ] Redis caching implemented for: plan limits, org settings, member roles

### Frontend Performance
- [ ] Lighthouse score > 90 (mobile + desktop)
- [ ] LCP < 2.5s verified on low-end mobile
- [ ] Bundle size analyzed — no unnecessary large dependencies
- [ ] Images served as WebP via Cloudinary auto-format
- [ ] Fonts loaded with `font-display: swap`
- [ ] Code splitting: each route loaded lazily
- [ ] TanStack Query caching configured correctly (no unnecessary refetches)

### Queue Performance
- [ ] BullMQ workers sized for expected throughput
- [ ] Queue monitoring dashboard live
- [ ] DLQ alert when jobs fail

---

## 20.4 Scalability Checklist

### Horizontal Scaling
- [ ] Backend is stateless (no in-memory state required for request handling)
- [ ] All session state in Redis (not in-process memory)
- [ ] File uploads go directly to S3/Cloudinary (not through API server)
- [ ] WebSocket server separate from API server (or using Redis pub/sub adapter for multi-instance)
- [ ] Load balancer configured with health checks

### Database Scaling
- [ ] Read replica active and routing analytics queries correctly
- [ ] Connection pool configured (not opening a new connection per request)
- [ ] Auto-vacuum on all tables (PostgreSQL default, verify settings)
- [ ] Partition strategy documented for future (leads, messages tables)
- [ ] pg_stat_statements enabled (query performance analysis)

---

## 20.5 Disaster Recovery Checklist

### Backup Strategy
- [ ] Daily PostgreSQL backups automated and verified
- [ ] Point-in-time recovery tested (restore DB to 2 hours ago)
- [ ] Redis snapshots every 6 hours
- [ ] S3 cross-region replication enabled for files
- [ ] Backup restoration drill completed (quarterly requirement)

### Recovery Procedures (Documented)
- [ ] **Database failure**: Failover to read replica → promote to primary → estimated RTO: 15 min
- [ ] **API server crash**: ECS auto-restarts container → estimated RTO: 2 min
- [ ] **Redis failure**: Application degrades gracefully (cache miss → DB hit) → RTO: immediate
- [ ] **Queue failure**: Jobs remain in Redis, workers auto-reconnect → RTO: 2 min
- [ ] **Instagram API down**: Webhooks queued, message send blocked, UI shows error → RTO: external dependency

### Runbooks
- [ ] Database restore runbook documented and linked in wiki
- [ ] Deployment rollback runbook documented (one command: `ecs update-service --force-new-deployment`)
- [ ] Emergency contacts list up to date (infra, Stripe, Sentry, Meta support)

---

## 20.6 Go-Live Checklist

### Pre-Launch (1 week before)
- [ ] Full staging environment matches production configuration
- [ ] Full regression test suite passed on staging
- [ ] Load test completed on staging
- [ ] Security audit completed
- [ ] All third-party integrations tested on staging (Stripe, Instagram, SendGrid)
- [ ] Support documentation written (user guide, FAQ)
- [ ] Status page (`status.leados.com`) configured and live
- [ ] On-call rotation set up (PagerDuty or equivalent)

### Launch Day
- [ ] DNS TTL reduced 24h before (for fast rollback)
- [ ] Deploy to production during low-traffic window (Sunday 2am IST)
- [ ] Smoke test all critical paths after deployment:
  - Sign up → verify email → login
  - Create lead → assign → move pipeline
  - Send Instagram DM from inbox
  - Create and trigger workflow
  - Upgrade to paid plan via Stripe
- [ ] Monitor error rate for 2 hours after launch
- [ ] Team on standby for immediate rollback if error rate > 2%

### Post-Launch (first 72 hours)
- [ ] Monitor: error rate, response times, queue depths
- [ ] First 10 signups personally onboarded by founding team
- [ ] Customer support queue monitored hourly
- [ ] Any P1 bugs: hotfix deployed same day
- [ ] Week 1 retro: what to fix in V1.1
