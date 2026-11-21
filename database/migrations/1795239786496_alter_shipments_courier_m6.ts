import { BaseSchema } from '@adonisjs/lucid/schema'

/*
 * M6 (docs/04a §11.5): the courier parts of `shipments` the E4 baseline left
 * for M6, after `logistics_branches` exists: the origin and destination
 * branches, which `shipments_path_check` keeps off the manual path and
 * `shipments_booking_guard` freezes once a booking is requested (INV-30); and
 * the cancellation request of a courier without `cancellation` (05 §6.3).
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(String.raw`SET LOCAL lock_timeout = '5s'`)
    this.schema.raw(String.raw`
      ALTER TABLE shipments
        ADD COLUMN origin_branch_id uuid,
        ADD COLUMN destination_branch_id uuid,
        ADD COLUMN cancel_requested_at timestamptz,
        ADD COLUMN cancel_requested_by text,
        ADD CONSTRAINT shipments_origin_branch_fkey FOREIGN KEY (origin_branch_id)
          REFERENCES logistics_branches (id) ON DELETE RESTRICT,
        ADD CONSTRAINT shipments_destination_branch_fkey FOREIGN KEY (destination_branch_id)
          REFERENCES logistics_branches (id) ON DELETE RESTRICT,
        DROP CONSTRAINT shipments_path_check,
        ADD CONSTRAINT shipments_path_check CHECK (CASE WHEN logistics_account_id IS NULL
          THEN status IN ('pending', 'packed', 'shipped', 'delivered', 'delivery_failed', 'returning',
              'returned_to_origin')
            AND merchant_reference IS NULL AND external_shipment_id IS NULL AND service_code IS NULL
            AND cod_amount_minor IS NULL AND provider_cost_minor IS NULL AND booked_at IS NULL
            AND origin_branch_id IS NULL AND destination_branch_id IS NULL
          ELSE status NOT IN ('pending', 'packed')
            AND pickup_address_id IS NOT NULL AND merchant_reference IS NOT NULL
            AND cod_amount_minor IS NOT NULL END),
        ADD CONSTRAINT shipments_cancel_request_check CHECK ((cancel_requested_at IS NULL) = (cancel_requested_by IS NULL)
          AND (cancel_requested_by IS NULL OR (cancel_requested_by IN ('vendor', 'shop_order')
          AND status = 'booked')));
      CREATE INDEX shipments_cancel_requested_idx ON shipments (cancel_requested_at)
        WHERE cancel_requested_at IS NOT NULL;
      CREATE OR REPLACE FUNCTION shipments_booking_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF (OLD.logistics_account_id IS NOT NULL
            AND ROW(NEW.logistics_account_id, NEW.pickup_address_id, NEW.merchant_reference,
                    NEW.cod_amount_minor, NEW.service_code, NEW.origin_branch_id, NEW.destination_branch_id)
                IS DISTINCT FROM ROW(OLD.logistics_account_id, OLD.pickup_address_id, OLD.merchant_reference,
                                     OLD.cod_amount_minor, OLD.service_code, OLD.origin_branch_id,
                                     OLD.destination_branch_id))
           OR (OLD.external_shipment_id IS NOT NULL
               AND NEW.external_shipment_id IS DISTINCT FROM OLD.external_shipment_id)
           OR (OLD.status = 'cancelled' AND NEW.status <> 'cancelled') THEN
          RAISE EXCEPTION 'shipments: a booking keeps its account, pickup address, reference, COD amount and courier ID'
            USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
      END $$
    `)
  }

  async down() {
    this.schema.raw(String.raw`
      CREATE OR REPLACE FUNCTION shipments_booking_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF (OLD.logistics_account_id IS NOT NULL
            AND ROW(NEW.logistics_account_id, NEW.pickup_address_id, NEW.merchant_reference,
                    NEW.cod_amount_minor, NEW.service_code)
                IS DISTINCT FROM ROW(OLD.logistics_account_id, OLD.pickup_address_id, OLD.merchant_reference,
                                     OLD.cod_amount_minor, OLD.service_code))
           OR (OLD.external_shipment_id IS NOT NULL
               AND NEW.external_shipment_id IS DISTINCT FROM OLD.external_shipment_id)
           OR (OLD.status = 'cancelled' AND NEW.status <> 'cancelled') THEN
          RAISE EXCEPTION 'shipments: a booking keeps its account, pickup address, reference, COD amount and courier ID'
            USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
      END $$;
      DROP INDEX IF EXISTS shipments_cancel_requested_idx;
      ALTER TABLE shipments
        DROP CONSTRAINT IF EXISTS shipments_cancel_request_check,
        DROP CONSTRAINT shipments_path_check,
        ADD CONSTRAINT shipments_path_check CHECK (CASE WHEN logistics_account_id IS NULL
          THEN status IN ('pending', 'packed', 'shipped', 'delivered', 'delivery_failed', 'returning',
              'returned_to_origin')
            AND merchant_reference IS NULL AND external_shipment_id IS NULL AND service_code IS NULL
            AND cod_amount_minor IS NULL AND provider_cost_minor IS NULL AND booked_at IS NULL
          ELSE status NOT IN ('pending', 'packed')
            AND pickup_address_id IS NOT NULL AND merchant_reference IS NOT NULL
            AND cod_amount_minor IS NOT NULL END),
        DROP COLUMN IF EXISTS cancel_requested_by,
        DROP COLUMN IF EXISTS cancel_requested_at,
        DROP COLUMN IF EXISTS destination_branch_id,
        DROP COLUMN IF EXISTS origin_branch_id
    `)
  }
}
