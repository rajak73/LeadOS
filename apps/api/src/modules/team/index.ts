import { Router } from 'express';
import { buildTeamRoutes } from './team.routes.js';
export function buildTeamModule(requirePermission: any): Router {
  return buildTeamRoutes(requirePermission);
}
