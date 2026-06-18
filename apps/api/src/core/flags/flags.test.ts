import { describe, it, expect, afterEach } from 'vitest';
import { isEnabled, setFlag, resetFlags } from './flags.js';

afterEach(() => resetFlags());

describe('feature flags', () => {
  it('returns defaults', () => {
    expect(isEnabled('instagram.sends.enabled')).toBe(true);
    expect(isEnabled('signups.enabled')).toBe(true);
  });

  it('runtime kill switch overrides the default', () => {
    setFlag('instagram.sends.enabled', false);
    expect(isEnabled('instagram.sends.enabled')).toBe(false);
  });

  it('reset clears overrides', () => {
    setFlag('ai.scoring.enabled', false);
    resetFlags();
    expect(isEnabled('ai.scoring.enabled')).toBe(true);
  });
});
