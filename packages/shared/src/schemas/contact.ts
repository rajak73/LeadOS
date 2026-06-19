// CRM-3.1 / CRM-3.3 — Contact Zod schemas (shared FE/BE contract).
//
// Contacts have no lifecycle status enum — they are created from lead conversion
// (POST /leads/:id/convert) or directly via POST /contacts. No status machine.

import { z } from 'zod';

const addressSchema = z
  .object({
    street: z.string().max(255).optional(),
    city: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    country: z.string().max(100).optional(),
    zip: z.string().max(20).optional(),
  })
  .optional()
  .nullable();

export const createContactSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).optional().nullable(),
  email: z.string().email().max(255).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  company: z.string().max(255).optional().nullable(),
  jobTitle: z.string().max(100).optional().nullable(),
  avatarUrl: z.string().url().max(2000).optional().nullable(),
  address: addressSchema,
  tags: z.array(z.string().max(100)).optional().default([]),
  customFields: z.record(z.unknown()).optional(),
  assignedToId: z.string().uuid().optional().nullable(),
});
export type CreateContactInput = z.infer<typeof createContactSchema>;

export const patchContactSchema = z
  .object({
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().max(100).optional().nullable(),
    email: z.string().email().max(255).optional().nullable(),
    phone: z.string().max(20).optional().nullable(),
    company: z.string().max(255).optional().nullable(),
    jobTitle: z.string().max(100).optional().nullable(),
    avatarUrl: z.string().url().max(2000).optional().nullable(),
    address: addressSchema,
    tags: z.array(z.string().max(100)).optional(),
    customFields: z.record(z.unknown()).optional(),
    assignedToId: z.string().uuid().optional().nullable(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field must be provided' });
export type PatchContactInput = z.infer<typeof patchContactSchema>;

export const contactIdParamSchema = z.object({
  id: z.string().uuid(),
});
