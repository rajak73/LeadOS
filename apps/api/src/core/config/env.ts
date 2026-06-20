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
  // Sprint 3 (TEN-3.1.1): the RLS-enforced application role (`leados_app`, NOBYPASSRLS).
  // Optional in S3 M1 — used by the RLS verification suite + coverage check to connect as a
  // non-bypass role (RLS is inert for a superuser, so it must be proven as leados_app). The
  // app runtime switches to this connection in M2/M3 once the tenant GUC mechanism exists.
  DATABASE_APP_URL: z.string().optional(),
  // The BYPASSRLS platform/support role (`leados_platform_admin`) — platform paths only (M5).
  DATABASE_PLATFORM_URL: z.string().optional(),

  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

  SENTRY_DSN: z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  OTEL_SERVICE_NAME: z.string().default('leados-api'),
  GIT_SHA: z.string().default('local'),

  // Auth (Sprint 2). Dev/test defaults provided; production MUST override (enforced below).
  JWT_ACCESS_SECRET: z.string().min(1).default('dev-access-secret-change-me'),
  JWT_REFRESH_PEPPER: z.string().min(1).default('dev-refresh-pepper-change-me'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900), // 15 min
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  REFRESH_TOKEN_REMEMBER_TTL_DAYS: z.coerce.number().int().positive().default(30),
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
  SESSION_COOKIE_DOMAIN: z.string().optional(),

  // Storage (Sprint 4 M5 — S3 for file uploads). Optional in dev/test; required in production
  // when files are uploaded (guard enforced at runtime in storage.service.ts).
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),

  // Webhooks (Sprint 5 M4). Dev/test defaults allow integration tests to compute matching
  // HMAC signatures without real secrets. Production MUST override with real values.
  INSTAGRAM_APP_SECRET: z.string().min(1).default('test-ig-secret'),
  INSTAGRAM_WEBHOOK_VERIFY_TOKEN: z.string().min(1).default('test-verify-token'),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).default('test-stripe-secret'),
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

// In production, the auth secrets must be explicitly set (never the dev defaults).
if (env.NODE_ENV === 'production') {
  const insecure: string[] = [];
  if (env.JWT_ACCESS_SECRET === 'dev-access-secret-change-me') insecure.push('JWT_ACCESS_SECRET');
  if (env.JWT_REFRESH_PEPPER === 'dev-refresh-pepper-change-me') insecure.push('JWT_REFRESH_PEPPER');
  if (insecure.length > 0) {
    throw new Error(`Refusing to start in production with default auth secrets: ${insecure.join(', ')}`);
  }
}
