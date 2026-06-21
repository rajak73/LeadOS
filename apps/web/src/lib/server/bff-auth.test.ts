// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveAccessToken } from './bff-auth';

vi.mock('./bff', () => ({ callApi: vi.fn() }));
vi.mock('./cookies', () => ({
  parseCookieHeader: vi.fn(),
  SESSION_COOKIE_NAME: 'leados_session',
}));

import { callApi } from './bff';
import { parseCookieHeader } from './cookies';

const mockCallApi = vi.mocked(callApi);
const mockParseCookieHeader = vi.mocked(parseCookieHeader);

function makeRequest(cookieHeader: string | null) {
  return { headers: { get: () => cookieHeader } } as unknown as import('next/server').NextRequest;
}

beforeEach(() => vi.clearAllMocks());

describe('resolveAccessToken', () => {
  it('returns null when no cookie header', async () => {
    mockParseCookieHeader.mockReturnValue({});
    const result = await resolveAccessToken(makeRequest(null));
    expect(result).toBeNull();
    expect(mockCallApi).not.toHaveBeenCalled();
  });

  it('returns null when session cookie missing', async () => {
    mockParseCookieHeader.mockReturnValue({});
    const result = await resolveAccessToken(makeRequest('other=value'));
    expect(result).toBeNull();
  });

  it('returns null when refresh endpoint returns non-200', async () => {
    mockParseCookieHeader.mockReturnValue({ leados_session: 'refresh-token' });
    mockCallApi.mockResolvedValue({ status: 401, body: {}, setCookie: null });
    const result = await resolveAccessToken(makeRequest('leados_session=refresh-token'));
    expect(result).toBeNull();
  });

  it('returns access token on successful refresh', async () => {
    mockParseCookieHeader.mockReturnValue({ leados_session: 'refresh-token' });
    mockCallApi.mockResolvedValue({
      status: 200,
      body: { data: { accessToken: 'access-token-abc' } },
      setCookie: null,
    });
    const result = await resolveAccessToken(makeRequest('leados_session=refresh-token'));
    expect(result).toBe('access-token-abc');
    expect(mockCallApi).toHaveBeenCalledWith({
      path: '/api/v1/auth/refresh',
      method: 'POST',
      refreshToken: 'refresh-token',
    });
  });

  it('returns null when accessToken field missing from response', async () => {
    mockParseCookieHeader.mockReturnValue({ leados_session: 'rt' });
    mockCallApi.mockResolvedValue({ status: 200, body: { data: {} }, setCookie: null });
    const result = await resolveAccessToken(makeRequest('leados_session=rt'));
    expect(result).toBeNull();
  });
});
