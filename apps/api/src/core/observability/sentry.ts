// Sentry init (OBS-1.2). Guarded by SENTRY_DSN — absent = disabled (dev/test no-op).
// PII is stripped in beforeSend (doc 18 §18.4).

import * as Sentry from '@sentry/node';
import { env } from '../config/env.js';
import { logger } from './logger.js';

let initialized = false;

export function initSentry(): void {
  if (!env.SENTRY_DSN) {
    logger.debug('Sentry disabled (no SENTRY_DSN)');
    return;
  }
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    release: env.GIT_SHA,
    tracesSampleRate: 0.1,
    beforeSend(event) {
      if (event.request?.data && typeof event.request.data === 'object') {
        const data = event.request.data as Record<string, unknown>;
        delete data.password;
        delete data.phone;
        delete data.email;
        delete data.token;
      }
      return event;
    },
  });
  initialized = true;
  logger.info('Sentry initialized');
}

export function captureException(err: unknown): void {
  if (initialized) Sentry.captureException(err);
}

export const isSentryEnabled = (): boolean => initialized;
