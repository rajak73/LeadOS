// Unit tests for the tenant-scope guard (no DB).

import { describe, it, expect } from 'vitest';
import {
  runInTenantScope,
  isInTenantScope,
  currentTenantOrganizationId,
  assertTenantScope,
  TenantScopeViolationError,
} from './scope.js';

describe('tenant scope', () => {
  it('is absent outside any scope', () => {
    expect(isInTenantScope()).toBe(false);
    expect(currentTenantOrganizationId()).toBeUndefined();
  });

  it('exposes the org id inside the scope', () => {
    const org = runInTenantScope('org-1', () => currentTenantOrganizationId());
    expect(org).toBe('org-1');
  });

  it('assertTenantScope throws outside, passes inside', () => {
    expect(() => assertTenantScope()).toThrow(TenantScopeViolationError);
    expect(() => runInTenantScope('org-1', () => assertTenantScope())).not.toThrow();
  });

  it('propagates the scope across awaited continuations', async () => {
    const org = await runInTenantScope('org-2', async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 1));
      return currentTenantOrganizationId();
    });
    expect(org).toBe('org-2');
  });

  it('restores the absence of scope after the run', () => {
    runInTenantScope('org-1', () => undefined);
    expect(isInTenantScope()).toBe(false);
  });
});
