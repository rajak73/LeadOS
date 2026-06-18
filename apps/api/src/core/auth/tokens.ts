// Opaque token generation + hashing for refresh tokens and verification/reset tokens
// (doc 19 §19.1). Tokens are cryptographically random; only their SHA-256 hash (peppered
// for refresh tokens) is stored at rest. The raw token is returned to the caller once.

import { randomBytes, createHash } from 'node:crypto';
import { env } from '../config/env.js';

/** Generate a random opaque token (hex). 48 bytes for refresh, 32 for verification. */
export function generateToken(bytes = 48): string {
  return randomBytes(bytes).toString('hex');
}

/** Peppered SHA-256 hash for refresh tokens (stored in refresh_tokens.tokenHash). */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(`${token}${env.JWT_REFRESH_PEPPER}`).digest('hex');
}

/** SHA-256 hash for verification/reset tokens (stored hashed at rest, doc 19). */
export function hashVerificationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
