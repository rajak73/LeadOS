import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

afterEach(() => vi.restoreAllMocks());

function req(url = 'http://localhost:3000/api/bff/notifications', cookie?: string): NextRequest {
  return new NextRequest(url, {
    method: 'GET',
    headers: cookie ? { cookie } : {},
  });
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

describe('BFF GET /bff/notifications', () => {
  it('returns 401 with no session cookie', async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('proxies notifications list on success', async () => {
    mockAuthedFetch(200, { success: true, data: { items: [], unreadCount: 0 } });
    const res = await GET(req('http://localhost:3000/api/bff/notifications?unread=true', 'leados_session=valid'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
  });
});
