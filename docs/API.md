# REST API Reference Docs

The LeadOS backend exposes JSON REST endpoints under `/api/v1`.

All protected requests require an `Authorization` header containing the access token:
`Authorization: Bearer <jwt_access_token>`

Multi-tenant requests require an additional header context:
`X-Organization-Id: <organization_uuid>`

---

## 1. Authentication Module (`/auth`)

### `POST /auth/signup`
Creates a user account + automatically provisions a default organization space.
- **Body**: `{ firstName, lastName, email, password, organizationName }`
- **Response**: `{ success: true, data: { user, accessToken, refreshToken } }`

### `POST /auth/login`
Authenticates credentials. Sets refresh token in httpOnly cookie.
- **Body**: `{ email, password }`
- **Response**: `{ success: true, data: { user, accessToken } }`

### `POST /auth/refresh-token`
Rotates and issues a new access token.
- **Response**: `{ success: true, data: { accessToken } }`

---

## 2. Organization Module (`/organization`)

### `GET /organization`
Fetches scoped organization details.
- **Response**: `{ success: true, data: { id, name, slug, website, industry } }`

### `PUT /organization`
Updates organization attributes. (Requires OWNER/ADMIN role).
- **Body**: `{ name, website, industry }`

---

## 3. Team Module (`/team`)

### `GET /team`
Lists workspace members.
- **Response**: `{ success: true, data: [ { id, role, user: { id, firstName, lastName, email } } ] }`

### `POST /team/invite`
Sends copyable workspace join invitation.
- **Body**: `{ email, role }`

---

## 4. Customers Module (`/customers`)

### `GET /customers`
Lists organization customers with pagination and search queries.
- **Query Params**: `page`, `limit`, `search`
- **Response**: `{ success: true, data: { data: [...], pagination: { page, total, totalPages } } }`

### `POST /customers`
Creates a new customer profile.
- **Body**: `{ firstName, lastName, email, phone, company, source }`

---

## 5. Leads Module (`/leads`)

### `GET /leads`
Lists scoped pipeline leads.
- **Query Params**: `page`, `limit`, `status`, `assignedToId`, `pipelineStageId`

### `PATCH /leads/:id/move`
Updates pipeline stage location and status of lead.
- **Body**: `{ pipelineStageId, status }`

---

## 6. Pipeline Module (`/pipeline`)

### `GET /pipeline/board`
Fetches stages populated with leads for Kanban display.
- **Response**: `{ success: true, data: [ { id, name, color, order, leads: [...], totalValue } ] }`

### `POST /pipeline/stages`
Creates custom pipeline column.
- **Body**: `{ name, color, order }`
