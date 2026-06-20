// CRM-5.1 — Note service.
//
// Notes store ProseMirror/Tiptap JSON content (JSONB). Sprint 6 tightens to full
// Tiptap document shape; M5 accepts any JSON object.
//
// Activity emission:
//   NOTE_ADDED   → on create (if entity FK present — notes always have one per schema refine)
//   NOTE_UPDATED → on update
//   NOTE_DELETED → on softDelete
//
// exactOptionalPropertyTypes: conditional spreads produce `string | undefined` even when
// narrowed. The `as AppendInput` cast on append() calls is safe because the createNoteSchema
// refine guarantees at least one entity FK is non-null.

import type { Note } from '@prisma/client';
import { withTenant } from '../../core/tenancy/with-tenant.js';
import { requireTenantContext } from '../../core/tenancy/context.js';
import { ActivityType } from '@leados/shared';
import type { CreateNoteInput, PatchNoteInput, ActivityAppendInput } from '@leados/shared';
import type { AuditRecorder } from '../../core/audit/audit-recorder.js';
import { ActivityService } from '../../core/activities/activity.service.js';
import { PrismaNoteRepository, type NotePage } from './note.repository.js';
export type { NotePage };

type AppendInput = Omit<ActivityAppendInput, 'organizationId'>;

export class NoteService {
  private readonly activityService = new ActivityService();

  constructor(private readonly audit: AuditRecorder) {}

  // ── CRM-5.1: create ────────────────────────────────────────────────────────

  async create(input: CreateNoteInput): Promise<Note> {
    const ctx = requireTenantContext();

    const note = await withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaNoteRepository(db);
      const created = await repo.create({ ...input, createdById: ctx.userId });

      await this.activityService.append(db, ctx, {
        type: ActivityType.NOTE_ADDED,
        description: 'Note added',
        metadata: { type: ActivityType.NOTE_ADDED, noteId: created.id },
        ...(created.relatedLeadId !== null ? { relatedLeadId: created.relatedLeadId } : {}),
        ...(created.relatedContactId !== null ? { relatedContactId: created.relatedContactId } : {}),
      } as AppendInput);

      return created;
    });

    await this.audit.record({
      action: 'created',
      resource: 'note',
      resourceId: note.id,
      after: note,
    });

    return note;
  }

  // ── CRM-5.1: update ───────────────────────────────────────────────────────

  async update(id: string, input: PatchNoteInput): Promise<Note> {
    const ctx = requireTenantContext();

    const note = await withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaNoteRepository(db);
      const existing = await repo.findByIdOrThrow(id);
      const updated = await repo.update(id, input);

      await this.activityService.append(db, ctx, {
        type: ActivityType.NOTE_UPDATED,
        description: 'Note updated',
        metadata: { type: ActivityType.NOTE_UPDATED, noteId: id },
        ...(existing.relatedLeadId !== null ? { relatedLeadId: existing.relatedLeadId } : {}),
        ...(existing.relatedContactId !== null ? { relatedContactId: existing.relatedContactId } : {}),
      } as AppendInput);

      return updated;
    });

    await this.audit.record({
      action: 'updated',
      resource: 'note',
      resourceId: id,
      after: note,
    });

    return note;
  }

  // ── CRM-5.1: softDelete ───────────────────────────────────────────────────

  async softDelete(id: string): Promise<void> {
    const ctx = requireTenantContext();

    await withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaNoteRepository(db);
      const existing = await repo.findByIdOrThrow(id);
      await repo.softDelete(id);

      await this.activityService.append(db, ctx, {
        type: ActivityType.NOTE_DELETED,
        description: 'Note deleted',
        metadata: { type: ActivityType.NOTE_DELETED, noteId: id },
        ...(existing.relatedLeadId !== null ? { relatedLeadId: existing.relatedLeadId } : {}),
        ...(existing.relatedContactId !== null ? { relatedContactId: existing.relatedContactId } : {}),
      } as AppendInput);
    });

    await this.audit.record({
      action: 'deleted',
      resource: 'note',
      resourceId: id,
    });
  }

  // ── Read path (delegated by LeadService / ContactService) ─────────────────

  async listForLead(leadId: string, page: number, limit: number): Promise<NotePage> {
    const ctx = requireTenantContext();
    return withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaNoteRepository(db);
      return repo.listForLead(leadId, page, limit);
    });
  }

  async listForContact(contactId: string, page: number, limit: number): Promise<NotePage> {
    const ctx = requireTenantContext();
    return withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaNoteRepository(db);
      return repo.listForContact(contactId, page, limit);
    });
  }
}
