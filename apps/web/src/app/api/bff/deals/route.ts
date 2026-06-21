// BFF: proxy GET /api/v1/deals and POST /api/v1/deals.

import { type NextRequest } from 'next/server';
import { callApi } from '@/lib/server/bff';
import { resolveAccessToken } from '@/lib/server/bff-auth';

export const dynamic = 'force-dynamic';

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
