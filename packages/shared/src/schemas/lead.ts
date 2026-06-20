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

// ── CRM-6.1: Lead list query ──────────────────────────────────────────────────

// All statuses including WON (valid filter target even though WON is write-blocked via PATCH).
const ALL_LEAD_STATUSES = [
  'NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST',
] as const;

const SORTABLE_FIELDS = ['createdAt', 'updatedAt', 'lastActivityAt', 'aiScore', 'firstName'] as const;
const SORT_ORDERS = ['asc', 'desc'] as const;

// HTTP query strings deliver array fields as either a single string or string[].
// preprocess normalises both to string[] so downstream code always sees an array.
const asArray = (v: unknown): unknown =>
  v === undefined ? undefined : Array.isArray(v) ? v : [v];

export const leadListQuerySchema = z.object({
  status: z.preprocess(asArray, z.array(z.enum(ALL_LEAD_STATUSES)).optional()),
  source: z.preprocess(asArray, z.array(z.enum(LEAD_SOURCES)).optional()),
  assignedToId: z.string().uuid().optional(),
  tags: z.preprocess(asArray, z.array(z.string().max(100)).optional()),
  aiScoreMin: z.coerce.number().int().min(0).max(100).optional(),
  aiScoreMax: z.coerce.number().int().min(0).max(100).optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  search: z.string().max(200).optional(),
  sortBy: z.enum(SORTABLE_FIELDS).default('createdAt'),
  sortOrder: z.enum(SORT_ORDERS).default('desc'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
});
export type LeadListQuery = z.infer<typeof leadListQuerySchema>;

// ── CRM-6.3: CSV import row schema ───────────────────────────────────────────
// One validated row from the uploaded CSV.  `source` defaults to IMPORT so
// the origin of bulk-loaded leads is always distinguishable in the UI.
// `tags` arrives as a comma-separated string in the CSV cell; callers must
// split it before passing to the schema.
export const leadImportRowSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).optional(),
  email: z.string().email().max(255).optional(),
  phone: z.string().max(20).optional(),
  source: z.enum(LEAD_SOURCES).optional().default('IMPORT'),
  tags: z.array(z.string().max(100)).optional().default([]),
});
export type LeadImportRow = z.infer<typeof leadImportRowSchema>;

// ── CRM-6.4: Export filter body schema ───────────────────────────────────────
// Mirrors leadListQuerySchema but for a JSON POST body — values arrive already
// typed (arrays, numbers, dates) so no coerce/asArray preprocessing is needed.
// Pagination and sort are intentionally omitted: export always returns all rows.
export const leadExportBodySchema = z.object({
  status: z.array(z.enum(ALL_LEAD_STATUSES)).optional(),
  source: z.array(z.enum(LEAD_SOURCES)).optional(),
  assignedToId: z.string().uuid().optional(),
  tags: z.array(z.string().max(100)).optional(),
  aiScoreMin: z.number().int().min(0).max(100).optional(),
  aiScoreMax: z.number().int().min(0).max(100).optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  search: z.string().max(200).optional(),
});
export type LeadExportBody = z.infer<typeof leadExportBodySchema>;
