// Express Request augmentation.
// - `context` (Sprint 1): requestId.
// - `auth` (Sprint 2): set by authMiddleware when a valid access token is present.
// Tenant scoping fields (scoped db client, permissions) are added in Sprint 3.

import 'express';

declare global {
  namespace Express {
    interface Request {
      context?: {
        requestId: string;
      };
      auth?: {
        userId: string;
        organizationId: string;
        role: string;
        isSuperAdmin: boolean;
      };
    }
  }
}

export {};
