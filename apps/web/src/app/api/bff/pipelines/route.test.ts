import { describe, it, expect, vi, afterEach } from 'vitest';
import { GET } from './route.js';

afterEach(() => vi.restoreAllMocks());

function req(cookie?: string): Request {
  return new Request('http://localhost:3000/api/bff/pipelines', {
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

describe('BFF GET /bff/pipelines', () => {
  it('returns 401 when there is no session cookie', async () => {
    const res = await GET(req() as never);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(false);
  });

  it('returns 401 when the refresh token exchange fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ success: false }), { status: 401 }),
      ),
    );
    const res = await GET(req('leados_session=bad-token') as never);
    expect(res.status).toBe(401);
  });

  it('proxies the pipeline list from the API when authenticated', async () => {
    const pipelines = [{ id: 'p1', name: 'Sales' }];
    mockAuthedFetch(200, { success: true, data: pipelines });
    const res = await GET(req('leados_session=valid-token') as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: typeof pipelines };
    expect(body.data).toEqual(pipelines);
  });
});
