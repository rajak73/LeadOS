// Base Zod schemas reused across domains. Domain schemas (lead, deal, …) are added with
// their modules (S2+). These are the cross-cutting primitives only.

import { z } from 'zod';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '../http/envelope.js';

export const uuidSchema = z.string().uuid();

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const dateRangeSchema = z.object({
  createdAfter: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
});

// Health response contract (used by the API health controller and the BFF proxy test).
export const healthStatusSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  timestamp: z.string(),
});
export type HealthStatus = z.infer<typeof healthStatusSchema>;
