// Prisma client singleton (INFRA-2.3).
//
// IMPORTANT (FINAL_ARCHITECTURE §2): the corrected multi-tenant mechanism — a per-unit-of-
// work transaction that sets `app.current_organization_id` via set_config(...,true), plus
// a tenant client extension scoping ALL operations, plus RLS — is implemented in Sprint 3.
// Sprint 1 exposes only the base client + a connectivity ping for /health/deep. No
// tenant-scoped queries exist yet.

import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export async function pingDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
