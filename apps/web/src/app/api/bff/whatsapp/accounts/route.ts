// BFF: proxy GET /api/v1/whatsapp/accounts and POST /api/v1/whatsapp/accounts

import { type NextRequest } from 'next/server';
import { callApi } from '@/lib/server/bff';
import { resolveAccessToken } from '@/lib/server/bff-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  const accessToken = await resolveAccessToken(request);
  if (!accessToken) return Response.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  const result = await callApi({ path: '/api/v1/whatsapp/accounts', accessToken });
  return Response.json(result.body, { status: result.status });
}

export async function POST(request: NextRequest): Promise<Response> {
  const accessToken = await resolveAccessToken(request);
  if (!accessToken) return Response.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  const body = await request.json() as unknown;
  const result = await callApi({ path: '/api/v1/whatsapp/accounts', method: 'POST', body, accessToken });
  return Response.json(result.body, { status: result.status });
}
