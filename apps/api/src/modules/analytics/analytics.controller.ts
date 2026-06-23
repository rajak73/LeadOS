import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/envelope.js';
import { AnalyticsService } from './analytics.service.js';

export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  getDashboardSummary = async (_req: Request, res: Response): Promise<void> => {
    const summary = await this.service.getDashboardSummary();
    sendSuccess(res, summary);
  };
}

export function createAnalyticsController(): AnalyticsController {
  const service = new AnalyticsService();
  return new AnalyticsController(service);
}
