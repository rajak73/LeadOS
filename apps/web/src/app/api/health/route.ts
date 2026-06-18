// BFF health proxy (UI-1.2). Proves the browser → BFF → API path: the browser calls this
// same-origin route, which (server-side) calls the API's /health and relays the result.
// This is also the seam where the authenticated BFF session proxy is built in Sprint 2.

export const dynamic = 'force-dynamic';

const API_BASE = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${API_BASE}/health`, { cache: 'no-store' });
    const api = (await res.json()) as unknown;
    return Response.json({ bff: 'ok', api }, { status: res.ok ? 200 : 503 });
  } catch {
    return Response.json({ bff: 'ok', api: { status: 'unreachable' } }, { status: 503 });
  }
}
