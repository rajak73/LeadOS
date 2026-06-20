import { describe, it, expect, vi, afterEach } from 'vitest';
import { POST } from './route.js';

afterEach(() => vi.restoreAllMocks());

function req(cookie?: string): Request {
  return new Request('http://localhost:3000/api/auth/logout', {
    method: 'POST',
    headers: cookie ? { cookie } : {},
  });
}

describe('BFF logout route', () => {
  it('clears the session cookie and returns 200 even with no session', async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('leados_session=');
    expect(setCookie).toContain('Max-Age=0');
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
  });

  it('calls the API to revoke the session then clears the cookie', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })),
    );
    const res = await POST(req('leados_session=old-token'));
    expect(res.status).toBe(200);
    expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('Max-Age=0');
  });

  it('still returns 200 and clears cookie even if the upstream revoke call fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => { throw new Error('network error'); }),
    );
    const res = await POST(req('leados_session=stale-token'));
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('Max-Age=0');
  });
});
