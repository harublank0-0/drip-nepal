-- Creates the test database next to the development one (RF-32, docs/11 §4.3),
-- owned by dripnepal_migrator (docs/07 §4.10), which 00_create_roles.sql
-- creates. The postgres image runs this only when its data volume is empty.
-- For an existing volume, create it once by hand after the roles:
--   docker compose exec postgres createdb -U dripnepal -O dripnepal_migrator dripnepal_test
CREATE DATABASE dripnepal_test OWNER dripnepal_migrator;
