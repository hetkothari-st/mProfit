-- §5.1 task 11 follow-up: create a non-superuser runtime role so that the
-- RLS policies installed by 20260421140000_phase_4_5_rls are actually
-- enforced.
--
-- Background: Postgres skips RLS entirely for any role with the SUPERUSER
-- or BYPASSRLS attribute. FORCE ROW LEVEL SECURITY only overrides the
-- table-owner exemption, not the superuser/BYPASSRLS one. The default
-- `postgres` role in a dev `docker-compose` cluster has both, so an app
-- connecting as `postgres` bypasses every policy we wrote.
--
-- Fix: a dedicated `portfolioos_app` role, LOGIN, NOSUPERUSER, NOBYPASSRLS.
-- The app connects via this role at runtime (DATABASE_URL); migrations keep
-- running as `postgres` (DIRECT_URL) because they need CREATE TABLE etc.
--
-- Production note: override the password before first boot
--   ALTER ROLE portfolioos_app WITH PASSWORD '<from secret store>';
-- and rotate via Parameter Store (§15.10). Do not ship the dev password.

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portfolioos_app') THEN
    CREATE ROLE portfolioos_app LOGIN PASSWORD 'portfolioos_app_dev' NOSUPERUSER NOBYPASSRLS NOREPLICATION;
  END IF;
END
$do$;

-- Belt-and-braces: even if the role already existed (e.g. created manually),
-- make sure it does NOT carry BYPASSRLS.
ALTER ROLE portfolioos_app NOSUPERUSER NOBYPASSRLS;

-- Schema-level usage.
GRANT USAGE ON SCHEMA public TO portfolioos_app;

-- CRUD on every existing table (user-scoped + shared reference data).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO portfolioos_app;

-- Prisma cuid()-based PKs don't use sequences, but Bull queues and any future
-- serial columns will — grant ahead of time so we don't hit a "permission
-- denied for sequence" later.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO portfolioos_app;

-- Future-proof: new tables/sequences created by `postgres` (the migration
-- owner) inherit these grants automatically. Without this, every future
-- migration would have to re-grant manually.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO portfolioos_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO portfolioos_app;

-- portfolioos_app must be able to set the RLS session variables. Custom GUCs
-- under the `app.` namespace are writable by any role by default, so nothing
-- extra is required here — this comment is a tripwire: if someone later adds
-- `ALTER SYSTEM SET app.bypass_rls = …` or a `pg_db_role_setting`, they must
-- ensure portfolioos_app can still SET them per-transaction.
