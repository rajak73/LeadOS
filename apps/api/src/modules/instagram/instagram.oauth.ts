/**
 * "Connect with Instagram": the Instagram API with Instagram login OAuth flow, so an admin can
 * connect by signing in to Instagram instead of pasting a token.
 *
 *   1. POST /api/instagram/oauth/start (admin) → URL of Instagram's consent screen, carrying a
 *      signed, short-lived `state`.
 *   2. Instagram redirects the browser to the redirect URI with `code` + `state`.
 *   3. The callback checks `state`, swaps the code for a short-lived token and that for a
 *      long-lived one, then connects exactly like a pasted token (connectInstagram).
 *
 * Needs INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET (the Instagram app's id and secret from
 * "API setup with Instagram login"), and the redirect URI registered in that app.
 */
import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { connectInstagram, isPublicUrl, publicOrigin } from './instagram.account.js';

const SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_messages',
  'instagram_business_manage_comments',
];
const STATE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;
export const DEFAULT_CALLBACK_PATH = '/api/instagram/oauth/callback';

const appSecret = () => env.INSTAGRAM_APP_SECRET ?? env.META_APP_SECRET;

export function oauthAvailable(): boolean {
  return Boolean(env.INSTAGRAM_APP_ID && appSecret()) && !env.INSTAGRAM_TEST_MODE;
}

export function oauthRedirectUri(): string {
  return env.INSTAGRAM_OAUTH_REDIRECT_URI ?? `${publicOrigin()}${DEFAULT_CALLBACK_PATH}`;
}

/** Paths the callback answers on: the default one, plus the configured redirect URI's path. */
export function oauthCallbackPaths(): string[] {
  const paths = new Set([DEFAULT_CALLBACK_PATH]);
  if (env.INSTAGRAM_OAUTH_REDIRECT_URI)
    paths.add(new URL(env.INSTAGRAM_OAUTH_REDIRECT_URI).pathname);
  return [...paths];
}

// ─── State ───────────────────────────────────────────────────────────────────

const sign = (payload: string) =>
  crypto
    .createHmac('sha256', env.JWT_SECRET)
    .update(`instagram-oauth:${payload}`)
    .digest('base64url');

export function createState(userId: string, now = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ u: userId, e: now + STATE_TTL_MS, n: crypto.randomBytes(8).toString('hex') }),
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyState(state: string, now = Date.now()): { userId: string } | null {
  const [payload, mac] = state.split('.');
  if (!payload || !mac) return null;
  const expected = sign(payload);
  if (mac.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      u?: unknown;
      e?: unknown;
    };
    if (typeof data.u !== 'string' || typeof data.e !== 'number' || data.e < now) return null;
    return { userId: data.u };
  } catch {
    return null;
  }
}

// ─── Flow ────────────────────────────────────────────────────────────────────

export function authorizeUrl(userId: string): string {
  const url = new URL('https://www.instagram.com/oauth/authorize');
  url.searchParams.set('client_id', env.INSTAGRAM_APP_ID ?? '');
  url.searchParams.set('redirect_uri', oauthRedirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPES.join(','));
  url.searchParams.set('state', createState(userId));
  return url.toString();
}

class OAuthError extends Error {}

async function readJson(res: globalThis.Response): Promise<Record<string, unknown>> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || body.error || body.error_message) {
    const err = body.error as { message?: string } | string | undefined;
    const message =
      (typeof body.error_message === 'string' && body.error_message) ||
      (typeof err === 'object' && err?.message) ||
      (typeof err === 'string' && err) ||
      `Instagram answered with HTTP ${res.status}`;
    throw new OAuthError(message);
  }
  return body;
}

/** Authorization code → long-lived (60-day) Instagram user token. */
export async function exchangeCode(code: string): Promise<string> {
  const form = new URLSearchParams({
    client_id: env.INSTAGRAM_APP_ID ?? '',
    client_secret: appSecret() ?? '',
    grant_type: 'authorization_code',
    redirect_uri: oauthRedirectUri(),
    // Instagram appends "#_" to the code in the redirect; it isn't part of the code.
    code: code.replace(/#_$/, ''),
  });
  const short = await readJson(
    await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }),
  );
  const shortToken = typeof short.access_token === 'string' ? short.access_token : null;
  if (!shortToken) throw new OAuthError("Instagram didn't return an access token.");

  const url = new URL('https://graph.instagram.com/access_token');
  url.searchParams.set('grant_type', 'ig_exchange_token');
  url.searchParams.set('client_secret', appSecret() ?? '');
  url.searchParams.set('access_token', shortToken);
  const long = await readJson(
    await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
  );
  if (typeof long.access_token !== 'string')
    throw new OAuthError("Instagram didn't return a long-lived token.");
  return long.access_token;
}

/**
 * Where the browser lands afterwards: the web app's Instagram settings page. Falls back to the
 * address this request came in on, so the redirect still works when APP_ORIGIN wasn't set.
 */
function settingsUrl(result: { ok: true } | { error: string }, req: Request): string {
  const host = req.get('host');
  const proto =
    req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const candidates = [env.APP_ORIGIN, publicOrigin(), host ? `${proto}://${host}` : ''];
  const web = candidates.find((c) => c && isPublicUrl(c)) ?? env.APP_ORIGIN;
  const url = new URL('/settings/instagram', web);
  if ('ok' in result) url.searchParams.set('instagram', 'connected');
  else url.searchParams.set('instagramError', result.error);
  return url.toString();
}

/** GET handler for the redirect URI (public: Instagram sends the browser here, not our client). */
export async function oauthCallback(req: Request, res: Response): Promise<void> {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  if (typeof req.query.error === 'string') {
    // The user pressed "Cancel" on Instagram's consent screen, or Meta refused.
    const reason =
      typeof req.query.error_description === 'string'
        ? req.query.error_description
        : 'Instagram connection was cancelled.';
    res.redirect(settingsUrl({ error: reason.slice(0, 200) }, req));
    return;
  }
  if (!code || !verifyState(state)) {
    res.redirect(
      settingsUrl(
        { error: 'That sign-in link expired or was not started here. Please try again.' },
        req,
      ),
    );
    return;
  }
  try {
    const token = await exchangeCode(code);
    await connectInstagram({ accessToken: token });
    res.redirect(settingsUrl({ ok: true }, req));
  } catch (err) {
    logger.warn({ err }, 'Instagram OAuth callback failed');
    const message =
      err instanceof OAuthError
        ? `Instagram said: ${err.message}`
        : err instanceof Error
          ? err.message
          : 'Couldn’t connect to Instagram. Please try again.';
    res.redirect(settingsUrl({ error: message.slice(0, 200) }, req));
  }
}
