import { BaseSchema } from '@adonisjs/lucid/schema'

/*
 * Baseline file 10 of 14 (docs/04 §20.2.2): inventory. Tables and
 * constraints are those of docs/04a §8.1 to §8.3, created in the order the
 * file list gives: `inventory_items`, `inventory_reservations` (its
 * four-column key references `order_items_reservation_ref_key` of file 9),
 * `inventory_movements`.
 *
 * Deferred foreign keys: none. Every key of docs/04a §8 points at a table
 * created by this file or an earlier one.
 *
 * The append-only triggers and REVOKEs of `inventory_movements` are in
 * file 14 (docs/04 §2.12).
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(String.raw`SET LOCAL lock_timeout = '5s'`)

    // docs/04a §8.1. Created WITH (fillfactor = 80) so that the checkout
    // update of `reserved`, `version` and `updated_at` can be a HOT update
    // (docs/04 §17.1 rule 5). Its only indexes are the two keys.
    this.schema.raw(String.raw`
      CREATE TABLE inventory_items (
        variant_id uuid NOT NULL,
        shop_id uuid NOT NULL,
        on_hand int NOT NULL DEFAULT 0,
        reserved int NOT NULL DEFAULT 0,
        version int NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT inventory_items_pkey PRIMARY KEY (variant_id),
        CONSTRAINT inventory_items_variant_id_shop_id_key UNIQUE (variant_id, shop_id),  -- target for §8.2, §8.3
        CONSTRAINT inventory_items_variant_fkey FOREIGN KEY (variant_id, shop_id)
          REFERENCES product_variants (id, shop_id) ON DELETE RESTRICT,
        CONSTRAINT inventory_items_on_hand_check  CHECK (on_hand >= 0),
        CONSTRAINT inventory_items_reserved_check CHECK (reserved >= 0 AND reserved <= on_hand)
      ) WITH (fillfactor = 80)
    `)

    // docs/04a §8.2
    this.schema.raw(String.raw`
      CREATE TABLE inventory_reservations (
        id uuid NOT NULL DEFAULT uuidv7(),
        shop_id uuid NOT NULL,
        variant_id uuid NOT NULL,
        order_id uuid NOT NULL,
        order_item_id uuid NOT NULL,
        quantity int NOT NULL,
        status text NOT NULL,
        expires_at timestamptz,
        resolved_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT inventory_reservations_pkey PRIMARY KEY (id),
        CONSTRAINT inventory_reservations_status_check
          CHECK (status IN ('held', 'committed', 'released', 'consumed')),
        CONSTRAINT inventory_reservations_quantity_check CHECK (quantity > 0),
        CONSTRAINT inventory_reservations_expiry_check CHECK (
             (status = 'held'      AND expires_at IS NOT NULL)
          OR (status = 'committed' AND expires_at IS NULL)
          OR  status IN ('released', 'consumed')),
        CONSTRAINT inventory_reservations_resolved_check
          CHECK ((status IN ('released', 'consumed')) = (resolved_at IS NOT NULL)),
        CONSTRAINT inventory_reservations_stock_fkey FOREIGN KEY (variant_id, shop_id)
          REFERENCES inventory_items (variant_id, shop_id) ON DELETE RESTRICT,
        CONSTRAINT inventory_reservations_order_item_fkey
          FOREIGN KEY (order_item_id, order_id, shop_id, variant_id)
          REFERENCES order_items (id, order_id, shop_id, variant_id) ON DELETE RESTRICT
      )
    `)
    this.schema.raw(String.raw`
      CREATE UNIQUE INDEX inventory_reservations_open_item_key
        ON inventory_reservations (order_item_id) WHERE status IN ('held', 'committed');
      CREATE INDEX inventory_reservations_open_order_idx
        ON inventory_reservations (order_id) WHERE status IN ('held', 'committed');
      CREATE INDEX inventory_reservations_held_expiry_idx
        ON inventory_reservations (expires_at) WHERE status = 'held';
      CREATE INDEX inventory_reservations_open_variant_idx
        ON inventory_reservations (variant_id) INCLUDE (quantity) WHERE status IN ('held', 'committed');
      CREATE INDEX inventory_reservations_variant_idx ON inventory_reservations (variant_id)
    `)

    // docs/04a §8.3. Append-only: its triggers and REVOKEs are in file 14.
    this.schema.raw(String.raw`
      CREATE TABLE inventory_movements (
        id uuid NOT NULL DEFAULT uuidv7(),
        shop_id uuid NOT NULL,
        variant_id uuid NOT NULL,
        kind text NOT NULL,
        on_hand_delta int NOT NULL,
        reserved_delta int NOT NULL,
        reason_code text NOT NULL,
        note text,
        actor_user_id uuid,
        reference_type text NOT NULL,
        reference_id text NOT NULL,
        request_id text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT inventory_movements_pkey PRIMARY KEY (id),
        CONSTRAINT inventory_movements_kind_check CHECK (kind IN ('reserve', 'release', 'commit', 'ship',
          'return_restock', 'rto_restock', 'adjustment', 'stocktake', 'correction')),
        CONSTRAINT inventory_movements_deltas_check CHECK (CASE kind
          WHEN 'reserve'        THEN on_hand_delta = 0 AND reserved_delta > 0
          WHEN 'release'        THEN on_hand_delta = 0 AND reserved_delta < 0
          WHEN 'commit'         THEN on_hand_delta = 0 AND reserved_delta = 0
          WHEN 'ship'           THEN on_hand_delta < 0 AND reserved_delta = on_hand_delta
          WHEN 'return_restock' THEN on_hand_delta > 0 AND reserved_delta = 0
          WHEN 'rto_restock'    THEN on_hand_delta > 0 AND reserved_delta = 0
          WHEN 'adjustment'     THEN on_hand_delta <> 0 AND reserved_delta = 0
          WHEN 'stocktake'      THEN reserved_delta = 0            -- a confirming count may be 0
          ELSE true END),                                          -- 'correction' repairs the journal (05 §5.10)
        CONSTRAINT inventory_movements_reference_check CHECK (
             (kind IN ('reserve', 'release', 'commit') AND reference_type = 'inventory_reservation')
          OR (kind IN ('ship', 'rto_restock')          AND reference_type = 'shipment')
          OR (kind = 'return_restock'                  AND reference_type = 'return_request')
          OR (kind IN ('adjustment', 'stocktake')      AND reference_type = 'request')
          OR (kind = 'correction'                      AND reference_type = 'audit_log')),
        CONSTRAINT inventory_movements_reference_id_check CHECK (
             reference_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          OR (reference_type = 'audit_log' AND reference_id ~ '^[0-9]{1,19}$')),
        CONSTRAINT inventory_movements_reason_code_check CHECK (reason_code ~ '^[a-z][a-z_]{2,39}$' AND CASE kind
          WHEN 'adjustment' THEN reason_code IN ('received_stock', 'damaged', 'lost', 'found', 'sold_offline',
                                                 'data_entry_error')
          WHEN 'stocktake'  THEN reason_code = 'stocktake'
          WHEN 'correction' THEN reason_code = 'drift_repair'
          ELSE true END),                  -- system kinds: format only (05 §5.2 lists examples)
        CONSTRAINT inventory_movements_note_check CHECK (note IS NULL OR char_length(note) <= 500),
        CONSTRAINT inventory_movements_stock_fkey FOREIGN KEY (variant_id, shop_id)
          REFERENCES inventory_items (variant_id, shop_id) ON DELETE RESTRICT,
        CONSTRAINT inventory_movements_actor_fkey FOREIGN KEY (actor_user_id)
          REFERENCES users (id) ON DELETE RESTRICT
      )
    `)
    this.schema.raw(String.raw`
      CREATE UNIQUE INDEX inventory_movements_reference_once_key
        ON inventory_movements (reference_type, reference_id, variant_id, kind)
        WHERE kind IN ('reserve', 'release', 'commit', 'ship', 'return_restock', 'rto_restock');
      CREATE INDEX inventory_movements_variant_history_idx
        ON inventory_movements (variant_id, created_at DESC, id DESC) INCLUDE (on_hand_delta, reserved_delta)
    `)

    // docs/04 §2.2: the two tables with `updated_at`
    this.schema.raw(String.raw`
      CREATE TRIGGER inventory_items_set_updated_at BEFORE UPDATE ON inventory_items
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
      CREATE TRIGGER inventory_reservations_set_updated_at BEFORE UPDATE ON inventory_reservations
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `)
  }

  async down() {
    this.schema.raw(String.raw`DROP TABLE IF EXISTS inventory_movements`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS inventory_reservations`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS inventory_items`)
  }
}
