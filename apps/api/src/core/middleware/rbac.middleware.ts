// RBAC middleware — STUB (Sprint 1).
// Real implementation lands in Sprint 3: enforce the permission matrix (doc 11) and set
// `ownOnly` when only a *_own permission is held. The factory signature is established now
// so routes can be authored against a stable contract; it currently passes through.

import type { RequestHandler } from 'express';
import type { PermissionKey } from '@leados/shared';

export function requirePermission(_permission: PermissionKey): RequestHandler {
  return (_req, _res, next) => {
    next();
  };
}
