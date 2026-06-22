// BFF: proxy POST /api/v1/notifications/:id/read

import { type NextRequest } from 'next/server';
import { callApi } from '@/lib/server/bff';
import { resolveAccessToken } from '@/lib/server/bff-auth';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const accessToken = await resolveAccessToken(request);
  if (!accessToken) return Response.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  const { id } = await params;
  const result = await callApi({
    path: `/api/v1/notifications/${encodeURIComponent(id)}/read`,
    method: 'POST',
    accessToken,
  });
  return Response.json(result.body, { status: result.status });
}
