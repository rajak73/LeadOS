import type { Request, Response } from 'express';
import { prisma } from '../../core/prisma/client.js';
import { sendSuccess } from '../../core/http/envelope.js';
import { BillingService } from './billing.service.js';
import { AppError } from '../../core/errors/app-error.js';
import { ErrorCode } from '@leados/shared';

export class BillingController {
  private readonly service: BillingService;

  constructor() {
    this.service = new BillingService(prisma);
  }

  createCheckoutSession = async (req: Request, res: Response): Promise<void> => {
    const auth = req.auth;
    if (!auth?.organizationId || !auth?.userId) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Missing tenant context');
    }

    const { planId, successUrl, cancelUrl } = req.body as {
      planId: 'STARTER' | 'GROWTH' | 'ENTERPRISE';
      successUrl: string;
      cancelUrl: string;
    };

    if (!planId || !successUrl || !cancelUrl) {
      throw AppError.validation('Missing required parameter planId, successUrl, or cancelUrl');
    }

    // Resolve owner email and organization name
    const user = await prisma.user.findUnique({ where: { id: auth.userId }, select: { email: true } });
    const org = await prisma.organization.findUnique({ where: { id: auth.organizationId }, select: { name: true } });

    if (!user || !org) {
      throw new AppError(ErrorCode.NOT_FOUND, 'User or organization not found');
    }

    const customerId = await this.service.ensureCustomer(auth.organizationId, user.email, org.name);
    const session = await this.service.createCheckoutSession(
      auth.organizationId,
      planId,
      successUrl,
      cancelUrl,
      customerId
    );

    sendSuccess(res, session);
  };

  createPortalSession = async (req: Request, res: Response): Promise<void> => {
    const auth = req.auth;
    if (!auth?.organizationId) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Missing tenant context');
    }

    const { returnUrl } = req.body as { returnUrl: string };
    if (!returnUrl) {
      throw AppError.validation('Missing required parameter returnUrl');
    }

    const session = await this.service.createPortalSession(auth.organizationId, returnUrl);
    sendSuccess(res, session);
  };

  getSubscription = async (req: Request, res: Response): Promise<void> => {
    const auth = req.auth;
    if (!auth?.organizationId) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Missing tenant context');
    }

    const sub = await this.service.getSubscription(auth.organizationId);
    if (!sub) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Subscription record not found');
    }

    sendSuccess(res, sub);
  };
}

export function createBillingController(): BillingController {
  return new BillingController();
}
