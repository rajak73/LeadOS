# 11 — RBAC Design

---

## 11.1 Role Hierarchy

```
SUPER ADMIN (platform level — not org level)
    │
    └── Can access all orgs for support/admin purposes
    
OWNER (per org — max 1)
    │
    └── Has ALL permissions
    └── Can transfer ownership
    └── Manages billing

ADMIN
    │
    └── All permissions EXCEPT billing and org deletion
    └── Can manage team members

MANAGER
    │
    └── Can view ALL team's leads, deals, conversations
    └── Can assign and reassign
    └── Cannot delete records created by others

SALES EXECUTIVE
    │
    └── Can only see ASSIGNED leads, deals, conversations
    └── Cannot see other team members' records
```

---

## 11.2 Permission Matrix

### Resource Definitions
| Resource Key | Description |
|---|---|
| `leads` | Lead records |
| `contacts` | Contact records |
| `deals` | Deal records |
| `pipelines` | Pipeline configuration |
| `tasks` | Task records |
| `team` | Team member management |
| `roles` | Role and permission management |
| `inbox` | Social inbox conversations |
| `workflows` | Automation workflows |
| `analytics` | Reports and analytics |
| `billing` | Subscription and billing |
| `org` | Organization settings |
| `files` | File uploads |
| `ai` | AI features |

### Permission Actions
| Action | Description |
|---|---|
| `create` | Create new records |
| `read` | Read records |
| `read_own` | Read only own (assigned) records |
| `update` | Update any record |
| `update_own` | Update only own records |
| `delete` | Delete (soft) any record |
| `delete_own` | Delete only own records |
| `assign` | Assign records to other users |
| `export` | Export data to CSV/PDF |
| `import` | Import data from CSV |

### Full Permission Matrix
| Permission | Super Admin | Owner | Admin | Manager | Sales Executive |
|---|---|---|---|---|---|
| **LEADS** | | | | | |
| leads.create | ✅ | ✅ | ✅ | ✅ | ✅ |
| leads.read | ✅ | ✅ | ✅ | ✅ | own only |
| leads.update | ✅ | ✅ | ✅ | ✅ | own only |
| leads.delete | ✅ | ✅ | ✅ | ❌ | ❌ |
| leads.assign | ✅ | ✅ | ✅ | ✅ | ❌ |
| leads.import | ✅ | ✅ | ✅ | ✅ | ❌ |
| leads.export | ✅ | ✅ | ✅ | ✅ | ❌ |
| **CONTACTS** | | | | | |
| contacts.create | ✅ | ✅ | ✅ | ✅ | ✅ |
| contacts.read | ✅ | ✅ | ✅ | ✅ | own only |
| contacts.update | ✅ | ✅ | ✅ | ✅ | own only |
| contacts.delete | ✅ | ✅ | ✅ | ❌ | ❌ |
| **DEALS** | | | | | |
| deals.create | ✅ | ✅ | ✅ | ✅ | ✅ |
| deals.read | ✅ | ✅ | ✅ | ✅ | own only |
| deals.update | ✅ | ✅ | ✅ | ✅ | own only |
| deals.delete | ✅ | ✅ | ✅ | ❌ | ❌ |
| deals.assign | ✅ | ✅ | ✅ | ✅ | ❌ |
| **PIPELINES** | | | | | |
| pipelines.create | ✅ | ✅ | ✅ | ❌ | ❌ |
| pipelines.read | ✅ | ✅ | ✅ | ✅ | ✅ |
| pipelines.update | ✅ | ✅ | ✅ | ❌ | ❌ |
| pipelines.delete | ✅ | ✅ | ✅ | ❌ | ❌ |
| **TEAM** | | | | | |
| team.invite | ✅ | ✅ | ✅ | ❌ | ❌ |
| team.read | ✅ | ✅ | ✅ | ✅ | ✅ |
| team.update_role | ✅ | ✅ | ✅ | ❌ | ❌ |
| team.remove | ✅ | ✅ | ✅ | ❌ | ❌ |
| team.suspend | ✅ | ✅ | ✅ | ❌ | ❌ |
| **INBOX** | | | | | |
| inbox.read | ✅ | ✅ | ✅ | ✅ | own only |
| inbox.reply | ✅ | ✅ | ✅ | ✅ | own only |
| inbox.assign | ✅ | ✅ | ✅ | ✅ | ❌ |
| inbox.close | ✅ | ✅ | ✅ | ✅ | own only |
| **WORKFLOWS** | | | | | |
| workflows.create | ✅ | ✅ | ✅ | ❌ | ❌ |
| workflows.read | ✅ | ✅ | ✅ | ✅ | ❌ |
| workflows.update | ✅ | ✅ | ✅ | ❌ | ❌ |
| workflows.delete | ✅ | ✅ | ✅ | ❌ | ❌ |
| **ANALYTICS** | | | | | |
| analytics.read_own | ✅ | ✅ | ✅ | ✅ | ✅ |
| analytics.read_all | ✅ | ✅ | ✅ | ✅ | ❌ |
| analytics.export | ✅ | ✅ | ✅ | ✅ | ❌ |
| **BILLING** | | | | | |
| billing.read | ✅ | ✅ | ❌ | ❌ | ❌ |
| billing.manage | ✅ | ✅ | ❌ | ❌ | ❌ |
| **ORG SETTINGS** | | | | | |
| org.read | ✅ | ✅ | ✅ | ✅ | ✅ |
| org.update | ✅ | ✅ | ✅ | ❌ | ❌ |
| org.delete | ✅ | ✅ | ❌ | ❌ | ❌ |
| org.connect_social | ✅ | ✅ | ✅ | ❌ | ❌ |

---

## 11.3 RBAC Middleware Implementation

```typescript
// core/middleware/rbacMiddleware.ts

export const requirePermission = (resource: string, action: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { permissions } = req.context;
    
    // Super admin bypasses RBAC
    if (req.auth.isSuperAdmin) return next();
    
    // Check exact permission
    const hasPermission = permissions.includes(`${resource}.${action}`);
    
    // Check "own only" variant
    const hasOwnPermission = permissions.includes(`${resource}.${action}_own`);
    
    if (!hasPermission && !hasOwnPermission) {
      throw new AppError(
        'FORBIDDEN',
        `You don't have permission to ${action} ${resource}`,
        403
      );
    }
    
    // If only has "own" permission, attach filter to request
    if (!hasPermission && hasOwnPermission) {
      req.context.ownOnly = true;
    }
    
    next();
  };
};

// Usage in routes:
router.get('/leads', 
  requirePermission('leads', 'read'),
  leadsController.list
);

router.delete('/leads/:id',
  requirePermission('leads', 'delete'),
  leadsController.delete
);
```

### "Own Only" Filter in Service Layer
```typescript
// modules/leads/leads.service.ts

async list(context: RequestContext, filters: LeadFilters) {
  const where: Prisma.LeadWhereInput = {
    ...buildFilters(filters),
  };
  
  // If user can only see own records, restrict to assigned records
  if (context.ownOnly) {
    where.assignedToId = context.userId;
  }
  
  return context.db.lead.findMany({
    where,
    // ... rest of query
  });
}
```

---

## 11.4 Record-Level Security

### "Own Only" Records
Sales Executives only see leads/deals/conversations **assigned to them**.

Implementation:
1. `rbacMiddleware` sets `req.context.ownOnly = true`
2. Service layer appends `assignedToId = userId` to all queries
3. PostgreSQL RLS provides defense-in-depth (even if service layer has bug)

### Cross-Team Visibility Rules
| Role | Can See Records Assigned To |
|---|---|
| Super Admin | Anyone in any org |
| Owner | Anyone in org |
| Admin | Anyone in org |
| Manager | Anyone in org (full pipeline visibility) |
| Sales Executive | Only records assigned to themselves |

### Shared Resources (always org-wide)
- Pipeline configuration
- Workflow definitions
- Team directory (read-only)
- Org settings (read-only)
- Custom field definitions

---

## 11.5 Role Seeding on Org Creation

When a new organization is created, these 4 system roles are seeded with their default permissions:

```typescript
const DEFAULT_ROLES = [
  {
    name: 'OWNER',
    permissions: ALL_PERMISSIONS // every permission granted
  },
  {
    name: 'ADMIN',
    permissions: ALL_PERMISSIONS.filter(p => 
      !p.startsWith('billing') && p !== 'org.delete'
    )
  },
  {
    name: 'MANAGER',
    permissions: [
      'leads.create', 'leads.read', 'leads.update', 'leads.assign', 'leads.export',
      'contacts.create', 'contacts.read', 'contacts.update',
      'deals.create', 'deals.read', 'deals.update', 'deals.assign',
      'pipelines.read',
      'team.read',
      'inbox.read', 'inbox.reply', 'inbox.assign', 'inbox.close',
      'workflows.read',
      'analytics.read_own', 'analytics.read_all', 'analytics.export',
      'tasks.create', 'tasks.read', 'tasks.update',
      'org.read'
    ]
  },
  {
    name: 'SALES_EXECUTIVE',
    permissions: [
      'leads.create', 'leads.read_own', 'leads.update_own',
      'contacts.create', 'contacts.read_own', 'contacts.update_own',
      'deals.create', 'deals.read_own', 'deals.update_own',
      'pipelines.read',
      'team.read',
      'inbox.read_own', 'inbox.reply_own', 'inbox.close_own',
      'tasks.create', 'tasks.read', 'tasks.update_own',
      'analytics.read_own',
      'org.read'
    ]
  }
];
```

---

## 11.6 Future: Custom Roles (Scale Plan)

Scale plan organizations can:
- Create custom roles with granular permission selection
- Duplicate existing roles and modify
- Assign different roles per pipeline (future)
- Time-limited role grants (future)
