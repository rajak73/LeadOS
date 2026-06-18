import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'lcov'],
      // Only the node-testable lib + route handlers are measured. Client-runtime modules
      // ('use client': Zustand store, Socket.io client) and React components/shell are
      // validated at build time and (in later sprints) via E2E, not node unit tests.
      include: ['src/lib/api-client.ts', 'src/lib/auth/**/*.ts', 'src/app/api/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      thresholds: {
        lines: 60,
        functions: 60,
        statements: 60,
        branches: 60,
      },
    },
  },
});
