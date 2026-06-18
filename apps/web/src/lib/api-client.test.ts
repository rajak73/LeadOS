import { describe, it, expect } from 'vitest';
import { createApiClient } from './api-client.js';

describe('api client', () => {
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
    // Run the request interceptor against a minimal config.
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
