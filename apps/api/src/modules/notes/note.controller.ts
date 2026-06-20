// CRM-5.1 — Note controller (thin HTTP translation layer).

import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/envelope.js';
import type { NoteService } from './note.service.js';
import type { CreateNoteInput, PatchNoteInput } from '@leados/shared';

export interface NoteController {
  create(req: Request, res: Response): Promise<void>;
  update(req: Request, res: Response): Promise<void>;
  softDelete(req: Request, res: Response): Promise<void>;
}

export function createNoteController(service: NoteService): NoteController {
  return {
    async create(req, res) {
      const note = await service.create(req.body as CreateNoteInput);
      sendSuccess(res, note, 201);
    },

    async update(req, res) {
      const note = await service.update(req.params['id']!, req.body as PatchNoteInput);
      sendSuccess(res, note);
    },

    async softDelete(req, res) {
      await service.softDelete(req.params['id']!);
      sendSuccess(res, null, 204);
    },
  };
}
