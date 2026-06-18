import { describe, it, expect, vi, afterEach } from 'vitest';
import { POST } from './route.js';

afterEach(() => vi.restoreAllMocks());

function req(cookie?: string): Request {
  return new Request('http://localhost:3000/api/auth/refresh', {
    method: 'POST',
    headers: cookie ? { cookie } : {},
  });
}

describe('BFF refresh route', () => {
  it('401s when there is no session cookie', async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
  });

  it('rotates the session cookie and returns the new access token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const headers = new Headers({ 'Content-Type': 'application/json' });
        headers.append('set-cookie', 'leados_rt=rotated-refresh; Path=/api/v1/auth; HttpOnly');
        return new Response(JSON.stringify({ success: true, data: { accessToken: 'new.acc' } }), {
          status: 200,
          headers,
        });
      }),
    );

    const res = await POST(req('leados_session=old-refresh'));
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie') ?? '').toContain('leados_session=rotated-refresh');
    const body = (await res.json()) as { data: { accessToken: string } };
    expect(body.data.accessToken).toBe('new.acc');
  });

  it('clears the session cookie when the API rejects the refresh', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ success: false }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const res = await POST(req('leados_session=stale'));
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie') ?? '').toContain('Max-Age=0');
  });
});
