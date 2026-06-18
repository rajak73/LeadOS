import { describe, it, expect } from 'vitest';
import {
  PLAN_LIMITS,
  ERROR_STATUS,
  ErrorCode,
  paginationQuerySchema,
  MANAGER_PERMISSIONS,
  LeadStatus,
  SubscriptionPlan,
} from './index.js';

describe('plan limits', () => {
  it('defines limits for every subscription plan', () => {
    for (const plan of Object.values(SubscriptionPlan)) {
      expect(PLAN_LIMITS[plan]).toBeDefined();
    }
  });

  it('exposes both monthly and hourly AI axes (BILL-4.1 reconciliation)', () => {
    expect(PLAN_LIMITS.STARTER.aiCallsPerMonth).toBe(500);
    expect(PLAN_LIMITS.STARTER.aiCallsPerHour).toBe(200);
  });

  it('treats SCALE as unlimited where applicable', () => {
    expect(PLAN_LIMITS.SCALE.leads).toBe(Number.POSITIVE_INFINITY);
    expect(PLAN_LIMITS.SCALE.apiAccess).toBe(true);
  });
});

describe('error codes', () => {
  it('maps every code to an HTTP status', () => {
    for (const code of Object.values(ErrorCode)) {
      expect(ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
    }
  });
});

describe('pagination schema', () => {
  it('applies defaults', () => {
    const parsed = paginationQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(25);
    expect(parsed.sortOrder).toBe('desc');
  });

  it('rejects an over-max limit', () => {
    expect(() => paginationQuerySchema.parse({ limit: 1000 })).toThrow();
  });
});

describe('permission contract', () => {
  it('manager has read but not delete on leads', () => {
    expect(MANAGER_PERMISSIONS).toContain('leads.read');
    expect(MANAGER_PERMISSIONS).not.toContain('leads.delete');
  });
});

describe('enums', () => {
  it('lead status lifecycle members are present', () => {
    expect(Object.values(LeadStatus)).toEqual([
      'NEW',
      'CONTACTED',
      'QUALIFIED',
      'PROPOSAL',
      'NEGOTIATION',
      'WON',
      'LOST',
    ]);
  });
});
