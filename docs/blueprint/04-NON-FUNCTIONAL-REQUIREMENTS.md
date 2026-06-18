# 04 — Non-Functional Requirements

> **⚠ UPDATED per `docs/planning/P0_FIXES.md` (P0-7).** Encryption-at-rest posture corrected in §4.4: PII (email/phone) is protected by storage-layer encryption (so it stays indexable for dedup/search), and application-level field encryption is limited to OAuth tokens. Consolidated architecture: `docs/planning/FINAL_ARCHITECTURE.md`.

---

## 4.1 Performance Requirements

### API Response Times
| Endpoint Type | Target P50 | Target P95 | Target P99 |
|---|---|---|---|
| Auth (login/refresh) | < 150ms | < 300ms | < 500ms |
| List endpoints (paginated) | < 200ms | < 400ms | < 800ms |
| Detail endpoints (single record) | < 100ms | < 250ms | < 500ms |
| Search endpoints | < 300ms | < 600ms | < 1,000ms |
| Analytics endpoints | < 500ms | < 1,500ms | < 3,000ms |
| File upload initiation | < 200ms | < 500ms | < 1,000ms |
| Webhook processing (async) | < 2s end-to-end | | |

### Frontend Performance (Core Web Vitals)
| Metric | Target |
|---|---|
| LCP (Largest Contentful Paint) | < 2.5s |
| INP (Interaction to Next Paint) | < 200ms |
| CLS (Cumulative Layout Shift) | < 0.1 |
| FCP (First Contentful Paint) | < 1.8s |
| Time to Interactive | < 3.0s |

### Database Performance
- No query should take > 1,000ms under normal load
- All queries that touch more than 100 rows must use indexed columns
- EXPLAIN ANALYZE run on all queries before production deployment
- Connection pool size: 20 per backend instance

---

## 4.2 Scalability Requirements

### Horizontal Scaling Targets
| Component | V1 (Launch) | V2 (Scale) | V3 (Enterprise) |
|---|---|---|---|
| Organizations | 1,000 | 10,000 | 100,000 |
| Users (total) | 10,000 | 100,000 | 1,000,000 |
| Leads (total records) | 5M | 50M | 500M |
| Messages (total) | 10M | 100M | 1B |
| API req/second | 100 RPS | 1,000 RPS | 10,000 RPS |
| Webhook events/second | 50 | 500 | 5,000 |

### Scaling Strategies
- **Backend**: Horizontal scaling with stateless Node.js instances behind load balancer
- **Database**: Read replicas for analytics queries; connection pooling via PgBouncer
- **Caching**: Redis for session storage, rate limiting, queue, and hot data caching
- **Queue**: BullMQ with multiple workers; workflow execution isolated from API
- **CDN**: All static assets (JS/CSS/images) served from CDN edge nodes
- **Database Partitioning**: Leads and Messages tables partitioned by `organization_id` at scale

---

## 4.3 Availability Requirements

| Metric | Target |
|---|---|
| Overall Uptime | 99.9% (< 8.7h downtime/year) |
| API Uptime | 99.95% |
| Planned Maintenance Window | Sundays 2am–4am UTC |
| Max Incident Recovery Time (RTO) | 4 hours |
| Recovery Point Objective (RPO) | 1 hour (last backup) |
| Webhook Delivery Guarantee | At-least-once |

---

## 4.4 Security Requirements

### Authentication
- Passwords hashed using bcrypt (cost factor 12)
- JWT secrets rotated every 90 days
- Refresh token rotation on every use
- Account locked after 5 failed login attempts (15 min lockout)
- All authentication events logged

### Data Protection
- All data encrypted in transit: TLS 1.2+ enforced, TLS 1.3 preferred
- All data encrypted at rest at the storage layer (Neon volume AES-256), including PII
- PII fields (phone, email) are stored as **indexable plaintext columns** (required for dedup, full-text and trigram search) — protected by storage-layer encryption, NOT application-level field encryption
- OAuth access tokens (Instagram/WhatsApp) are **additionally** encrypted at the application layer (AES-256-GCM) before storage
- Database backups encrypted
- API keys and secrets never logged
- PII data masked in application logs

### Authorization
- All API endpoints protected by JWT middleware
- All queries scoped to `organization_id` (tenant isolation)
- PostgreSQL Row Level Security (RLS) as defense-in-depth
- RBAC permission check on every protected operation

### Compliance
- GDPR: Right to access, right to erasure, data portability
- Data residency: Configurable per org (India/EU/US regions)
- Audit logs for all data mutations
- Data retention policy configurable per org

---

## 4.5 Reliability Requirements

- Circuit breaker pattern for all external API calls (Instagram, WhatsApp, OpenAI, Stripe)
- Retry with exponential backoff on transient failures
- Dead Letter Queue (DLQ) for failed queue jobs
- Health check endpoints: `/health` (shallow), `/health/deep` (DB + Redis check)
- Graceful shutdown: drain in-flight requests before restart
- Zero-downtime deployments via rolling updates

---

## 4.6 Observability Requirements

- 100% of API requests logged with: method, path, status, duration, org_id, user_id
- 100% of errors reported to Sentry with stack trace and context
- Custom metrics emitted via OpenTelemetry for: queue depth, webhook processing time, AI call latency
- Business metrics tracked: signups/day, trials started, conversions, churn
- Alerting thresholds defined for: error rate > 1%, P99 > 2s, queue depth > 1,000

---

## 4.7 Maintainability Requirements

- TypeScript strict mode enforced for both frontend and backend
- ESLint + Prettier configured in CI pipeline
- No PR merged without passing tests (unit + integration)
- API changes require OpenAPI spec update
- Database schema changes require Prisma migration
- All services must expose `/health`, `/metrics` endpoints
- 80% unit test coverage target for services layer
- Integration tests for all critical user journeys

---

## 4.8 Compliance & Data Requirements

### Data Residency
- Primary deployment: AWS Asia Pacific (Mumbai) `ap-south-1`
- Secondary: AWS US East `us-east-1` for international customers
- European customers: AWS EU West `eu-west-1`

### Data Retention
| Data Type | Default Retention | Configurable |
|---|---|---|
| Lead/Contact records | Forever (while subscribed) | No |
| Activity logs | 2 years | No |
| Audit logs | 5 years | No |
| Message history | 2 years | Yes (Enterprise) |
| Deleted org data | 30 days | No |
| API access logs | 90 days | No |

### Backup Requirements
- PostgreSQL: Daily full backups, continuous WAL archiving (PITR to 7 days)
- Redis: RDB snapshots every 6 hours
- Backup stored in separate AWS account (cross-account protection)
- Monthly restore test required

---

## 4.9 Usability Requirements

- New user should complete onboarding checklist in < 10 minutes
- Time to first lead captured: < 5 minutes from signup
- Pipeline Kanban should handle up to 200 cards without UI degradation
- All core actions achievable with keyboard shortcuts
- Mobile web must be functional for inbox and pipeline views
- WCAG 2.1 Level AA accessibility compliance
- Support English and Hindi as primary languages (i18n architecture from day 1)
- RTL support architecture (Arabic, Hebrew markets — V2)
