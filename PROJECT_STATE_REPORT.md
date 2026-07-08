# LeadOS Project State Report

**Date:** June 24, 2026
**Current Phase:** Sprint 1 — "Platform Spine" (M0 Milestone)

## Overview
LeadOS is an AI-powered Revenue Operating System. The architecture is a modular-monolith backend paired with a Next.js web application.

- **Backend:** Express + TypeScript (API and Worker processes)
- **Frontend:** Next.js 15 App Router + BFF route handlers
- **Infrastructure:** PostgreSQL (Neon), Prisma, Redis, BullMQ
- **Monorepo:** Managed via pnpm and Turborepo

## Workspace Structure
- `apps/api`: Express modular monolith + worker entrypoint.
- `apps/web`: Next.js 15 web application.
- `packages/shared`: Shared resources including Zod schemas, enums, error codes, and plan limits.
- `packages/config`: Shared ESLint and Prettier presets.
- `packages/tsconfig`: Shared TypeScript configuration presets.
- `prisma/`: Database schema, migrations, and seeds.
- `infra/`: Dockerfiles, local compose setups, and runbooks.
- `docs/`: Extensive project blueprints, architecture definitions, and execution plans.

## Current Sprint Focus (Sprint 1)
The project is currently focused on establishing the "Platform Spine". The goal is to build the skeleton of the application so that domain logic can be cleanly plugged in during subsequent sprints. 

### In Scope for Sprint 1
- **Toolchain:** Monorepo setup with pnpm, Turborepo, strict TypeScript, and linting (including module-boundary rules).
- **Backend Spine:** Express app setup, middleware order, error models, Prisma client, Neon wiring, Redis client, and BullMQ worker topologies.
- **Frontend Shell:** Design tokens, Tailwind setup, Shadcn baseline, Next.js App Router shell, and a minimal BFF health proxy.
- **Observability:** Structured logs, traces, Sentry, and metrics.
- **Security:** Helmet/CSP, CORS, rate limiting, and single-flight schedulers.
- **CI/CD:** Pipelines for testing, building, and deployment (Vercel and Railway) on custom domains.

### Explicitly Out of Scope for Sprint 1
- Domain modules
- Authentication logic (Planned for Sprint 2)
- Tenancy logic and RBAC enforcement (Planned for Sprint 3)

## Definition of Done (M0 - Spine Green)
Sprint 1 will be considered complete when:
1. A request successfully flows from the browser → web (BFF) → API → Postgres with structured logging.
2. A job enqueued by the API is successfully processed by a separate worker process.
3. CI pipelines are green.
4. Preview deployments function correctly on same-site custom domains.
