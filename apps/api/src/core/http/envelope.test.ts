import { describe, it, expect } from 'vitest';
import { successEnvelope, errorEnvelope, buildPaginationMeta } from './envelope.js';
import { ErrorCode } from '@leados/shared';

describe('successEnvelope', () => {
  it('wraps data', () => {
    expect(successEnvelope({ a: 1 })).toEqual({ success: true, data: { a: 1 } });
  });

  it('includes meta when provided', () => {
    const meta = buildPaginationMeta(2, 25, 100);
    const env = successEnvelope([1, 2], meta);
    expect(env.meta).toEqual(meta);
  });
});

describe('errorEnvelope', () => {
  it('shapes errors per the contract', () => {
    const env = errorEnvelope(ErrorCode.NOT_FOUND, 'nope', 404);
    expect(env).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'nope', statusCode: 404 },
    });
  });
});

describe('buildPaginationMeta', () => {
  it('computes next/prev flags', () => {
    expect(buildPaginationMeta(1, 25, 100)).toMatchObject({ hasNextPage: true, hasPrevPage: false });
    expect(buildPaginationMeta(4, 25, 100)).toMatchObject({ hasNextPage: false, hasPrevPage: true });
  });
});
