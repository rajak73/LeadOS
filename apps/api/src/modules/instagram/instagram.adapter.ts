// Instagram Graph API adapter interface + implementations.
//
// All Meta Graph API calls go through this interface. The inbox, OAuth, and webhook modules
// never call fetch() to Meta directly — they call the adapter. This makes the entire
// Instagram integration testable without network calls.
//
// MetaInstagramAdapter: calls real Meta Graph API endpoints (spike-confirmed paths).
// SandboxInstagramAdapter: deterministic in-process implementation for integration tests.

import { env } from '../../core/config/env.js';

// ─── Value types ─────────────────────────────────────────────────────────────

export interface TokenResult {
  accessToken: string;
  expiresIn: number; // seconds until expiry
}

export interface UserProfile {
  igUserId: string;
  username: string;
  profilePictureUrl?: string;
}

export interface SenderProfile {
  username?: string;
  name?: string;
  profilePictureUrl?: string;
}

export interface MessageContent {
  type: 'text' | 'image' | 'video' | 'audio';
  text?: string;
  mediaUrl?: string;
}

export interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  category?: string;
  picture?: { data: { url: string } };
}

// ─── Interface ────────────────────────────────────────────────────────────────

export interface InstagramAdapter {
  /**
   * Exchange an authorization code for a short-lived user access token.
   * Meta docs: /oauth/access_token (short-lived → ~1 hour).
   */
  exchangeCodeForToken(code: string): Promise<TokenResult>;

  /**
   * Exchange a short-lived token for a long-lived token (~60 days, spike-confirmed).
   * Meta docs: /access_token?grant_type=ig_exchange_token.
   */
  getLongLivedToken(shortLivedToken: string): Promise<TokenResult>;

  /**
   * Refresh a long-lived token before it expires.
   * Meta docs: /refresh_access_token?grant_type=ig_refresh_token.
   */
  refreshToken(accessToken: string): Promise<TokenResult>;

  /**
   * Subscribe the app's webhook to this IG user's DM events.
   * Requires `instagram_manage_messages` permission.
   */
  subscribeWebhook(igUserId: string, accessToken: string): Promise<void>;

  /** Unsubscribe the app's webhook from this IG user's DM events. */
  unsubscribeWebhook(igUserId: string, accessToken: string): Promise<void>;

  /**
   * Fetch the IG business profile linked to the OAuth user (post-auth enrichment).
   */
  getUserProfile(igUserId: string, accessToken: string): Promise<UserProfile>;

  /**
   * Fetch the public profile of a message sender (for lead enrichment).
   * Returns partial data — Meta may not expose all fields for all users.
   */
  getSenderProfile(senderIgUserId: string, accessToken: string): Promise<SenderProfile>;

  /**
   * Send a DM to a recipient. Only valid within the 24-hour messaging window.
   * Returns Meta's message ID (`mid`).
   */
  sendMessage(
    recipientIgUserId: string,
    content: MessageContent,
    accessToken: string,
    platform?: 'INSTAGRAM' | 'FACEBOOK',
  ): Promise<{ mid: string }>;

  /** Fetch connected Facebook Pages for the user. */
  getFacebookPages(userAccessToken: string): Promise<FacebookPage[]>;

  /** Subscribe the app to Facebook Page webhook events. */
  subscribeFacebookWebhook(pageId: string, pageAccessToken: string): Promise<void>;

  /** Unsubscribe the app from Facebook Page webhook events. */
  unsubscribeFacebookWebhook(pageId: string, pageAccessToken: string): Promise<void>;
}

// ─── Meta Graph API implementation ───────────────────────────────────────────

const GRAPH_BASE = 'https://graph.instagram.com';
const GRAPH_VERSION = 'v19.0'; // update when spike confirms the target version

async function graphFetch(
  path: string,
  opts: RequestInit = {},
): Promise<Record<string, unknown>> {
  const url = `${GRAPH_BASE}/${GRAPH_VERSION}${path}`;
  const res = await fetch(url, opts);
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = body['error'] as Record<string, unknown> | undefined;
    throw new Error(
      `Meta API ${res.status}: ${(err?.['message'] as string | undefined) ?? 'unknown error'}`,
    );
  }
  return body;
}

const FB_GRAPH_BASE = 'https://graph.facebook.com';

async function fbGraphFetch(
  path: string,
  opts: RequestInit = {},
): Promise<Record<string, unknown>> {
  const url = `${FB_GRAPH_BASE}/${GRAPH_VERSION}${path}`;
  const res = await fetch(url, opts);
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = body['error'] as Record<string, unknown> | undefined;
    throw new Error(
      `Meta API ${res.status}: ${(err?.['message'] as string | undefined) ?? 'unknown error'}`,
    );
  }
  return body;
}

export class MetaInstagramAdapter implements InstagramAdapter {
  async exchangeCodeForToken(code: string): Promise<TokenResult> {
    const params = new URLSearchParams({
      client_id: env.INSTAGRAM_APP_ID ?? '',
      client_secret: env.INSTAGRAM_APP_SECRET,
      grant_type: 'authorization_code',
      redirect_uri: env.INSTAGRAM_OAUTH_REDIRECT_URI ?? '',
      code,
    });
    const body = await graphFetch('/oauth/access_token', {
      method: 'POST',
      body: params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return {
      accessToken: body['access_token'] as string,
      expiresIn: (body['expires_in'] as number | undefined) ?? 3600,
    };
  }

  async getLongLivedToken(shortLivedToken: string): Promise<TokenResult> {
    const body = await graphFetch(
      `/access_token?grant_type=ig_exchange_token&client_secret=${env.INSTAGRAM_APP_SECRET}&access_token=${shortLivedToken}`,
    );
    return {
      accessToken: body['access_token'] as string,
      expiresIn: (body['expires_in'] as number | undefined) ?? 5183944, // ~60 days
    };
  }

  async refreshToken(accessToken: string): Promise<TokenResult> {
    const body = await graphFetch(
      `/refresh_access_token?grant_type=ig_refresh_token&access_token=${accessToken}`,
    );
    return {
      accessToken: body['access_token'] as string,
      expiresIn: (body['expires_in'] as number | undefined) ?? 5183944,
    };
  }

  async subscribeWebhook(igUserId: string, accessToken: string): Promise<void> {
    await graphFetch(`/${igUserId}/subscribed_apps`, {
      method: 'POST',
      body: new URLSearchParams({
        subscribed_fields: 'messages,messaging_postbacks,message_reads',
        access_token: accessToken,
      }),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  }

  async unsubscribeWebhook(igUserId: string, accessToken: string): Promise<void> {
    await graphFetch(`/${igUserId}/subscribed_apps`, {
      method: 'DELETE',
      body: new URLSearchParams({ access_token: accessToken }),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  }

  async getUserProfile(igUserId: string, accessToken: string): Promise<UserProfile> {
    const body = await graphFetch(
      `/${igUserId}?fields=id,username,profile_picture_url&access_token=${accessToken}`,
    );
    const pic = body['profile_picture_url'] as string | undefined;
    return {
      igUserId: body['id'] as string,
      username: body['username'] as string,
      ...(pic !== undefined ? { profilePictureUrl: pic } : {}),
    };
  }

  async getSenderProfile(senderIgUserId: string, accessToken: string): Promise<SenderProfile> {
    const body = await graphFetch(
      `/${senderIgUserId}?fields=username,name,profile_pic&access_token=${accessToken}`,
    );
    const username = body['username'] as string | undefined;
    const name = body['name'] as string | undefined;
    const pic = body['profile_pic'] as string | undefined;
    return {
      ...(username !== undefined ? { username } : {}),
      ...(name !== undefined ? { name } : {}),
      ...(pic !== undefined ? { profilePictureUrl: pic } : {}),
    };
  }

  async sendMessage(
    recipientIgUserId: string,
    content: MessageContent,
    accessToken: string,
    platform: 'INSTAGRAM' | 'FACEBOOK' = 'INSTAGRAM',
  ): Promise<{ mid: string }> {
    const message =
      content.type === 'text'
        ? { text: content.text ?? '' }
        : { attachment: { type: content.type, payload: { url: content.mediaUrl } } };
    const fetcher = platform === 'FACEBOOK' ? fbGraphFetch : graphFetch;
    const body = await fetcher(`/me/messages?access_token=${accessToken}`, {
      method: 'POST',
      body: JSON.stringify({ recipient: { id: recipientIgUserId }, message }),
      headers: { 'Content-Type': 'application/json' },
    });
    return { mid: body['message_id'] as string };
  }

  async getFacebookPages(userAccessToken: string): Promise<FacebookPage[]> {
    const body = await fbGraphFetch(`/me/accounts?access_token=${userAccessToken}&fields=id,name,access_token,category,picture`);
    return (body['data'] as FacebookPage[]) ?? [];
  }

  async subscribeFacebookWebhook(pageId: string, pageAccessToken: string): Promise<void> {
    await fbGraphFetch(`/${pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,feed&access_token=${pageAccessToken}`, { method: 'POST' });
  }

  async unsubscribeFacebookWebhook(pageId: string, pageAccessToken: string): Promise<void> {
    await fbGraphFetch(`/${pageId}/subscribed_apps?access_token=${pageAccessToken}`, { method: 'DELETE' });
  }
}

// ─── Sandbox implementation (tests + local dev without Meta credentials) ─────

export class SandboxInstagramAdapter implements InstagramAdapter {
  async exchangeCodeForToken(code: string): Promise<TokenResult> {
    return { accessToken: `sb-short-${code}`, expiresIn: 3600 };
  }

  async getLongLivedToken(shortLivedToken: string): Promise<TokenResult> {
    return { accessToken: `sb-long-${shortLivedToken}`, expiresIn: 5183944 };
  }

  async refreshToken(accessToken: string): Promise<TokenResult> {
    return { accessToken: `sb-refreshed-${accessToken}`, expiresIn: 5183944 };
  }

  async subscribeWebhook(_igUserId: string, _accessToken: string): Promise<void> {
    // no-op in sandbox
  }

  async unsubscribeWebhook(_igUserId: string, _accessToken: string): Promise<void> {
    // no-op in sandbox
  }

  async getUserProfile(igUserId: string, accessToken: string): Promise<UserProfile> {
    // 'me' is passed during OAuth; derive a stable igUserId from the access token
    // so determinism holds across test runs (same code → same igUserId).
    const resolvedId =
      igUserId === 'me'
        ? `sbig-${accessToken.replace('sb-long-sb-short-', '').replace(/[^a-z0-9]/g, '-')}`
        : igUserId;
    return { igUserId: resolvedId, username: `sandbox_${resolvedId}` };
  }

  async getSenderProfile(senderIgUserId: string, _accessToken: string): Promise<SenderProfile> {
    return { username: `sender_${senderIgUserId}` };
  }

  async sendMessage(
    _recipientIgUserId: string,
    _content: MessageContent,
    _accessToken: string,
    _platform?: 'INSTAGRAM' | 'FACEBOOK',
  ): Promise<{ mid: string }> {
    return { mid: `sandbox_mid_${Date.now()}` };
  }

  async getFacebookPages(_userAccessToken: string): Promise<FacebookPage[]> {
    return [{ id: 'fb_page_1', name: 'Sandbox FB Page', access_token: 'sandbox_fb_token', category: 'Testing' }];
  }

  async subscribeFacebookWebhook(_pageId: string, _pageAccessToken: string): Promise<void> {}
  async unsubscribeFacebookWebhook(_pageId: string, _pageAccessToken: string): Promise<void> {}
}

// Singleton adapter — swapped to SandboxInstagramAdapter in tests via module mocking.
export const instagramAdapter: InstagramAdapter =
  env.NODE_ENV === 'test' ? new SandboxInstagramAdapter() : new MetaInstagramAdapter();
