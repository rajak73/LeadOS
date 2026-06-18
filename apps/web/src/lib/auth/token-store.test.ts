import { describe, it, expect, afterEach } from 'vitest';
import { getAccessToken, setAccessToken, clearAccessToken } from './token-store.js';

afterEach(() => clearAccessToken());

describe('in-memory access-token store', () => {
  it('starts empty', () => {
    expect(getAccessToken()).toBeNull();
  });

  it('stores and returns a token', () => {
    setAccessToken('abc.def.ghi');
    expect(getAccessToken()).toBe('abc.def.ghi');
  });

  it('clears the token', () => {
    setAccessToken('abc');
    clearAccessToken();
    expect(getAccessToken()).toBeNull();
  });

  it('accepts an explicit null', () => {
    setAccessToken('abc');
    setAccessToken(null);
    expect(getAccessToken()).toBeNull();
  });
});
