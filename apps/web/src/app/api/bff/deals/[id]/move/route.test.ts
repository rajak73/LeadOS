import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route.js';

afterEach(() => vi.restoreAllMocks());

const DEAL_ID = 'deal-uuid-move';
const params = Promise.resolve({ id: DEAL_ID });

function req(cookie?: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/bff/deals/${DEAL_ID}/move`, {
    method: 'POST',
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

describe('BFF POST /bff/deals/:id/move', () => {
  it('returns 401 with no session cookie', async () => {
    const res = await POST(req(), { params });
    expect(res.status).toBe(401);
  });

  it('proxies the move call and returns the API response when authenticated', async () => {
    const deal = { id: DEAL_ID, stageId: 'stage-2' };
    mockAuthedFetch(200, { success: true, data: deal });
    const r = new NextRequest(`http://localhost:3000/api/bff/deals/${DEAL_ID}/move`, {
      method: 'POST',
      headers: { cookie: 'leados_session=valid', 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageId: 'stage-2' }),
    });
    const res = await POST(r, { params });
    expect(res.status).toBe(200);
  });
});
