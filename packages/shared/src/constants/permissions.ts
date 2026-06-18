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
