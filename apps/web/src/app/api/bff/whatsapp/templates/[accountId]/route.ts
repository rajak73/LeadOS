// BFF: proxy GET /api/v1/whatsapp/accounts/:accountId/templates and
//      POST /api/v1/whatsapp/accounts/:accountId/sync-templates

import { type NextRequest } from 'next/server';
import { callApi } from '@/lib/server/bff';
import { resolveAccessToken } from '@/lib/server/bff-auth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> },
): Promise<Response> {
  const accessToken = await resolveAccessToken(request);
  if (!accessToken) return Response.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  const { accountId } = await params;
  const result = await callApi({
    path: `/api/v1/whatsapp/accounts/${accountId}/templates`,
    accessToken,
  });
  return Response.json(result.body, { status: result.status });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> },
): Promise<Response> {
  const accessToken = await resolveAccessToken(request);
  if (!accessToken) return Response.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  const { accountId } = await params;
  const result = await callApi({
    path: `/api/v1/whatsapp/accounts/${accountId}/sync-templates`,
    method: 'POST',
    accessToken,
  });
  return Response.json(result.body, { status: result.status });
}
