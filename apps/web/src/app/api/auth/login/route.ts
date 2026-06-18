// BFF login (AUTH-5.1). The browser posts credentials here (same-origin); the BFF calls the
// API, captures the API's rotated refresh cookie, stores it as a FIRST-PARTY HttpOnly
// session cookie on the web origin, and returns the access token + user to the client
// (kept in memory). The refresh token never reaches client JS.

import { callApi } from '@/lib/server/bff';
import { extractSetCookieValue, serializeCookie, SESSION_COOKIE_NAME } from '@/lib/server/cookies';
import { REFRESH_COOKIE_NAME } from '@/lib/server/constants';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const credentials = await request.json().catch(() => ({}));
  const api = await callApi({ path: '/api/v1/auth/login', method: 'POST', body: credentials });

  const headers = new Headers({ 'Content-Type': 'application/json' });

  if (api.status === 200) {
    const refresh = extractSetCookieValue(api.setCookie, REFRESH_COOKIE_NAME);
    if (refresh) {
      headers.append(
        'Set-Cookie',
        serializeCookie(SESSION_COOKIE_NAME, refresh, {
          httpOnly: true,
          secure: process.env.NEXT_PUBLIC_APP_ENV === 'production',
          sameSite: 'Lax',
          path: '/',
          maxAge: 60 * 60 * 24 * 7,
        }),
      );
    }
  }

  return new Response(JSON.stringify(api.body), { status: api.status, headers });
}
