import { describe, it, expect } from 'vitest';
import { createContactSchema, patchContactSchema, contactIdParamSchema } from './contact.js';

describe('createContactSchema', () => {
  it('accepts a minimal valid contact', () => {
    const result = createContactSchema.safeParse({ firstName: 'Priya' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toEqual([]);
      expect(result.data.firstName).toBe('Priya');
    }
  });

  it('accepts a fully populated contact', () => {
    const result = createContactSchema.safeParse({
      firstName: 'Priya',
      lastName: 'Sharma',
      email: 'priya@example.com',
      phone: '+919876543210',
      company: 'Acme',
      jobTitle: 'CTO',
      address: { city: 'Hyderabad', country: 'India' },
      tags: ['vip'],
      assignedToId: '123e4567-e89b-12d3-a456-426614174000',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing firstName', () => {
    const result = createContactSchema.safeParse({ email: 'a@b.com' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid email', () => {
    const result = createContactSchema.safeParse({ firstName: 'Priya', email: 'not-an-email' });
    expect(result.success).toBe(false);
  });
});

describe('patchContactSchema', () => {
  it('accepts a valid partial update', () => {
    const result = patchContactSchema.safeParse({ company: 'NewCo' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty body (refine guard)', () => {
    const result = patchContactSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('At least one field must be provided');
    }
  });

  it('accepts a partial address update', () => {
    const result = patchContactSchema.safeParse({ address: { city: 'Mumbai' } });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid email in patch', () => {
    const result = patchContactSchema.safeParse({ email: 'bad-email' });
    expect(result.success).toBe(false);
  });
});

describe('contactIdParamSchema', () => {
  it('accepts a valid UUID', () => {
    const result = contactIdParamSchema.safeParse({ id: '123e4567-e89b-12d3-a456-426614174000' });
    expect(result.success).toBe(true);
  });

  it('rejects a non-UUID string', () => {
    const result = contactIdParamSchema.safeParse({ id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });
});
