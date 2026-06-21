import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Loads workspace-root .env into process.env before any test module is evaluated.
    // Required so top-level `await isPostgresUp()` calls see DATABASE_URL / DATABASE_APP_URL
    // even when running via `pnpm test` without manually exporting the vars first.
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/setup-env.ts'],
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Integration tests that need Postgres/Redis self-gate at runtime via a service probe
    // (tests/helpers/services.ts) so the suite is green with or without local infra; CI
    // runs docker-compose services so they execute there.
    // Headroom for pure-JS bcryptjs (TD-S2-1) cost-factor ops running under parallel test
    // load; CI additionally lowers BCRYPT_COST so the suite stays well under this ceiling.
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'lcov'],
      include: ['src/**/*.ts'],
      // Excluded from coverage: process entrypoints + bootstrap that are exercised by
      // integration/E2E rather than unit tests, guarded observability inits (no-op without
      // a backend), type-only declarations, and barrels. These are covered behaviorally,
      // not by unit assertions, so including them would distort the unit-coverage signal.
      exclude: [
        'src/**/*.test.ts',
        'src/server.ts',
        'src/worker.ts',
        'src/core/observability/otel.ts',
        'src/core/observability/sentry.ts',
        'src/core/observability/logger.ts',
        'src/core/middleware/index.ts',
        'src/core/types/**',
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        statements: 60,
        branches: 60,
      },
    },
  },
});
