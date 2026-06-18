# Clean Architecture & Engineering Principles

LeadOS is engineered with strong adherence to modular decoupling, row-level logical multi-tenant isolation, and clean layered design.

## Logical Workspace Boundaries

The system is separated into two standalone workspaces:
1. **`backend/`**: A Node/Express TypeScript server implementing standard Controller-Service-Repository layers, communicating via Prisma with a PostgreSQL database.
2. **`frontend/`**: A Next.js 15 App Router web client implementing client-side view states, service API binders, and Tailwind styling.

---

## Decoupled Layering (Backend)

We enforce a strict unidirectional dependency stack on the backend to keep business rules independent of server protocols, database dialects, or libraries:

```
Request Router ──> Controllers ──> Services ──> Repositories ──> Database (Prisma)
```

### 1. Controllers Layer (`src/modules/*/controller.ts`)
- **Responsibility**: Interface adapter. Translates HTTP requests, parses headers (such as `x-organization-id`), calls services, and formats standard JSON responses using `ApiResponse`.
- **Constraint**: Must not contain database queries, business transactions, or raw logic.

### 2. Services Layer (`src/modules/*/service.ts`)
- **Responsibility**: Pure business logic engine. Enforces state transitions, creates database relationships (e.g. Prisma `connect`/`disconnect` objects), and manages access control logic.
- **Constraint**: Does not know about HTTP requests, routing, status codes, or middleware.

### 3. Repositories Layer (`src/modules/*/repository.ts`)
- **Responsibility**: Database access abstraction. Directs queries via the Prisma client singleton, implements search filters, and performs soft deletions.
- **Constraint**: No business validation logic or HTTP transport dependencies.

---

## Tenant Logical Scoping (Row-level Isolation)

Logical multi-tenant isolation is implemented at the database row level rather than separate databases.

1. **Relation Bridge**: All tenant data tables (`Customer`, `Lead`, `PipelineStage`, `InstagramAccount`, `Message`, `Invitation`) are linked to an `Organization` via an `organizationId` foreign key.
2. **Context Middlewares**:
   - `authMiddleware` verifies the JWT access token and attaches the decoded user metadata payload to the request (`req.user`).
   - `orgMiddleware` pulls the header `x-organization-id`, verifies the user belongs to that organization, and sets `req.user.organizationId = orgId`.
3. **Controller Enforcement**: Every database query query parameters passed from controller to service explicitly binds the `organizationId`. It is structurally impossible to retrieve or mutate records belonging to a different tenant because all prisma filters include `where: { organizationId }`.
