import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { csrfGuard } from './csrf.js';
import { errorHandler } from '../errors/error-handler.js';

const app = (() => {
  const a = express();
  a.post('/protected', csrfGuard, (_req, res) => res.json({ ok: true }));
  a.use(errorHandler);
  return a;
})();

describe('csrfGuard', () => {
  it('rejects requests without the custom header (403)', async () => {
    const res = await request(app).post('/protected');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('allows requests with the custom header and no cross-site origin', async () => {
    const res = await request(app).post('/protected').set('X-CSRF-Token', '1');
    expect(res.status).toBe(200);
  });

  it('rejects a cross-site Origin even with the header', async () => {
    const res = await request(app)
      .post('/protected')
      .set('X-CSRF-Token', '1')
      .set('Origin', 'https://evil.example.com');
    expect(res.status).toBe(403);
  });

  it('allows the same-site Origin', async () => {
    const res = await request(app)
      .post('/protected')
      .set('X-CSRF-Token', '1')
      .set('Origin', 'http://localhost:3000');
    expect(res.status).toBe(200);
  });
});
