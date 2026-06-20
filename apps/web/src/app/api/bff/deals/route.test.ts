import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route.js';

afterEach(() => vi.restoreAllMocks());

function req(method: string, cookie?: string, url = 'http://localhost:3000/api/bff/deals'): NextRequest {
  return new NextRequest(url, {
    method,
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

describe('BFF GET /bff/deals', () => {
  it('returns 401 with no session cookie', async () => {
    const res = await GET(req('GET'));
    expect(res.status).toBe(401);
  });

  it('proxies the deals list when authenticated', async () => {
    const deals = [{ id: 'd1', title: 'Alpha' }];
    mockAuthedFetch(200, { success: true, data: deals });
    const res = await GET(req('GET', 'leados_session=valid'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: typeof deals };
    expect(body.data).toEqual(deals);
  });

  it('forwards query string to the API', async () => {
    mockAuthedFetch(200, { success: true, data: [] });
    await GET(req('GET', 'leados_session=valid', 'http://localhost:3000/api/bff/deals?pipelineId=p1'));
    const calls = vi.mocked(fetch).mock.calls;
    const apiUrl = calls[1]?.[0] as string;
    expect(apiUrl).toContain('pipelineId=p1');
  });
});

describe('BFF POST /bff/deals', () => {
  it('returns 401 with no session cookie', async () => {
    const res = await POST(req('POST'));
    expect(res.status).toBe(401);
  });

  it('creates a deal and returns the API response when authenticated', async () => {
    const created = { id: 'd2', title: 'Beta' };
    mockAuthedFetch(201, { success: true, data: created });
    const r = new NextRequest('http://localhost:3000/api/bff/deals', {
      method: 'POST',
      headers: { cookie: 'leados_session=valid', 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Beta' }),
    });
    const res = await POST(r);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: typeof created };
    expect(body.data).toEqual(created);
  });
});
