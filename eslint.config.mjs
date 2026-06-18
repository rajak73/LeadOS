// Root ESLint flat config (ESLint 9). Shared across workspaces.
// Enforces TypeScript strictness + MODULE-BOUNDARY rules (INFRA-1.3 / R-ARCH-1):
//   - apps/web may not import apps/api internals
//   - a domain module may only be reached via its own folder or its public index
// Boundary rules are configured now, before any module-shaped code exists.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/.turbo/**',
      'prisma/migrations/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      'no-eval': 'error',
      'no-new-func': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // Frontend may never reach into backend internals.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/apps/api/**', '@leados/api', '@leados/api/**'],
              message: 'apps/web must not import apps/api internals. Talk to the API over HTTP.',
            },
          ],
        },
      ],
    },
  },
  // Backend module-boundary rule: cross-module access only via a module public index.
  {
    files: ['apps/api/src/modules/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // Deep imports into a sibling module's internals are forbidden.
              group: ['**/modules/*/!(index)', '../*/!(index)', '../../modules/*/!(index)'],
              message:
                'Cross-module access must go through the module public index.ts (R-ARCH-1).',
            },
          ],
        },
      ],
    },
  },
  // Test files: relax a few rules.
  {
    files: ['**/*.test.ts', '**/tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
