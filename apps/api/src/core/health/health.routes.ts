// Health + metrics routes (INFRA-2.7 / OBS-2.1). These are unauthenticated and outside the
// versioned API surface, by design (load balancer + monitoring probes).

import { Router } from 'express';
import { getDeepHealth } from './health.service.js';
import { renderMetrics, registry } from '../observability/metrics.js';

export const healthRouter: Router = Router();

// Shallow liveness probe.
healthRouter.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Deep readiness probe (DB + Redis + queue).
healthRouter.get('/health/deep', async (_req, res) => {
  const health = await getDeepHealth();
  res.status(health.status === 'ok' ? 200 : 503).json(health);
});

// Prometheus scrape endpoint.
healthRouter.get('/metrics', async (_req, res) => {
  res.setHeader('Content-Type', registry.contentType);
  res.send(await renderMetrics());
});
