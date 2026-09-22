# LeadOS

A CRM for one company and its sales team. It covers leads, contacts, a deals pipeline,
tasks, notes, AI lead scoring and simple automation.

- **Backend:** Node.js 22, Express 5 and TypeScript, with Prisma on SQLite
- **Frontend:** React 19 (Vite), Tailwind CSS v4, TanStack Query and Radix UI
- **One process:** in production the API also serves the web app, so a single server and a
  single database file is all you run

## Features

- **Leads:** search and filters, bulk actions, CSV import and export, and converting a lead
  into a contact and a deal
- **Contacts**
- **Pipelines:** a drag-and-drop kanban board, several pipelines, and custom stages
- **Tasks:** due dates, reminders and priorities, grouped into Overdue, Today and Upcoming
- **Notes and activity:** a timeline on every lead, contact and deal
- **AI lead scoring:** uses OpenAI `gpt-4o-mini`. Without an API key it falls back to a
  built-in rules scorer, and no data leaves your server.
- **Workflows:** automation in three steps: _when_ something happens, _only if_ conditions
  match, _then_ do something. Actions: change status, assign (to a person or round robin),
  add a tag, create a task, notify, rescore, or call a webhook.
- **Dashboard:** KPIs, charts and team performance
- **Team:** Admin and Member roles, with in-app notifications
- **Interface:** light and dark themes, works on phones, keyboard accessible, and a
  <kbd>⌘K</kbd> command palette

## Getting started

You need Node 22 or newer and pnpm 9 (`corepack enable`).

```bash
pnpm install
cp .env.example .env            # the defaults work for local development
pnpm db:migrate                 # creates prisma/data/leados.db
pnpm db:seed -- --demo          # creates an admin account plus demo data (omit --demo for an empty CRM)
pnpm dev                        # API on :4000, web app on http://localhost:5173
```

The seed prints the admin login. You can choose it with `SEED_ADMIN_EMAIL` and
`SEED_ADMIN_PASSWORD` in `.env`. If you skip the seed, the app opens a first-run setup screen
where you create the admin account.

## Scripts

| Command                                        | What it does                                                |
| ---------------------------------------------- | ----------------------------------------------------------- |
| `pnpm dev`                                     | Runs the API and web app with hot reload                    |
| `pnpm build`                                   | Builds the shared package, the API and the web app          |
| `pnpm start`                                   | Starts the production server (API + built web app)          |
| `pnpm test`                                    | Runs all tests                                              |
| `pnpm typecheck` / `pnpm lint` / `pnpm format` | Code checks                                                 |
| `pnpm db:migrate`                              | Applies database migrations                                 |
| `pnpm db:migrate:create`                       | Creates a migration after you change `prisma/schema.prisma` |
| `pnpm db:seed`                                 | Creates the first admin (`-- --demo` adds sample data)      |
| `pnpm db:studio`                               | Opens Prisma Studio to browse the data                      |

## Deploying

```bash
docker build -f infra/docker/api.Dockerfile -t leados .
docker run -p 4000:4000 -v leados-data:/data -e JWT_SECRET="$(openssl rand -base64 48)" leados
```

The container applies migrations on start and keeps the SQLite database in the `/data`
volume, so back that volume up. Put it behind HTTPS and set `TRUST_PROXY=true` if a reverse
proxy sits in front. See [`.env.example`](.env.example) for every setting.

## Project layout

```
apps/api         Express API: src/modules/<area>/ (routes + service), src/lib/ (shared helpers)
apps/web         React app: src/features/<area>/ (pages), src/components/ui/ (design system)
packages/shared  Enums, zod validation schemas and API types used by both apps
prisma/          Database schema and migrations
docs/API.md      API reference
```
