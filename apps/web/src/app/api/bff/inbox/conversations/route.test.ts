import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock bff helpers before importing the route
vi.mock('@/lib/server/bff', () => ({ callApi: vi.fn() }));
vi.mock('@/lib/server/cookies', () => ({
  parseCookieHeader: vi.fn(),
  SESSION_COOKIE_NAME: 'session',
}));

import { GET } from './route';
import { callApi } from '@/lib/server/bff';
import { parseCookieHeader } from '@/lib/server/cookies';
import { NextRequest } from 'next/server';

const mockCallApi = vi.mocked(callApi);
const mockParseCookie = vi.mocked(parseCookieHeader);

function makeRequest(url = 'http://localhost/api/bff/inbox/conversations') {
  return new NextRequest(url, { headers: { cookie: 'session=tok' } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockParseCookie.mockReturnValue({ session: 'refresh-token' });
  mockCallApi.mockImplementation(async ({ path }) => {
    if (path === '/api/v1/auth/refresh')
      return { status: 200, body: { data: { accessToken: 'access-token' } }, setCookie: null };
    return { status: 200, body: { success: true, data: { items: [], nextCursor: null } }, setCookie: null };
  });
});

describe('GET /api/bff/inbox/conversations', () => {
  it('returns 401 when no session cookie', async () => {
    mockParseCookie.mockReturnValue({});
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 401 when refresh call fails', async () => {
    mockCallApi.mockResolvedValueOnce({ status: 401, body: {}, setCookie: null });
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('proxies conversations list on success', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(true);
  });

  it('passes query params to upstream', async () => {
    await GET(makeRequest('http://localhost/api/bff/inbox/conversations?status=OPEN'));
    const proxyCalls = mockCallApi.mock.calls.filter((c) => !c[0].path.includes('auth'));
    expect(proxyCalls[0]?.[0].path).toContain('status=OPEN');
  });
});
