import type { Workflow, WorkflowRun, Prisma } from '@prisma/client';
import { TenantRepository, asTenantCreate } from '../../core/tenancy/tenant-repository.js';
import type { TenantTransactionClient } from '../../core/tenancy/with-tenant.js';
import { AppError } from '../../core/errors/app-error.js';

export class PrismaWorkflowRepository extends TenantRepository {
  constructor(db: TenantTransactionClient) {
    super(db);
  }

  async create(data: Omit<Prisma.WorkflowUncheckedCreateInput, 'organizationId'>): Promise<Workflow> {
    return this.db.workflow.create({
      data: asTenantCreate<Prisma.WorkflowUncheckedCreateInput>(data),
    });
  }

  async findById(id: string): Promise<Workflow | null> {
    return this.db.workflow.findFirst({ where: { id, deletedAt: null } });
  }

  async findByIdOrThrow(id: string): Promise<Workflow> {
    const wf = await this.findById(id);
    if (!wf) {
      throw AppError.notFound(`Workflow ${id} not found`);
    }
    return wf;
  }

  async findActiveByTriggerType(triggerType: string): Promise<Workflow[]> {
    return this.db.workflow.findMany({
      where: { triggerType, isActive: true, deletedAt: null }
    });
  }

  async list(): Promise<Workflow[]> {
    return this.db.workflow.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, data: Prisma.WorkflowUpdateInput): Promise<Workflow> {
    return this.db.workflow.update({
      where: { id },
      data,
    });
  }

  async softDelete(id: string): Promise<void> {
    await this.db.workflow.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  async createRun(data: Omit<Prisma.WorkflowRunUncheckedCreateInput, 'organizationId'>): Promise<WorkflowRun> {
    return this.db.workflowRun.create({
      data: asTenantCreate<Prisma.WorkflowRunUncheckedCreateInput>(data),
    });
  }

  async listRuns(workflowId?: string): Promise<WorkflowRun[]> {
    return this.db.workflowRun.findMany({
      where: workflowId ? { workflowId } : {},
      orderBy: { createdAt: 'desc' },
      take: 50
    });
  }

  async countActiveWorkflows(): Promise<number> {
    return this.db.workflow.count({
      where: { isActive: true, deletedAt: null }
    });
  }
}
