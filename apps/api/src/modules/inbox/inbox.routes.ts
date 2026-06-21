// Inbox routes — M3 read-only, M4 send, M6 saved-replies + create-lead.

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

  // PATCH /inbox/conversations/:id — assign or open/close (inbox.assign)
  router.patch(
    '/conversations/:id',
    requirePermission('inbox.assign'),
    (req, res, next) => ctrl.updateConversation(req, res).catch(next),
  );

  // POST /inbox/conversations/:id/messages
  // inbox.reply_own holders (SALES_EXECUTIVE) can reply to their assigned conversations only;
  // decide() sets ownOnly=true, service enforces the assignee check.
  router.post(
    '/conversations/:id/messages',
    requirePermission('inbox.reply'),
    (req, res, next) => ctrl.sendMessage(req, res).catch(next),
  );

  // POST /inbox/conversations/:id/leads — create a Lead from a conversation (MANAGER+)
  // SALES_EXECUTIVE does not have inbox.assign; intentional per M6 signoff §R-4
  router.post(
    '/conversations/:id/leads',
    requirePermission('inbox.assign'),
    (req, res, next) => ctrl.createLeadFromConversation(req, res).catch(next),
  );

  // Saved Replies — org-scoped template store
  // GET: inbox.read (SALES_EXECUTIVE satisfies via inbox.read_own — ownOnly has no effect on global list)
  // POST/PATCH/DELETE: inbox.assign (MANAGER+ only — global template management)
  router.get(
    '/saved-replies',
    requirePermission('inbox.read'),
    (req, res, next) => ctrl.listSavedReplies(req, res).catch(next),
  );

  router.post(
    '/saved-replies',
    requirePermission('inbox.assign'),
    (req, res, next) => ctrl.createSavedReply(req, res).catch(next),
  );

  router.patch(
    '/saved-replies/:id',
    requirePermission('inbox.assign'),
    (req, res, next) => ctrl.updateSavedReply(req, res).catch(next),
  );

  router.delete(
    '/saved-replies/:id',
    requirePermission('inbox.assign'),
    (req, res, next) => ctrl.deleteSavedReply(req, res).catch(next),
  );

  return router;
}
