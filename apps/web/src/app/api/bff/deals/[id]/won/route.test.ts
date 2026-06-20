import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route.js';

afterEach(() => vi.restoreAllMocks());

const DEAL_ID = 'deal-uuid-won';
const params = Promise.resolve({ id: DEAL_ID });

function req(cookie?: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/bff/deals/${DEAL_ID}/won`, {
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

describe('BFF POST /bff/deals/:id/won', () => {
  it('returns 401 with no session cookie', async () => {
    const res = await POST(req(), { params });
    expect(res.status).toBe(401);
  });

  it('marks the deal won and returns the API response when authenticated', async () => {
    const deal = { id: DEAL_ID, status: 'WON' };
    mockAuthedFetch(200, { success: true, data: deal });
    const res = await POST(req('leados_session=valid'), { params });
    expect(res.status).toBe(200);
  });
});
