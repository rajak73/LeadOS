// Unit tests for PII masking (no DB).

import { describe, it, expect } from 'vitest';
import { maskPii, maskEmail, maskPhone } from './pii-masking.js';

describe('maskEmail / maskPhone', () => {
  it('masks an email keeping the first char + domain', () => {
    expect(maskEmail('john@example.com')).toBe('j***@example.com');
  });
  it('masks a malformed email fully', () => {
    expect(maskEmail('not-an-email')).toBe('***');
  });
  it('masks a phone keeping the last 4 digits', () => {
    expect(maskPhone('+1-555-123-4567')).toBe('***4567');
    expect(maskPhone('12')).toBe('***');
  });
});

describe('maskPii', () => {
  it('masks email/phone fields by key (case-insensitive) and preserves the rest', () => {
    const out = maskPii({
      email: 'jane@acme.io',
      phoneNumber: '555-987-6543',
      name: 'Jane',
      roleId: 'r-1',
    });
    expect(out).toEqual({
      email: 'j***@acme.io',
      phoneNumber: '***6543',
      name: 'Jane',
      roleId: 'r-1',
    });
  });

  it('recurses into nested objects and arrays', () => {
    const out = maskPii({
      user: { contactEmail: 'a@b.com', tags: [{ email: 'c@d.com' }] },
      count: 2,
    });
    expect(out).toEqual({
      user: { contactEmail: 'a***@b.com', tags: [{ email: 'c***@d.com' }] },
      count: 2,
    });
  });

  it('passes through primitives unchanged', () => {
    expect(maskPii('hello')).toBe('hello');
    expect(maskPii(42)).toBe(42);
    expect(maskPii(null)).toBeNull();
  });
});
