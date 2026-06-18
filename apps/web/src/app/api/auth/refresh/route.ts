// BFF refresh (AUTH-5.1). Reads the first-party session cookie, asks the API to rotate the
// refresh token, updates the session cookie with the rotated value, and returns the new
// access token. RSC/data fetches use this to obtain a valid access token without exposing
// the refresh token to client JS.

import { callApi } from '@/lib/server/bff';
import {
  parseCookieHeader,
  extractSetCookieValue,
  serializeCookie,
  SESSION_COOKIE_NAME,
} from '@/lib/server/cookies';
import { REFRESH_COOKIE_NAME } from '@/lib/server/constants';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const cookies = parseCookieHeader(request.headers.get('cookie'));
  const session = cookies[SESSION_COOKIE_NAME];

  if (!session) {
    return Response.json({ success: false }, { status: 401 });
  }

  const api = await callApi({ path: '/api/v1/auth/refresh', method: 'POST', refreshToken: session });
  const headers = new Headers({ 'Content-Type': 'application/json' });

  if (api.status === 200) {
    const rotated = extractSetCookieValue(api.setCookie, REFRESH_COOKIE_NAME);
    if (rotated) {
      headers.append(
        'Set-Cookie',
        serializeCookie(SESSION_COOKIE_NAME, rotated, {
          httpOnly: true,
          secure: process.env.NEXT_PUBLIC_APP_ENV === 'production',
          sameSite: 'Lax',
          path: '/',
          maxAge: 60 * 60 * 24 * 7,
        }),
      );
    }
  } else {
    // On failure, clear the stale session cookie.
    headers.append(
      'Set-Cookie',
      serializeCookie(SESSION_COOKIE_NAME, '', { path: '/', maxAge: 0 }),
    );
  }

  return new Response(JSON.stringify(api.body), { status: api.status, headers });
}
