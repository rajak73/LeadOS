// Typed environment loader. Validates process.env at boot and FAILS FAST on invalid
// configuration (a misconfigured process must not start). Only the Sprint-1 platform-spine
// variables are required; auth/billing/integration vars are declared optional here and
// become required as their modules land.

import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  APP_WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),

  DATABASE_URL: z.string().min(1).default('postgresql://leados:leados@localhost:5432/leados'),
  DATABASE_DIRECT_URL: z.string().optional(),
  DATABASE_REPLICA_URL: z.string().optional(),

  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

  SENTRY_DSN: z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  OTEL_SERVICE_NAME: z.string().default('leados-api'),
  GIT_SHA: z.string().default('local'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate an environment source. Exposed for testability.
 * Throws a descriptive error if validation fails.
 */
export function loadEnv(source: NodeJS.ProcessEnv): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const env: Env = loadEnv(process.env);
export const isProduction = (): boolean => env.NODE_ENV === 'production';
export const isTest = (): boolean => env.NODE_ENV === 'test';
