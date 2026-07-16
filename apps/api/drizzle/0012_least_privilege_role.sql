-- Least-privilege runtime role (ADR-018). The application connects as
-- `accesscore_app`; DDL migrations run as the owner via MIGRATION_DATABASE_URL.
-- A non-owner runtime role is what makes REVOKE bind: the append-only
-- decision_log and revisions changelog cannot be rewritten or deleted at runtime.
--
-- Idempotent and environment-uniform: provisions the role NOLOGIN if absent
-- (local/CI keep a single owner role, so `accesscore_app` exists but is unused).
-- In production the deployer creates it WITH LOGIN PASSWORD out-of-band, so no
-- secret ever lives in a migration; this only (re)applies the grants.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'accesscore_app') THEN
    CREATE ROLE accesscore_app NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO accesscore_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO accesscore_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO accesscore_app;

-- Tables/sequences created by later migrations (run as the owner) are granted
-- to the runtime role automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO accesscore_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO accesscore_app;

-- Append-only audit and revision changelog: SELECT + INSERT only, no UPDATE/DELETE.
REVOKE UPDATE, DELETE ON decision_log, revisions FROM PUBLIC;
REVOKE UPDATE, DELETE ON decision_log, revisions FROM accesscore_app;
