import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route.js';

afterEach(() => vi.restoreAllMocks());

const DEAL_ID = 'deal-uuid-act';
const params = Promise.resolve({ id: DEAL_ID });

function req(cookie?: string, url = `http://localhost:3000/api/bff/deals/${DEAL_ID}/activities`): NextRequest {
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

describe('BFF GET /bff/deals/:id/activities', () => {
  it('returns 401 with no session cookie', async () => {
    const res = await GET(req(), { params });
    expect(res.status).toBe(401);
  });

  it('returns the activity list when authenticated', async () => {
    const activities = [{ id: 'a1', type: 'DEAL_CREATED' }];
    mockAuthedFetch(200, { success: true, data: activities });
    const res = await GET(req('leados_session=valid'), { params });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: typeof activities };
    expect(body.data).toEqual(activities);
  });

  it('forwards page and limit query params to the API', async () => {
    mockAuthedFetch(200, { success: true, data: [] });
    const url = `http://localhost:3000/api/bff/deals/${DEAL_ID}/activities?page=2&limit=10`;
    await GET(req('leados_session=valid', url), { params });
    const calls = vi.mocked(fetch).mock.calls;
    const apiUrl = calls[1]?.[0] as string;
    expect(apiUrl).toContain('page=2');
    expect(apiUrl).toContain('limit=10');
  });
});
