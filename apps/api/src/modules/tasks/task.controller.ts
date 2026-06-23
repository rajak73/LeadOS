// CRM-4.4 — Task controller (thin HTTP translation layer).

import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/envelope.js';
import type { TaskService } from './task.service.js';
import type { CreateTaskInput, PatchTaskInput } from '@leados/shared';

export interface TaskController {
  create(req: Request, res: Response): Promise<void>;
  getById(req: Request, res: Response): Promise<void>;
  update(req: Request, res: Response): Promise<void>;
  softDelete(req: Request, res: Response): Promise<void>;
  list(req: Request, res: Response): Promise<void>;
}

export function createTaskController(service: TaskService): TaskController {
  return {
    async create(req, res) {
      const task = await service.create(req.body as CreateTaskInput);
      sendSuccess(res, task, 201);
    },

    async getById(req, res) {
      const task = await service.getById(req.params['id']!);
      sendSuccess(res, task);
    },

    async update(req, res) {
      const task = await service.update(req.params['id']!, req.body as PatchTaskInput);
      sendSuccess(res, task);
    },

    async softDelete(req, res) {
      await service.softDelete(req.params['id']!);
      sendSuccess(res, null, 204);
    },

    async list(req, res) {
      const filters: { status?: string; type?: string } = {};
      if (typeof req.query['status'] === 'string') {
        filters.status = req.query['status'];
      }
      if (typeof req.query['type'] === 'string') {
        filters.type = req.query['type'];
      }
      const tasks = await service.list(filters);
      sendSuccess(res, tasks);
    },
  };
}
