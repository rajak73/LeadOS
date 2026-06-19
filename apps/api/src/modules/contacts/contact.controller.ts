// CRM-3.3 — Contact controller (thin HTTP translation layer).
// CRM-4.1 — Activity feed handler.
// Reads validated request data, calls the service, and writes the response envelope.

import type { Request, Response } from 'express';
import { sendSuccess, buildPaginationMeta } from '../../core/http/envelope.js';
import type { ContactService } from './contact.service.js';
import type { CreateContactInput, PatchContactInput, PaginationQuery } from '@leados/shared';

export interface ContactController {
  create(req: Request, res: Response): Promise<void>;
  getById(req: Request, res: Response): Promise<void>;
  update(req: Request, res: Response): Promise<void>;
  softDelete(req: Request, res: Response): Promise<void>;
  listActivities(req: Request, res: Response): Promise<void>;
}

export function createContactController(service: ContactService): ContactController {
  return {
    async create(req, res) {
      const contact = await service.create(req.body as CreateContactInput);
      sendSuccess(res, contact, 201);
    },

    async getById(req, res) {
      const contact = await service.getById(req.params['id']!);
      sendSuccess(res, contact);
    },

    async update(req, res) {
      const contact = await service.update(req.params['id']!, req.body as PatchContactInput);
      sendSuccess(res, contact);
    },

    async softDelete(req, res) {
      await service.softDelete(req.params['id']!);
      sendSuccess(res, null, 204);
    },

    async listActivities(req, res) {
      const { page, limit } = req.query as unknown as PaginationQuery;
      const { items, total } = await service.listActivities(req.params['id']!, page, limit);
      sendSuccess(res, items, 200, buildPaginationMeta(page, limit, total));
    },
  };
}
