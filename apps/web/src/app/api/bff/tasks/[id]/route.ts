import { type NextRequest } from 'next/server';
import { callApi } from '@/lib/server/bff';
import { resolveAccessToken } from '@/lib/server/bff-auth';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const accessToken = await resolveAccessToken(request);
  if (!accessToken) return Response.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  const body = await request.json();
  const result = await callApi({
    path: `/api/v1/tasks/${id}`,
    method: 'PATCH',
    body,
    accessToken,
  });
  return Response.json(result.body, { status: result.status });
}
