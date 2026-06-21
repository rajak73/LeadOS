// Inbox routes — M3 read-only endpoints.
// M4 adds POST /conversations/:id/messages.

import { Router } from 'express';
import { buildInboxController } from './inbox.controller.js';

export function buildInboxRouter(requirePermission: (permission: string) => import('express').RequestHandler): Router {
  const router = Router();
  const ctrl = buildInboxController();

  // GET /inbox/conversations
  // requirePermission('inbox.read') also grants access to holders of 'inbox.read_own'
  // (the decide() function sets ownOnly=true for _own variants — service enforces the filter)
  router.get(
    '/conversations',
    requirePermission('inbox.read'),
    (req, res, next) => ctrl.listConversations(req, res).catch(next),
  );

  // GET /inbox/conversations/:id
  router.get(
    '/conversations/:id',
    requirePermission('inbox.read'),
    (req, res, next) => ctrl.getConversation(req, res).catch(next),
  );

  // GET /inbox/conversations/:id/messages
  router.get(
    '/conversations/:id/messages',
    requirePermission('inbox.read'),
    (req, res, next) => ctrl.listMessages(req, res).catch(next),
  );

  return router;
}
