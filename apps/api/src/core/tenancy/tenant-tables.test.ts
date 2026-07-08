// Unit tests for the tenant-table registry (no DB). The registry is the contract the RLS
// migration + coverage check are validated against; these guard its internal consistency.

import { describe, it, expect } from 'vitest';
import {
  TENANT_TABLES,
  TENANT_MODELS,
  NON_TENANT_TABLES,
  TENANT_COLUMN,
  TENANT_GUC,
  isTenantTable,
  isTenantModel,
} from './tenant-tables.js';

// Sprint 3 tables (5) + Sprint 4 M1 CRM tables (10) = 15
const SPRINT_3_TABLES = [
  'audit_logs',
  'organization_members',
  'refresh_tokens',
  'roles',
  'subscriptions',
];
const SPRINT_4_CRM_TABLES = [
  'activities',
  'ai_scores',
  'contacts',
  'custom_field_definitions',
  'files',
  'leads',
  'notes',
  'saved_replies',
  'tasks',
  'team_invites',
];
const SPRINT_6_INSTAGRAM_TABLES = [
  'instagram_accounts',
  'instagram_conversations',
  'messages',
];
const SPRINT_7_NOTIFICATION_TABLES = [
  'notifications',
  'notification_preferences',
];
const SPRINT_7_M2_TABLES = [
  'ai_usage_counters',
];
const SPRINT_7_M3_TABLES = [
  'workflows',
  'workflow_runs',
];
const SPRINT_9_WHATSAPP_TABLES = [
  'whatsapp_accounts',
  'whatsapp_templates',
  'whatsapp_conversations',
  'whatsapp_messages',
];
const ALL_TENANT_TABLES = [
  ...SPRINT_3_TABLES,
  'import_history',
  'pipelines',
  'pipeline_stages',
  'deals',
  'webhook_events',
  ...SPRINT_4_CRM_TABLES,
  ...SPRINT_6_INSTAGRAM_TABLES,
  ...SPRINT_7_NOTIFICATION_TABLES,
  ...SPRINT_7_M2_TABLES,
  ...SPRINT_7_M3_TABLES,
  ...SPRINT_9_WHATSAPP_TABLES,
];

describe('tenant-table registry', () => {
  it('lists exactly 32 org-scoped tables (Sprint 3 + Sprint 4 CRM + Sprint 5 Pipeline/Deal + Sprint 6 Instagram + Sprint 7 Notifications/AI Quota/Workflows + Sprint 9 WhatsApp)', () => {
    expect(TENANT_TABLES).toHaveLength(32);
    expect([...TENANT_TABLES].sort()).toEqual(ALL_TENANT_TABLES.sort());
  });

  it('has a 1-to-1 correspondence between TENANT_TABLES and TENANT_MODELS', () => {
    expect(TENANT_TABLES.length).toBe(TENANT_MODELS.length);
  });

  it('pins the real Prisma tenant column and the GUC name', () => {
    expect(TENANT_COLUMN).toBe('organizationId');
    expect(TENANT_GUC).toBe('app.current_organization_id');
  });

  it('keeps tenant and non-tenant sets disjoint', () => {
    const overlap = TENANT_TABLES.filter((t) =>
      (NON_TENANT_TABLES as readonly string[]).includes(t),
    );
    expect(overlap).toEqual([]);
  });

  it('classifies tables via isTenantTable', () => {
    // Sprint 3 entries still classified correctly
    expect(isTenantTable('roles')).toBe(true);
    expect(isTenantTable('audit_logs')).toBe(true);
    // Sprint 4 CRM entries
    expect(isTenantTable('leads')).toBe(true);
    expect(isTenantTable('contacts')).toBe(true);
    expect(isTenantTable('activities')).toBe(true);
    expect(isTenantTable('custom_field_definitions')).toBe(true);
    // Non-tenant tables
    expect(isTenantTable('users')).toBe(false);
    expect(isTenantTable('organizations')).toBe(false);
    expect(isTenantTable('nonexistent')).toBe(false);
  });

  it('classifies models via isTenantModel', () => {
    expect(isTenantModel('Lead')).toBe(true);
    expect(isTenantModel('Contact')).toBe(true);
    expect(isTenantModel('Activity')).toBe(true);
    expect(isTenantModel('AiScore')).toBe(true);
    expect(isTenantModel('CustomFieldDefinition')).toBe(true);
    expect(isTenantModel('TeamInvite')).toBe(true);
    expect(isTenantModel('SavedReply')).toBe(true);
    // Sprint 3
    expect(isTenantModel('AuditLog')).toBe(true);
    expect(isTenantModel('OrganizationMember')).toBe(true);
    // Non-tenant
    expect(isTenantModel('User')).toBe(false);
    expect(isTenantModel(undefined)).toBe(false);
  });

  it('has no duplicate entries', () => {
    expect(new Set(TENANT_TABLES).size).toBe(TENANT_TABLES.length);
    expect(new Set(TENANT_MODELS).size).toBe(TENANT_MODELS.length);
    expect(new Set(NON_TENANT_TABLES).size).toBe(NON_TENANT_TABLES.length);
  });
});
