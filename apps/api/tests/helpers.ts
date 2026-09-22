import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { flush } from '../src/lib/queue.js';

export { flush, prisma };

export const PASSWORD = 'correct-horse-battery';

export function testApp(options: Parameters<typeof createApp>[0] = {}): Express {
  return createApp({ authRateLimit: 10_000, globalRateLimit: 100_000, ...options });
}

export interface Session {
  token: string;
  userId: string;
  cookie: string;
}

const cookieFrom = (res: request.Response) => {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return (
    (raw ?? []).map((c) => c.split(';')[0] ?? '').find((c) => c.startsWith('leados_rt=')) ?? ''
  );
};

export async function setupAdmin(app: Express, email = 'admin@example.com'): Promise<Session> {
  const res = await request(app)
    .post('/api/auth/setup')
    .send({
      companyName: 'Acme Traders',
      firstName: 'Asha',
      lastName: 'Rao',
      email,
      password: PASSWORD,
    })
    .expect(201);
  return {
    token: res.body.data.accessToken,
    userId: res.body.data.user.id,
    cookie: cookieFrom(res),
  };
}

export async function login(app: Express, email: string, password = PASSWORD): Promise<Session> {
  const res = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
  return {
    token: res.body.data.accessToken,
    userId: res.body.data.user.id,
    cookie: cookieFrom(res),
  };
}

export async function createMember(
  app: Express,
  admin: Session,
  firstName = 'Mohan',
  role: 'ADMIN' | 'MEMBER' = 'MEMBER',
): Promise<Session> {
  const email = `${firstName.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  await request(app)
    .post('/api/users')
    .set(auth(admin))
    .send({ firstName, email, password: PASSWORD, role })
    .expect(201);
  return login(app, email);
}

export const auth = (s: Session) => ({ authorization: `Bearer ${s.token}` });

/** Small typed-ish wrapper: api(app, session).post('/leads', body). */
export function api(app: Express, s: Session) {
  const h = auth(s);
  return {
    get: (url: string) => request(app).get(`/api${url}`).set(h),
    post: (url: string, body?: object) =>
      request(app)
        .post(`/api${url}`)
        .set(h)
        .send(body ?? {}),
    patch: (url: string, body: object) => request(app).patch(`/api${url}`).set(h).send(body),
    delete: (url: string) => request(app).delete(`/api${url}`).set(h),
  };
}

export { cookieFrom };
