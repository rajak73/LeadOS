import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PATCH } from './route.js';

afterEach(() => vi.restoreAllMocks());

const DEAL_ID = 'deal-uuid-1234';
const params = Promise.resolve({ id: DEAL_ID });

function req(method: string, cookie?: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/bff/deals/${DEAL_ID}`, {
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

describe('BFF GET /bff/deals/:id', () => {
  it('returns 401 with no session cookie', async () => {
    const res = await GET(req('GET'), { params });
    expect(res.status).toBe(401);
  });

  it('returns the deal from the API when authenticated', async () => {
    const deal = { id: DEAL_ID, title: 'Deal One' };
    mockAuthedFetch(200, { success: true, data: deal });
    const res = await GET(req('GET', 'leados_session=valid'), { params });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: typeof deal };
    expect(body.data).toEqual(deal);
  });
});

describe('BFF PATCH /bff/deals/:id', () => {
  it('returns 401 with no session cookie', async () => {
    const res = await PATCH(req('PATCH'), { params });
    expect(res.status).toBe(401);
  });

  it('patches the deal and returns the API response when authenticated', async () => {
    const updated = { id: DEAL_ID, title: 'Updated Deal' };
    mockAuthedFetch(200, { success: true, data: updated });
    const r = new NextRequest(`http://localhost:3000/api/bff/deals/${DEAL_ID}`, {
      method: 'PATCH',
      headers: { cookie: 'leados_session=valid', 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated Deal' }),
    });
    const res = await PATCH(r, { params });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: typeof updated };
    expect(body.data).toEqual(updated);
  });
});
