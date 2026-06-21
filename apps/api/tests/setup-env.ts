// Per-worker env setup — runs in every Vitest worker thread BEFORE any test
// module is evaluated. Removes empty-string env vars so that the Zod schema
// defaults in env.ts fire correctly (Zod .default() only applies to undefined,
// not to ""). This handles the case where the shell or vitest pre-sets vars
// like JWT_ACCESS_SECRET="" from sourcing the workspace .env placeholders.

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
