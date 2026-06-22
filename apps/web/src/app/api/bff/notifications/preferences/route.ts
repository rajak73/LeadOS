// BFF: proxy GET + PUT /api/v1/notifications/preferences

import { type NextRequest } from 'next/server';
import { callApi } from '@/lib/server/bff';
import { resolveAccessToken } from '@/lib/server/bff-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  const accessToken = await resolveAccessToken(request);
  if (!accessToken) return Response.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  const result = await callApi({ path: '/api/v1/notifications/preferences', accessToken });
  return Response.json(result.body, { status: result.status });
}

export async function PUT(request: NextRequest): Promise<Response> {
  const accessToken = await resolveAccessToken(request);
  if (!accessToken) return Response.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const result = await callApi({ path: '/api/v1/notifications/preferences', method: 'PUT', body, accessToken });
  return Response.json(result.body, { status: result.status });
}
