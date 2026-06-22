import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PUT } from './route';

afterEach(() => vi.restoreAllMocks());

function req(method: 'GET' | 'PUT', cookie?: string): NextRequest {
  const init = {
    method,
    headers: cookie ? { cookie } : {},
    ...(method === 'PUT' ? { body: JSON.stringify({ inApp: true }) } : {}),
  };

  return new NextRequest(
    'http://localhost:3000/api/bff/notifications/preferences',
    init,
  );
}

function mockAuthedFetch(apiStatus: number, apiBody: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { accessToken: 'tok' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(apiBody), {
          status: apiStatus,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
  );
}

describe('BFF /bff/notifications/preferences', () => {
  it('GET returns 401 with no session cookie', async () => {
    const res = await GET(req('GET'));
    expect(res.status).toBe(401);
  });

  it('GET proxies preferences on success', async () => {
    mockAuthedFetch(200, { success: true, data: [] });
    const res = await GET(req('GET', 'leados_session=valid'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
  });

  it('PUT returns 401 with no session cookie', async () => {
    const res = await PUT(req('PUT'));
    expect(res.status).toBe(401);
  });

  it('PUT proxies update preferences on success', async () => {
    mockAuthedFetch(200, { success: true });
    const res = await PUT(req('PUT', 'leados_session=valid'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
  });
});
