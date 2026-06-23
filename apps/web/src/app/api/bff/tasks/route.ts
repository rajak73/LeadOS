import { type NextRequest } from 'next/server';
import { callApi } from '@/lib/server/bff';
import { resolveAccessToken } from '@/lib/server/bff-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  const accessToken = await resolveAccessToken(request);
  if (!accessToken) return Response.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const type = searchParams.get('type');

  let path = '/api/v1/tasks';
  const params = [];
  if (status) params.push(`status=${status}`);
  if (type) params.push(`type=${type}`);
  if (params.length > 0) {
    path += `?${params.join('&')}`;
  }

  const result = await callApi({ path, accessToken });
  return Response.json(result.body, { status: result.status });
}

export async function POST(request: NextRequest): Promise<Response> {
  const accessToken = await resolveAccessToken(request);
  if (!accessToken) return Response.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  const body = await request.json();
  const result = await callApi({
    path: '/api/v1/tasks',
    method: 'POST',
    body,
    accessToken,
  });
  return Response.json(result.body, { status: result.status });
}
