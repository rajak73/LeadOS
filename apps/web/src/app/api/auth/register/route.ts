import { callApi } from '@/lib/server/bff';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const credentials = await request.json().catch(() => ({}));
  const api = await callApi({ path: '/api/v1/auth/register', method: 'POST', body: credentials });

  const headers = new Headers({ 'Content-Type': 'application/json' });
  return new Response(JSON.stringify(api.body), { status: api.status, headers });
}
