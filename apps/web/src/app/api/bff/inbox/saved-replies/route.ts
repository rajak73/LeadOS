// BFF: proxy GET /api/v1/inbox/saved-replies and POST /api/v1/inbox/saved-replies

import { type NextRequest } from 'next/server';
import { callApi } from '@/lib/server/bff';
import { resolveAccessToken } from '@/lib/server/bff-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  const accessToken = await resolveAccessToken(request);
  if (!accessToken) return Response.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  const q = request.nextUrl.searchParams.get('q');
  const path = q ? `/api/v1/inbox/saved-replies?q=${encodeURIComponent(q)}` : '/api/v1/inbox/saved-replies';
  const result = await callApi({ path, accessToken });
  return Response.json(result.body, { status: result.status });
}

export async function POST(request: NextRequest): Promise<Response> {
  const accessToken = await resolveAccessToken(request);
  if (!accessToken) return Response.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const result = await callApi({ path: '/api/v1/inbox/saved-replies', method: 'POST', body, accessToken });
  return Response.json(result.body, { status: result.status });
}
