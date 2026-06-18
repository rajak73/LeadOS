// BFF logout (AUTH-5.1). Tells the API to revoke the session, then clears the first-party
// session cookie. Idempotent.

import { callApi } from '@/lib/server/bff';
import { parseCookieHeader, serializeCookie, SESSION_COOKIE_NAME } from '@/lib/server/cookies';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const cookies = parseCookieHeader(request.headers.get('cookie'));
  const session = cookies[SESSION_COOKIE_NAME];

  if (session) {
    await callApi({ path: '/api/v1/auth/logout', method: 'POST', refreshToken: session }).catch(
      () => undefined,
    );
  }

  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append('Set-Cookie', serializeCookie(SESSION_COOKIE_NAME, '', { path: '/', maxAge: 0 }));
  return new Response(JSON.stringify({ success: true }), { status: 200, headers });
}
