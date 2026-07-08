// In-memory access-token store (FINAL_ARCHITECTURE §3.2). The access token lives ONLY in
// memory (never localStorage/cookie). The refresh token is an HttpOnly cookie handled by
// the BFF. Sprint 1 ships the holder; the refresh flow that populates it lands in S2.

import * as self from './token-store';

let accessToken: string | null = null;
let activeRefreshPromise: Promise<string | null> | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function clearAccessToken(): void {
  accessToken = null;
}

export async function refreshAccessToken(customFetch?: typeof fetch): Promise<string | null> {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  const doFetch = customFetch ?? fetch;

  activeRefreshPromise = (async () => {
    try {
      const res = await doFetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        throw new Error('Refresh request failed');
      }
      const json = await res.json();
      const token = json?.data?.accessToken || null;
      if (token) {
        self.setAccessToken(token);
      }
      return token;
    } catch {
      self.clearAccessToken();
      return null;
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
}
