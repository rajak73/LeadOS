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

  // Sprint 6 M1 — Instagram OAuth (required in production; optional in dev/test).
  INSTAGRAM_APP_ID: z.string().optional(),
  INSTAGRAM_OAUTH_REDIRECT_URI: z.string().url().optional(),

  // Sprint 6 M1 — AES-256-GCM field encryption.
  // 64-char hex string (32 bytes / 256 bits). Required in production.
  // Dev default is a deterministic test key — MUST be overridden in production.
  FIELD_ENCRYPTION_KEY: z.string().length(64).default('0000000000000000000000000000000000000000000000000000000000000001'),

  // Sprint 6 M1 — Socket.io CORS origin (comma-separated list). Defaults to APP_WEB_ORIGIN.
  SOCKET_IO_CORS_ORIGIN: z.string().optional(),

  // Sprint 6 M1 — Signs OAuth state JWTs (separate from JWT_ACCESS_SECRET per signoff §4.4).
  // Dev default is distinct from JWT_ACCESS_SECRET default. Production MUST override.
  OAUTH_STATE_SECRET: z.string().min(1).default('dev-oauth-state-secret-change-me'),

  // Sprint 6 M4 — Kill switch for Instagram outbound sends. Defaults to enabled.
  // Set to 'false' to disable all sends without a deploy (e.g. during Meta API incidents).
  FLAG_INSTAGRAM_SENDS_ENABLED: z.coerce.boolean().default(true),

  // Sprint 7 M1 — Email delivery (SendGrid). Optional everywhere; only required in
  // production when the notifications.email.enabled flag is on (guard enforced below).
  // Without SENDGRID_API_KEY the email channel degrades to LoggingEmailSender.
  SENDGRID_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
  EMAIL_REPLY_TO: z.string().email().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate an environment source. Exposed for testability.
 * Throws a descriptive error if validation fails.
 */
export function loadEnv(source: NodeJS.ProcessEnv): Env {
  // Strip empty-string values before validation so that .env placeholder lines
  // (KEY=) behave like absent keys — allowing Zod .default() values to apply.
  // Dotenv and Vite both parse `KEY=` as `""`, but that should mean "not set".
  const coerced: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(source)) {
    coerced[k] = v === '' ? undefined : v;
  }
  const parsed = envSchema.safeParse(coerced);
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

// In production, auth and encryption secrets must be explicitly set (never the dev defaults).
if (env.NODE_ENV === 'production') {
  const insecure: string[] = [];
  if (env.JWT_ACCESS_SECRET === 'dev-access-secret-change-me') insecure.push('JWT_ACCESS_SECRET');
  if (env.JWT_REFRESH_PEPPER === 'dev-refresh-pepper-change-me') insecure.push('JWT_REFRESH_PEPPER');
  if (env.OAUTH_STATE_SECRET === 'dev-oauth-state-secret-change-me') insecure.push('OAUTH_STATE_SECRET');
  if (env.FIELD_ENCRYPTION_KEY === '0000000000000000000000000000000000000000000000000000000000000001') {
    insecure.push('FIELD_ENCRYPTION_KEY');
  }
  if (!env.INSTAGRAM_APP_ID) insecure.push('INSTAGRAM_APP_ID');
  if (!env.INSTAGRAM_OAUTH_REDIRECT_URI) insecure.push('INSTAGRAM_OAUTH_REDIRECT_URI');
  // Email is opt-in: only require SendGrid config when the email channel is turned on.
  // (Read the env override directly to avoid importing the flags module into config.)
  const emailFlag = process.env['FLAG_NOTIFICATIONS_EMAIL_ENABLED'];
  if (emailFlag === 'true' || emailFlag === '1') {
    if (!env.SENDGRID_API_KEY) insecure.push('SENDGRID_API_KEY (required when notifications.email.enabled)');
    if (!env.EMAIL_FROM) insecure.push('EMAIL_FROM (required when notifications.email.enabled)');
  }
  if (insecure.length > 0) {
    throw new Error(`Refusing to start in production with missing/default secrets: ${insecure.join(', ')}`);
  }
}
