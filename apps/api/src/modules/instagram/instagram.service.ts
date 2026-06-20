// Instagram module service — OAuth flow, account management, token lifecycle.
//
// OAuth initiation sets a Redis nonce + signs a state JWT.
// OAuth callback validates the JWT, resolves the nonce, exchanges the code, stores the account.
// All callback error paths throw OAuthCallbackError which the controller converts to redirects
// (never JSON — see signoff §4.2 / A4).
//
// Token storage: access tokens are AES-256-GCM encrypted before writing to the DB.
// Plan limits: enforced against PLAN_LIMITS[plan].instagramAccounts before account creation.

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { InstagramAccount } from '@prisma/client';
import { withTenant } from '../../core/tenancy/with-tenant.js';
import { requireTenantContext } from '../../core/tenancy/context.js';
import { PLAN_LIMITS } from '@leados/shared';
import { env } from '../../core/config/env.js';
import { cacheRedis } from '../../core/redis/client.js';
import { encryptField, decryptField } from '../../core/crypto/field-encryption.js';
import { enqueue } from '../../core/queue/queues.js';
import { QUEUE } from '../../core/queue/names.js';
import { logger } from '../../core/observability/logger.js';
import { instagramAdapter } from './instagram.adapter.js';
import { PrismaInstagramAccountRepository } from './instagram.repository.js';

// ─── Error type for OAuth callback (controller converts to browser redirect) ─

export class OAuthCallbackError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'OAuthCallbackError';
  }
}

// ─── Redis key helpers ────────────────────────────────────────────────────────

const OAUTH_STATE_TTL = 900; // 15 minutes in seconds
function oauthStateKey(nonce: string): string {
  return `oauth:state:${nonce}`;
}

// ─── State JWT payload shape ─────────────────────────────────────────────────

interface OAuthStatePayload {
  nonce: string;
}

interface OAuthStateData {
  userId: string;
  orgId: string;
}

// ─── Redirect URL helpers ─────────────────────────────────────────────────────

function settingsUrl(params: Record<string, string>): string {
  const base = `${env.APP_WEB_ORIGIN}/settings/integrations/instagram`;
  const qs = new URLSearchParams(params).toString();
  return `${base}?${qs}`;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class InstagramService {

  /**
   * Initiate Instagram OAuth. Stores state in Redis; returns the Meta OAuth URL.
   * Caller must have `org.connect_social` permission (enforced at route level).
   */
  async initiateOAuth(): Promise<{ redirectUrl: string }> {
    const ctx = requireTenantContext();

    const nonce = crypto.randomUUID();
    const stateData: OAuthStateData = { userId: ctx.userId, orgId: ctx.organizationId };
    await cacheRedis.set(oauthStateKey(nonce), JSON.stringify(stateData), 'EX', OAUTH_STATE_TTL);

    const state = jwt.sign({ nonce } satisfies OAuthStatePayload, env.OAUTH_STATE_SECRET, {
      expiresIn: '15m',
      algorithm: 'HS256',
    });

    const params = new URLSearchParams({
      client_id: env.INSTAGRAM_APP_ID ?? '',
      redirect_uri: env.INSTAGRAM_OAUTH_REDIRECT_URI ?? '',
      scope: 'instagram_basic,instagram_manage_messages,pages_messaging',
      response_type: 'code',
      state,
    });

    const redirectUrl = `https://api.instagram.com/oauth/authorize?${params.toString()}`;
    return { redirectUrl };
  }

  /**
   * Handle the OAuth callback. All error paths throw OAuthCallbackError.
   * On success returns the success redirect URL.
   */
  async handleCallback(
    code: string | undefined,
    stateJwt: string | undefined,
    metaError: string | undefined,
  ): Promise<{ successRedirectUrl: string }> {
    // 1. Meta-side error (user denied or Meta error param)
    if (metaError) {
      throw new OAuthCallbackError('ACCESS_DENIED');
    }

    if (!stateJwt || !code) {
      throw new OAuthCallbackError('INVALID_STATE');
    }

    // 2. Verify state JWT signature
    let nonce: string;
    try {
      const payload = jwt.verify(stateJwt, env.OAUTH_STATE_SECRET, {
        algorithms: ['HS256'],
      }) as OAuthStatePayload;
      nonce = payload.nonce;
    } catch {
      throw new OAuthCallbackError('INVALID_STATE');
    }

    // 3. Look up nonce in Redis
    const raw = await cacheRedis.get(oauthStateKey(nonce));
    if (!raw) {
      throw new OAuthCallbackError('STATE_EXPIRED');
    }

    // 4. Single-use: delete nonce immediately after retrieval
    await cacheRedis.del(oauthStateKey(nonce));

    const { orgId } = JSON.parse(raw) as OAuthStateData;

    // 5. Exchange code for tokens
    const shortLived = await instagramAdapter.exchangeCodeForToken(code);
    const longLived = await instagramAdapter.getLongLivedToken(shortLived.accessToken);

    // 6. Fetch IG user profile via adapter ('me' resolves to the OAuth user in Meta's API).
    const profile = await instagramAdapter.getUserProfile('me', longLived.accessToken);
    const igUserId = profile.igUserId;
    const igUsername = profile.username;
    const profilePictureUrl = profile.profilePictureUrl;

    const tokenExpiresAt = new Date(Date.now() + longLived.expiresIn * 1000);
    const encryptedToken = encryptField(longLived.accessToken);

    // 7. Persist account inside tenant context
    try {
      await withTenant(orgId, async (db) => {
        const repo = new PrismaInstagramAccountRepository(db);

        // Duplicate check first — more specific than plan limit
        const alreadyConnected = await repo.isIgUserIdConnected(igUserId);
        if (alreadyConnected) {
          throw new OAuthCallbackError('ALREADY_CONNECTED');
        }

        // Plan limit check
        const sub = await db.subscription.findFirst({ select: { plan: true } });
        const plan = (sub?.plan ?? 'TRIAL') as keyof typeof PLAN_LIMITS;
        const limit = PLAN_LIMITS[plan].instagramAccounts;
        const current = await repo.count();
        if (current >= limit) {
          throw new OAuthCallbackError('PLAN_LIMIT_EXCEEDED');
        }

        const createData: import('./instagram.repository.js').CreateInstagramAccountData = {
          igUserId,
          igUsername,
          accessToken: encryptedToken,
          tokenExpiresAt,
          tokenType: 'bearer',
          webhookSubscribed: false,
        };
        if (profilePictureUrl !== undefined) {
          createData.profilePictureUrl = profilePictureUrl;
        }
        const account = await repo.create(createData);

        // 8. Subscribe webhook (fire-and-forget with retry queue on failure)
        try {
          await instagramAdapter.subscribeWebhook(igUserId, longLived.accessToken);
          await repo.update(account.id, { webhookSubscribed: true });
        } catch (subscribeErr) {
          logger.warn({ message: 'Webhook subscription failed, enqueuing retry', igUserId, error: String(subscribeErr) });
          // Retry via WEBHOOK_PROCESSING queue per signoff A13
          await enqueue(QUEUE.WEBHOOK_PROCESSING, 'instagram-webhook-subscribe', {
            igUserId,
            igAccountId: account.id,
            orgId,
          });
        }

        logger.info({ message: 'Instagram account connected', orgId, igUserId, accountId: account.id });
      });
    } catch (err) {
      // Re-throw OAuthCallbackErrors so the controller can redirect correctly
      if (err instanceof OAuthCallbackError) throw err;
      logger.error({ message: 'OAuth callback DB error', orgId, igUserId, error: String(err) });
      throw new OAuthCallbackError('ACCESS_DENIED');
    }

    return { successRedirectUrl: settingsUrl({ connected: '1' }) };
  }

  errorRedirectUrl(code: string): string {
    return settingsUrl({ error: code });
  }

  /** List connected (non-deleted) Instagram accounts for the current tenant. */
  async listAccounts(): Promise<InstagramAccount[]> {
    const ctx = requireTenantContext();
    return withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaInstagramAccountRepository(db);
      return repo.findAll();
    });
  }

  /** Disconnect an account: unsubscribe webhook, soft-delete, set status=DISCONNECTED. */
  async disconnectAccount(id: string): Promise<void> {
    const ctx = requireTenantContext();
    await withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaInstagramAccountRepository(db);
      const account = await repo.findByIdOrThrow(id);

      // Decrypt token to call Meta API for unsubscribe (best-effort)
      try {
        const plainToken = decryptField(account.accessToken);
        await instagramAdapter.unsubscribeWebhook(account.igUserId, plainToken);
      } catch (err) {
        logger.warn({ message: 'Webhook unsubscribe failed during disconnect', id, error: String(err) });
      }

      await repo.update(id, { status: 'DISCONNECTED', deletedAt: new Date(), webhookSubscribed: false });
      logger.info({ message: 'Instagram account disconnected', orgId: ctx.organizationId, accountId: id });
    });
  }

  /**
   * Refresh tokens expiring within the next 7 days.
   * Called by the daily cron job (`instagram-token-refresh`).
   */
  async refreshAllActiveTokens(): Promise<void> {
    const { prisma } = await import('../../core/prisma/client.js');
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const expiring = await prisma.instagramAccount.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        tokenExpiresAt: { lte: sevenDaysFromNow },
      },
      select: { id: true, organizationId: true, accessToken: true, igUserId: true },
    });

    logger.info({ message: 'Instagram token refresh: found expiring accounts', count: expiring.length });

    for (const account of expiring) {
      try {
        const plainToken = decryptField(account.accessToken);
        const refreshed = await instagramAdapter.refreshToken(plainToken);
        const encryptedToken = encryptField(refreshed.accessToken);
        const tokenExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000);

        await withTenant(account.organizationId, async (db) => {
          const repo = new PrismaInstagramAccountRepository(db);
          await repo.update(account.id, { accessToken: encryptedToken, tokenExpiresAt, status: 'ACTIVE' });
        });

        logger.info({ message: 'Instagram token refreshed', accountId: account.id });
      } catch (err) {
        logger.warn({ message: 'Instagram token refresh failed', accountId: account.id, error: String(err) });
        // Mark as EXPIRED so the UI shows the user they need to reconnect
        try {
          await withTenant(account.organizationId, async (db) => {
            const repo = new PrismaInstagramAccountRepository(db);
            await repo.update(account.id, { status: 'EXPIRED' });
          });
        } catch {
          // best-effort status update
        }
      }
    }
  }
}
