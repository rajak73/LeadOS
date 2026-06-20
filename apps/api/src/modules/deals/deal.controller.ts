// CRM-9.3 — Deal controller (thin HTTP translation layer).

import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/envelope.js';
import type { DealService } from './deal.service.js';
import type { CreateDeal, DealListQuery, LostDeal, MoveDeal, PatchDeal } from '@leados/shared';

export interface DealController {
  list(req: Request, res: Response): Promise<void>;
  create(req: Request, res: Response): Promise<void>;
  getById(req: Request, res: Response): Promise<void>;
  update(req: Request, res: Response): Promise<void>;
  remove(req: Request, res: Response): Promise<void>;
  move(req: Request, res: Response): Promise<void>;
  markWon(req: Request, res: Response): Promise<void>;
  markLost(req: Request, res: Response): Promise<void>;
  forecast(req: Request, res: Response): Promise<void>;
  listActivities(req: Request, res: Response): Promise<void>;
}

export function createDealController(service: DealService): DealController {
  return {
    async list(req, res) {
      const page = await service.list(req.query as unknown as DealListQuery);
      sendSuccess(res, page);
    },

    async create(req, res) {
      const deal = await service.create(req.body as CreateDeal);
      sendSuccess(res, deal, 201);
    },

    async getById(req, res) {
      const deal = await service.getById(req.params['id']!);
      sendSuccess(res, deal);
    },

    async update(req, res) {
      const deal = await service.update(req.params['id']!, req.body as PatchDeal);
      sendSuccess(res, deal);
    },

    async remove(req, res) {
      await service.delete(req.params['id']!);
      sendSuccess(res, null, 204);
    },

    async move(req, res) {
      const deal = await service.move(req.params['id']!, req.body as MoveDeal);
      sendSuccess(res, deal);
    },

    async markWon(req, res) {
      const deal = await service.markWon(req.params['id']!);
      sendSuccess(res, deal);
    },

    async markLost(req, res) {
      const deal = await service.markLost(req.params['id']!, req.body as LostDeal);
      sendSuccess(res, deal);
    },

    async forecast(req, res) {
      const pipelineId = typeof req.query['pipelineId'] === 'string' ? req.query['pipelineId'] : undefined;
      const forecast = await service.forecast(pipelineId);
      sendSuccess(res, forecast);
    },

    async listActivities(req, res) {
      const q = req.query as unknown as { page: number; limit: number };
      const result = await service.listActivities(req.params['id']!, q.page, q.limit);
      sendSuccess(res, result);
    },
  };
}
