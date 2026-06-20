import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route.js';

afterEach(() => vi.restoreAllMocks());

function req(cookie?: string, url = 'http://localhost:3000/api/bff/deals/forecast'): NextRequest {
  return new NextRequest(url, {
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

describe('BFF GET /bff/deals/forecast', () => {
  it('returns 401 with no session cookie', async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('returns the forecast data when authenticated', async () => {
    const forecast = [{ stageId: 's1', weightedValue: '12000' }];
    mockAuthedFetch(200, { success: true, data: forecast });
    const res = await GET(req('leados_session=valid'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: typeof forecast };
    expect(body.data).toEqual(forecast);
  });

  it('forwards pipelineId query param to the API', async () => {
    mockAuthedFetch(200, { success: true, data: [] });
    const url = 'http://localhost:3000/api/bff/deals/forecast?pipelineId=pipe-1';
    await GET(req('leados_session=valid', url));
    const calls = vi.mocked(fetch).mock.calls;
    const apiUrl = calls[1]?.[0] as string;
    expect(apiUrl).toContain('pipelineId=pipe-1');
  });
});
