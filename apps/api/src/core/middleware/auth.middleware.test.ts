import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { authMiddleware, requireAuth } from './auth.middleware.js';
import { errorHandler } from '../errors/error-handler.js';
import { signAccessToken } from '../auth/jwt.js';
import { sendSuccess } from '../http/envelope.js';

function app() {
  const a = express();
  a.get('/open', authMiddleware, (req, res) =>
    sendSuccess(res, { auth: req.auth ?? null }),
  );
  a.get('/protected', authMiddleware, requireAuth, (req, res) =>
    sendSuccess(res, { userId: req.auth?.userId }),
  );
  a.use(errorHandler);
  return a;
}

const token = signAccessToken({ sub: 'u1', orgId: 'o1', role: 'OWNER', isSuperAdmin: false });

describe('authMiddleware', () => {
  it('passes through with no req.auth when no token is present', async () => {
    const res = await request(app()).get('/open');
    expect(res.status).toBe(200);
    expect(res.body.data.auth).toBeNull();
  });

  it('attaches req.auth for a valid Bearer token', async () => {
    const res = await request(app()).get('/open').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.auth.userId).toBe('u1');
    expect(res.body.data.auth.role).toBe('OWNER');
  });

  it('rejects an invalid token with 401', async () => {
    const res = await request(app()).get('/open').set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('requireAuth', () => {
  it('401s when no token is present', async () => {
    const res = await request(app()).get('/protected');
    expect(res.status).toBe(401);
  });

  it('allows a valid token through', async () => {
    const res = await request(app()).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.userId).toBe('u1');
  });
});
