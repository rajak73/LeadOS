import { describe, it, expect } from 'vitest';
import { createLeadSchema, patchLeadSchema, leadIdParamSchema } from './lead.js';

describe('createLeadSchema', () => {
  it('accepts a minimal valid lead', () => {
    const result = createLeadSchema.safeParse({ firstName: 'Aarav' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('NEW');
      expect(result.data.source).toBe('MANUAL');
      expect(result.data.tags).toEqual([]);
    }
  });

  it('rejects missing firstName', () => {
    const result = createLeadSchema.safeParse({ email: 'a@b.com' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid email', () => {
    const result = createLeadSchema.safeParse({ firstName: 'Aarav', email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('rejects status WON (not in create enum)', () => {
    const result = createLeadSchema.safeParse({ firstName: 'Aarav', status: 'WON' });
    expect(result.success).toBe(false);
  });
});

describe('patchLeadSchema', () => {
  it('accepts a valid partial update', () => {
    const result = patchLeadSchema.safeParse({ firstName: 'Raja' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty body (refine guard)', () => {
    const result = patchLeadSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('At least one field must be provided');
    }
  });

  it('accepts status LOST', () => {
    const result = patchLeadSchema.safeParse({ status: 'LOST', lostReason: 'Competitor' });
    expect(result.success).toBe(true);
  });

  it('rejects status WON (excluded from patch)', () => {
    const result = patchLeadSchema.safeParse({ status: 'WON' });
    expect(result.success).toBe(false);
  });
});

describe('leadIdParamSchema', () => {
  it('accepts a valid UUID', () => {
    const result = leadIdParamSchema.safeParse({ id: '123e4567-e89b-12d3-a456-426614174000' });
    expect(result.success).toBe(true);
  });

  it('rejects a non-UUID string', () => {
    const result = leadIdParamSchema.safeParse({ id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });
});
