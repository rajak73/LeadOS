// Tenant-table registry (TEN-3.1.3) — the single source of truth for which tables are
// organization-scoped. It drives (a) the RLS policies (migrations 0003 + 0009 + 0011 + 0012), (b) the
// RLS-coverage check (scripts/check-rls-coverage.ts), and (c) the tenant Prisma extension.
//
// INVARIANT enforced in CI: this registry MUST equal the set of tables that physically carry
// the tenant column. A new org-scoped table that is added to the schema but not here (or
// vice-versa) fails the coverage check — so no tenant table can silently ship without RLS.
//
// Sprint 4 M1 expanded from 5 tables (Sprint 3) to 15 (5 existing + 10 new CRM tables).
// Sprint 5 M1 expanded from 15 tables (Sprint 4) to 19 (4 new Pipeline/Deal/Webhook tables).
// Sprint 6 M1 expanded from 19 tables (Sprint 5) to 22 (3 new Instagram Inbox tables).
// Sprint 7 M1 expanded from 22 tables (Sprint 6) to 24 (2 new Notification tables).
// Sprint 9 expanded from 26 tables (Sprint 8) to 30 (4 new WhatsApp tables).
// check:rls expected output: OK — 30 tenant tables enabled + forced + policied.
//
// NOTE on the column name: the actual Prisma-generated column is camelCase `"organizationId"`.
// Policies + checks use the real column name below.

/** The physical column carrying the owning organization id on every tenant table. */
export const TENANT_COLUMN = 'organizationId' as const;

/**
 * The Prisma relation field that ALSO sets the tenant FK (`organization { connect/set/... }`).
 * Write paths must neutralize this in addition to {@link TENANT_COLUMN}, otherwise a row could
 * be reassigned to another org via the relation instead of the scalar (DEF-M2-1). Uniform
 * across tenant models that expose the relation; a no-op for those that only carry the scalar.
 */
export const TENANT_RELATION = 'organization' as const;

/** The Postgres GUC that pins the active organization for a unit of work (set via SET LOCAL). */
export const TENANT_GUC = 'app.current_organization_id' as const;

/**
 * Org-scoped tables. RLS (enable + force + missing-safe policy) must cover exactly this set.
 * Identity roots (`users`, `organizations`) and cross-tenant infra (`verification_tokens`,
 * `health_check`) are intentionally NOT tenant-scoped and carry no `organizationId`.
 */
export const TENANT_TABLES = [
  // Sprint 3 — identity & tenancy
  'organization_members',
  'roles',
  'subscriptions',
  'refresh_tokens',
  'audit_logs',
  // Sprint 4 M1 — CRM foundation
  'leads',
  'contacts',
  'tasks',
  'activities',
  'notes',
  'files',
  'ai_scores',
  'custom_field_definitions',
  'team_invites',
  'saved_replies',
  // Sprint 5 M1 — Pipeline, Deals & Webhook foundation
  'pipelines',
  'pipeline_stages',
  'deals',
  'webhook_events',
  // Sprint 6 M1 — Instagram Inbox
  'instagram_accounts',
  'instagram_conversations',
  'messages',
  // Sprint 7 M1 — Notification engine
  'notifications',
  'notification_preferences',
  // Sprint 7 M2 — AI usage tracking
  'ai_usage_counters',
  // Sprint 7 M3 — Workflow engine
  'workflows',
  'workflow_runs',
  // Sprint 9 — WhatsApp integration
  'whatsapp_accounts',
  'whatsapp_templates',
  'whatsapp_conversations',
  'whatsapp_messages',
] as const;

export type TenantTable = (typeof TENANT_TABLES)[number];

/**
 * The same set expressed as Prisma MODEL names (PascalCase) — the identifier the client
 * extension receives in `$allOperations({ model })`. Kept in lock-step with TENANT_TABLES;
 * the registry unit test asserts the two stay the same length.
 */
export const TENANT_MODELS = [
  // Sprint 3
  'OrganizationMember',
  'Role',
  'Subscription',
  'RefreshToken',
  'AuditLog',
  // Sprint 4 M1 — CRM
  'Lead',
  'Contact',
  'Task',
  'Activity',
  'Note',
  'File',
  'AiScore',
  'CustomFieldDefinition',
  'TeamInvite',
  'SavedReply',
  // Sprint 5 M1 — Pipeline, Deals & Webhook
  'Pipeline',
  'PipelineStage',
  'Deal',
  'WebhookEvent',
  // Sprint 6 M1 — Instagram Inbox
  'InstagramAccount',
  'InstagramConversation',
  'Message',
  // Sprint 7 M1 — Notification engine
  'Notification',
  'NotificationPreference',
  // Sprint 7 M2 — AI usage tracking
  'AiUsageCounter',
  // Sprint 7 M3 — Workflow engine
  'Workflow',
  'WorkflowRun',
  // Sprint 9 — WhatsApp integration
  'WhatsAppAccount',
  'WhatsAppTemplate',
  'WhatsAppConversation',
  'WhatsAppMessage',
] as const;

export type TenantModel = (typeof TENANT_MODELS)[number];

export function isTenantModel(model: string | undefined): model is TenantModel {
  return model !== undefined && (TENANT_MODELS as readonly string[]).includes(model);
}

/** Tables that intentionally have no tenant column (documented exclusions). */
export const NON_TENANT_TABLES = [
  'users',
  'organizations',
  'verification_tokens',
  'permissions',
  'health_check',
  'platform_audit_logs', // AUD-3 scaffold — intentionally NOT tenant-scoped (no organizationId)
  'billing_plans',
  'stripe_webhook_events',
] as const;

export function isTenantTable(table: string): table is TenantTable {
  return (TENANT_TABLES as readonly string[]).includes(table);
}
