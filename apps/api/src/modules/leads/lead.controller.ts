// CRM-2.4 — Lead controller (thin HTTP translation layer).
// CRM-4.1 — Activity feed handler.
// Reads validated request data, calls the service, and writes the response envelope.
// Tenant context is available via requireTenantContext() on every authenticated request.

import type { Request, Response } from 'express';
import { sendSuccess, buildPaginationMeta } from '../../core/http/envelope.js';
import type { LeadService } from './lead.service.js';
import type { CreateLeadInput, PatchLeadInput, PaginationQuery } from '@leados/shared';

export interface LeadController {
  create(req: Request, res: Response): Promise<void>;
  getById(req: Request, res: Response): Promise<void>;
  update(req: Request, res: Response): Promise<void>;
  softDelete(req: Request, res: Response): Promise<void>;
  convert(req: Request, res: Response): Promise<void>;
  listActivities(req: Request, res: Response): Promise<void>;
}

export function createLeadController(service: LeadService): LeadController {
  return {
    async create(req, res) {
      const lead = await service.create(req.body as CreateLeadInput);
      sendSuccess(res, lead, 201);
    },

    async getById(req, res) {
      const lead = await service.getById(req.params['id']!);
      sendSuccess(res, lead);
    },

    async update(req, res) {
      const lead = await service.update(req.params['id']!, req.body as PatchLeadInput);
      sendSuccess(res, lead);
    },

    async softDelete(req, res) {
      await service.softDelete(req.params['id']!);
      sendSuccess(res, null, 204);
    },

    async convert(req, res) {
      const result = await service.convert(req.params['id']!);
      sendSuccess(res, result, 201);
    },

    async listActivities(req, res) {
      const { page, limit } = req.query as unknown as PaginationQuery;
      const { items, total } = await service.listActivities(req.params['id']!, page, limit);
      sendSuccess(res, items, 200, buildPaginationMeta(page, limit, total));
    },
  };
}
