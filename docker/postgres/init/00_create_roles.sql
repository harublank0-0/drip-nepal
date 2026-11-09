-- Creates the database roles of docs/07 §4.10 next to the superuser of the
-- development Compose file (docs/11 §4.3), so tests can migrate as
-- dripnepal_migrator and run as dripnepal_app, as in production (docs/10
-- §3.2). Development only: the password is the docker-compose one. The
-- postgres image runs the files in this folder in name order, and only when
-- its data volume is empty. For an existing volume, run this file and the
-- next one once by hand:
--   docker compose exec -T postgres psql -U dripnepal -d dripnepal < docker/postgres/init/00_create_roles.sql
--   docker compose exec postgres psql -U dripnepal -d dripnepal -c 'ALTER DATABASE dripnepal_test OWNER TO dripnepal_migrator'

-- Owns the test database, so it holds CREATE on it for the CREATE EXTENSION
-- of baseline file 1 (docs/04 §20.2.2), and owns schema public through
-- pg_database_owner.
CREATE ROLE dripnepal_migrator LOGIN PASSWORD 'secret' NOSUPERUSER NOCREATEDB NOCREATEROLE;

-- The web and worker role: DML only, granted by the baseline_grants migration.
CREATE ROLE dripnepal_app LOGIN PASSWORD 'secret' NOSUPERUSER NOCREATEDB NOCREATEROLE;

-- Incident reads (proposed): SELECT grants from baseline_grants, and
-- pg_read_all_stats so pg_stat_activity shows other roles' sessions.
CREATE ROLE dripnepal_readonly LOGIN PASSWORD 'secret' NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT pg_read_all_stats TO dripnepal_readonly;
