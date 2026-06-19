// Unit tests for the pure audit-row builder (no DB).

import { describe, it, expect } from 'vitest';
import { buildAuditRow } from './audit-recorder.js';
import type { TenantContext } from '../tenancy/context.js';

const ctx: TenantContext = {
  organizationId: 'o1',
  userId: 'actor-1',
  role: 'OWNER',
  isSuperAdmin: false,
  ipAddress: '203.0.113.7',
};

describe('buildAuditRow', () => {
  it('stamps actor + ip from context and masks PII in before/after', () => {
    const row = buildAuditRow(
      {
        action: 'member.updated',
        resource: 'organization_member',
        resourceId: 'u-9',
        before: { email: 'old@x.com', roleId: 'r-old' },
        after: { email: 'new@x.com', roleId: 'r-new' },
      },
      ctx,
    );
    expect(row.actorUserId).toBe('actor-1');
    expect(row.ipAddress).toBe('203.0.113.7');
    expect(row.resourceId).toBe('u-9');
    expect(row.before).toEqual({ email: 'o***@x.com', roleId: 'r-old' });
    expect(row.after).toEqual({ email: 'n***@x.com', roleId: 'r-new' });
  });

  it('omits before/after when not provided (no SQL-null Json issue)', () => {
    const row = buildAuditRow({ action: 'a', resource: 'r' }, ctx);
    expect('before' in row).toBe(false);
    expect('after' in row).toBe(false);
    expect(row.resourceId).toBeNull();
  });

  it('does not carry organizationId (the extension injects it)', () => {
    const row = buildAuditRow({ action: 'a', resource: 'r' }, ctx);
    expect('organizationId' in row).toBe(false);
  });
});
