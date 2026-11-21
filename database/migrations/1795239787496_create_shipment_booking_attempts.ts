import { BaseSchema } from '@adonisjs/lucid/schema'

/*
 * M6 (docs/04a §9.13): every call that creates or cancels a courier booking,
 * claimed before the call. `shipment_booking_attempts_in_flight_key` is the
 * claim, so two workers cannot both call the courier for one shipment, and
 * `shipment_booking_attempts_guard` writes an outcome once; the one later
 * change is a late success after the sweeper gave up (docs/05 §6.3,
 * T-FUL-111). No request body is stored.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(String.raw`SET LOCAL lock_timeout = '5s'`)
    this.schema.raw(String.raw`
      CREATE TABLE shipment_booking_attempts (
        id uuid NOT NULL DEFAULT uuidv7(),
        shipment_id uuid NOT NULL,
        shop_id uuid NOT NULL,
        logistics_account_id uuid NOT NULL,
        kind text NOT NULL,
        attempt_no smallint NOT NULL,
        outcome text NOT NULL DEFAULT 'pending',
        http_status smallint,
        error_code text,
        error_fields text,
        external_shipment_id text,
        started_at timestamptz NOT NULL DEFAULT now(),
        finished_at timestamptz,
        request_id text,
        CONSTRAINT shipment_booking_attempts_pkey PRIMARY KEY (id),
        CONSTRAINT shipment_booking_attempts_no_key UNIQUE (shipment_id, kind, attempt_no),
        CONSTRAINT shipment_booking_attempts_shipment_fkey FOREIGN KEY (shipment_id, shop_id)
          REFERENCES shipments (id, shop_id) ON DELETE RESTRICT,
        CONSTRAINT shipment_booking_attempts_account_fkey FOREIGN KEY (logistics_account_id)
          REFERENCES logistics_accounts (id) ON DELETE RESTRICT,
        CONSTRAINT shipment_booking_attempts_kind_check CHECK (kind IN ('book', 'cancel', 'reference_lookup')),
        CONSTRAINT shipment_booking_attempts_outcome_check
          CHECK (outcome IN ('pending', 'succeeded', 'refused', 'unknown')
          AND (outcome = 'pending') = (finished_at IS NULL)),
        CONSTRAINT shipment_booking_attempts_booked_check
          CHECK (kind <> 'book' OR outcome <> 'succeeded' OR external_shipment_id IS NOT NULL),
        CONSTRAINT shipment_booking_attempts_attempt_no_check CHECK (attempt_no >= 1),
        CONSTRAINT shipment_booking_attempts_http_status_check
          CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
        CONSTRAINT shipment_booking_attempts_error_code_check
          CHECK (error_code IS NULL OR error_code ~ '^[a-z][a-z0-9_]{1,39}$'),
        CONSTRAINT shipment_booking_attempts_error_fields_check
          CHECK (error_fields IS NULL OR error_fields ~ '^[A-Za-z0-9_]{1,40}(,[A-Za-z0-9_]{1,40}){0,9}$'),
        CONSTRAINT shipment_booking_attempts_external_id_check
          CHECK (external_shipment_id IS NULL OR char_length(external_shipment_id) BETWEEN 1 AND 100)
      );
      CREATE UNIQUE INDEX shipment_booking_attempts_in_flight_key ON shipment_booking_attempts (shipment_id)
        WHERE outcome = 'pending';
      CREATE INDEX shipment_booking_attempts_stale_idx ON shipment_booking_attempts (started_at)
        WHERE outcome = 'pending';
      CREATE OR REPLACE FUNCTION shipment_booking_attempts_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF ROW(NEW.shipment_id, NEW.shop_id, NEW.logistics_account_id, NEW.kind, NEW.attempt_no, NEW.started_at)
             IS DISTINCT FROM ROW(OLD.shipment_id, OLD.shop_id, OLD.logistics_account_id, OLD.kind,
                                  OLD.attempt_no, OLD.started_at)
           OR NOT (OLD.outcome = 'pending'
                   OR (OLD.outcome = 'unknown' AND NEW.outcome = 'succeeded' AND OLD.kind = 'book')) THEN
          RAISE EXCEPTION 'shipment_booking_attempts: an outcome is written once' USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER shipment_booking_attempts_guard BEFORE UPDATE ON shipment_booking_attempts
        FOR EACH ROW EXECUTE FUNCTION shipment_booking_attempts_guard()
    `)
  }

  async down() {
    this.schema.raw(String.raw`
      DROP TABLE IF EXISTS shipment_booking_attempts;
      DROP FUNCTION IF EXISTS shipment_booking_attempts_guard()
    `)
  }
}
