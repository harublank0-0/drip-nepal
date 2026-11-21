import { BaseSchema } from '@adonisjs/lucid/schema'

/*
 * M6 (docs/04a §9.14): the courier event inbox of docs/05 §6.3. Every status
 * message from a courier, as a callback, a poll answer or a history reading,
 * is stored once per account and key (`courier_events_key`, T-FUL-110), and
 * only its processing columns change afterwards (`courier_events_guard`,
 * INV-34). The payload holds only the courier's documented status fields.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(String.raw`SET LOCAL lock_timeout = '5s'`)
    this.schema.raw(String.raw`
      CREATE TABLE courier_events (
        id uuid NOT NULL DEFAULT uuidv7(),
        logistics_account_id uuid NOT NULL,
        source text NOT NULL,
        event_key text NOT NULL,
        external_shipment_id text NOT NULL,
        shipment_id uuid,
        shop_id uuid,
        raw_event text,
        raw_status text NOT NULL,
        mapped_status text,
        occurred_at timestamptz,
        payload jsonb NOT NULL,
        raw_body_sha256 bytea,
        received_at timestamptz NOT NULL DEFAULT now(),
        processed_at timestamptz,
        processing_status text NOT NULL DEFAULT 'pending',
        hold_reason text,
        error text,
        request_id text,
        CONSTRAINT courier_events_pkey PRIMARY KEY (id),
        CONSTRAINT courier_events_key UNIQUE (logistics_account_id, event_key),
        CONSTRAINT courier_events_account_fkey FOREIGN KEY (logistics_account_id)
          REFERENCES logistics_accounts (id) ON DELETE RESTRICT,
        CONSTRAINT courier_events_shipment_fkey FOREIGN KEY (shipment_id, shop_id)
          REFERENCES shipments (id, shop_id) ON DELETE RESTRICT,
        CONSTRAINT courier_events_source_check CHECK (source IN ('callback', 'poll', 'history')),
        CONSTRAINT courier_events_match_check CHECK ((shipment_id IS NULL) = (shop_id IS NULL)
          AND (source <> 'callback' OR shipment_id IS NOT NULL)),
        CONSTRAINT courier_events_processing_check
          CHECK (processing_status IN ('pending', 'looked_up', 'applied', 'ignored', 'held', 'failed')
          AND (processing_status = 'pending') = (processed_at IS NULL)
          AND (processing_status <> 'held' OR hold_reason IS NOT NULL)),
        CONSTRAINT courier_events_hold_reason_check CHECK (hold_reason IS NULL
          OR hold_reason IN ('not_allowed', 'terminal_shop_order', 'cod_collected', 'unmapped_status',
            'return_check_failed')),
        CONSTRAINT courier_events_mapped_status_check CHECK (mapped_status IS NULL OR mapped_status IN ('booked',
          'shipped', 'out_for_delivery', 'delivered', 'delivery_failed', 'returning', 'cancelled')),
        CONSTRAINT courier_events_key_check CHECK (char_length(event_key) BETWEEN 8 AND 197),
        CONSTRAINT courier_events_external_id_check CHECK (char_length(external_shipment_id) BETWEEN 1 AND 100),
        CONSTRAINT courier_events_raw_check CHECK (char_length(raw_status) BETWEEN 1 AND 100
          AND (raw_event IS NULL OR char_length(raw_event) BETWEEN 1 AND 100)),
        CONSTRAINT courier_events_payload_check CHECK (jsonb_typeof(payload) = 'object'),
        CONSTRAINT courier_events_hash_check CHECK (raw_body_sha256 IS NULL OR octet_length(raw_body_sha256) = 32),
        CONSTRAINT courier_events_error_check CHECK (error IS NULL OR char_length(error) <= 2000)
      );
      CREATE INDEX courier_events_pending_idx ON courier_events (received_at)
        WHERE processing_status IN ('pending', 'failed');
      CREATE INDEX courier_events_held_idx ON courier_events (received_at)
        WHERE processing_status = 'held';
      CREATE INDEX courier_events_shipment_idx ON courier_events (shipment_id, received_at)
        WHERE shipment_id IS NOT NULL;
      CREATE TRIGGER courier_events_guard BEFORE UPDATE ON courier_events FOR EACH ROW
        EXECUTE FUNCTION allow_only_columns('mapped_status', 'processed_at', 'processing_status',
          'hold_reason', 'error')
    `)
  }

  async down() {
    this.schema.raw(String.raw`DROP TABLE IF EXISTS courier_events`)
  }
}
