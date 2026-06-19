// CRM-4.2 / CRM-4.4 — Task Zod schemas (shared FE/BE contract).
//
// patchTaskSchema intentionally excludes completedAt — it is server-set when status
// transitions to COMPLETED. Status machine transitions are validated at the service layer;
// the schema accepts any valid TaskStatus so the service can return a precise error.

import { z } from 'zod';

const TASK_TYPES = ['CALL', 'EMAIL', 'MEETING', 'FOLLOW_UP', 'DEMO', 'OTHER'] as const;
const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
const TASK_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;

export const createTaskSchema = z.object({
  title: z.string().min(1).max(255),
  type: z.enum(TASK_TYPES),
  priority: z.enum(TASK_PRIORITIES).default('MEDIUM'),
  description: z.string().max(2000).optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  assignedToId: z.string().uuid().optional().nullable(),
  relatedLeadId: z.string().uuid().optional().nullable(),
  relatedContactId: z.string().uuid().optional().nullable(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const patchTaskSchema = z
  .object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().max(2000).optional().nullable(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    status: z.enum(TASK_STATUSES).optional(),
    dueDate: z.string().datetime().optional().nullable(),
    assignedToId: z.string().uuid().optional().nullable(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field must be provided' });
export type PatchTaskInput = z.infer<typeof patchTaskSchema>;

export const taskIdParamSchema = z.object({ id: z.string().uuid() });
