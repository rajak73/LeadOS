import { describe, it, expect } from 'vitest';
import { processHealthEcho } from './health-echo.js';

describe('processHealthEcho', () => {
  it('echoes the nonce', () => {
    expect(processHealthEcho({ nonce: 'abc', enqueuedAt: 'now' })).toEqual({
      ok: true,
      nonce: 'abc',
    });
  });

  it('throws on a missing nonce (drives DLQ on exhausted retries)', () => {
    expect(() =>
      processHealthEcho({ nonce: '', enqueuedAt: 'now' }),
    ).toThrow(/missing nonce/);
  });
});
