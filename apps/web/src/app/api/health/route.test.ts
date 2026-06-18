import { describe, it, expect, vi, afterEach } from 'vitest';
import { GET } from './route.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BFF health proxy', () => {
  it('relays the API health and returns 200 when the API is ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ status: 'ok', timestamp: 'now' }, { status: 200 }),
      ),
    );
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { bff: string; api: { status: string } };
    expect(body.bff).toBe('ok');
    expect(body.api.status).toBe('ok');
  });

  it('returns 503 when the API is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connection refused');
      }),
    );
    const res = await GET();
    expect(res.status).toBe(503);
    const body = (await res.json()) as { api: { status: string } };
    expect(body.api.status).toBe('unreachable');
  });
});
