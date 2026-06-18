// JWT access tokens (doc 19 §19.1). HS256, short-lived (15 min default), carry the tenant
// claim { sub: userId, orgId, role, isSuperAdmin }. The refresh token is NOT a JWT — it is
// an opaque token handled in tokens.ts.

import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface AccessTokenClaims {
  sub: string; // userId
  orgId: string;
  role: string;
  isSuperAdmin: boolean;
}

export function signAccessToken(claims: AccessTokenClaims): string {
  const options: SignOptions = {
    algorithm: 'HS256',
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  };
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, options);
}

export interface VerifiedAccessToken extends AccessTokenClaims {
  iat: number;
  exp: number;
}

/** Verifies signature + expiry. Throws on invalid/expired tokens. */
export function verifyAccessToken(token: string): VerifiedAccessToken {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
  if (typeof decoded === 'string') {
    throw new Error('Unexpected token payload');
  }
  return decoded as VerifiedAccessToken;
}
