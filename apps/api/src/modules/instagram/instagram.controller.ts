// Instagram controller — thin HTTP translation layer.
//
// handleCallback is the only method that redirects; all other methods return JSON envelopes.
// OAuthCallbackError from the service is caught here and converted to a browser redirect
// (never JSON — signoff §4.2 / A4).

import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/envelope.js';
import { logger } from '../../core/observability/logger.js';
import { InstagramService, OAuthCallbackError } from './instagram.service.js';

export interface InstagramController {
  initiateOAuth(req: Request, res: Response): Promise<void>;
  handleCallback(req: Request, res: Response): Promise<void>;
  listAccounts(req: Request, res: Response): Promise<void>;
  disconnectAccount(req: Request, res: Response): Promise<void>;
}

export function createInstagramController(service: InstagramService): InstagramController {
  return {
    async initiateOAuth(_req, res) {
      const result = await service.initiateOAuth();
      sendSuccess(res, result);
    },

    async handleCallback(req, res) {
      const { code, state, error } = req.query as Record<string, string | undefined>;
      try {
        const { successRedirectUrl } = await service.handleCallback(code, state, error);
        res.redirect(302, successRedirectUrl);
      } catch (err) {
        const code = err instanceof OAuthCallbackError ? err.code : 'INTERNAL_ERROR';
        if (!(err instanceof OAuthCallbackError)) {
          logger.error({ message: 'Unexpected OAuth callback error', error: String(err) });
        }
        res.redirect(302, service.errorRedirectUrl(code));
      }
    },

    async listAccounts(_req, res) {
      const accounts = await service.listAccounts();
      // Strip encrypted access tokens from the API response
      const safe = accounts.map(({ accessToken: _at, ...rest }) => rest);
      sendSuccess(res, safe);
    },

    async disconnectAccount(req, res) {
      await service.disconnectAccount(req.params['id']!);
      sendSuccess(res, null, 204);
    },
  };
}
