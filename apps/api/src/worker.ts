// Worker process entrypoint. SEPARATE process from the API (same codebase, different
// entrypoint) — this is the topology M0 proves. Starts the BullMQ workers and the cron
// scheduler (single-flight), and wires graceful shutdown.

import { initSentry } from './core/observability/sentry.js';
import { initTracing, shutdownTracing } from './core/observability/otel.js';
import { logger } from './core/observability/logger.js';
import { startWorkers, stopWorkers } from './core/queue/worker-registry.js';
import { scheduleAllCrons } from './core/scheduler/scheduler.js';
import { initNotificationPublisher } from './core/realtime/notification-publisher.js';

async function start(): Promise<void> {
  initTracing();
  initSentry();

  initNotificationPublisher();
  startWorkers();
  await scheduleAllCrons();
  logger.info({ message: 'Worker process started' });

  const shutdown = (signal: string): void => {
    logger.info({ message: 'Shutting down worker', signal });
    void stopWorkers()
      .then(() => shutdownTracing())
      .finally(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

void start();
