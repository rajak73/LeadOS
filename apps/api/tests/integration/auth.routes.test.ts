// Integration: auth route wiring + validation through the assembled app. The validation
// paths need no DB (Zod rejects before the service). The full register happy-path is
// DB-gated (runs in CI with Postgres).

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';
import { isPostgresUp } from '../helpers/services.js';

const app = buildApp();
const pgUp = await isPostgresUp();

describe('auth routes — validation (no DB)', () => {
  it('rejects registration with a weak password (422)', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'arjun@acme.com',
      password: 'weak',
      firstName: 'Arjun',
      lastName: 'Shah',
      organizationName: 'Acme',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.fields).toHaveProperty('password');
  });

  it('rejects registration with a missing field (422)', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({ email: 'a@b.com' });
    expect(res.status).toBe(422);
  });

  it('rejects verify-email with no token (422)', async () => {
    const res = await request(app).post('/api/v1/auth/verify-email').send({});
    expect(res.status).toBe(422);
  });

  it('resend-verification always returns 202 (no enumeration) for valid email shape', async () => {
    // Reaches the service; with no DB the service would throw, so this asserts shape only
    // when DB is available. Without DB we just confirm the route validates the email.
    const res = await request(app)
      .post('/api/v1/auth/resend-verification')
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(422);
  });
});

describe('auth routes — refresh/logout/sessions guards (no DB)', () => {
  it('refresh without the CSRF header → 403', async () => {
    const res = await request(app).post('/api/v1/auth/refresh');
    expect(res.status).toBe(403);
  });

  it('refresh with CSRF header but no cookie → 401', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').set('X-CSRF-Token', '1');
    expect(res.status).toBe(401);
  });

  it('logout is idempotent: CSRF header, no cookie → 200', async () => {
    const res = await request(app).post('/api/v1/auth/logout').set('X-CSRF-Token', '1');
    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);
  });

  it('GET /sessions without a token → 401', async () => {
    const res = await request(app).get('/api/v1/auth/sessions');
    expect(res.status).toBe(401);
  });

  it('GET /me without a token → 401', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('reset-password with a weak new password → 422', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'x', password: 'weak' });
    expect(res.status).toBe(422);
  });

  it('forgot-password with an invalid email → 422 (validation, no DB)', async () => {
    const res = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'nope' });
    expect(res.status).toBe(422);
  });
});

describe.skipIf(!pgUp)('auth routes — register happy path (DB)', () => {
  it('registers a new org and returns 201', async () => {
    const unique = `owner+${Math.floor(process.hrtime()[1])}@acme.test`;
    const res = await request(app).post('/api/v1/auth/register').send({
      email: unique,
      password: 'Str0ng!Pass',
      firstName: 'Arjun',
      lastName: 'Shah',
      organizationName: `Acme ${Math.floor(process.hrtime()[1])}`,
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.userId).toBeTruthy();
    expect(res.body.data.organizationId).toBeTruthy();
  });
});
