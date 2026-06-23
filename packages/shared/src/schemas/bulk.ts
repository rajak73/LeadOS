import { z } from 'zod';

export const bulkLeadsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  action: z.enum(['update-status', 'assign', 'delete', 'add-tags', 'remove-tags']),
  status: z.string().optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string()).optional(),
  lostReason: z.string().optional(),
});
export type BulkLeadsInput = z.infer<typeof bulkLeadsSchema>;

export const bulkDealsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  action: z.enum(['update-stage', 'assign', 'delete']),
  stageId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().nullable().optional(),
});
export type BulkDealsInput = z.infer<typeof bulkDealsSchema>;

export const bulkConversationsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  action: z.enum(['update-status', 'assign']),
  status: z.enum(['OPEN', 'CLOSED']).optional(),
  assignedToId: z.string().uuid().nullable().optional(),
});
export type BulkConversationsInput = z.infer<typeof bulkConversationsSchema>;
