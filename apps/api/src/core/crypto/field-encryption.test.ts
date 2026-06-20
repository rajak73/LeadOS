import { beforeAll, describe, expect, it } from 'vitest';

// Set deterministic test key before importing the module under test.
// Must be exactly 64 hex chars (32 bytes for AES-256).
beforeAll(() => {
  process.env.FIELD_ENCRYPTION_KEY = 'a'.repeat(64);
});

// Dynamic import after env is set — ESM modules cache on first load.
const { encryptField, decryptField } = await import('./field-encryption.js');

describe('field-encryption', () => {
  it('roundtrips a short plaintext', () => {
    const plain = 'hello-world';
    expect(decryptField(encryptField(plain))).toBe(plain);
  });

  it('roundtrips a long plaintext (IG access token shape)', () => {
    const token = 'IGQ' + 'A'.repeat(200);
    expect(decryptField(encryptField(token))).toBe(token);
  });

  it('produces different ciphertexts for the same plaintext (random IV)', () => {
    const plain = 'same-input';
    const c1 = encryptField(plain);
    const c2 = encryptField(plain);
    expect(c1).not.toBe(c2);
    expect(decryptField(c1)).toBe(plain);
    expect(decryptField(c2)).toBe(plain);
  });

  it('wire format is v1:{12-byte-iv-hex}:{16-byte-tag-hex}:{ciphertext-hex}', () => {
    const result = encryptField('test');
    const parts = result.split(':');
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe('v1');
    expect(parts[1]).toHaveLength(24); // 12 bytes * 2 hex chars
    expect(parts[2]).toHaveLength(32); // 16 bytes * 2 hex chars
  });

  it('throws on tampered ciphertext (auth tag mismatch)', () => {
    const enc = encryptField('sensitive');
    const parts = enc.split(':');
    parts[3] = '00'.repeat((parts[3]?.length ?? 0) / 2); // zero out ciphertext
    expect(() => decryptField(parts.join(':'))).toThrow();
  });

  it('throws on invalid wire format', () => {
    expect(() => decryptField('not-encrypted')).toThrow('Invalid encrypted field format');
  });
});
