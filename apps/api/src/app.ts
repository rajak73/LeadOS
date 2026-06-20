// Express application assembly + middleware order (INFRA-2.1).
// Order (doc 06 §6.2 / FINAL_ARCHITECTURE): security → cors → compression → requestLogger →
// [health/metrics, exempt] → [webhooks raw-body BEFORE json] → json → apiRateLimit →
// auth → tenant → rbac → controllers → notFound → errorHandler.
//
// Sprint 1 has no domain controllers. A diagnostic /api/v1/ping exercises the full chain
// (auth/tenant/rbac stubs) and returns the standard envelope.

import express, { type Express, Router } from 'express';
import cookieParser from 'cookie-parser';
import {
  corsMiddleware,
  securityHeaders,
  compressionMiddleware,
  requestLogger,
  apiRateLimit,
  authMiddleware,
  tenantMiddleware,
} from './core/middleware/index.js';
import { healthRouter } from './core/health/health.routes.js';
import { webhookRouter } from './core/webhooks/webhook.routes.js';
import { notFoundHandler, errorHandler } from './core/errors/error-handler.js';
import { sendSuccess } from './core/http/envelope.js';
import { authRouter } from './modules/auth/index.js';
import { buildRbacModule } from './modules/rbac/index.js';
import { buildLeadsModule } from './modules/leads/index.js';
import { buildContactsModule } from './modules/contacts/index.js';
import { buildTasksModule } from './modules/tasks/index.js';
import { buildNotesModule } from './modules/notes/index.js';
import { buildFilesModule } from './modules/files/index.js';
import { buildPipelinesModule } from './modules/pipelines/index.js';
import { buildDealsModule } from './modules/deals/index.js';

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
  app.use(cookieParser()); // refresh-token cookie parsing for /auth/refresh + /auth/logout

  // PUBLIC auth routes (register/verify/etc.) — no auth/tenant middleware. Mounted before
  // the authenticated chain so it terminates auth requests (each route carries its own
  // rate limit).
  app.use('/api/v1/auth', authRouter);

  // Versioned API surface (authenticated). RBAC (real requirePermission + role admin) is wired
  // here via the rbac module composition.
  const rbac = buildRbacModule();
  const v1 = Router();
  v1.get('/ping', rbac.requirePermission('org.read'), (req, res) => {
    sendSuccess(res, { pong: true, requestId: req.context?.requestId ?? null });
  });
  v1.use(rbac.router); // /roles, /members/:userId/role, /members/:userId/suspend
  v1.use('/leads', buildLeadsModule(rbac.requirePermission));
  v1.use('/contacts', buildContactsModule(rbac.requirePermission));
  v1.use('/tasks', buildTasksModule(rbac.requirePermission));
  v1.use('/notes', buildNotesModule(rbac.requirePermission));
  v1.use('/files', buildFilesModule(rbac.requirePermission));
  v1.use('/pipelines', buildPipelinesModule(rbac.requirePermission));
  v1.use('/deals', buildDealsModule(rbac.requirePermission));
  app.use('/api/v1', apiRateLimit, authMiddleware, tenantMiddleware, v1);

  // Terminal handlers.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
