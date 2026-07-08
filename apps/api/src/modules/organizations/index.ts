import type { RequestHandler } from 'express';
import { buildOrganizationAdminRoutes, buildOrganizationTenantRoutes } from './organization.routes.js';

export function buildOrganizationModule(requirePermission?: (permission: string) => RequestHandler) {
  return {
    adminRouter: buildOrganizationAdminRoutes(),
    tenantRouter: buildOrganizationTenantRoutes(requirePermission),
  };
}
