import type { Request, Response } from 'express';
import { TeamService } from './team.service.js';
import { sendSuccess } from '../../core/http/envelope.js';
import { requireTenantContext } from '../../core/tenancy/context.js';
import { z } from 'zod';
import { AppError } from '../../core/errors/app-error.js';

export class TeamController {
  constructor(private readonly service: TeamService) {}

  async inviteMember(req: Request, res: Response) {
    const ctx = requireTenantContext();
    const schema = z.object({
      email: z.string().email(),
      role: z.string().min(1),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) throw AppError.validation('Invalid request body');

    const result = await this.service.inviteMember(ctx.organizationId, parsed.data.email, parsed.data.role);
    sendSuccess(res, result);
  }

  async updateRole(req: Request, res: Response) {
    const ctx = requireTenantContext();
    const userId = req.params.userId;
    if (!userId) throw AppError.validation('Missing user ID');

    const schema = z.object({
      role: z.string().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) throw AppError.validation('Invalid role');

    const result = await this.service.updateRole(ctx.organizationId, userId, parsed.data.role);
    sendSuccess(res, { member: result });
  }

  async removeMember(req: Request, res: Response) {
    const ctx = requireTenantContext();
    const userId = req.params.userId;
    if (!userId) throw AppError.validation('Missing user ID');

    await this.service.removeMember(ctx.organizationId, userId);
    sendSuccess(res, { message: 'Member removed' });
  }
}
