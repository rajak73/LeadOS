import { describe, it, expect } from 'vitest';
import {
  parseCookieHeader,
  extractSetCookieValue,
  serializeCookie,
  SESSION_COOKIE_NAME,
} from './cookies.js';

describe('parseCookieHeader', () => {
  it('parses a cookie header into a map', () => {
    expect(parseCookieHeader('a=1; leados_session=abc.def; b=2')).toMatchObject({
      a: '1',
      leados_session: 'abc.def',
      b: '2',
    });
  });
  it('returns empty for nullish input', () => {
    expect(parseCookieHeader(undefined)).toEqual({});
    expect(parseCookieHeader(null)).toEqual({});
  });
});

describe('extractSetCookieValue', () => {
  it('extracts a value from a Set-Cookie line', () => {
    const sc = 'leados_rt=tok123; Path=/api/v1/auth; HttpOnly; SameSite=Strict';
    expect(extractSetCookieValue(sc, 'leados_rt')).toBe('tok123');
  });
  it('returns null when the cookie is absent', () => {
    expect(extractSetCookieValue('other=x; Path=/', 'leados_rt')).toBeNull();
    expect(extractSetCookieValue(null, 'leados_rt')).toBeNull();
  });
});

describe('serializeCookie', () => {
  it('serializes HttpOnly secure session cookies', () => {
    const out = serializeCookie(SESSION_COOKIE_NAME, 'v', {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      maxAge: 100,
    });
    expect(out).toContain('leados_session=v');
    expect(out).toContain('HttpOnly');
    expect(out).toContain('Secure');
    expect(out).toContain('SameSite=Lax');
    expect(out).toContain('Max-Age=100');
  });
  it('clears a cookie with maxAge 0', () => {
    expect(serializeCookie(SESSION_COOKIE_NAME, '', { maxAge: 0 })).toContain('Max-Age=0');
  });
});
