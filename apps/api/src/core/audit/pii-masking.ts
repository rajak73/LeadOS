// AUD-2 — PII masking for audit before/after snapshots (FINAL_ARCHITECTURE: email/phone are
// stored plaintext+indexable on the domain tables, but MASKED in logs and audit snapshots).
//
// Pure + recursive: walks objects/arrays and masks values whose KEY looks like an email or
// phone field. Non-PII values are preserved so the snapshot stays useful.

const EMAIL_KEY = /email/i;
const PHONE_KEY = /phone/i;

export function maskEmail(value: string): string {
  const at = value.indexOf('@');
  if (at <= 0) return '***';
  const first = value[0] ?? '';
  return `${first}***${value.slice(at)}`;
}

export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 4 ? `***${digits.slice(-4)}` : '***';
}

export function maskPii(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => maskPii(v));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (typeof val === 'string' && EMAIL_KEY.test(key)) {
        out[key] = maskEmail(val);
      } else if (typeof val === 'string' && PHONE_KEY.test(key)) {
        out[key] = maskPhone(val);
      } else {
        out[key] = maskPii(val);
      }
    }
    return out;
  }
  return value;
}
