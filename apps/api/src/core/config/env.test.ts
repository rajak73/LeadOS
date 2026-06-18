import { describe, it, expect } from 'vitest';
import { loadEnv } from './env.js';

describe('loadEnv', () => {
  it('applies defaults for the platform-spine vars', () => {
    const env = loadEnv({} as NodeJS.ProcessEnv);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(4000);
    expect(env.APP_WEB_ORIGIN).toBe('http://localhost:3000');
    expect(env.OTEL_SERVICE_NAME).toBe('leados-api');
  });

  it('coerces PORT and accepts overrides', () => {
    const env = loadEnv({ PORT: '8080', NODE_ENV: 'production' } as NodeJS.ProcessEnv);
    expect(env.PORT).toBe(8080);
    expect(env.NODE_ENV).toBe('production');
  });

  it('fails fast on an invalid PORT', () => {
    expect(() => loadEnv({ PORT: 'not-a-number' } as NodeJS.ProcessEnv)).toThrow(
      /Invalid environment/,
    );
  });

  it('fails fast on an invalid web origin URL', () => {
    expect(() => loadEnv({ APP_WEB_ORIGIN: 'notaurl' } as NodeJS.ProcessEnv)).toThrow(
      /Invalid environment/,
    );
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => loadEnv({ NODE_ENV: 'staging' } as unknown as NodeJS.ProcessEnv)).toThrow();
  });
});
