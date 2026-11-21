import { BaseSchema } from '@adonisjs/lucid/schema'

/*
 * M6: the grants of the three courier tables (docs/07 §4.10, docs/09 §8.3).
 * The baseline grants covered only the tables that existed then, and no
 * default privileges exist, so each later table gets its grants here. None of
 * the three is append-only (docs/04 §2.12).
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(String.raw`SET LOCAL lock_timeout = '5s'`)
    this.schema.raw(String.raw`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dripnepal_app') THEN
          GRANT SELECT, INSERT, UPDATE, DELETE ON logistics_branches, shipment_booking_attempts, courier_events
            TO dripnepal_app;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dripnepal_readonly') THEN
          GRANT SELECT ON logistics_branches, shipment_booking_attempts, courier_events TO dripnepal_readonly;
        END IF;
      END $$
    `)
  }

  async down() {
    this.schema.raw(String.raw`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dripnepal_app') THEN
          REVOKE ALL ON logistics_branches, shipment_booking_attempts, courier_events FROM dripnepal_app;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dripnepal_readonly') THEN
          REVOKE ALL ON logistics_branches, shipment_booking_attempts, courier_events FROM dripnepal_readonly;
        END IF;
      END $$
    `)
  }
}
