import type { Workflow, WorkflowRun, Prisma } from '@prisma/client';
import { withTenant } from '../../core/tenancy/with-tenant.js';
import { requireTenantContext } from '../../core/tenancy/context.js';
import { AppError } from '../../core/errors/app-error.js';
import { ErrorCode, WorkflowDefinitionSchema, PLAN_LIMITS, type WorkflowDefinition } from '@leados/shared';
import { PrismaWorkflowRepository } from './workflow.repository.js';

export class WorkflowService {
  async createWorkflow(data: {
    name: string;
    description?: string;
    triggerType: string;
    definition: WorkflowDefinition;
    isActive?: boolean;
  }): Promise<Workflow> {
    // 1. Validate definition using Zod
    const parsed = WorkflowDefinitionSchema.safeParse(data.definition);
    if (!parsed.success) {
      throw new AppError(
        ErrorCode.WORKFLOW_INVALID_DEFINITION,
        `Invalid workflow definition: ${parsed.error.message}`
      );
    }

    const ctx = requireTenantContext();

    return withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaWorkflowRepository(db);

      // 2. Check active workflows limit if creating as active
      if (data.isActive) {
        const activeCount = await repo.countActiveWorkflows();
        const sub = await db.subscription.findFirst({ select: { plan: true } });
        const plan = (sub?.plan ?? 'TRIAL') as keyof typeof PLAN_LIMITS;
        const limit = PLAN_LIMITS[plan].activeWorkflows;

        if (activeCount >= limit) {
          throw new AppError(ErrorCode.WORKFLOW_LIMIT_EXCEEDED, 'Active workflow limit exceeded');
        }
      }

      return repo.create({
        name: data.name,
        description: data.description ?? null,
        triggerType: data.triggerType,
        definition: data.definition as unknown as Prisma.InputJsonValue,
        isActive: data.isActive ?? false,
      });
    });
  }

  async listWorkflows(): Promise<Workflow[]> {
    const ctx = requireTenantContext();
    return withTenant(ctx.organizationId, async (db) => {
      return new PrismaWorkflowRepository(db).list();
    });
  }

  async getWorkflow(id: string): Promise<Workflow> {
    const ctx = requireTenantContext();
    return withTenant(ctx.organizationId, async (db) => {
      return new PrismaWorkflowRepository(db).findByIdOrThrow(id);
    });
  }

  async updateWorkflow(
    id: string,
    patch: {
      name?: string;
      description?: string | null;
      triggerType?: string;
      definition?: WorkflowDefinition;
      isActive?: boolean;
    }
  ): Promise<Workflow> {
    const ctx = requireTenantContext();

    // 1. Validate definition if provided
    if (patch.definition !== undefined) {
      const parsed = WorkflowDefinitionSchema.safeParse(patch.definition);
      if (!parsed.success) {
        throw new AppError(
          ErrorCode.WORKFLOW_INVALID_DEFINITION,
          `Invalid workflow definition: ${parsed.error.message}`
        );
      }
    }

    return withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaWorkflowRepository(db);
      const current = await repo.findByIdOrThrow(id);

      // 2. Check active workflows limit if status changes to active
      if (patch.isActive === true && !current.isActive) {
        const activeCount = await repo.countActiveWorkflows();
        const sub = await db.subscription.findFirst({ select: { plan: true } });
        const plan = (sub?.plan ?? 'TRIAL') as keyof typeof PLAN_LIMITS;
        const limit = PLAN_LIMITS[plan].activeWorkflows;

        if (activeCount >= limit) {
          throw new AppError(ErrorCode.WORKFLOW_LIMIT_EXCEEDED, 'Active workflow limit exceeded');
        }
      }

      const updateData: Prisma.WorkflowUpdateInput = {};
      if (patch.name !== undefined) updateData.name = patch.name;
      if (patch.description !== undefined) updateData.description = patch.description;
      if (patch.triggerType !== undefined) updateData.triggerType = patch.triggerType;
      if (patch.definition !== undefined) {
        updateData.definition = patch.definition as unknown as Prisma.InputJsonValue;
      }
      if (patch.isActive !== undefined) updateData.isActive = patch.isActive;

      return repo.update(id, updateData);
    });
  }

  async deleteWorkflow(id: string): Promise<void> {
    const ctx = requireTenantContext();
    return withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaWorkflowRepository(db);
      await repo.findByIdOrThrow(id);
      await repo.softDelete(id);
    });
  }

  async listRuns(workflowId?: string): Promise<WorkflowRun[]> {
    const ctx = requireTenantContext();
    return withTenant(ctx.organizationId, async (db) => {
      return new PrismaWorkflowRepository(db).listRuns(workflowId);
    });
  }
}
