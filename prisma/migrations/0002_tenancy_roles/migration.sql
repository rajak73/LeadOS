-- Sprint 3 M1 / TEN-3.1.1 — Tenant database roles (FINAL_ARCHITECTURE §2.3).
--
-- Two distinct roles enforce the "least privilege + RLS is the floor" posture:
--   * leados_app            — LOGIN, NOSUPERUSER, NOBYPASSRLS. ALL tenant traffic connects
--                             as this role, so PostgreSQL RLS actually applies to it.
--   * leados_platform_admin — LOGIN, NOSUPERUSER, BYPASSRLS. Platform/support paths ONLY
--                             (every action audited in Sprint 3 M5). Never used for tenant
--                             traffic.
--
-- The migration runner (e.g. `leados`, the table owner / a superuser) is NOT either of these;
-- it keeps owning the schema and running migrations. RLS is FORCED (migration 0003) so it
-- applies even to the owner.
--
-- CREDENTIALS: the passwords below are DEV/TEST credentials for local + CI parity (mirroring
-- the existing `leados:leados` dev credential). In production these roles are provisioned
-- out-of-band (Neon/infra) with managed secrets; the guarded CREATE statements are idempotent
-- and simply no-op if the role already exists.

-- leados_app — RLS-enforced application role
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'leados_app') THEN
    CREATE ROLE leados_app LOGIN PASSWORD 'leados_app'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  -- Re-assert the security-critical attributes even if the role pre-existed.
  ALTER ROLE leados_app NOSUPERUSER NOBYPASSRLS;
END $$;

-- leados_platform_admin — BYPASSRLS platform/support role (used only on audited platform paths)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'leados_platform_admin') THEN
    CREATE ROLE leados_platform_admin LOGIN PASSWORD 'leados_platform_admin'
      NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;
  END IF;
  ALTER ROLE leados_platform_admin NOSUPERUSER BYPASSRLS;
END $$;

-- Schema + object privileges. RLS sits ON TOP of these grants: a grant lets the role attempt
-- an operation; the RLS policy (0003) then decides which rows it may see/write.
GRANT USAGE ON SCHEMA public TO leados_app, leados_platform_admin;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO leados_app, leados_platform_admin;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO leados_app, leados_platform_admin;

-- Future tables/sequences created by the migration runner inherit the same grants, so a new
-- domain table (Sprint 4+) is reachable by the app role without a follow-up grant migration.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO leados_app, leados_platform_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO leados_app, leados_platform_admin;
