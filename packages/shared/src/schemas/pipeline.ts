// Sprint 5 M1 — Pipeline and PipelineStage Zod schemas.
// Used by both API validation middleware and frontend form validation.
// Parity-checked with the Pipeline/PipelineStage Prisma models.

import { z } from 'zod';

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a 6-digit hex value (e.g. #FF5733)');

export const createStageSchema = z.object({
  name: z.string().min(1).max(100),
  color: hexColorSchema.optional(),
  probability: z.number().int().min(0).max(100).optional(),
  isWon: z.boolean().optional(),
  isLost: z.boolean().optional(),
});
export type CreateStage = z.infer<typeof createStageSchema>;

export const patchStageSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: hexColorSchema.optional(),
  probability: z.number().int().min(0).max(100).optional(),
  isWon: z.boolean().optional(),
  isLost: z.boolean().optional(),
});
export type PatchStage = z.infer<typeof patchStageSchema>;

export const reorderStagesSchema = z.object({
  stageIds: z.array(z.string().uuid()).min(1),
});
export type ReorderStages = z.infer<typeof reorderStagesSchema>;

export const createPipelineSchema = z.object({
  name: z.string().min(1).max(100),
  isDefault: z.boolean().optional(),
  stages: z.array(createStageSchema).optional(),
});
export type CreatePipeline = z.infer<typeof createPipelineSchema>;

export const patchPipelineSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isDefault: z.boolean().optional(),
});
export type PatchPipeline = z.infer<typeof patchPipelineSchema>;
