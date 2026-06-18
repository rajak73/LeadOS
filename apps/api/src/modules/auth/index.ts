// Auth module public surface (the ONLY import path other modules / app.ts may use).
// Composition root: wires the Prisma repository + default email sender into the service.

import { Router } from 'express';
import { prisma } from '../../core/prisma/client.js';
import { AuthService } from './auth.service.js';
import { PrismaAuthRepository } from './auth.repository.js';
import { defaultEmailSender } from './email.js';
import { createAuthController } from './auth.controller.js';
import { buildAuthRouter } from './auth.routes.js';

function buildAuthModule(): { router: Router; service: AuthService } {
  const service = new AuthService(new PrismaAuthRepository(prisma), defaultEmailSender);
  const controller = createAuthController(service);
  const router = buildAuthRouter(controller);
  return { router, service };
}

const authModule = buildAuthModule();

export const authRouter: Router = authModule.router;
export { AuthService } from './auth.service.js';
export type { AuthRepository } from './auth.repository.js';
