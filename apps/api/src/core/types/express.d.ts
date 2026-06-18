// Express Request augmentation. In Sprint 1, `context` carries only the requestId.
// Auth/tenant fields (userId, organizationId, role, permissions, scoped db client) are
// added by their middleware in Sprints 2–3.

import 'express';

declare global {
  namespace Express {
    interface Request {
      context?: {
        requestId: string;
      };
    }
  }
}

export {};
