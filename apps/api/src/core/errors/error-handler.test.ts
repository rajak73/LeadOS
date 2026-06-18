import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { AppError } from './app-error.js';
import { errorHandler, notFoundHandler } from './error-handler.js';

function appWith(handler: express.RequestHandler): express.Express {
  const app = express();
  app.get('/boom', handler);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  it('maps AppError to its status + error envelope', async () => {
    const app = appWith(() => {
      throw AppError.notFound('lead missing');
    });
    const res = await request(app).get('/boom');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'lead missing', statusCode: 404 },
    });
  });

  it('maps an unexpected error to 500 INTERNAL_ERROR without leaking a stack', async () => {
    const app = appWith(() => {
      throw new Error('secret internal detail');
    });
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('stack');
  });

  it('returns a 404 envelope for unknown routes', async () => {
    const app = appWith((_req, res) => res.send('ok'));
    const res = await request(app).get('/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
