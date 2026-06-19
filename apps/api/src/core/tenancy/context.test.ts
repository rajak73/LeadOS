// Unit tests for the AsyncLocalStorage tenant context (no DB).

import { describe, it, expect } from 'vitest';
import {
  runWithTenantContext,
  getTenantContext,
  requireTenantContext,
  type TenantContext,
} from './context.js';

const ctx: TenantContext = {
  organizationId: 'org-1',
  userId: 'user-1',
  role: 'OWNER',
  isSuperAdmin: false,
};

describe('tenant context (AsyncLocalStorage)', () => {
  it('exposes the context inside the run scope', () => {
    const seen = runWithTenantContext(ctx, () => getTenantContext());
    expect(seen).toEqual(ctx);
  });

  it('is undefined outside any run scope', () => {
    expect(getTenantContext()).toBeUndefined();
  });

  it('requireTenantContext returns inside scope and throws outside', () => {
    expect(runWithTenantContext(ctx, () => requireTenantContext())).toEqual(ctx);
    expect(() => requireTenantContext()).toThrow(/No tenant context/);
  });

  it('propagates across awaited async continuations', async () => {
    const seen = await runWithTenantContext(ctx, async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 1));
      return getTenantContext();
    });
    expect(seen).toEqual(ctx);
  });

  it('isolates nested contexts and restores the outer one', () => {
    const inner: TenantContext = { ...ctx, organizationId: 'org-2' };
    runWithTenantContext(ctx, () => {
      expect(getTenantContext()?.organizationId).toBe('org-1');
      runWithTenantContext(inner, () => {
        expect(getTenantContext()?.organizationId).toBe('org-2');
      });
      expect(getTenantContext()?.organizationId).toBe('org-1');
    });
  });
});
