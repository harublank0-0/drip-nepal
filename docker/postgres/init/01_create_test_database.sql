-- Creates the test database next to the development one (RF-32, docs/11 §4.3).
-- The postgres image runs this only when its data volume is empty. For an
-- existing volume, create it once by hand:
--   docker compose exec postgres createdb -U dripnepal dripnepal_test
CREATE DATABASE dripnepal_test;
