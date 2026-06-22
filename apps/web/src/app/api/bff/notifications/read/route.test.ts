import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

afterEach(() => vi.restoreAllMocks());

function req(cookie?: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/bff/notifications/read', {
    method: 'POST',
    headers: cookie ? { cookie } : {},
    body: JSON.stringify({ ids: ['n1'] }),
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

describe('BFF POST /bff/notifications/read', () => {
  it('returns 401 with no session cookie', async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
  });

  it('proxies mark-read on success', async () => {
    mockAuthedFetch(200, { success: true });
    const res = await POST(req('leados_session=valid'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
  });
});
