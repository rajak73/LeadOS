import { z } from 'zod';

// MIME types accepted for upload (images, documents, spreadsheets).
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

// Step 1: client requests a presigned URL before uploading.
export const presignedUrlRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_SIZE_BYTES),
  relatedLeadId: z.string().uuid().optional().nullable(),
  relatedContactId: z.string().uuid().optional().nullable(),
});
export type PresignedUrlRequestInput = z.infer<typeof presignedUrlRequestSchema>;

// Step 2: after the client uploads directly to storage, it records the file metadata.
export const recordFileSchema = z.object({
  fileId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  storageKey: z.string().min(1),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_SIZE_BYTES),
  url: z.string().url(),
  relatedLeadId: z.string().uuid().optional().nullable(),
  relatedContactId: z.string().uuid().optional().nullable(),
});
export type RecordFileInput = z.infer<typeof recordFileSchema>;

export const fileIdParamSchema = z.object({ id: z.string().uuid() });

export { ALLOWED_MIME_TYPES, MAX_SIZE_BYTES };
