import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('produces a bcrypt hash that verifies the original password', async () => {
    const hash = await hashPassword('Str0ng!Pass');
    expect(hash).toMatch(/^\$2[aby]\$/); // bcrypt hash prefix
    expect(await verifyPassword('Str0ng!Pass', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('Str0ng!Pass');
    expect(await verifyPassword('Wr0ng!Pass', hash)).toBe(false);
  });

  it('produces different hashes for the same input (salted)', async () => {
    const a = await hashPassword('Str0ng!Pass');
    const b = await hashPassword('Str0ng!Pass');
    expect(a).not.toBe(b);
  });
});
