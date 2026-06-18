# 18 — Observability Design

> **⚠ UPDATED per `docs/planning/P0_FIXES.md` (P0-6).** Added `leados_billing_mirror_drift` metric + alert. Consolidated architecture: `docs/planning/FINAL_ARCHITECTURE.md`.

---

## 18.1 Observability Pillars

| Pillar | Tool | Purpose |
|---|---|---|
| Logging | Winston + OpenTelemetry | Structured logs for all requests, events, errors |
| Metrics | OpenTelemetry + Prometheus + Grafana | System health, business metrics, SLOs |
| Traces | OpenTelemetry + Jaeger | Request traces for debugging latency |
| Error Tracking | Sentry | Real-time error alerting with context |
| Uptime Monitoring | Better Uptime / Checkly | External health checks every 60s |
| APM | Sentry Performance | Frontend + backend performance monitoring |

---

## 18.2 Logging Strategy

### Log Format (JSON Structured)
Every log line outputs JSON for easy ingestion into log aggregators (Datadog, CloudWatch, Loki):

```json
{
  "timestamp": "2026-06-18T07:00:00.000Z",
  "level": "info",
  "service": "leados-api",
  "traceId": "abc123def456",
  "spanId": "xyz789",
  "organizationId": "org-uuid",
  "userId": "user-uuid",
  "requestId": "req-uuid",
  "method": "POST",
  "path": "/api/v1/leads",
  "statusCode": 201,
  "duration": 87,
  "message": "Lead created successfully",
  "meta": {
    "leadId": "lead-uuid",
    "source": "INSTAGRAM_DM"
  }
}
```

### Log Levels
| Level | When to Use |
|---|---|
| `error` | Unexpected errors, exceptions, 5xx responses |
| `warn` | Expected failures, rate limits, plan limits, 4xx patterns |
| `info` | Normal operations: request completed, job processed |
| `debug` | Development only: function calls, DB queries (never in production) |

### What to LOG
✅ All API requests: method, path, status, duration, org_id, user_id
✅ All authentication events: login, logout, failed login, token refresh
✅ All webhook events: receipt, processing, completion, failure
✅ All queue jobs: enqueue, process start, process complete/fail
✅ All external API calls: Instagram, WhatsApp, OpenAI, Stripe (with duration)
✅ All billing events: subscription created, payment, cancellation

### What NOT to LOG
❌ Passwords or tokens (even hashed)
❌ Full message content (privacy)
❌ Patient/medical data (HIPAA consideration)
❌ Credit card data (never touches our servers anyway)
❌ Full request/response bodies (log summary only)

### Log Middleware (Express)
```typescript
// core/middleware/requestLogger.ts

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const requestId = crypto.randomUUID();
  
  req.context = { ...req.context, requestId };
  res.setHeader('X-Request-Id', requestId);
  
  res.on('finish', () => {
    logger.info({
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: Date.now() - start,
      organizationId: req.context?.organizationId,
      userId: req.context?.userId,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
  });
  
  next();
};
```

---

## 18.3 Metrics Strategy

### Business Metrics (Custom OpenTelemetry Counters)

| Metric Name | Type | Description |
|---|---|---|
| `leados_orgs_total` | Gauge | Total organizations |
| `leados_orgs_trialing` | Gauge | Orgs in trial |
| `leados_orgs_active` | Gauge | Paid active orgs |
| `leados_leads_created_total` | Counter | Cumulative leads created |
| `leados_leads_won_total` | Counter | Cumulative won leads |
| `leados_messages_sent_total` | Counter | Messages sent by channel |
| `leados_messages_received_total` | Counter | Messages received by channel |
| `leados_workflows_executed_total` | Counter | Workflow executions |
| `leados_ai_calls_total` | Counter | AI API calls by type |
| `leados_signup_total` | Counter | New registrations |
| `leados_mrr` | Gauge | Monthly Recurring Revenue |
| `leados_billing_mirror_drift` | Gauge | Subscriptions where the LeadOS mirror disagreed with Stripe at last reconciliation (P0-6) — alert on any non-zero value |

### System Metrics (Auto-collected via OpenTelemetry)
| Metric | Description |
|---|---|
| `http_request_duration_ms` | API response time histogram |
| `http_requests_total` | Request count by status code |
| `db_query_duration_ms` | Database query time histogram |
| `queue_job_duration_ms` | Queue job processing time |
| `queue_depth` | Jobs waiting in each queue |
| `cache_hit_rate` | Redis cache hit vs miss ratio |
| `external_api_duration_ms` | Instagram/WhatsApp/OpenAI latency |
| `node_heap_used_bytes` | Node.js memory usage |
| `node_event_loop_lag_ms` | Event loop lag (key Node.js health metric) |

### SLO Targets & Alerts
| SLO | Target | Alert When |
|---|---|---|
| API availability | 99.9% | < 99.5% over 5 minutes |
| API P95 response time | < 400ms | > 800ms for 5 minutes |
| Error rate | < 0.5% | > 1% for 3 minutes |
| Queue depth (workflow) | < 100 | > 500 for 5 minutes |
| Queue depth (webhook) | < 200 | > 1000 for 2 minutes |
| AI API error rate | < 2% | > 5% for 5 minutes |

---

## 18.4 Sentry Configuration

### Backend (Node.js)
```typescript
// core/sentry.ts
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: process.env.GIT_SHA, // Set during CI build
  tracesSampleRate: 0.1, // 10% of requests traced
  profilesSampleRate: 0.1,
  
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
    new Sentry.Integrations.Express({ app }),
    new Sentry.Integrations.Prisma({ client: prisma }),
  ],
  
  beforeSend(event) {
    // Strip PII from error reports
    if (event.request?.data) {
      delete event.request.data.password;
      delete event.request.data.phone;
    }
    return event;
  },
  
  // Custom tags added to every error
  initialScope: {
    tags: { component: 'api' }
  }
});

// Set user context in middleware:
Sentry.setUser({ id: req.context.userId, orgId: req.context.organizationId });
```

### Frontend (Next.js)
```typescript
// sentry.client.config.ts
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.05, // 5% of page loads
  replaysSessionSampleRate: 0.01, // 1% session replay (for debugging)
  replaysOnErrorSampleRate: 1.0, // 100% replay on error
  integrations: [
    new Sentry.Replay({
      maskAllText: true, // Privacy: mask all text in replays
      blockAllMedia: true,
    })
  ]
});
```

### Alert Rules in Sentry
| Issue | Alert Channel | Condition |
|---|---|---|
| New error type | Slack #alerts | First occurrence |
| Error spike | Slack #alerts | > 10 occurrences/minute |
| Performance degradation | PagerDuty | P95 > 2s |
| Unhandled rejection | Slack #alerts | First occurrence |
| Memory leak signal | Slack #alerts | Heap > 1.5GB |

---

## 18.5 Health Check Endpoints

### Shallow Health Check (for load balancer)
```
GET /health
Response 200: { "status": "ok", "timestamp": "..." }
Response 503: { "status": "degraded", "message": "..." }
```

### Deep Health Check (for monitoring systems)
```
GET /health/deep
Response 200:
{
  "status": "ok",
  "checks": {
    "database": { "status": "ok", "latency": 12 },
    "redis": { "status": "ok", "latency": 3 },
    "queue": { "status": "ok", "depth": { "workflow": 5, "webhook": 12 } }
  },
  "version": "1.2.3",
  "uptime": 3600
}
```

### Readiness Probe vs Liveness Probe (Kubernetes)
- **Liveness**: `GET /health` — is the process alive?
- **Readiness**: `GET /health/deep` — is it ready to serve traffic?

---

## 18.6 Grafana Dashboards

### Dashboard 1: API Health
- Request rate by endpoint
- Error rate by status code
- P50/P95/P99 response time
- Active connections

### Dashboard 2: Business Metrics
- New signups today/week/month
- Leads created today
- Messages sent today
- MRR trend
- Trial conversion funnel

### Dashboard 3: Queue Health
- Queue depth per queue (real-time)
- Job completion rate
- Failed job rate
- Processing time per job type

### Dashboard 4: Database Health
- Active connections
- Query duration percentiles
- Cache hit rate (Redis)
- Slow query log (queries > 500ms)

### Dashboard 5: External APIs
- Instagram API: call rate, error rate, latency
- WhatsApp API: call rate, error rate
- OpenAI API: token usage, cost/hour, latency, error rate
- Stripe API: call rate, error rate

---

## 18.7 Alerting Runbook

When an alert fires:
1. Acknowledge in PagerDuty (if on-call)
2. Check Grafana dashboard for context
3. Check Sentry for specific errors
4. Check logs in CloudWatch/Datadog
5. Check status.leados.com (external status page)
6. If user-impacting: update status page within 5 minutes
7. Resolve or escalate within 30 minutes

**Status Page:**
- Public status page at `status.leados.com`
- Components tracked: API, Web App, Instagram Webhooks, WhatsApp Webhooks, Background Jobs
- Automated incident creation when SLO breach detected
- Post-mortem published within 72 hours for P1 incidents
