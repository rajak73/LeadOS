// CRM-5.2 — File controller (thin HTTP translation layer).

import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/envelope.js';
import type { FileService } from './file.service.js';
import type { PresignedUrlRequestInput, RecordFileInput } from '@leados/shared';

export interface FileController {
  presignedUrl(req: Request, res: Response): Promise<void>;
  recordMetadata(req: Request, res: Response): Promise<void>;
  softDelete(req: Request, res: Response): Promise<void>;
}

export function createFileController(service: FileService): FileController {
  return {
    async presignedUrl(req, res) {
      const result = await service.generatePresignedUrl(req.body as PresignedUrlRequestInput);
      sendSuccess(res, result);
    },

    async recordMetadata(req, res) {
      const file = await service.recordMetadata(req.body as RecordFileInput);
      sendSuccess(res, file, 201);
    },

    async softDelete(req, res) {
      await service.softDelete(req.params['id']!);
      sendSuccess(res, null, 204);
    },
  };
}
