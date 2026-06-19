// Coverage gate — exercises createTaskSchema, patchTaskSchema, taskIdParamSchema.
// Critical: patchTaskSchema has a .refine() callback. V8 counts it as a function declaration;
// both the true and false branches must be exercised or functions coverage drops below 70%.

import { describe, it, expect } from 'vitest';
import { createTaskSchema, patchTaskSchema, taskIdParamSchema } from './task.js';

describe('createTaskSchema', () => {
  it('accepts a minimal valid task (title + type)', () => {
    const result = createTaskSchema.safeParse({ title: 'Call lead', type: 'CALL' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priority).toBe('MEDIUM'); // default applied
      expect(result.data.assignedToId).toBeUndefined();
    }
  });

  it('accepts a fully populated task', () => {
    const result = createTaskSchema.safeParse({
      title: 'Follow up call',
      type: 'CALL',
      priority: 'HIGH',
      description: 'Discuss the proposal',
      dueDate: '2026-07-01T10:00:00.000Z',
      assignedToId: '123e4567-e89b-12d3-a456-426614174000',
      relatedLeadId: '123e4567-e89b-12d3-a456-426614174001',
      relatedContactId: '123e4567-e89b-12d3-a456-426614174002',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing title', () => {
    const result = createTaskSchema.safeParse({ type: 'CALL' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('title'))).toBe(true);
    }
  });

  it('rejects an invalid task type', () => {
    const result = createTaskSchema.safeParse({ title: 'Task', type: 'INVALID_TYPE' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid priority', () => {
    const result = createTaskSchema.safeParse({ title: 'Task', type: 'EMAIL', priority: 'EXTREME' });
    expect(result.success).toBe(false);
  });
});

describe('patchTaskSchema', () => {
  it('accepts a single status update', () => {
    const result = patchTaskSchema.safeParse({ status: 'IN_PROGRESS' });
    expect(result.success).toBe(true);
  });

  it('accepts multiple field update', () => {
    const result = patchTaskSchema.safeParse({ title: 'Updated title', priority: 'HIGH' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty body (refine guard — false branch)', () => {
    const result = patchTaskSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('At least one field must be provided');
    }
  });

  it('accepts a single priority (refine guard — true branch)', () => {
    const result = patchTaskSchema.safeParse({ priority: 'URGENT' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priority).toBe('URGENT');
    }
  });

  it('rejects an invalid status value', () => {
    const result = patchTaskSchema.safeParse({ status: 'DONE' });
    expect(result.success).toBe(false);
  });
});

describe('taskIdParamSchema', () => {
  it('accepts a valid UUID', () => {
    const result = taskIdParamSchema.safeParse({ id: '123e4567-e89b-12d3-a456-426614174000' });
    expect(result.success).toBe(true);
  });

  it('rejects a non-UUID string', () => {
    const result = taskIdParamSchema.safeParse({ id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });
});
