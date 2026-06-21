import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApiClient } from './api-client.js';
import * as tokenStore from './auth/token-store.js';

// ─── Existing request interceptor tests ──────────────────────────────────────

describe('api client — request interceptor', () => {
  it('uses the provided base URL and sends credentials', () => {
    const client = createApiClient({ baseURL: 'https://api.leados.app/api/v1' });
    expect(client.defaults.baseURL).toBe('https://api.leados.app/api/v1');
    expect(client.defaults.withCredentials).toBe(true);
  });

  it('attaches the bearer token from the token getter on requests', async () => {
    const client = createApiClient({
      baseURL: 'http://localhost:4000/api/v1',
      getToken: () => 'test-token',
    });
    const handler = client.interceptors.request as unknown as {
      handlers: { fulfilled: (c: unknown) => unknown }[];
    };
    const fulfilled = handler.handlers[0]?.fulfilled;
    const headers = new Map<string, string>();
    const config = { headers: { set: (k: string, v: string) => headers.set(k, v) } };
    fulfilled?.(config);
    expect(headers.get('Authorization')).toBe('Bearer test-token');
  });

  it('does not attach a header when there is no token', () => {
    const client = createApiClient({ getToken: () => null });
    const handler = client.interceptors.request as unknown as {
      handlers: { fulfilled: (c: unknown) => unknown }[];
    };
    const fulfilled = handler.handlers[0]?.fulfilled;
    let setCalled = false;
    const config = { headers: { set: () => (setCalled = true) } };
    fulfilled?.(config);
    expect(setCalled).toBe(false);
  });
});

// ─── 401 → refresh → retry tests ─────────────────────────────────────────────

describe('api client — 401 retry interceptor', () => {
  beforeEach(() => {
    tokenStore.clearAccessToken();
  });

  function getResponseInterceptorRejected(client: ReturnType<typeof createApiClient>) {
    const handler = client.interceptors.response as unknown as {
      handlers: { rejected: (e: unknown) => unknown }[];
    };
    return handler.handlers[0]?.rejected;
  }

  it('calls refresh exactly once when a 401 is received', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { accessToken: 'new-access-token' } }),
    } as Response);

    const client = createApiClient({ refreshFetch: mockFetch });

    // The client(config) retry call will fail (no real server); that's OK for this test.
    const rejected = getResponseInterceptorRejected(client);
    const headers = { set: vi.fn(), get: vi.fn(() => null) };
    const error = {
      config: { _retried: false, headers },
      response: { status: 401 },
    };

    try {
      await rejected?.(error);
    } catch {
      // Expected — retry call has no real server
    }

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith('/api/auth/refresh', expect.objectContaining({ method: 'POST' }));
  });

  it('sets the new access token and updates the Authorization header on success', async () => {
    const setAccessTokenSpy = vi.spyOn(tokenStore, 'setAccessToken');

    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { accessToken: 'refreshed-token' } }),
    } as Response);

    const client = createApiClient({ refreshFetch: mockFetch });
    const rejected = getResponseInterceptorRejected(client);

    const headerSetCalls: [string, string][] = [];
    const headers = {
      set: (k: string, v: string) => headerSetCalls.push([k, v]),
      get: vi.fn(() => null),
    };
    const error = { config: { _retried: false, headers }, response: { status: 401 } };

    try { await rejected?.(error); } catch { /* retry fails without real server */ }

    expect(setAccessTokenSpy).toHaveBeenCalledWith('refreshed-token');
    expect(headerSetCalls).toContainEqual(['Authorization', 'Bearer refreshed-token']);
  });

  it('clears the token when the refresh request fails', async () => {
    const clearSpy = vi.spyOn(tokenStore, 'clearAccessToken');
    tokenStore.setAccessToken('old-token');

    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: false, json: async () => ({}) } as Response);
    const client = createApiClient({ refreshFetch: mockFetch });
    const rejected = getResponseInterceptorRejected(client);

    const headers = { set: vi.fn(), get: vi.fn(() => null) };
    const error = { config: { _retried: false, headers }, response: { status: 401 } };

    await expect(rejected?.(error)).rejects.toBeDefined();
    expect(clearSpy).toHaveBeenCalled();
  });

  it('does not retry a second time when _retried is already true', async () => {
    const mockFetch = vi.fn();
    const client = createApiClient({ refreshFetch: mockFetch });
    const rejected = getResponseInterceptorRejected(client);

    const headers = { set: vi.fn(), get: vi.fn() };
    const error = { config: { _retried: true, headers }, response: { status: 401 } };

    await expect(rejected?.(error)).rejects.toBeDefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not call refresh for non-401 errors', async () => {
    const mockFetch = vi.fn();
    const client = createApiClient({ refreshFetch: mockFetch });
    const rejected = getResponseInterceptorRejected(client);

    const headers = { set: vi.fn(), get: vi.fn() };
    const error403 = { config: { _retried: false, headers }, response: { status: 403 } };
    const error500 = { config: { _retried: false, headers }, response: { status: 500 } };

    await expect(rejected?.(error403)).rejects.toBeDefined();
    await expect(rejected?.(error500)).rejects.toBeDefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
