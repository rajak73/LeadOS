import { z } from 'zod';

export const createNoteSchema = z.object({
  // content is a ProseMirror/Tiptap JSON document (JSONB). Not TEXT, not HTML.
  // Sprint 6 tightens to full Tiptap document shape; M5 only validates it's a JSON object.
  content: z.record(z.unknown()),
  relatedLeadId: z.string().uuid().optional().nullable(),
  relatedContactId: z.string().uuid().optional().nullable(),
}).refine(
  (d) => d.relatedLeadId != null || d.relatedContactId != null,
  { message: 'Note must be linked to at least one of: relatedLeadId, relatedContactId' },
);
export type CreateNoteInput = z.infer<typeof createNoteSchema>;

export const patchNoteSchema = z.object({
  content: z.record(z.unknown()),
});
export type PatchNoteInput = z.infer<typeof patchNoteSchema>;

export const noteIdParamSchema = z.object({ id: z.string().uuid() });
