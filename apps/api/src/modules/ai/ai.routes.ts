import { Router } from 'express';
import type { RequestHandler } from 'express';
import { createAiController } from './ai.controller.js';
import { validate } from '../../core/middleware/validate.js';
import { leadIdParamSchema } from '@leados/shared';

export function buildAiRouter(requirePermission: (permission: string) => RequestHandler): Router {
  const router = Router();
  const ctrl = createAiController();

  router.get(
    '/:id/score',
    requirePermission('leads.read'),
    validate(leadIdParamSchema, 'params'),
    (req, res, next) => ctrl.getLeadScore(req, res).catch(next),
  );

  router.post(
    '/:id/rescore',
    requirePermission('leads.update'),
    validate(leadIdParamSchema, 'params'),
    (req, res, next) => ctrl.rescoreLead(req, res).catch(next),
  );

  router.get(
    '/:id/follow-up-suggestion',
    requirePermission('leads.read'),
    validate(leadIdParamSchema, 'params'),
    (req, res, next) => ctrl.getFollowUpSuggestion(req, res).catch(next),
  );

  return router;
}
