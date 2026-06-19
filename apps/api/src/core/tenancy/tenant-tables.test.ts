// Unit tests for the tenant-table registry (no DB). The registry is the contract the RLS
// migration + coverage check are validated against; these guard its internal consistency.

import { describe, it, expect } from 'vitest';
import {
  TENANT_TABLES,
  NON_TENANT_TABLES,
  TENANT_COLUMN,
  TENANT_GUC,
  isTenantTable,
} from './tenant-tables.js';

describe('tenant-table registry', () => {
  it('lists exactly the org-scoped tables (S2 identity + S3 audit)', () => {
    expect([...TENANT_TABLES].sort()).toEqual(
      ['audit_logs', 'organization_members', 'refresh_tokens', 'roles', 'subscriptions'].sort(),
    );
  });

  it('pins the real Prisma tenant column and the GUC name', () => {
    expect(TENANT_COLUMN).toBe('organizationId');
    expect(TENANT_GUC).toBe('app.current_organization_id');
  });

  it('keeps tenant and non-tenant sets disjoint', () => {
    const overlap = TENANT_TABLES.filter((t) =>
      (NON_TENANT_TABLES as readonly string[]).includes(t),
    );
    expect(overlap).toEqual([]);
  });

  it('classifies tables via isTenantTable', () => {
    expect(isTenantTable('roles')).toBe(true);
    expect(isTenantTable('users')).toBe(false);
    expect(isTenantTable('nonexistent')).toBe(false);
  });

  it('has no duplicate entries', () => {
    expect(new Set(TENANT_TABLES).size).toBe(TENANT_TABLES.length);
    expect(new Set(NON_TENANT_TABLES).size).toBe(NON_TENANT_TABLES.length);
  });
});
