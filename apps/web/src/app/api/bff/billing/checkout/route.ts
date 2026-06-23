import { type NextRequest } from 'next/server';
import { callApi } from '@/lib/server/bff';
import { resolveAccessToken } from '@/lib/server/bff-auth';

export async function POST(request: NextRequest): Promise<Response> {
  const accessToken = await resolveAccessToken(request);
  if (!accessToken) return Response.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  const body = await request.json();
  const result = await callApi({
    path: '/api/v1/billing/checkout',
    method: 'POST',
    body,
    accessToken,
  });
  return Response.json(result.body, { status: result.status });
}
