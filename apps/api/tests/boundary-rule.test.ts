// Proves the module-boundary lint rule (R-ARCH-1) FAILS on a deliberate violation, without
// failing CI (the violation lives only inside this test, linted programmatically).
// SPRINT_1_EXECUTION_PLAN §6.4 DoD: "a deliberate violation test asserting the rule fails".

import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(import.meta.url), '../../../..');

function makeESLint(): ESLint {
  return new ESLint({
    cwd: repoRoot,
    overrideConfigFile: resolve(repoRoot, 'eslint.config.mjs'),
  });
}

describe('module-boundary rule', () => {
  it('flags apps/web importing apps/api internals', async () => {
    const eslint = makeESLint();
    const code = `import { buildApp } from '../../apps/api/src/app';\nexport const x = buildApp;\n`;
    const results = await eslint.lintText(code, {
      filePath: resolve(repoRoot, 'apps/web/src/__boundary_probe__.ts'),
    });
    const messages = results[0]?.messages ?? [];
    const violated = messages.some((m) => m.ruleId === 'no-restricted-imports');
    expect(violated).toBe(true);
  });

  it('allows apps/web importing @leados/shared', async () => {
    const eslint = makeESLint();
    const code = `import { PLAN_LIMITS } from '@leados/shared';\nexport const x = PLAN_LIMITS;\n`;
    const results = await eslint.lintText(code, {
      filePath: resolve(repoRoot, 'apps/web/src/__boundary_ok__.ts'),
    });
    const messages = results[0]?.messages ?? [];
    const violated = messages.some((m) => m.ruleId === 'no-restricted-imports');
    expect(violated).toBe(false);
  });
});
