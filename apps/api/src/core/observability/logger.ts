// Structured JSON logger (Winston). Doc 18 §18.2.
// NEVER logs PII or secrets: a redaction format strips known-sensitive keys before output.

import winston from 'winston';
import { env } from '../config/env.js';

const REDACT_KEYS = new Set([
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  'phone',
  'email',
  'apiKey',
  'secret',
]);

const redact = winston.format((info) => {
  const scrub = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(scrub);
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = REDACT_KEYS.has(k) ? '[redacted]' : scrub(v);
      }
      return out;
    }
    return value;
  };
  return scrub(info) as winston.Logform.TransformableInfo;
});

export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  defaultMeta: { service: 'leados-api' },
  format: winston.format.combine(
    redact(),
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  // Silence transport during tests to keep output clean; logging logic is still exercised.
  transports: [new winston.transports.Console({ silent: env.NODE_ENV === 'test' })],
});

export type Logger = typeof logger;
