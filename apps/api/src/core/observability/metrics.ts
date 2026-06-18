// Prometheus metrics (OBS-2.1). System metrics + business counters.
// CARDINALITY RULE (I8): tenant/user ids go in LOGS, never as metric labels. Labels here
// are bounded (method, route, status_code, queue, job type) only.

import client from 'prom-client';

export const registry = new client.Registry();
registry.setDefaultLabels({ service: 'leados-api' });
client.collectDefaultMetrics({ register: registry });

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP request duration in milliseconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [10, 25, 50, 100, 200, 400, 800, 1500, 3000],
  registers: [registry],
});

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [registry],
});

export const queueJobsProcessed = new client.Counter({
  name: 'queue_jobs_processed_total',
  help: 'Total queue jobs processed',
  labelNames: ['queue', 'status'] as const,
  registers: [registry],
});

export async function renderMetrics(): Promise<string> {
  return registry.metrics();
}
