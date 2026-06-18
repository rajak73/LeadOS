# Environment Configuration Reference

This document describes all environment variables used by the LeadOS workspace.

## Backend Environment Variables (`backend/.env`)

These variables must be set for the backend process to run.

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `DATABASE_URL` | String | Yes | — | PostgreSQL Neon connection string. |
| `JWT_ACCESS_SECRET` | String | Yes | — | Secret key used to sign and verify JSON Web Access Tokens. |
| `JWT_REFRESH_SECRET` | String | Yes | — | Secret key used to sign and verify JSON Web Refresh Tokens. |
| `PORT` | Integer | No | `5000` | Port on which the Express.js server will listen. |
| `NODE_ENV` | String | No | `development` | Running environment mode (`development`, `production`). |
| `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` | String | No | `leados_instagram_webhook_secret` | Verify token used to authenticate Meta developer webhook verification. |
| `INSTAGRAM_APP_SECRET` | String | No | — | Secret used to validate Meta webhook post signatures in production. |

---

## Frontend Environment Variables (`frontend/.env.local`)

These variables are compiled into the client-side Next.js bundle.

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | String | Yes | `http://localhost:5000/api/v1` | Public domain endpoint of the running backend API service. |
