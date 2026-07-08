import type { Request, Response } from 'express';
import { OrganizationService } from './organization.service.js';
import { sendSuccess } from '../../core/http/envelope.js';
import { requireTenantContext } from '../../core/tenancy/context.js';
import { z } from 'zod';
import { AppError } from '../../core/errors/app-error.js';

export class OrganizationController {
  constructor(private readonly service: OrganizationService) {}

  async listOrganizations(req: Request, res: Response) {
    const search = req.query.search as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;

    const result = await this.service.listOrganizations(search, page, limit);
    sendSuccess(res, { items: result.items, total: result.total, page, limit });
  }

  async createOrganization(req: Request, res: Response) {
    const schema = z.object({
      name: z.string().min(1),
      industry: z.string().optional(),
      timezone: z.string().optional(),
      currency: z.string().optional(),
      language: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) throw AppError.validation('Invalid organization data');

    const ownerId = req.auth?.userId;
    if (!ownerId) throw AppError.unauthorized('User ID missing from auth context');

    const result = await this.service.createOrganization(parsed.data.name, ownerId, parsed.data);
    sendSuccess(res, { organization: result });
  }

  async getOwnOrganization(_req: Request, res: Response) {
    const ctx = requireTenantContext();
    const result = await this.service.getOrganization(ctx.organizationId);
    sendSuccess(res, { organization: result });
  }

  async suspendOrganization(req: Request, res: Response) {
    const id = req.params.id;
    if (!id) throw AppError.validation('Missing organization ID');
    const result = await this.service.suspendOrganization(id);
    sendSuccess(res, { organization: result });
  }

  async deleteOrganization(req: Request, res: Response) {
    const id = req.params.id;
    if (!id) throw AppError.validation('Missing organization ID');
    const result = await this.service.deleteOrganization(id);
    sendSuccess(res, { organization: result });
  }

  async deleteOwnOrganization(_req: Request, res: Response) {
    const ctx = requireTenantContext();
    const result = await this.service.deleteOrganization(ctx.organizationId);
    sendSuccess(res, { organization: result });
  }

  async getOrganizationUsage(req: Request, res: Response) {
    const id = req.params.id;
    if (!id) throw AppError.validation('Missing organization ID');
    const result = await this.service.getOrganizationUsage(id);
    sendSuccess(res, { usage: result });
  }

  async updateOrganization(req: Request, res: Response) {
    const ctx = requireTenantContext();
    
    const schema = z.object({
      name: z.string().min(1).optional(),
      industry: z.string().optional(),
      timezone: z.string().optional(),
      currency: z.string().optional(),
      language: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.validation('Invalid organization data');
    }

    const result = await this.service.updateOrganization(ctx.organizationId, parsed.data);
    sendSuccess(res, { organization: result });
  }
}
