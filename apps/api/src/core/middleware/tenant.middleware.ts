// Tenant middleware — STUB (Sprint 1).
// Real implementation lands in Sprint 3: validate org membership, set the request-scoped
// unit-of-work transaction tenant context (set_config('app.current_organization_id', …)),
// per FINAL_ARCHITECTURE §2. Pass-through only for now to keep middleware order stable.

import type { RequestHandler } from 'express';

export const tenantMiddleware: RequestHandler = (_req, _res, next) => {
  next();
};
