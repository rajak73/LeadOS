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

  it('GET /api/v1/ping returns the success envelope through the full chain', async () => {
    const res = await request(app).get('/api/v1/ping');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { pong: true } });
    expect(res.body.data.requestId).toBeTruthy();
  });

  it('POST /api/webhooks/_echo receives the RAW body (carve-out before JSON parser)', async () => {
    const res = await request(app)
      .post('/api/webhooks/_echo')
      .set('Content-Type', 'application/json')
      .send('{"hello":"world"}');
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(res.body.rawBytes).toBe(Buffer.byteLength('{"hello":"world"}'));
  });

  it('unknown route returns a 404 error envelope', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
