// CRM-8.3 — Pipeline controller (thin HTTP translation layer).
// Reads validated request data, calls the service, and writes the response envelope.

import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/envelope.js';
import type { PipelineService } from './pipeline.service.js';
import type { CreatePipeline, PatchPipeline, CreateStage, PatchStage, ReorderStages } from '@leados/shared';

export interface PipelineController {
  list(req: Request, res: Response): Promise<void>;
  create(req: Request, res: Response): Promise<void>;
  getById(req: Request, res: Response): Promise<void>;
  update(req: Request, res: Response): Promise<void>;
  remove(req: Request, res: Response): Promise<void>;
  createStage(req: Request, res: Response): Promise<void>;
  updateStage(req: Request, res: Response): Promise<void>;
  deleteStage(req: Request, res: Response): Promise<void>;
  reorderStages(req: Request, res: Response): Promise<void>;
}

export function createPipelineController(service: PipelineService): PipelineController {
  return {
    async list(_req, res) {
      const pipelines = await service.list();
      sendSuccess(res, pipelines);
    },

    async create(req, res) {
      const pipeline = await service.create(req.body as CreatePipeline);
      sendSuccess(res, pipeline, 201);
    },

    async getById(req, res) {
      const pipeline = await service.getById(req.params['id']!);
      sendSuccess(res, pipeline);
    },

    async update(req, res) {
      const pipeline = await service.update(req.params['id']!, req.body as PatchPipeline);
      sendSuccess(res, pipeline);
    },

    async remove(req, res) {
      await service.delete(req.params['id']!);
      sendSuccess(res, null, 204);
    },

    async createStage(req, res) {
      const stage = await service.createStage(req.params['id']!, req.body as CreateStage);
      sendSuccess(res, stage, 201);
    },

    async updateStage(req, res) {
      const stage = await service.updateStage(
        req.params['id']!,
        req.params['stageId']!,
        req.body as PatchStage,
      );
      sendSuccess(res, stage);
    },

    async deleteStage(req, res) {
      await service.deleteStage(req.params['id']!, req.params['stageId']!);
      sendSuccess(res, null, 204);
    },

    async reorderStages(req, res) {
      const stages = await service.reorderStages(req.params['id']!, req.body as ReorderStages);
      sendSuccess(res, stages);
    },
  };
}
