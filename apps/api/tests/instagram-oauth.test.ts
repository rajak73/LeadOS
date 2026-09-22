import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/config/env.js';
import { decryptSecret } from '../src/lib/crypto.js';
import { createState, verifyState } from '../src/modules/instagram/instagram.oauth.js';
import { api, createMember, prisma, setupAdmin, testApp, type Session } from './helpers.js';
import { instagramTestEnv } from './instagram-helpers.js';

// Set before the app is built: the callback routes are registered from these values.
instagramTestEnv();
env.INSTAGRAM_TEST_MODE = false;
env.INSTAGRAM_APP_ID = '1234567890';
env.INSTAGRAM_APP_SECRET = 'ig-app-secret';
env.INSTAGRAM_OAUTH_REDIRECT_URI = 'https://crm.example.com/api/v1/integrations/instagram/callback';
env.APP_ORIGIN = 'https://app.example.com';

const app = testApp();
let admin: Session;
let member: Session;

beforeAll(async () => {
  admin = await setupAdmin(app);
  member = await createMember(app, admin);
});

beforeEach(async () => {
  await prisma.igAccount.deleteMany({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Fakes Instagram's token endpoints and the Graph calls made while connecting. */
function mockInstagram(options: { codeError?: string } = {}) {
  const calls: Array<{ url: string; body?: string }> = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? String(init.body) : undefined });
    const json = (body: object, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    if (url.startsWith('https://api.instagram.com/oauth/access_token')) {
      return options.codeError
        ? json({ error_type: 'OAuthException', error_message: options.codeError }, 400)
        : json({ access_token: 'IGAA-short', user_id: '17841400000000001' });
    }
    if (url.startsWith('https://graph.instagram.com/access_token'))
      return json({ access_token: 'IGAA-long', token_type: 'bearer', expires_in: 5184000 });
    if (url.includes('/me/subscribed_apps')) return json({ success: true });
    if (url.includes('/me?') || url.includes('/me&'))
      return json({ user_id: '17841400000000001', username: 'clothing.store', name: 'Clothing' });
    return json({ error: { message: `unexpected ${url}` } }, 500);
  });
  return calls;
}

const callback = (query: string, path = '/api/v1/integrations/instagram/callback') =>
  request(app).get(`${path}?${query}`).redirects(0);

describe('Connect with Instagram (OAuth)', () => {
  it('is offered when the app id and secret are set, with the redirect URI to register', async () => {
    const status = (await api(app, member).get('/instagram/status').expect(200)).body.data;
    expect(status).toMatchObject({
      oauthAvailable: true,
      oauthRedirectUri: 'https://crm.example.com/api/v1/integrations/instagram/callback',
    });
  });

  it('only admins can start it; the URL asks Instagram for the messaging and comment scopes', async () => {
    await api(app, member).post('/instagram/oauth/start').expect(403);
    const { url } = (await api(app, admin).post('/instagram/oauth/start').expect(200)).body.data;
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://www.instagram.com/oauth/authorize');
    expect(u.searchParams.get('client_id')).toBe('1234567890');
    expect(u.searchParams.get('redirect_uri')).toBe(env.INSTAGRAM_OAUTH_REDIRECT_URI);
    expect(u.searchParams.get('scope')).toBe(
      'instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments',
    );
    expect(verifyState(u.searchParams.get('state')!)).toEqual({ userId: admin.userId });
  });

  it('swaps the code for a long-lived token, connects the account and returns to settings', async () => {
    const calls = mockInstagram();
    const state = createState(admin.userId);
    const res = await callback(`code=abc123%23_&state=${encodeURIComponent(state)}`).expect(302);
    expect(res.headers.location).toBe(
      'https://app.example.com/settings/instagram?instagram=connected',
    );

    const tokenCall = calls.find((c) => c.url.startsWith('https://api.instagram.com'))!;
    const form = new URLSearchParams(tokenCall.body);
    expect(Object.fromEntries(form)).toMatchObject({
      client_id: '1234567890',
      client_secret: 'ig-app-secret',
      grant_type: 'authorization_code',
      redirect_uri: env.INSTAGRAM_OAUTH_REDIRECT_URI,
      code: 'abc123', // Instagram's trailing "#_" removed
    });

    const account = await prisma.igAccount.findUniqueOrThrow({ where: { id: 1 } });
    expect(account).toMatchObject({ username: 'clothing.store', status: 'ACTIVE' });
    expect(decryptSecret(account.accessTokenEnc)).toBe('IGAA-long');
    expect(calls.some((c) => c.url.includes('/me/subscribed_apps'))).toBe(true);
  });

  it('also answers on the default callback path', async () => {
    mockInstagram();
    const res = await callback(
      `code=abc&state=${encodeURIComponent(createState(admin.userId))}`,
      '/api/instagram/oauth/callback',
    ).expect(302);
    expect(res.headers.location).toContain('instagram=connected');
  });

  it('rejects a forged, tampered or expired state without calling Instagram', async () => {
    const calls = mockInstagram();
    const good = createState(admin.userId);
    const expired = createState(admin.userId, Date.now() - 11 * 60 * 1000);
    for (const state of ['nonsense', `${good.split('.')[0]}.AAAA`, expired]) {
      const res = await callback(`code=abc&state=${encodeURIComponent(state)}`).expect(302);
      expect(new URL(String(res.headers.location)).searchParams.get('instagramError')).toMatch(
        /expired/,
      );
    }
    expect(calls).toHaveLength(0);
    expect(await prisma.igAccount.count()).toBe(0);
  });

  it('reports Instagram errors and a cancelled consent back to the settings page', async () => {
    mockInstagram({ codeError: 'This authorization code has been used' });
    const state = encodeURIComponent(createState(admin.userId));
    let res = await callback(`code=used&state=${state}`).expect(302);
    expect(new URL(String(res.headers.location)).searchParams.get('instagramError')).toBe(
      'Instagram said: This authorization code has been used',
    );

    res = await callback(
      'error=access_denied&error_reason=user_denied&error_description=The+user+denied+your+request.',
    ).expect(302);
    expect(new URL(String(res.headers.location)).searchParams.get('instagramError')).toBe(
      'The user denied your request.',
    );
    expect(await prisma.igAccount.count()).toBe(0);
  });
});
