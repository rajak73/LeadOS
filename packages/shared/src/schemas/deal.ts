// Sprint 5 M1 — Deal Zod schemas.
// Used by both API validation middleware and frontend form validation.
// Note: stageId and status are NOT patchable via patchDealSchema.
//   Stage moves use moveDealSchema (POST /:id/move).
//   Status changes use won/lost endpoints (POST /:id/won, POST /:id/lost).

import { z } from 'zod';
import { paginationQuerySchema } from './index.js';
import { DealStatus } from '../constants/enums.js';

export const createDealSchema = z.object({
  title: z.string().min(1).max(200),
  value: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  pipelineId: z.string().uuid(),
  stageId: z.string().uuid(),
  leadId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional(),
  expectedCloseDate: z.coerce.date().optional(),
  customFields: z.record(z.unknown()).optional(),
});
export type CreateDeal = z.infer<typeof createDealSchema>;

export const patchDealSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  value: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  assignedToId: z.string().uuid().optional(),
  expectedCloseDate: z.coerce.date().optional(),
  customFields: z.record(z.unknown()).optional(),
});
export type PatchDeal = z.infer<typeof patchDealSchema>;

export const moveDealSchema = z.object({
  stageId: z.string().uuid(),
});
export type MoveDeal = z.infer<typeof moveDealSchema>;

export const lostDealSchema = z.object({
  reason: z.string().max(500).optional(),
});
export type LostDeal = z.infer<typeof lostDealSchema>;

export const dealListQuerySchema = paginationQuerySchema.extend({
  pipelineId: z.string().uuid().optional(),
  stageId: z.string().uuid().optional(),
  status: z.array(z.nativeEnum(DealStatus)).optional(),
  assignedToId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  valueMin: z.coerce.number().nonnegative().optional(),
  valueMax: z.coerce.number().nonnegative().optional(),
  closedFrom: z.coerce.date().optional(),
  closedTo: z.coerce.date().optional(),
});
export type DealListQuery = z.infer<typeof dealListQuerySchema>;
