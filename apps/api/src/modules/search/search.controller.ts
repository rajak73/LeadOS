import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/envelope.js';
import { SearchService } from './search.service.js';

export function createSearchController(service: SearchService) {
  return {
    async search(req: Request, res: Response): Promise<void> {
      const q = typeof req.query['q'] === 'string' ? req.query['q'] : '';
      const results = await service.search(q);
      sendSuccess(res, results);
    },
    async adminSearch(req: Request, res: Response): Promise<void> {
      const q = typeof req.query['q'] === 'string' ? req.query['q'] : '';
      const results = await service.adminSearch(q);
      sendSuccess(res, results);
    },
  };
}
