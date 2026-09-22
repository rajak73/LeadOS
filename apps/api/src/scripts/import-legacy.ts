/**
 * `pnpm db:import-legacy [-- --org <id|slug>] [-- --dry-run]`
 * Copies the data of one organization from the previous (multi-tenant) LeadOS database
 * (LEGACY_DATABASE_URL) into this app's database (DATABASE_URL). The legacy database is only
 * read, never changed. The target must be migrated and empty (no users yet).
 *
 * Copied: users (same passwords), company settings, leads, contacts, pipelines and stages,
 * deals, tasks, notes (Tiptap JSON → plain text), activity timeline, AI scores, workflows
 * whose definition is still valid, and Instagram DM conversations with their messages.
 * Not copied: the Instagram connection (reconnect it in Settings → Instagram), notifications,
 * refresh tokens, files, custom fields, WhatsApp and billing data.
 * Ids are kept, so links between records stay intact.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { workflowDefinitionSchema, WORKFLOW_TRIGGERS } from '@leados/shared';
import { env, withDefaultUser } from '../config/env.js';
import { prisma, type Tx } from '../lib/prisma.js';
import { SETTINGS_ID } from '../modules/settings/index.js';

type Row = Record<string, unknown>;

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const orgArg = argv.includes('--org') ? argv[argv.indexOf('--org') + 1] : undefined;

const legacyUrl = process.env.LEGACY_DATABASE_URL?.trim();

// ─── Value mapping ───────────────────────────────────────────────────────────

const LEAD_SOURCE: Record<string, string> = {
  INSTAGRAM_DM: 'INSTAGRAM',
  INSTAGRAM_COMMENT: 'INSTAGRAM',
  WHATSAPP: 'WHATSAPP',
  MANUAL: 'MANUAL',
  IMPORT: 'IMPORT',
  REFERRAL: 'REFERRAL',
  WEB_FORM: 'WEBSITE',
  OTHER: 'OTHER',
};

/** Legacy activity types that have a counterpart; the rest (pipeline edits, files…) are dropped. */
const ACTIVITY_TYPE: Record<string, string> = {
  LEAD_CREATED: 'LEAD_CREATED',
  LEAD_STATUS_CHANGED: 'LEAD_STATUS_CHANGED',
  LEAD_ASSIGNED: 'LEAD_ASSIGNED',
  LEAD_WON: 'LEAD_STATUS_CHANGED',
  LEAD_LOST: 'LEAD_STATUS_CHANGED',
  LEAD_SCORED: 'LEAD_SCORED',
  CONTACT_CREATED: 'CONTACT_CREATED',
  CONTACT_UPDATED: 'CONTACT_UPDATED',
  TASK_CREATED: 'TASK_CREATED',
  TASK_COMPLETED: 'TASK_COMPLETED',
  NOTE_ADDED: 'NOTE_ADDED',
  DEAL_CREATED: 'DEAL_CREATED',
  DEAL_UPDATED: 'DEAL_UPDATED',
  DEAL_STAGE_MOVED: 'DEAL_STAGE_MOVED',
  DEAL_WON: 'DEAL_WON',
  DEAL_LOST: 'DEAL_LOST',
  MESSAGE_RECEIVED: 'INSTAGRAM_MESSAGE_RECEIVED',
  MESSAGE_SENT: 'INSTAGRAM_MESSAGE_SENT',
  WORKFLOW_ACTION_EXECUTED: 'WORKFLOW_ACTION',
};

const ADMIN_ROLES = new Set(['OWNER', 'ADMIN']);

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const date = (v: unknown): Date | null => (v instanceof Date ? v : v ? new Date(String(v)) : null);
const json = (v: unknown): Prisma.InputJsonValue => (v ?? {}) as Prisma.InputJsonValue;

/** Plain text of a Tiptap/ProseMirror document: one line per block, "- " for list items. */
export function tiptapToText(doc: unknown): string {
  const lines: string[] = [];
  const inline = (node: Row): string => {
    if (node.type === 'text') return String(node.text ?? '');
    if (node.type === 'hardBreak') return '\n';
    return Array.isArray(node.content) ? (node.content as Row[]).map(inline).join('') : '';
  };
  const block = (node: Row, prefix = ''): void => {
    const children = Array.isArray(node.content) ? (node.content as Row[]) : [];
    if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'codeBlock') {
      lines.push(prefix + children.map(inline).join(''));
    } else if (node.type === 'listItem' || node.type === 'taskItem') {
      children.forEach((c, i) => block(c, i === 0 ? prefix + '- ' : prefix + '  '));
    } else if (node.type === 'text') {
      lines.push(prefix + inline(node));
    } else {
      children.forEach((c) => block(c, prefix));
    }
  };
  if (typeof doc === 'string') return doc.trim();
  if (doc && typeof doc === 'object') {
    const d = doc as Row;
    if (typeof d.text === 'string' && !d.type) return d.text.trim();
    block(d);
  }
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Instagram attachments from a legacy message payload ({ raw: { attachments: [...] } }). */
function attachmentsOf(content: Row): Array<{ type: string; url: string }> {
  const raw = (content.raw ?? content) as Row;
  const list = Array.isArray(raw.attachments) ? (raw.attachments as Row[]) : [];
  return list
    .map((a) => ({
      type: String(a.type ?? 'file'),
      url: String((a.payload as Row | undefined)?.url ?? ''),
    }))
    .filter((a) => a.url);
}

// ─── Read ────────────────────────────────────────────────────────────────────

async function readLegacy(legacy: PrismaClient, orgId: string) {
  // Tenant tables use FORCE ROW LEVEL SECURITY keyed on this setting, so every read runs in a
  // transaction that pins the organization.
  return legacy.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.current_organization_id', $1, true)`,
        orgId,
      );
      const q = (sql: string) => tx.$queryRawUnsafe<Row[]>(sql, orgId);
      return {
        members: await q(
          `SELECT m."userId", m.status, r.name AS "roleName" FROM organization_members m
           JOIN roles r ON r.id = m."roleId" WHERE m."organizationId" = $1::uuid`,
        ),
        contacts: await q(`SELECT * FROM contacts WHERE "organizationId" = $1::uuid`),
        leads: await q(`SELECT * FROM leads WHERE "organizationId" = $1::uuid`),
        pipelines: await q(`SELECT * FROM pipelines WHERE "organizationId" = $1::uuid`),
        stages: await q(`SELECT * FROM pipeline_stages WHERE "organizationId" = $1::uuid`),
        deals: await q(`SELECT * FROM deals WHERE "organizationId" = $1::uuid`),
        tasks: await q(`SELECT * FROM tasks WHERE "organizationId" = $1::uuid`),
        notes: await q(`SELECT * FROM notes WHERE "organizationId" = $1::uuid`),
        activities: await q(`SELECT * FROM activities WHERE "organizationId" = $1::uuid`),
        aiScores: await q(`SELECT * FROM ai_scores WHERE "organizationId" = $1::uuid`),
        workflows: await q(`SELECT * FROM workflows WHERE "organizationId" = $1::uuid`),
        conversations: await q(
          `SELECT * FROM instagram_conversations WHERE "organizationId" = $1::uuid`,
        ),
        messages: await q(
          `SELECT * FROM messages WHERE "organizationId" = $1::uuid ORDER BY "sentAt"`,
        ),
      };
    },
    { timeout: 120_000 },
  );
}

async function pickOrganization(legacy: PrismaClient): Promise<Row> {
  const orgs = await legacy.$queryRawUnsafe<Row[]>(
    `SELECT id::text, name, slug, currency, timezone, "deletedAt" FROM organizations ORDER BY "createdAt"`,
  );
  if (orgArg) {
    const org = orgs.find((o) => o.id === orgArg || o.slug === orgArg);
    if (!org) throw new Error(`No organization with id or slug "${orgArg}".`);
    return org;
  }
  const live = orgs.filter((o) => !o.deletedAt);
  if (live.length === 1) return live[0]!;
  console.error('The legacy database has several organizations. Pick one with --org <slug>:');
  for (const o of orgs)
    console.error(`  ${String(o.slug).padEnd(30)} ${o.name}${o.deletedAt ? ' (deleted)' : ''}`);
  process.exit(1);
}

// ─── Write ───────────────────────────────────────────────────────────────────

async function insert<T>(label: string, rows: T[], write: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += 1000) await write(rows.slice(i, i + 1000));
  console.log(`  ${label.padEnd(24)} ${rows.length}`);
}

async function main(): Promise<void> {
  if (!legacyUrl) {
    console.error('Set LEGACY_DATABASE_URL to the old LeadOS database (it is only read).');
    process.exit(1);
  }
  if (withDefaultUser(legacyUrl) === env.DATABASE_URL) {
    console.error('LEGACY_DATABASE_URL and DATABASE_URL point to the same database.');
    process.exit(1);
  }

  const legacy = new PrismaClient({ datasourceUrl: withDefaultUser(legacyUrl) });
  try {
    const existing = await prisma.user.count().catch(() => {
      console.error('The target database has no tables yet. Run `pnpm db:migrate` first.');
      process.exit(1);
    });
    if (existing > 0) {
      console.error(
        `The target database already has ${existing} user(s). Import into an empty one.`,
      );
      process.exit(1);
    }

    const org = await pickOrganization(legacy);
    const orgId = String(org.id);
    console.log(`Reading "${org.name}" from the legacy database…`);
    const data = await readLegacy(legacy, orgId);

    // Users: every member of the organization plus anyone referenced by the copied records.
    const roleOf = new Map(data.members.map((m) => [String(m.userId), m]));
    const referenced = new Set<string>(roleOf.keys());
    for (const list of [data.leads, data.contacts, data.deals, data.tasks, data.notes]) {
      for (const r of list) {
        if (r.createdById) referenced.add(String(r.createdById));
        if (r.assignedToId) referenced.add(String(r.assignedToId));
      }
    }
    for (const a of data.activities) if (a.performedById) referenced.add(String(a.performedById));
    const users = await legacy.$queryRawUnsafe<Row[]>(
      `SELECT * FROM users WHERE id = ANY($1::uuid[])`,
      [...referenced],
    );
    const userRows: Prisma.UserCreateManyInput[] = users.map((u) => {
      const m = roleOf.get(String(u.id));
      const active = u.status === 'ACTIVE' && !u.deletedAt && m?.status === 'ACTIVE';
      return {
        id: String(u.id),
        email: String(u.email).trim().toLowerCase(),
        passwordHash: String(u.passwordHash),
        firstName: String(u.firstName),
        lastName: String(u.lastName ?? ''),
        role: ADMIN_ROLES.has(String(m?.roleName)) ? 'ADMIN' : 'MEMBER',
        status: active ? 'ACTIVE' : 'DISABLED',
        lastLoginAt: date(u.lastLoginAt),
        createdAt: date(u.createdAt)!,
      };
    });
    const owner =
      data.members.find((m) => m.roleName === 'OWNER' && m.status === 'ACTIVE') ??
      data.members.find((m) => ADMIN_ROLES.has(String(m.roleName)));
    if (!userRows.some((u) => u.role === 'ADMIN' && u.status === 'ACTIVE')) {
      throw new Error('The organization has no active owner or admin, so nobody could sign in.');
    }
    const fallbackUserId = String(owner?.userId ?? userRows[0]!.id);

    const leadIds = new Set(data.leads.map((l) => String(l.id)));
    const contactIds = new Set(data.contacts.map((c) => String(c.id)));
    const dealIds = new Set(data.deals.map((d) => String(d.id)));
    const ref = (ids: Set<string>, v: unknown) => (v && ids.has(String(v)) ? String(v) : null);

    const notes = data.notes
      .map((n): Row & { text: string } => ({ ...n, text: tiptapToText(n.content) }))
      .filter((n) => n.text !== '');
    const activities = data.activities.filter((a) => ACTIVITY_TYPE[String(a.type)]);
    const workflows = data.workflows.filter(
      (w) =>
        (WORKFLOW_TRIGGERS as readonly string[]).includes(String(w.triggerType)) &&
        workflowDefinitionSchema.safeParse(w.definition).success,
    );

    // Instagram conversations: igConversationId is "<business id>_<customer id>".
    const seenIgsid = new Set<string>();
    const conversations = data.conversations.flatMap((c) => {
      const igsid = String(c.igConversationId).split('_').slice(1).join('_');
      if (!igsid || seenIgsid.has(igsid)) return [];
      seenIgsid.add(igsid);
      return [{ ...c, igsid } as Row & { igsid: string }];
    });
    const conversationIds = new Set(conversations.map((c) => String(c.id)));
    const messages = data.messages.filter((m) => conversationIds.has(String(m.conversationId)));
    const handleOfLead = new Map(data.leads.map((l) => [String(l.id), str(l.instagramHandle)]));
    const lastMessage = new Map<string, Row>();
    for (const m of messages) lastMessage.set(String(m.conversationId), m);

    console.log(dryRun ? 'Would import:' : 'Importing:');
    const run = async (tx: Tx) => {
      await tx.appSettings.upsert({
        where: { id: SETTINGS_ID },
        create: {
          id: SETTINGS_ID,
          companyName: String(org.name),
          defaultCurrency: String(org.currency ?? 'INR').trim(),
          timezone: String(org.timezone ?? 'Asia/Kolkata'),
        },
        update: {},
      });
      await insert('users', userRows, (c) => tx.user.createMany({ data: c }));
      await insert('contacts', data.contacts, (c) =>
        tx.contact.createMany({
          data: c.map((r) => ({
            id: String(r.id),
            firstName: String(r.firstName),
            lastName: str(r.lastName),
            email: str(r.email),
            phone: str(r.phone),
            company: str(r.company),
            jobTitle: str(r.jobTitle),
            assignedToId: str(r.assignedToId),
            createdById: String(r.createdById),
            lastActivityAt: date(r.lastActivityAt),
            createdAt: date(r.createdAt)!,
            deletedAt: date(r.deletedAt),
          })),
        }),
      );
      await insert('leads', data.leads, (c) =>
        tx.lead.createMany({
          data: c.map((r) => ({
            id: String(r.id),
            firstName: String(r.firstName),
            lastName: str(r.lastName),
            email: str(r.email),
            phone: str(r.phone),
            source: LEAD_SOURCE[String(r.source)] ?? 'OTHER',
            status: String(r.status),
            lostReason: str(r.lostReason),
            aiScore: num(r.aiScore),
            aiScoreUpdatedAt: date(r.aiScoreUpdatedAt),
            assignedToId: str(r.assignedToId),
            createdById: String(r.createdById),
            convertedToContactId: ref(contactIds, r.convertedToContactId),
            lastActivityAt: date(r.lastActivityAt),
            createdAt: date(r.createdAt)!,
            deletedAt: date(r.deletedAt),
          })),
        }),
      );
      await insert('pipelines', data.pipelines, (c) =>
        tx.pipeline.createMany({
          data: c.map((r) => ({
            id: String(r.id),
            name: String(r.name),
            isDefault: Boolean(r.isDefault),
            createdAt: date(r.createdAt)!,
          })),
        }),
      );
      await insert('pipeline stages', data.stages, (c) =>
        tx.pipelineStage.createMany({
          data: c.map((r) => ({
            id: String(r.id),
            pipelineId: String(r.pipelineId),
            name: String(r.name),
            order: Number(r.order),
            color: str(r.color),
            probability: num(r.probability),
            isWon: Boolean(r.isWon),
            isLost: Boolean(r.isLost),
            createdAt: date(r.createdAt)!,
          })),
        }),
      );
      await insert('deals', data.deals, (c) =>
        tx.deal.createMany({
          data: c.map((r) => ({
            id: String(r.id),
            title: String(r.title),
            value: num(r.value),
            currency: String(r.currency ?? 'INR').trim(),
            status: String(r.status),
            pipelineId: String(r.pipelineId),
            stageId: String(r.stageId),
            leadId: ref(leadIds, r.leadId),
            contactId: ref(contactIds, r.contactId),
            assignedToId: str(r.assignedToId),
            createdById: String(r.createdById),
            expectedCloseDate: date(r.expectedCloseDate),
            closedAt: date(r.closedAt),
            lostReason: str(r.lostReason),
            createdAt: date(r.createdAt)!,
            deletedAt: date(r.deletedAt),
          })),
        }),
      );
      await insert('tasks', data.tasks, (c) =>
        tx.task.createMany({
          data: c.map((r) => ({
            id: String(r.id),
            title: String(r.title),
            description: str(r.description),
            type: String(r.type),
            priority: String(r.priority),
            status: String(r.status),
            dueDate: date(r.dueDate),
            completedAt: date(r.completedAt),
            // Past reminders were already handled by the old app; don't send them again.
            reminderSentAt: date(r.dueDate) && date(r.dueDate)! < new Date() ? new Date() : null,
            assignedToId: str(r.assignedToId),
            createdById: String(r.createdById),
            relatedLeadId: ref(leadIds, r.relatedLeadId),
            relatedContactId: ref(contactIds, r.relatedContactId),
            relatedDealId: ref(dealIds, r.relatedDealId),
            createdAt: date(r.createdAt)!,
            deletedAt: date(r.deletedAt),
          })),
        }),
      );
      await insert('notes', notes, (c) =>
        tx.note.createMany({
          data: c.map((r) => ({
            id: String(r.id),
            content: r.text,
            createdById: String(r.createdById),
            relatedLeadId: ref(leadIds, r.relatedLeadId),
            relatedContactId: ref(contactIds, r.relatedContactId),
            relatedDealId: ref(dealIds, r.relatedDealId),
            createdAt: date(r.createdAt)!,
            deletedAt: date(r.deletedAt),
          })),
        }),
      );
      await insert('activities', activities, (c) =>
        tx.activity.createMany({
          data: c.map((r) => ({
            id: String(r.id),
            type: ACTIVITY_TYPE[String(r.type)]!,
            description: String(r.description),
            metadata: json(r.metadata),
            performedById: str(r.performedById),
            relatedLeadId: ref(leadIds, r.relatedLeadId),
            relatedContactId: ref(contactIds, r.relatedContactId),
            relatedDealId: ref(dealIds, r.relatedDealId),
            createdAt: date(r.createdAt)!,
          })),
        }),
      );
      await insert('AI scores', data.aiScores, (c) =>
        tx.aiScore.createMany({
          data: c
            .filter((r) => leadIds.has(String(r.leadId)))
            .map((r) => ({
              id: String(r.id),
              leadId: String(r.leadId),
              score: Number(r.score),
              factors: Array.isArray(r.factors) ? (r.factors as Prisma.InputJsonValue) : [],
              recommendation: String(r.recommendation ?? ''),
              modelVersion: String(r.modelVersion ?? 'legacy'),
              triggeredBy: ['manual', 'auto', 'workflow'].includes(String(r.triggeredBy))
                ? String(r.triggeredBy)
                : 'auto',
              createdAt: date(r.createdAt)!,
            })),
        }),
      );
      await insert('workflows', workflows, (c) =>
        tx.workflow.createMany({
          data: c.map((r) => ({
            id: String(r.id),
            name: String(r.name),
            description: str(r.description),
            triggerType: String(r.triggerType),
            definition: json(r.definition),
            isActive: Boolean(r.isActive),
            createdById: fallbackUserId,
            createdAt: date(r.createdAt)!,
            deletedAt: date(r.deletedAt),
          })),
        }),
      );
      await insert('Instagram conversations', conversations, (c) =>
        tx.igConversation.createMany({
          data: c.map((r) => {
            const last = lastMessage.get(String(r.id));
            const lastText = last ? str((last.content as Row | null)?.text) : null;
            return {
              id: String(r.id),
              igsid: r.igsid,
              username: r.leadId ? (handleOfLead.get(String(r.leadId)) ?? null) : null,
              leadId: ref(leadIds, r.leadId),
              lastMessageAt: date(r.lastMessageAt),
              lastMessagePreview: last ? (lastText ?? '[attachment]').slice(0, 200) : null,
              lastInboundAt: date(r.lastInboundAt),
              createdAt: date(r.createdAt)!,
            };
          }),
        }),
      );
      await insert('Instagram messages', messages, (c) =>
        tx.igMessage.createMany({
          data: c.map((r) => {
            const content = (r.content ?? {}) as Row;
            const inbound = r.direction === 'INBOUND';
            return {
              id: String(r.id),
              conversationId: String(r.conversationId),
              direction: String(r.direction),
              mid: String(r.mid),
              text: str(content.text),
              attachments: attachmentsOf(content),
              author: inbound ? 'CUSTOMER' : 'USER',
              status: inbound ? 'RECEIVED' : r.status === 'FAILED' ? 'FAILED' : 'SENT',
              createdAt: date(r.createdAt)!,
              sentAt: date(r.sentAt),
            };
          }),
        }),
      );
    };

    const skipped = {
      'notes (empty)': data.notes.length - notes.length,
      'activities (no counterpart)': data.activities.length - activities.length,
      'workflows (invalid now)': data.workflows.length - workflows.length,
      'conversations (duplicate)': data.conversations.length - conversations.length,
    };

    if (dryRun) {
      // Validate everything inside a transaction, then roll it back.
      await prisma
        .$transaction(
          async (tx) => {
            await run(tx);
            throw new DryRunDone();
          },
          { timeout: 300_000 },
        )
        .catch((e) => {
          if (!(e instanceof DryRunDone)) throw e;
        });
    } else {
      await prisma.$transaction(run, { timeout: 300_000 });
    }

    for (const [label, n] of Object.entries(skipped)) {
      if (n > 0) console.log(`  skipped ${label}: ${n}`);
    }
    console.log(
      dryRun
        ? '\nDry run: nothing was written.'
        : '\nDone. Users sign in with their old email and password. Reconnect Instagram in Settings → Instagram.',
    );
  } finally {
    await legacy.$disconnect();
    await prisma.$disconnect();
  }
}

class DryRunDone extends Error {}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
