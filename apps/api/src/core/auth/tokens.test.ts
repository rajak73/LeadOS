import { describe, it, expect } from 'vitest';
import { generateToken, hashRefreshToken, hashVerificationToken } from './tokens.js';

describe('token generation', () => {
  it('generates unique high-entropy tokens', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).toHaveLength(96); // 48 bytes hex
    expect(a).not.toBe(b);
  });
});

describe('token hashing', () => {
  it('refresh hash is deterministic and not the raw token', () => {
    const t = generateToken();
    expect(hashRefreshToken(t)).toBe(hashRefreshToken(t));
    expect(hashRefreshToken(t)).not.toBe(t);
    expect(hashRefreshToken(t)).toHaveLength(64); // sha256 hex
  });

  it('verification hash is deterministic sha256', () => {
    const t = generateToken(32);
    expect(hashVerificationToken(t)).toBe(hashVerificationToken(t));
    expect(hashVerificationToken(t)).toHaveLength(64);
  });

  it('different tokens hash differently', () => {
    expect(hashRefreshToken('a')).not.toBe(hashRefreshToken('b'));
  });
});
