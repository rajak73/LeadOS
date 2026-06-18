import { describe, it, expect } from 'vitest';
import { registerSchema, loginSchema, passwordSchema, resetPasswordSchema } from './auth.js';

describe('passwordSchema', () => {
  it('accepts a strong password', () => {
    expect(passwordSchema.safeParse('Str0ng!Pass').success).toBe(true);
  });
  it.each([
    ['short', 'Ab1!'],
    ['no uppercase', 'weak1!pass'],
    ['no lowercase', 'WEAK1!PASS'],
    ['no number', 'Weak!Pass'],
    ['no special', 'Weak1Pass'],
  ])('rejects %s', (_label, pw) => {
    expect(passwordSchema.safeParse(pw).success).toBe(false);
  });
});

describe('registerSchema', () => {
  it('accepts a valid registration and lowercases email', () => {
    const r = registerSchema.safeParse({
      email: 'Owner@Acme.COM',
      password: 'Str0ng!Pass',
      firstName: 'Arjun',
      lastName: 'Shah',
      organizationName: 'Acme',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe('owner@acme.com');
  });

  it('rejects a password containing the email local-part', () => {
    const r = registerSchema.safeParse({
      email: 'arjun@acme.com',
      password: 'Arjun123!',
      firstName: 'Arjun',
      lastName: 'Shah',
      organizationName: 'Acme',
    });
    expect(r.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('defaults rememberMe to false', () => {
    const r = loginSchema.parse({ email: 'a@b.com', password: 'x' });
    expect(r.rememberMe).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('requires a token and a strong password', () => {
    expect(resetPasswordSchema.safeParse({ token: 't', password: 'weak' }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token: 't', password: 'Str0ng!Pass' }).success).toBe(
      true,
    );
  });
});
