// BFF: proxy DELETE /api/v1/instagram/accounts/:id

import { type NextRequest } from 'next/server';
import { callApi } from '@/lib/server/bff';
import { resolveAccessToken } from '@/lib/server/bff-auth';

export const dynamic = 'force-dynamic';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const accessToken = await resolveAccessToken(request);
  if (!accessToken) return Response.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  const { id } = await params;
  const result = await callApi({ path: `/api/v1/instagram/accounts/${id}`, method: 'DELETE', accessToken });
  return new Response(null, { status: result.status });
}
