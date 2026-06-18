import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { signAccessToken, verifyAccessToken } from './jwt.js';

const claims = { sub: 'user-1', orgId: 'org-1', role: 'OWNER', isSuperAdmin: false };

describe('access token', () => {
  it('signs and verifies a round trip', () => {
    const token = signAccessToken(claims);
    const decoded = verifyAccessToken(token);
    expect(decoded.sub).toBe('user-1');
    expect(decoded.orgId).toBe('org-1');
    expect(decoded.role).toBe('OWNER');
    expect(decoded.exp).toBeGreaterThan(decoded.iat);
  });

  it('rejects a tampered token', () => {
    const token = signAccessToken(claims);
    const tampered = token.slice(0, -2) + (token.slice(-2) === 'aa' ? 'bb' : 'aa');
    expect(() => verifyAccessToken(tampered)).toThrow();
  });

  it('rejects a token signed with a different secret', () => {
    const forged = jwt.sign(claims, 'someone-elses-secret', { algorithm: 'HS256' });
    expect(() => verifyAccessToken(forged)).toThrow();
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign(claims, 'dev-access-secret-change-me', {
      algorithm: 'HS256',
      expiresIn: -10,
    });
    expect(() => verifyAccessToken(expired)).toThrow();
  });
});
