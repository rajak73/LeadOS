// Permission keys + default role sets (doc 11). Shared so the backend RBAC middleware
// (S3) and the frontend role-aware UI use identical keys. No enforcement here — keys only.

export const RESOURCES = [
  'leads',
  'contacts',
  'deals',
  'pipelines',
  'tasks',
  'team',
  'roles',
  'inbox',
  'workflows',
  'analytics',
  'billing',
  'org',
  'files',
  'ai',
] as const;
export type Resource = (typeof RESOURCES)[number];

export const ACTIONS = [
  'create',
  'read',
  'read_own',
  'update',
  'update_own',
  'delete',
  'delete_own',
  'assign',
  'export',
  'import',
] as const;
export type Action = (typeof ACTIONS)[number];

export type PermissionKey = `${Resource}.${Action}`;

export const SYSTEM_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'SALES_EXECUTIVE'] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

// Manager default permission set (doc 11 §11.5). Owner/Admin are derived in the seeding
// service (S3); Sales Executive uses the *_own variants. Kept here as the contract.
export const MANAGER_PERMISSIONS: PermissionKey[] = [
  'leads.create',
  'leads.read',
  'leads.update',
  'leads.assign',
  'leads.export',
  'contacts.create',
  'contacts.read',
  'contacts.update',
  'deals.create',
  'deals.read',
  'deals.update',
  'deals.assign',
  'pipelines.read',
  'team.read',
  'inbox.read',
  'workflows.read',
  'analytics.read',
  'tasks.create',
  'tasks.read',
  'tasks.update',
  'org.read',
];

export const SALES_EXECUTIVE_PERMISSIONS: PermissionKey[] = [
  'leads.create',
  'leads.read_own',
  'leads.update_own',
  'contacts.create',
  'contacts.read_own',
  'contacts.update_own',
  'deals.create',
  'deals.read_own',
  'deals.update_own',
  'pipelines.read',
  'team.read',
  'inbox.read_own',
  'tasks.create',
  'tasks.read',
  'tasks.update_own',
  'analytics.read_own',
  'org.read',
];

// Full permission catalog (doc 11 §11.2). Some keys (e.g. team.invite, org.connect_social,
// analytics.read_all) do not fit the generic `${Resource}.${Action}` shape, so the catalog
// is typed as plain strings. This is the single source of truth for role SEEDING (S2) and
// RBAC ENFORCEMENT (S3). Seeding splits "resource.action" into the permissions table's
// resource + action columns.
export const PERMISSION_CATALOG: readonly string[] = [
  // leads
  'leads.create', 'leads.read', 'leads.read_own', 'leads.update', 'leads.update_own',
  'leads.delete', 'leads.assign', 'leads.import', 'leads.export',
  // contacts
  'contacts.create', 'contacts.read', 'contacts.read_own', 'contacts.update',
  'contacts.update_own', 'contacts.delete',
  // deals
  'deals.create', 'deals.read', 'deals.read_own', 'deals.update', 'deals.update_own',
  'deals.delete', 'deals.assign',
  // pipelines
  'pipelines.create', 'pipelines.read', 'pipelines.update', 'pipelines.delete',
  // tasks
  'tasks.create', 'tasks.read', 'tasks.update', 'tasks.update_own',
  // inbox
  'inbox.read', 'inbox.read_own', 'inbox.reply', 'inbox.reply_own', 'inbox.assign',
  'inbox.close', 'inbox.close_own',
  // workflows
  'workflows.create', 'workflows.read', 'workflows.update', 'workflows.delete',
  // analytics
  'analytics.read_own', 'analytics.read_all', 'analytics.export',
  // team
  'team.invite', 'team.read', 'team.update_role', 'team.remove', 'team.suspend',
  // billing
  'billing.read', 'billing.manage',
  // org
  'org.read', 'org.update', 'org.delete', 'org.connect_social',
  // files
  'files.create', 'files.read', 'files.delete',
] as const;

// ADMIN = everything except billing and org deletion (doc 11 §11.5).
const ADMIN_PERMISSIONS: readonly string[] = PERMISSION_CATALOG.filter(
  (p) => !p.startsWith('billing.') && p !== 'org.delete',
);

export const ROLE_PERMISSIONS: Record<SystemRole, readonly string[]> = {
  OWNER: PERMISSION_CATALOG, // all
  ADMIN: ADMIN_PERMISSIONS,
  MANAGER: MANAGER_PERMISSIONS,
  SALES_EXECUTIVE: SALES_EXECUTIVE_PERMISSIONS,
};
