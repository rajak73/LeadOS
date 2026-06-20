// CRM-2.4 — Lead controller (thin HTTP translation layer).
// CRM-4.1 — Activity feed handler.
// CRM-5.1 — Notes sub-resource handler.
// CRM-5.2 — Files sub-resource handler.
// CRM-6.3 — CSV import handlers.
// CRM-6.4 — CSV export handlers.
// Reads validated request data, calls the service, and writes the response envelope.
// Tenant context is available via requireTenantContext() on every authenticated request.

import type { Request, Response } from 'express';
import { sendSuccess, buildPaginationMeta } from '../../core/http/envelope.js';
import type { LeadService } from './lead.service.js';
import type { CreateLeadInput, PatchLeadInput, PaginationQuery, LeadListQuery, LeadExportBody } from '@leados/shared';

export interface LeadController {
  list(req: Request, res: Response): Promise<void>;
  create(req: Request, res: Response): Promise<void>;
  getById(req: Request, res: Response): Promise<void>;
  update(req: Request, res: Response): Promise<void>;
  softDelete(req: Request, res: Response): Promise<void>;
  convert(req: Request, res: Response): Promise<void>;
  listActivities(req: Request, res: Response): Promise<void>;
  listNotes(req: Request, res: Response): Promise<void>;
  createNote(req: Request, res: Response): Promise<void>;
  listFiles(req: Request, res: Response): Promise<void>;
  importCsv(req: Request, res: Response): Promise<void>;
  getImportJob(req: Request, res: Response): Promise<void>;
  exportCsv(req: Request, res: Response): Promise<void>;
  getExportJob(req: Request, res: Response): Promise<void>;
}

export function createLeadController(service: LeadService): LeadController {
  return {
    async list(req, res) {
      const query = req.query as unknown as LeadListQuery;
      const { items, total } = await service.list(query);
      sendSuccess(res, items, 200, buildPaginationMeta(query.page, query.limit, total));
    },

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

    async listNotes(req, res) {
      const { page, limit } = req.query as unknown as PaginationQuery;
      const { items, total } = await service.listNotes(req.params['id']!, page, limit);
      sendSuccess(res, items, 200, buildPaginationMeta(page, limit, total));
    },

    async createNote(req, res) {
      const note = await service.createNote(
        req.params['id']!,
        req.body.content as Record<string, unknown>,
      );
      sendSuccess(res, note, 201);
    },

    async listFiles(req, res) {
      const { page, limit } = req.query as unknown as PaginationQuery;
      const { items, total } = await service.listFiles(req.params['id']!, page, limit);
      sendSuccess(res, items, 200, buildPaginationMeta(page, limit, total));
    },

    async importCsv(req, res) {
      const file = req.file;
      if (!file) {
        res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'CSV file is required' } });
        return;
      }
      const jobId = await service.startImport(file.buffer);
      sendSuccess(res, { jobId }, 202);
    },

    async getImportJob(req, res) {
      const result = await service.getImportJob(req.params['jobId']!);
      sendSuccess(res, result);
    },

    async exportCsv(req, res) {
      const filters = req.body as LeadExportBody;
      const jobId = await service.startExport(filters);
      sendSuccess(res, { jobId }, 202);
    },

    async getExportJob(req, res) {
      const result = await service.getExportJob(req.params['jobId']!);
      sendSuccess(res, result);
    },
  };
}
