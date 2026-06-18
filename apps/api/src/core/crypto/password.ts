// Password hashing (doc 19 §19.2): the bcrypt algorithm at the configured cost factor (12
// in prod), via the pure-JS `bcryptjs` implementation. bcryptjs produces standard
// `$2a$/$2b$` bcrypt hashes — algorithm and cost are unchanged from the blueprint; the
// library was chosen over the native `bcrypt` package to avoid a HIGH advisory in its build
// toolchain (@mapbox/node-pre-gyp > tar). Verification is timing-safe.

import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, env.BCRYPT_COST);
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}
