// API process entrypoint (HTTP). Boots observability, builds the app, listens, and wires
// graceful shutdown (drain in-flight requests). Does NOT run queue workers — those run in
// the separate worker process (worker.ts), proving the API ↔ worker split (M0).

import type { Server } from 'node:http';
import { env } from './core/config/env.js';
import { initSentry } from './core/observability/sentry.js';
import { initTracing, shutdownTracing } from './core/observability/otel.js';
import { logger } from './core/observability/logger.js';
import { buildApp } from './app.js';

function start(): void {
  initTracing();
  initSentry();

  const app = buildApp();
  const server: Server = app.listen(env.PORT, () => {
    logger.info({ message: 'API listening', port: env.PORT, env: env.NODE_ENV });
  });

  const shutdown = (signal: string): void => {
    logger.info({ message: 'Shutting down API', signal });
    server.close(() => {
      void shutdownTracing().finally(() => process.exit(0));
    });
    // Force-exit if drain takes too long.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();
