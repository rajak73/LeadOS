// BFF → API call helper (server-only). Calls the backend API from Next.js route handlers /
// RSC, carrying the same-site Origin + CSRF header the API expects on cookie endpoints.

import { REFRESH_COOKIE_NAME } from './constants';

const API_BASE = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
const WEB_ORIGIN = process.env.APP_WEB_ORIGIN ?? 'http://localhost:3000';

export interface ApiCall {
  path: string; // e.g. /api/v1/auth/login
  method?: string;
  body?: unknown;
  /** Raw refresh-token value to forward to the API as its cookie (for refresh/logout). */
  refreshToken?: string;
  /** Bearer access token for authenticated data calls. */
  accessToken?: string;
}

export interface ApiResult {
  status: number;
  body: unknown;
  /** Upstream Set-Cookie header (the API's rotated refresh cookie), if any. */
  setCookie: string | null;
}

export async function callApi(call: ApiCall): Promise<ApiResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Origin: WEB_ORIGIN,
    'X-CSRF-Token': '1', // BFF is same-site; the header satisfies the API CSRF guard
  };
  if (call.accessToken) headers.Authorization = `Bearer ${call.accessToken}`;
  if (call.refreshToken) headers.Cookie = `${REFRESH_COOKIE_NAME}=${call.refreshToken}`;

  const init: RequestInit = { method: call.method ?? 'GET', headers, cache: 'no-store' };
  if (call.body !== undefined) init.body = JSON.stringify(call.body);

  try {
    const res = await fetch(`${API_BASE}${call.path}`, init);
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body, setCookie: res.headers.get('set-cookie') };
  } catch (err: any) {
    console.error(`callApi failed to reach backend API (${API_BASE}):`, err);
    return {
      status: 502,
      body: {
        success: false,
        error: { message: `Backend API is currently unreachable. Details: ${err.message || err}` }
      },
      setCookie: null
    };
  }
}

