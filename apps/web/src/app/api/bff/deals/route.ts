// BFF: proxy GET /api/v1/deals and POST /api/v1/deals.

import { type NextRequest } from 'next/server';
import { callApi } from '@/lib/server/bff';
import { parseCookieHeader, SESSION_COOKIE_NAME } from '@/lib/server/cookies';

export const dynamic = 'force-dynamic';

async function resolveAccessToken(request: NextRequest): Promise<string | null> {
  const cookies = parseCookieHeader(request.headers.get('cookie'));
  const session = cookies[SESSION_COOKIE_NAME];
  if (!session) return null;
  const refresh = await callApi({ path: '/api/v1/auth/refresh', method: 'POST', refreshToken: session });
  if (refresh.status !== 200) return null;
  return (refresh.body as { data?: { accessToken?: string } })?.data?.accessToken ?? null;
}

export async function GET(request: NextRequest): Promise<Response> {
  const accessToken = await resolveAccessToken(request);
  if (!accessToken) return Response.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  const qs = request.nextUrl.searchParams.toString();
  const result = await callApi({ path: `/api/v1/deals${qs ? `?${qs}` : ''}`, accessToken });
  return Response.json(result.body, { status: result.status });
}

export async function POST(request: NextRequest): Promise<Response> {
  const accessToken = await resolveAccessToken(request);
  if (!accessToken) return Response.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const result = await callApi({ path: '/api/v1/deals', method: 'POST', body, accessToken });
  return Response.json(result.body, { status: result.status });
}
