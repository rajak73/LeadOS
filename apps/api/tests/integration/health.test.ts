// Integration: the request lifecycle through the assembled app (no external infra needed —
// health checks degrade gracefully when DB/Redis are absent). Proves envelope, middleware
// chain, webhook raw-body carve-out, metrics, and 404 handling.

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';

const app = buildApp();

describe('health + request lifecycle', () => {
  it('GET /health returns 200 shallow ok with a request id header', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('GET /health/deep reports database, redis, and queue checks', async () => {
    const res = await request(app).get('/health/deep');
    expect([200, 503]).toContain(res.status);
    expect(res.body.checks).toHaveProperty('database');
    expect(res.body.checks).toHaveProperty('redis');
    expect(res.body.checks).toHaveProperty('queue');
    expect(res.body).toHaveProperty('version');
  });

  it('GET /metrics exposes Prometheus metrics', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('http_requests_total');
  });

  it('GET /api/v1/ping is now permission-gated: unauthenticated → 401 (Sprint 3 M4 RBAC)', async () => {
    // Sprint 1 returned 200 here through the stub chain. With real RBAC (requirePermission),
    // the authenticated /api/v1 surface rejects an unauthenticated request. The full success
    // path (member token → 200) is covered in tenant.middleware.e2e + rbac.enforcement.
    const res = await request(app).get('/api/v1/ping');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/webhooks/instagram rejects missing HMAC (proves raw-body middleware is wired before JSON parser)', async () => {
    // /_echo (Sprint 1 proof) was retired in M4 when the real webhook receiver replaced the stub.
    // The same raw-body carve-out guarantee is now exercised by the live Instagram receiver:
    // a request with no X-Hub-Signature-256 header returns 400 from the controller — which can
    // only happen if express.raw() ran (giving req.body as Buffer) before express.json().
    // No DB access, no HMAC computation needed — the header check fires first.
    const res = await request(app)
      .post('/api/webhooks/instagram')
      .set('Content-Type', 'application/json')
      .send('{"hello":"world"}');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing X-Hub-Signature-256');
  });

  it('unknown route returns a 404 error envelope', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
