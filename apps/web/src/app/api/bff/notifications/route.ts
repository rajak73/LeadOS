// BFF: proxy GET /api/v1/notifications (cursor + ?unread=)

import { type NextRequest } from 'next/server';
import { callApi } from '@/lib/server/bff';
import { resolveAccessToken } from '@/lib/server/bff-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  const accessToken = await resolveAccessToken(request);
  if (!accessToken) return Response.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  const qs = request.nextUrl.searchParams.toString();
  const result = await callApi({ path: `/api/v1/notifications${qs ? `?${qs}` : ''}`, accessToken });
  return Response.json(result.body, { status: result.status });
}
