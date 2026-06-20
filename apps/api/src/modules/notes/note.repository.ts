// CRM-5.1 — Note repository.
//
// Extends TenantRepository — always used inside a withTenant() callback.
// organizationId is injected by the tenant extension via asTenantCreate().
// softDelete sets deletedAt; findById/findByIdOrThrow filter deletedAt: null.

import { Prisma, type Note } from '@prisma/client';
import { TenantRepository, asTenantCreate } from '../../core/tenancy/tenant-repository.js';
import type { TenantTransactionClient } from '../../core/tenancy/with-tenant.js';
import { AppError } from '../../core/errors/app-error.js';
import { ErrorCode } from '@leados/shared';
import type { CreateNoteInput, PatchNoteInput } from '@leados/shared';

export type { Note };

export interface NotePage {
  items: Note[];
  total: number;
}

export class PrismaNoteRepository extends TenantRepository {
  constructor(db: TenantTransactionClient) {
    super(db);
  }

  async create(data: CreateNoteInput & { createdById: string }): Promise<Note> {
    return this.db.note.create({
      data: asTenantCreate<Prisma.NoteUncheckedCreateInput>({
        content: data.content as Prisma.InputJsonValue,
        relatedLeadId: data.relatedLeadId ?? null,
        relatedContactId: data.relatedContactId ?? null,
        createdById: data.createdById,
      }),
    });
  }

  async findById(id: string): Promise<Note | null> {
    return this.db.note.findFirst({ where: { id, deletedAt: null } });
  }

  async findByIdOrThrow(id: string): Promise<Note> {
    const note = await this.findById(id);
    if (note === null) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Note not found', { noteId: id });
    }
    return note;
  }

  async update(id: string, data: PatchNoteInput): Promise<Note> {
    return this.db.note.update({
      where: { id },
      data: { content: data.content as Prisma.InputJsonValue },
    });
  }

  async softDelete(id: string): Promise<Note> {
    return this.db.note.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async listForLead(leadId: string, page: number, limit: number): Promise<NotePage> {
    const where = { relatedLeadId: leadId, deletedAt: null };
    const total = await this.db.note.count({ where });
    const items = await this.db.note.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total };
  }

  async listForContact(contactId: string, page: number, limit: number): Promise<NotePage> {
    const where = { relatedContactId: contactId, deletedAt: null };
    const total = await this.db.note.count({ where });
    const items = await this.db.note.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total };
  }
}
