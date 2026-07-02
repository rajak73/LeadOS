/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

import { Router } from 'express';
import { buildTeamRoutes } from './team.routes.js';
export function buildTeamModule(requirePermission: any): Router {
  return buildTeamRoutes(requirePermission);
}
