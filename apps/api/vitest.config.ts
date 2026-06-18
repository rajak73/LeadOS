import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Integration tests that need Postgres/Redis self-gate at runtime via a service probe
    // (tests/helpers/services.ts) so the suite is green with or without local infra; CI
    // runs docker-compose services so they execute there.
    testTimeout: 20000,
  },
});
