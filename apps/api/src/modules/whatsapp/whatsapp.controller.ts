// WhatsApp controller — thin HTTP translation layer.
// All methods return JSON envelopes (no redirects).
// Access tokens are stripped from API responses before sending.

import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/envelope.js';
import { WhatsAppService, type SendWhatsAppMessageInput } from './whatsapp.service.js';

export interface WhatsAppController {
  connectAccount(req: Request, res: Response): Promise<void>;
  listAccounts(req: Request, res: Response): Promise<void>;
  disconnectAccount(req: Request, res: Response): Promise<void>;
  syncTemplates(req: Request, res: Response): Promise<void>;
  listTemplates(req: Request, res: Response): Promise<void>;
  sendMessage(req: Request, res: Response): Promise<void>;
}

export function createWhatsAppController(service: WhatsAppService): WhatsAppController {
  return {
    async connectAccount(req, res) {
      const { wabaId, phoneNumberId, displayName, phoneNumber, accessToken } =
        req.body as {
          wabaId: string;
          phoneNumberId: string;
          displayName: string;
          phoneNumber: string;
          accessToken: string;
        };
      const account = await service.connectAccount({
        wabaId,
        phoneNumberId,
        displayName,
        phoneNumber,
        accessToken,
      });
      // Strip encrypted token from response
      const { accessToken: _at, ...safe } = account;
      sendSuccess(res, safe, 201);
    },

    async listAccounts(_req, res) {
      const accounts = await service.listAccounts();
      const safe = accounts.map(({ accessToken: _at, ...rest }) => rest);
      sendSuccess(res, safe);
    },

    async disconnectAccount(req, res) {
      await service.disconnectAccount(req.params['id']!);
      sendSuccess(res, null, 204);
    },

    async syncTemplates(req, res) {
      const count = await service.syncTemplates(req.params['accountId']!);
      sendSuccess(res, { synced: count });
    },

    async listTemplates(req, res) {
      const templates = await service.getTemplates(req.params['accountId']!);
      sendSuccess(res, templates);
    },

    async sendMessage(req, res) {
      const body = req.body as {
        conversationId: string;
        text?: string;
        templateName?: string;
        templateLanguage?: string;
        accountId: string;
      };
      const input: SendWhatsAppMessageInput = {
        conversationId: body.conversationId,
        accountId: body.accountId,
        ...(body.text !== undefined ? { text: body.text } : {}),
        ...(body.templateName !== undefined ? { templateName: body.templateName } : {}),
        ...(body.templateLanguage !== undefined ? { templateLanguage: body.templateLanguage } : {}),
      };
      const result = await service.sendMessage(input);
      sendSuccess(res, result, 201);
    },
  };
}
