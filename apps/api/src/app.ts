// Express application assembly + middleware order (INFRA-2.1).
// Order (doc 06 §6.2 / FINAL_ARCHITECTURE): security → cors → compression → requestLogger →
// [health/metrics, exempt] → [webhooks raw-body BEFORE json] → json → apiRateLimit →
// auth → tenant → rbac → controllers → notFound → errorHandler.
//
// Sprint 1 has no domain controllers. A diagnostic /api/v1/ping exercises the full chain
// (auth/tenant/rbac stubs) and returns the standard envelope.

import express, { type Express, Router } from 'express';
import {
  corsMiddleware,
  securityHeaders,
  compressionMiddleware,
  requestLogger,
  apiRateLimit,
  authMiddleware,
  tenantMiddleware,
  requirePermission,
} from './core/middleware/index.js';
import { healthRouter } from './core/health/health.routes.js';
import { webhookRouter } from './core/webhooks/webhook.routes.js';
import { notFoundHandler, errorHandler } from './core/errors/error-handler.js';
import { sendSuccess } from './core/http/envelope.js';

export function buildApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Cross-cutting middleware (run for every request, incl. health, so all are logged).
  app.use(securityHeaders);
  app.use(corsMiddleware);
  app.use(compressionMiddleware);
  app.use(requestLogger);

  // Health/metrics: unauthenticated, rate-limit-exempt (monitoring probes).
  app.use(healthRouter);

  // Webhooks: RAW body BEFORE the JSON parser (HMAC verification needs raw bytes).
  app.use('/api/webhooks', express.raw({ type: '*/*', limit: '1mb' }), webhookRouter);

  // Global JSON parser for the rest of the API.
  app.use(express.json({ limit: '1mb' }));

  // Versioned API surface. Sprint 1: diagnostic ping only.
  const v1 = Router();
  v1.get('/ping', requirePermission('org.read'), (req, res) => {
    sendSuccess(res, { pong: true, requestId: req.context?.requestId ?? null });
  });
  app.use('/api/v1', apiRateLimit, authMiddleware, tenantMiddleware, v1);

  // Terminal handlers.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
