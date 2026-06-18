// In-memory access-token store (FINAL_ARCHITECTURE §3.2). The access token lives ONLY in
// memory (never localStorage/cookie). The refresh token is an HttpOnly cookie handled by
// the BFF. Sprint 1 ships the holder; the refresh flow that populates it lands in S2.

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function clearAccessToken(): void {
  accessToken = null;
}
