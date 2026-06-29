import type { Request, Response } from 'express';
import { CustomerService } from './customer.service.js';
import { sendSuccess } from '../../core/http/envelope.js';
import { requireTenantContext } from '../../core/tenancy/context.js';
import { z } from 'zod';
import { AppError } from '../../core/errors/app-error.js';

const listQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export class CustomerController {
  constructor(private readonly service: CustomerService) {
    this.listCustomers = this.listCustomers.bind(this);
    this.getCustomerProfile = this.getCustomerProfile.bind(this);
  }

  async listCustomers(req: Request, res: Response) {
    const ctx = requireTenantContext();
    const query = listQuerySchema.parse(req.query);

    const customers = await this.service.listCustomers(ctx.organizationId, query.search, query.page, query.limit);
    sendSuccess(res, customers);
  }

  async getCustomerProfile(req: Request, res: Response) {
    const ctx = requireTenantContext();
    const id = req.params.id;
    if (!id) throw AppError.validation('Missing ID');

    const profile = await this.service.getCustomerProfile(ctx.organizationId, id);
    sendSuccess(res, profile);
  }
}
