// CRM-4.2 — Task repository.
//
// Extends TenantRepository — assertTenantScope() at construction guarantees this is
// always called inside a withTenant() callback. organizationId is injected by the
// tenant Prisma extension via asTenantCreate().
//
// softDelete sets deletedAt; findById/findByIdOrThrow filter deletedAt: null.
// ownOnly (tasks.update_own for SALES_EXECUTIVE) filters by assignedToId.

import { Prisma, type Task } from '@prisma/client';
import { TenantRepository, asTenantCreate } from '../../core/tenancy/tenant-repository.js';
import type { TenantTransactionClient } from '../../core/tenancy/with-tenant.js';
import { AppError } from '../../core/errors/app-error.js';
import { ErrorCode } from '@leados/shared';
import type { CreateTaskInput } from '@leados/shared';

export type { Task };

export interface TaskUpdateData {
  title?: string;
  description?: string | null;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  dueDate?: string | null;
  assignedToId?: string | null;
  completedAt?: Date | null;
}

export class PrismaTaskRepository extends TenantRepository {
  constructor(db: TenantTransactionClient) {
    super(db);
  }

  async create(data: CreateTaskInput & { createdById: string }): Promise<Task> {
    return this.db.task.create({
      data: asTenantCreate<Prisma.TaskUncheckedCreateInput>({
        title: data.title,
        type: data.type,
        priority: data.priority ?? 'MEDIUM',
        description: data.description ?? null,
        dueDate: data.dueDate != null ? new Date(data.dueDate) : null,
        assignedToId: data.assignedToId ?? null,
        relatedLeadId: data.relatedLeadId ?? null,
        relatedContactId: data.relatedContactId ?? null,
        createdById: data.createdById,
      }),
    });
  }

  async findMany(where: Prisma.TaskWhereInput): Promise<Task[]> {
    return this.db.task.findMany({
      where: {
        ...where,
        deletedAt: null,
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  async findById(id: string, ownedByUserId?: string): Promise<Task | null> {
    return this.db.task.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(ownedByUserId !== undefined ? { assignedToId: ownedByUserId } : {}),
      },
    });
  }

  async findByIdOrThrow(id: string, ownedByUserId?: string): Promise<Task> {
    const task = await this.findById(id, ownedByUserId);
    if (task === null) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Task not found', { taskId: id });
    }
    return task;
  }

  async update(id: string, data: TaskUpdateData): Promise<Task> {
    return this.db.task.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.dueDate !== undefined
          ? { dueDate: data.dueDate !== null ? new Date(data.dueDate) : null }
          : {}),
        ...(data.assignedToId !== undefined ? { assignedToId: data.assignedToId } : {}),
        ...(data.completedAt !== undefined ? { completedAt: data.completedAt } : {}),
      } as Prisma.TaskUncheckedUpdateInput,
    });
  }

  async softDelete(id: string): Promise<Task> {
    return this.db.task.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
