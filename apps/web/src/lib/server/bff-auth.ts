// Shared BFF auth helper — server-only.
// Exchanges the session cookie (refresh token) for an access token.
// Used by all BFF route handlers that call authenticated API endpoints.

import { type NextRequest } from 'next/server';
import { callApi } from './bff';
import { parseCookieHeader, SESSION_COOKIE_NAME } from './cookies';

export async function resolveAccessToken(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  const cookies = parseCookieHeader(request.headers.get('cookie'));
  const session = cookies[SESSION_COOKIE_NAME];
  if (!session) return null;
  const refresh = await callApi({ path: '/api/v1/auth/refresh', method: 'POST', refreshToken: session });
  if (refresh.status !== 200) return null;
  return (refresh.body as { data?: { accessToken?: string } })?.data?.accessToken ?? null;
}
