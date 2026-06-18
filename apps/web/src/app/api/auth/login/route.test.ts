import { describe, it, expect, vi, afterEach } from 'vitest';
import { POST } from './route.js';

afterEach(() => vi.restoreAllMocks());

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('BFF login route', () => {
  it('on success: sets a first-party session cookie and returns the access token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const headers = new Headers({ 'Content-Type': 'application/json' });
        headers.append('set-cookie', 'leados_rt=upstream-refresh; Path=/api/v1/auth; HttpOnly');
        return new Response(
          JSON.stringify({ success: true, data: { accessToken: 'acc.tok', user: { id: 'u1' } } }),
          { status: 200, headers },
        );
      }),
    );

    const res = await POST(jsonRequest({ email: 'a@b.com', password: 'x' }));
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('leados_session=upstream-refresh');
    expect(setCookie).toContain('HttpOnly');
    const body = (await res.json()) as { data: { accessToken: string } };
    expect(body.data.accessToken).toBe('acc.tok');
  });

  it('on failure: forwards status and sets no session cookie', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ success: false, error: { code: 'UNAUTHORIZED' } }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const res = await POST(jsonRequest({ email: 'a@b.com', password: 'wrong' }));
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});
