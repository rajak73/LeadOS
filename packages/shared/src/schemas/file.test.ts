import { describe, it, expect } from 'vitest';
import { presignedUrlRequestSchema, recordFileSchema, fileIdParamSchema, MAX_SIZE_BYTES } from './file.js';

const LEAD_ID = '00000000-0000-0000-0000-000000000001';
const FILE_ID = '00000000-0000-0000-0000-000000000002';

describe('presignedUrlRequestSchema', () => {
  it('accepts a valid image request', () => {
    const result = presignedUrlRequestSchema.safeParse({
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1024 * 100,
      relatedLeadId: LEAD_ID,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid PDF request without entity FK', () => {
    const result = presignedUrlRequestSchema.safeParse({
      fileName: 'contract.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024 * 500,
    });
    expect(result.success).toBe(true);
  });

  it('rejects disallowed MIME type', () => {
    const result = presignedUrlRequestSchema.safeParse({
      fileName: 'script.sh',
      mimeType: 'application/x-sh',
      sizeBytes: 1024,
      relatedLeadId: LEAD_ID,
    });
    expect(result.success).toBe(false);
  });

  it('rejects file exceeding 50 MB', () => {
    const result = presignedUrlRequestSchema.safeParse({
      fileName: 'huge.pdf',
      mimeType: 'application/pdf',
      sizeBytes: MAX_SIZE_BYTES + 1,
      relatedLeadId: LEAD_ID,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing fileName', () => {
    const result = presignedUrlRequestSchema.safeParse({
      mimeType: 'application/pdf',
      sizeBytes: 1024,
    });
    expect(result.success).toBe(false);
  });

  it('rejects zero sizeBytes', () => {
    const result = presignedUrlRequestSchema.safeParse({
      fileName: 'empty.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 0,
      relatedLeadId: LEAD_ID,
    });
    expect(result.success).toBe(false);
  });
});

describe('recordFileSchema', () => {
  it('accepts a valid file metadata record', () => {
    const result = recordFileSchema.safeParse({
      fileId: FILE_ID,
      fileName: 'contract.pdf',
      storageKey: 'orgs/abc/files/contract.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024 * 50,
      url: 'https://s3.example.com/contract.pdf',
      relatedLeadId: LEAD_ID,
    });
    expect(result.success).toBe(true);
  });

  it('accepts file without entity FK', () => {
    const result = recordFileSchema.safeParse({
      fileId: FILE_ID,
      fileName: 'doc.pdf',
      storageKey: 'orgs/abc/files/doc.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 512,
      url: 'https://s3.example.com/doc.pdf',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid fileId UUID', () => {
    const result = recordFileSchema.safeParse({
      fileId: 'not-a-uuid',
      fileName: 'doc.pdf',
      storageKey: 'key',
      mimeType: 'application/pdf',
      sizeBytes: 512,
      url: 'https://s3.example.com/doc.pdf',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid url', () => {
    const result = recordFileSchema.safeParse({
      fileId: FILE_ID,
      fileName: 'doc.pdf',
      storageKey: 'key',
      mimeType: 'application/pdf',
      sizeBytes: 512,
      url: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });
});

describe('fileIdParamSchema', () => {
  it('accepts valid UUID', () => {
    const result = fileIdParamSchema.safeParse({ id: FILE_ID });
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID id', () => {
    const result = fileIdParamSchema.safeParse({ id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });
});
