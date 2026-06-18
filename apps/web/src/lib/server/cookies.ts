// Server-only cookie helpers for the BFF (FINAL_ARCHITECTURE §3.3). The BFF holds the
// refresh token in a first-party HttpOnly cookie on the web origin; the access token is
// returned to the client (kept in memory). Pure string helpers → fully unit-testable.

export const SESSION_COOKIE_NAME = 'leados_session';

export function parseCookieHeader(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

/** Extract a cookie value from an upstream Set-Cookie header line. */
export function extractSetCookieValue(setCookie: string | null, name: string): string | null {
  if (!setCookie) return null;
  // A Set-Cookie header may contain multiple cookies joined by ", " — scan defensively.
  const segments = setCookie.split(/,(?=[^;]+?=)/);
  for (const seg of segments) {
    const first = seg.split(';')[0]?.trim() ?? '';
    const idx = first.indexOf('=');
    if (idx === -1) continue;
    if (first.slice(0, idx).trim() === name) return first.slice(idx + 1).trim();
  }
  return null;
}

export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  path?: string;
  maxAge?: number; // seconds
  expires?: Date;
  domain?: string;
}

export function serializeCookie(name: string, value: string, opts: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(opts.maxAge)}`);
  if (opts.expires) parts.push(`Expires=${opts.expires.toUTCString()}`);
  parts.push(`Path=${opts.path ?? '/'}`);
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.secure) parts.push('Secure');
  parts.push(`SameSite=${opts.sameSite ?? 'Lax'}`);
  return parts.join('; ');
}
