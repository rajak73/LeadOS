// AES-256-GCM field-level encryption for sensitive values (e.g. Instagram access tokens).
//
// Wire format: v{keyVersion}:{hex(iv)}:{hex(authTag)}:{hex(ciphertext)}
//
// Key is sourced from env.FIELD_ENCRYPTION_KEY (64-char hex = 32 bytes).
// keyVersion is stored with every ciphertext to allow key rotation without re-encrypting
// all existing rows immediately — decrypt checks keyVersion and selects the correct key.
// Current implementation only supports version 1; future versions add key lookup logic.

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const KEY_VERSION = 1;
const IV_BYTES = 12; // 96-bit IV — recommended for AES-GCM
const TAG_BYTES = 16; // 128-bit authentication tag

function getKey(): Buffer {
  return Buffer.from(env.FIELD_ENCRYPTION_KEY, 'hex');
}

/**
 * Encrypt a plaintext string.
 * Returns a wire-format string: v{n}:{hex(iv)}:{hex(tag)}:{hex(ct)}
 */
export function encryptField(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v${KEY_VERSION}:${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`;
}

/**
 * Decrypt a wire-format string produced by encryptField().
 * Throws on invalid format, wrong key version, or authentication failure.
 */
export function decryptField(ciphertext: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted field format');
  }
  // length === 4 is verified above; non-null assertions safe here (noUncheckedIndexedAccess).
  const versionTag = parts[0]!;
  const ivHex = parts[1]!;
  const tagHex = parts[2]!;
  const ctHex = parts[3]!;
  const version = Number(versionTag.slice(1));
  if (versionTag[0] !== 'v' || !Number.isInteger(version) || version !== KEY_VERSION) {
    throw new Error(`Unsupported key version: ${versionTag}`);
  }
  const key = getKey();
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const ct = Buffer.from(ctHex, 'hex');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error('Malformed encrypted field: invalid IV or tag length');
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
