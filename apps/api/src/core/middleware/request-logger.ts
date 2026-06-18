// Per-request structured logging + requestId (OBS-1.1). Emits one log line per request
// with method/path/status/duration and the requestId. NEVER logs bodies or PII.
// Also records HTTP metrics (bounded labels only — no tenant/user ids, I8).

import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { logger } from '../observability/logger.js';
import { httpRequestDuration, httpRequestsTotal } from '../observability/metrics.js';

export const requestLogger: RequestHandler = (req, res, next) => {
  const start = Date.now();
  const requestId = randomUUID();
  req.context = { requestId };
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const duration = Date.now() - start;
    const route = req.route?.path ? String(req.route.path) : req.path;
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };
    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, duration);

    logger.info({
      message: 'request.completed',
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
    });
  });

  next();
};
