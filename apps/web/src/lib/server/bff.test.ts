import { describe, it, expect, vi, afterEach } from 'vitest';
import { callApi } from './bff.js';

afterEach(() => vi.restoreAllMocks());

function mockFetch(status: number, body: unknown, setCookie?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (setCookie) headers['set-cookie'] = setCookie;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers })),
  );
}

describe('callApi', () => {
  it('makes a GET request and returns status, body, setCookie', async () => {
    mockFetch(200, { success: true, data: [] }, 'leados_rt=abc; HttpOnly');
    const result = await callApi({ path: '/api/v1/test' });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ success: true, data: [] });
    expect(result.setCookie).toContain('leados_rt=abc');
    const [url, init] = (vi.mocked(fetch).mock.calls[0] ?? []) as [string, RequestInit];
    expect(url).toContain('/api/v1/test');
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('1');
    expect(init.method).toBe('GET');
  });

  it('sets Authorization header when accessToken is provided', async () => {
    mockFetch(200, {});
    await callApi({ path: '/api/v1/test', accessToken: 'bearer-tok' });
    const [, init] = (vi.mocked(fetch).mock.calls[0] ?? []) as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer bearer-tok');
  });

  it('sets Cookie header when refreshToken is provided', async () => {
    mockFetch(200, {});
    await callApi({ path: '/api/v1/auth/refresh', method: 'POST', refreshToken: 'rt-val' });
    const [, init] = (vi.mocked(fetch).mock.calls[0] ?? []) as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Cookie']).toContain('rt-val');
    expect(init.method).toBe('POST');
  });

  it('serialises body as JSON when body is provided', async () => {
    mockFetch(201, { success: true });
    await callApi({ path: '/api/v1/deals', method: 'POST', body: { title: 'Deal A' } });
    const [, init] = (vi.mocked(fetch).mock.calls[0] ?? []) as [string, RequestInit];
    expect(init.body).toBe(JSON.stringify({ title: 'Deal A' }));
  });

  it('returns body: null when the response is not valid JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not-json', { status: 200 })),
    );
    const result = await callApi({ path: '/api/v1/test' });
    expect(result.body).toBeNull();
  });

  it('returns setCookie: null when no Set-Cookie header is present', async () => {
    mockFetch(200, {});
    const result = await callApi({ path: '/api/v1/test' });
    expect(result.setCookie).toBeNull();
  });
});
