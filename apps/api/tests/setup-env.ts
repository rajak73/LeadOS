// Per-worker env setup — runs in every Vitest worker thread BEFORE any test
// module is evaluated. Removes empty-string env vars so that the Zod schema
// defaults in env.ts fire correctly (Zod .default() only applies to undefined,
// not to ""). This handles the case where the shell or vitest pre-sets vars
// like JWT_ACCESS_SECRET="" from sourcing the workspace .env placeholders.
//
// We also force NODE_ENV=test here so that isTest() guards (rate-limiter bypass,
// bcrypt cost reduction, etc.) are always active regardless of what the workspace
// .env file sets. This is safe: global-setup.ts loads .env BEFORE this file runs,
// so DATABASE_URL / REDIS_URL etc. are already in process.env from .env.

// Force test mode — must happen before any module imports env.ts
process.env['NODE_ENV'] = 'test';

const ENV_VARS_WITH_DEFAULTS = [
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_PEPPER',
  'INSTAGRAM_APP_SECRET',
  'INSTAGRAM_WEBHOOK_VERIFY_TOKEN',
  'STRIPE_WEBHOOK_SECRET',
  'FIELD_ENCRYPTION_KEY',
  'OAUTH_STATE_SECRET',
];

for (const key of ENV_VARS_WITH_DEFAULTS) {
  if (process.env[key] === '') {
    delete process.env[key];
  }
}
