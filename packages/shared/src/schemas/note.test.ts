import { describe, it, expect } from 'vitest';
import { createNoteSchema, patchNoteSchema, noteIdParamSchema } from './note.js';

const TIPTAP_DOC = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] };

describe('createNoteSchema', () => {
  it('accepts note with relatedLeadId only', () => {
    const result = createNoteSchema.safeParse({
      content: TIPTAP_DOC,
      relatedLeadId: '00000000-0000-0000-0000-000000000001',
    });
    expect(result.success).toBe(true);
  });

  it('accepts note with relatedContactId only', () => {
    const result = createNoteSchema.safeParse({
      content: TIPTAP_DOC,
      relatedContactId: '00000000-0000-0000-0000-000000000002',
    });
    expect(result.success).toBe(true);
  });

  it('accepts note with both relatedLeadId and relatedContactId', () => {
    const result = createNoteSchema.safeParse({
      content: TIPTAP_DOC,
      relatedLeadId: '00000000-0000-0000-0000-000000000001',
      relatedContactId: '00000000-0000-0000-0000-000000000002',
    });
    expect(result.success).toBe(true);
  });

  it('rejects note with no entity FK (refine false branch)', () => {
    const result = createNoteSchema.safeParse({ content: TIPTAP_DOC });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/at least one/i);
    }
  });

  it('rejects when content is missing', () => {
    const result = createNoteSchema.safeParse({
      relatedLeadId: '00000000-0000-0000-0000-000000000001',
    });
    expect(result.success).toBe(false);
  });

  it('rejects when content is a string instead of object', () => {
    const result = createNoteSchema.safeParse({
      content: 'plain text',
      relatedLeadId: '00000000-0000-0000-0000-000000000001',
    });
    expect(result.success).toBe(false);
  });

  it('rejects when relatedLeadId is not a UUID', () => {
    const result = createNoteSchema.safeParse({
      content: TIPTAP_DOC,
      relatedLeadId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('accepts empty content object {}', () => {
    const result = createNoteSchema.safeParse({
      content: {},
      relatedLeadId: '00000000-0000-0000-0000-000000000001',
    });
    expect(result.success).toBe(true);
  });
});

describe('patchNoteSchema', () => {
  it('accepts valid content update', () => {
    const result = patchNoteSchema.safeParse({ content: TIPTAP_DOC });
    expect(result.success).toBe(true);
  });

  it('accepts empty content object (clearing note)', () => {
    const result = patchNoteSchema.safeParse({ content: {} });
    expect(result.success).toBe(true);
  });

  it('rejects missing content', () => {
    const result = patchNoteSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects content as string', () => {
    const result = patchNoteSchema.safeParse({ content: 'text' });
    expect(result.success).toBe(false);
  });
});

describe('noteIdParamSchema', () => {
  it('accepts valid UUID', () => {
    const result = noteIdParamSchema.safeParse({ id: '00000000-0000-0000-0000-000000000001' });
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID id', () => {
    const result = noteIdParamSchema.safeParse({ id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });
});
