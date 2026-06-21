// BFF: proxy GET /api/v1/inbox/conversations/:id/messages and POST /api/v1/inbox/conversations/:id/messages

import { type NextRequest } from 'next/server';
import { callApi } from '@/lib/server/bff';
import { resolveAccessToken } from '@/lib/server/bff-auth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const accessToken = await resolveAccessToken(request);
  if (!accessToken) return Response.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  const qs = request.nextUrl.searchParams.toString();
  const result = await callApi({
    path: `/api/v1/inbox/conversations/${id}/messages${qs ? `?${qs}` : ''}`,
    accessToken,
  });
  return Response.json(result.body, { status: result.status });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const accessToken = await resolveAccessToken(request);
  if (!accessToken) return Response.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const result = await callApi({
    path: `/api/v1/inbox/conversations/${id}/messages`,
    method: 'POST',
    body,
    accessToken,
  });
  return Response.json(result.body, { status: result.status });
}
