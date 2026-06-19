// CRM-2.3 / CRM-2.4 — Lead Zod schemas (shared FE/BE contract).
//
// PatchLeadInput intentionally excludes WON from the status enum — WON is only
// reachable via POST /leads/:id/convert (the atomic lead→contact conversion in E3/M3).
// Sending { status: "WON" } via PATCH returns 400 INVALID_STATUS_TRANSITION.

import { z } from 'zod';

const LEAD_SOURCES = [
  'INSTAGRAM_DM',
  'INSTAGRAM_COMMENT',
  'WHATSAPP',
  'MANUAL',
  'IMPORT',
  'REFERRAL',
  'WEB_FORM',
  'OTHER',
] as const;

// Open statuses reachable via direct PATCH (WON excluded; used in PatchLeadInput).
const PATCHABLE_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'LOST'] as const;

export const createLeadSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).optional().nullable(),
  email: z.string().email().max(255).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  source: z.enum(LEAD_SOURCES).default('MANUAL'),
  status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION']).default('NEW'),
  assignedToId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string().max(100)).optional().default([]),
  customFields: z.record(z.unknown()).optional(),
  lostReason: z.string().max(500).optional().nullable(),
  instagramHandle: z.string().max(100).optional().nullable(),
  instagramUserId: z.string().max(50).optional().nullable(),
});
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const patchLeadSchema = z
  .object({
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().max(100).optional().nullable(),
    email: z.string().email().max(255).optional().nullable(),
    phone: z.string().max(20).optional().nullable(),
    // WON excluded — only reachable via convert()
    status: z.enum(PATCHABLE_STATUSES).optional(),
    assignedToId: z.string().uuid().optional().nullable(),
    tags: z.array(z.string().max(100)).optional(),
    customFields: z.record(z.unknown()).optional(),
    lostReason: z.string().max(500).optional().nullable(),
    instagramHandle: z.string().max(100).optional().nullable(),
    instagramUserId: z.string().max(50).optional().nullable(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field must be provided' });
export type PatchLeadInput = z.infer<typeof patchLeadSchema>;

export const leadIdParamSchema = z.object({
  id: z.string().uuid(),
});
