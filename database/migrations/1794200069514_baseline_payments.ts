import { BaseSchema } from '@adonisjs/lucid/schema'

/*
 * Baseline file 11 of 14 (docs/04 §20.2.2): payments and refunds. Tables
 * and constraints are those of docs/04a §12.1 to §12.5, created in the order
 * the file list gives: `payments` with `payments_amount_guard`,
 * `payment_allocations`, `refunds`, `refund_items`, then `provider_events`,
 * which references `refunds`. The gateway columns and `provider_events` are
 * first used in R1.1 but created here (docs/04a §12).
 *
 * Deferred foreign keys: none. Every key of docs/04a §12 points at a table
 * created by this file or an earlier one (`refunds_return_fkey` at
 * `return_requests` of file 9, `refunds_approved_by_fkey` at
 * `platform_staff` of file 3).
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(String.raw`SET LOCAL lock_timeout = '5s'`)

    // docs/04a §12.1
    this.schema.raw(String.raw`
      CREATE TABLE payments (
        id uuid NOT NULL DEFAULT uuidv7(),
        order_id uuid NOT NULL,
        shop_order_id uuid,
        method text NOT NULL,
        status text NOT NULL,
        amount_minor bigint NOT NULL,
        currency char(3) NOT NULL DEFAULT 'NPR',
        captured_minor bigint NOT NULL DEFAULT 0,
        refunded_minor bigint NOT NULL DEFAULT 0,
        captured_at timestamptz,
        is_late_capture boolean NOT NULL DEFAULT false,
        provider_payment_id text,
        provider_reference text,
        attempt_no smallint NOT NULL DEFAULT 1,
        expires_at timestamptz,
        verification_attempts int NOT NULL DEFAULT 0,
        next_verification_at timestamptz,
        last_provider_status text,
        version int NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT payments_pkey PRIMARY KEY (id),
        CONSTRAINT payments_id_order_id_key UNIQUE (id, order_id),              -- target for §12.2, §12.4
        CONSTRAINT payments_provider_payment_key UNIQUE (method, provider_payment_id),   -- NULLs are distinct
        CONSTRAINT payments_order_fkey FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT,
        CONSTRAINT payments_cod_shop_order_fkey FOREIGN KEY (shop_order_id, order_id)
          REFERENCES shop_orders (id, order_id) ON DELETE RESTRICT,
        CONSTRAINT payments_method_check CHECK (method IN ('cod', 'esewa', 'khalti')),
        CONSTRAINT payments_status_check CHECK (
             (method = 'cod'  AND status IN ('awaiting_collection', 'collected', 'not_collected', 'cancelled'))
          OR (method <> 'cod' AND status IN ('initiated', 'pending', 'captured', 'failed', 'expired',
                                             'cancelled', 'needs_review'))),
        CONSTRAINT payments_cod_shape_check CHECK ((method = 'cod') = (shop_order_id IS NOT NULL)
          AND (method <> 'cod' OR (provider_payment_id IS NULL AND provider_reference IS NULL AND expires_at IS NULL))),
        CONSTRAINT payments_currency_check CHECK (currency = 'NPR'),
        CONSTRAINT payments_amount_check CHECK (amount_minor > 0),
        CONSTRAINT payments_captured_le_amount_check CHECK (captured_minor >= 0 AND captured_minor <= amount_minor),
        CONSTRAINT payments_refunded_le_captured_check CHECK (refunded_minor >= 0 AND refunded_minor <= captured_minor),
        CONSTRAINT payments_captured_state_check CHECK (CASE WHEN status IN ('captured', 'collected')
          THEN captured_minor = amount_minor AND captured_at IS NOT NULL
          ELSE captured_minor = 0 AND captured_at IS NULL END),
        CONSTRAINT payments_counters_check CHECK (attempt_no >= 1 AND verification_attempts >= 0)
      )
    `)
    this.schema.raw(String.raw`
      CREATE UNIQUE INDEX payments_one_live_gateway_attempt_key ON payments (order_id)
        WHERE method <> 'cod' AND status IN ('initiated', 'pending', 'captured') AND NOT is_late_capture;
      CREATE UNIQUE INDEX payments_gateway_attempt_no_key ON payments (order_id, attempt_no) WHERE method <> 'cod';
      CREATE UNIQUE INDEX payments_cod_shop_order_key ON payments (shop_order_id) WHERE method = 'cod';
      CREATE INDEX payments_order_idx ON payments (order_id);
      CREATE INDEX payments_verify_due_idx ON payments (next_verification_at)
        WHERE method <> 'cod' AND status IN ('initiated', 'pending', 'needs_review');
      CREATE INDEX payments_needs_review_idx ON payments (created_at) WHERE status = 'needs_review';
      CREATE INDEX payments_cod_uncollected_idx ON payments (shop_order_id)
        WHERE method = 'cod' AND status = 'awaiting_collection'
    `)
    // A payment amount never grows; a COD amount shrinks only before collection (Directive 2082 s8(3))
    this.schema.raw(String.raw`
      CREATE OR REPLACE FUNCTION payments_amount_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.amount_minor <> OLD.amount_minor AND NOT (OLD.method = 'cod'
             AND OLD.status = 'awaiting_collection' AND NEW.amount_minor < OLD.amount_minor) THEN
          RAISE EXCEPTION 'payments.amount_minor may only decrease on an uncollected COD payment'
            USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
      END $$
    `)
    this.schema.raw(String.raw`
      CREATE TRIGGER payments_amount_guard BEFORE UPDATE OF amount_minor ON payments
        FOR EACH ROW EXECUTE FUNCTION payments_amount_guard()
    `)

    // docs/04a §12.2. Composite primary key: written with the query builder
    // (docs/04 §2.15).
    this.schema.raw(String.raw`
      CREATE TABLE payment_allocations (
        payment_id uuid NOT NULL,
        shop_order_id uuid NOT NULL,
        order_id uuid NOT NULL,
        amount_minor bigint NOT NULL,
        captured_minor bigint NOT NULL DEFAULT 0,
        refunded_minor bigint NOT NULL DEFAULT 0,
        currency char(3) NOT NULL DEFAULT 'NPR',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT payment_allocations_pkey PRIMARY KEY (payment_id, shop_order_id),   -- target for §12.4
        CONSTRAINT payment_allocations_payment_fkey FOREIGN KEY (payment_id, order_id)
          REFERENCES payments (id, order_id) ON DELETE RESTRICT,
        CONSTRAINT payment_allocations_shop_order_fkey FOREIGN KEY (shop_order_id, order_id)
          REFERENCES shop_orders (id, order_id) ON DELETE RESTRICT,
        CONSTRAINT payment_allocations_amounts_check CHECK (amount_minor > 0 AND captured_minor >= 0
          AND captured_minor <= amount_minor AND refunded_minor >= 0 AND refunded_minor <= captured_minor),
        CONSTRAINT payment_allocations_currency_check CHECK (currency = 'NPR')
      )
    `)
    this.schema.raw(
      String.raw`CREATE INDEX payment_allocations_shop_order_idx ON payment_allocations (shop_order_id)`
    )

    // docs/04a §12.4. `refunds_replaces_fkey`, `refunds_vendor_ledger_check`
    // and their columns are proposed in docs/05 §8.8 and §7.4 and part of the
    // baseline as 04a writes them. `refunds_note_check` is the length the
    // `note` row states (docs/04 §2.8).
    this.schema.raw(String.raw`
      CREATE TABLE refunds (
        id uuid NOT NULL DEFAULT uuidv7(),
        order_id uuid NOT NULL,
        shop_order_id uuid NOT NULL,
        shop_id uuid NOT NULL,
        payment_id uuid NOT NULL,
        return_request_id uuid,
        replaces_refund_id uuid,
        amount_minor bigint NOT NULL,
        currency char(3) NOT NULL DEFAULT 'NPR',
        method text NOT NULL,
        status text NOT NULL DEFAULT 'requested',
        reason_code text NOT NULL,
        affects_vendor_ledger boolean NOT NULL,
        note text,
        due_at timestamptz NOT NULL,
        provider_refund_id text,
        provider_idempotency_key text NOT NULL,
        attempts int NOT NULL DEFAULT 0,
        verification_attempts int NOT NULL DEFAULT 0,
        next_verification_at timestamptz,
        created_by uuid,
        approved_by uuid,
        is_single_operator_approval boolean NOT NULL DEFAULT false,
        recipient_details_enc text,
        paid_reference text,
        approved_at timestamptz,
        succeeded_at timestamptz,
        version int NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT refunds_pkey PRIMARY KEY (id),
        CONSTRAINT refunds_provider_idempotency_key_key UNIQUE (provider_idempotency_key),
        CONSTRAINT refunds_id_shop_id_key UNIQUE (id, shop_id),                 -- target for §13.1
        CONSTRAINT refunds_id_shop_order_id_key UNIQUE (id, shop_order_id),     -- target for §12.5 and self-reference (refunds_replaces_fkey, proposed)
        CONSTRAINT refunds_shop_order_fkey FOREIGN KEY (shop_order_id, shop_id)
          REFERENCES shop_orders (id, shop_id) ON DELETE RESTRICT,
        CONSTRAINT refunds_shop_order_order_fkey FOREIGN KEY (shop_order_id, order_id)
          REFERENCES shop_orders (id, order_id) ON DELETE RESTRICT,
        CONSTRAINT refunds_payment_fkey FOREIGN KEY (payment_id, order_id)
          REFERENCES payments (id, order_id) ON DELETE RESTRICT,
        CONSTRAINT refunds_allocation_fkey FOREIGN KEY (payment_id, shop_order_id)
          REFERENCES payment_allocations (payment_id, shop_order_id) ON DELETE RESTRICT,
        CONSTRAINT refunds_return_fkey FOREIGN KEY (return_request_id, shop_order_id)
          REFERENCES return_requests (id, shop_order_id) ON DELETE RESTRICT,
        CONSTRAINT refunds_replaces_fkey FOREIGN KEY (replaces_refund_id, shop_order_id)   -- proposed
          REFERENCES refunds (id, shop_order_id) ON DELETE RESTRICT,
        CONSTRAINT refunds_created_by_fkey FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT refunds_approved_by_fkey FOREIGN KEY (approved_by)
          REFERENCES platform_staff (user_id) ON DELETE RESTRICT,
        CONSTRAINT refunds_amount_check CHECK (amount_minor > 0),
        CONSTRAINT refunds_currency_check CHECK (currency = 'NPR'),
        CONSTRAINT refunds_method_check CHECK (method IN ('gateway_api', 'gateway_manual', 'manual_transfer')),
        CONSTRAINT refunds_status_check CHECK (status IN ('requested', 'approved', 'processing', 'succeeded',
          'failed', 'cancelled', 'needs_review')),
        CONSTRAINT refunds_reason_check CHECK (reason_code IN ('order_cancelled', 'items_rejected', 'undeliverable',
          'return_accepted', 'late_capture', 'stock_unavailable_after_payment', 'goodwill', 'other')),
        CONSTRAINT refunds_return_reason_check
          CHECK ((reason_code = 'return_accepted') = (return_request_id IS NOT NULL)),
        CONSTRAINT refunds_maker_checker_check CHECK (approved_by IS NULL OR created_by IS NULL
          OR approved_by <> created_by OR is_single_operator_approval),
        CONSTRAINT refunds_approver_check CHECK (status IN ('requested', 'cancelled') OR approved_by IS NOT NULL
          OR (created_by IS NULL AND reason_code IN ('order_cancelled', 'items_rejected', 'undeliverable',
                                                     'stock_unavailable_after_payment'))),
        CONSTRAINT refunds_vendor_ledger_check                                           -- proposed
          CHECK (NOT affects_vendor_ledger OR reason_code IN ('return_accepted', 'goodwill', 'other')),
        CONSTRAINT refunds_approved_check
          CHECK (status IN ('requested', 'cancelled') OR approved_at IS NOT NULL),
        CONSTRAINT refunds_succeeded_check CHECK ((status = 'succeeded') = (succeeded_at IS NOT NULL)
          AND (status <> 'succeeded' OR method = 'gateway_api' OR paid_reference IS NOT NULL)),
        CONSTRAINT refunds_recipient_check CHECK (method <> 'manual_transfer'
          OR status NOT IN ('approved', 'processing', 'failed', 'needs_review') OR recipient_details_enc IS NOT NULL),
        CONSTRAINT refunds_recipient_details_enc_check CHECK (recipient_details_enc IS NULL
          OR recipient_details_enc ~ '^v[0-9]+\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$'),
        CONSTRAINT refunds_attempts_check CHECK (attempts >= 0),
        CONSTRAINT refunds_verification_check CHECK (verification_attempts >= 0
          AND (next_verification_at IS NULL OR status = 'processing')),
        CONSTRAINT refunds_note_check CHECK (note IS NULL OR char_length(note) <= 2000)
      )
    `)
    this.schema.raw(String.raw`
      CREATE INDEX refunds_shop_order_idx ON refunds (shop_order_id);
      CREATE INDEX refunds_queue_idx ON refunds (due_at)
        WHERE status IN ('requested', 'approved', 'processing', 'failed', 'needs_review');
      CREATE INDEX refunds_return_idx ON refunds (return_request_id) WHERE return_request_id IS NOT NULL;
      CREATE UNIQUE INDEX refunds_provider_refund_key ON refunds (method, provider_refund_id)
        WHERE provider_refund_id IS NOT NULL;
      CREATE INDEX refunds_verify_due_idx ON refunds (next_verification_at)
        WHERE status = 'processing' AND method IN ('gateway_api', 'gateway_manual');
      CREATE UNIQUE INDEX refunds_gateway_api_in_flight_key ON refunds (payment_id)
        WHERE method = 'gateway_api' AND status IN ('processing', 'needs_review')
    `)

    // docs/04a §12.5. Composite primary key: written with the query builder
    // (docs/04 §2.15). Inserted with the refund, never updated.
    this.schema.raw(String.raw`
      CREATE TABLE refund_items (
        refund_id uuid NOT NULL,
        order_item_id uuid NOT NULL,
        shop_order_id uuid NOT NULL,
        quantity int NOT NULL,
        amount_minor bigint NOT NULL,
        vendor_amount_minor bigint NOT NULL,
        commission_reversal_minor bigint NOT NULL,
        currency char(3) NOT NULL DEFAULT 'NPR',
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT refund_items_pkey PRIMARY KEY (refund_id, order_item_id),
        CONSTRAINT refund_items_refund_fkey FOREIGN KEY (refund_id, shop_order_id)
          REFERENCES refunds (id, shop_order_id) ON DELETE RESTRICT,
        CONSTRAINT refund_items_order_item_fkey FOREIGN KEY (order_item_id, shop_order_id)
          REFERENCES order_items (id, shop_order_id) ON DELETE RESTRICT,
        CONSTRAINT refund_items_quantity_check CHECK (quantity > 0),
        CONSTRAINT refund_items_amount_check CHECK (amount_minor >= 0),
        CONSTRAINT refund_items_vendor_amount_check CHECK (vendor_amount_minor >= 0),               -- proposed
        CONSTRAINT refund_items_commission_reversal_check CHECK (commission_reversal_minor >= 0),   -- proposed
        CONSTRAINT refund_items_currency_check CHECK (currency = 'NPR')
      )
    `)
    this.schema.raw(
      String.raw`CREATE INDEX refund_items_order_item_idx ON refund_items (order_item_id)`
    )

    // docs/04a §12.3, after `refunds` because it references them.
    // `provider_events_error_check` is the length the `error` row states
    // (docs/04 §2.8).
    this.schema.raw(String.raw`
      CREATE TABLE provider_events (
        id uuid NOT NULL DEFAULT uuidv7(),
        provider text NOT NULL,
        provider_event_key text NOT NULL,
        kind text NOT NULL,
        payment_id uuid,
        refund_id uuid,
        payload jsonb NOT NULL,
        raw_body_sha256 bytea,
        signature_valid boolean,
        received_at timestamptz NOT NULL DEFAULT now(),
        processed_at timestamptz,
        processing_status text NOT NULL DEFAULT 'pending',
        error text,
        request_id text,
        CONSTRAINT provider_events_pkey PRIMARY KEY (id),
        CONSTRAINT provider_events_key UNIQUE (provider, provider_event_key),
        CONSTRAINT provider_events_payment_fkey FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE RESTRICT,
        CONSTRAINT provider_events_refund_fkey FOREIGN KEY (refund_id) REFERENCES refunds (id) ON DELETE RESTRICT,
        CONSTRAINT provider_events_provider_check CHECK (provider IN ('esewa', 'khalti')),
        CONSTRAINT provider_events_kind_check
          CHECK (kind IN ('initiate', 'return', 'webhook', 'lookup', 'refund', 'refund_lookup')),
        CONSTRAINT provider_events_subject_check CHECK (
              (kind NOT IN ('initiate', 'lookup') OR payment_id IS NOT NULL)
          AND (kind NOT IN ('refund', 'refund_lookup') OR refund_id IS NOT NULL)),
        CONSTRAINT provider_events_processing_check
          CHECK (processing_status IN ('pending', 'processed', 'ignored', 'failed')
          AND (processing_status = 'pending') = (processed_at IS NULL)),
        CONSTRAINT provider_events_key_check CHECK (char_length(provider_event_key) BETWEEN 8 AND 200),
        CONSTRAINT provider_events_payload_check CHECK (jsonb_typeof(payload) = 'object'),
        CONSTRAINT provider_events_hash_check CHECK (raw_body_sha256 IS NULL OR octet_length(raw_body_sha256) = 32),
        CONSTRAINT provider_events_error_check CHECK (error IS NULL OR char_length(error) <= 2000)
      )
    `)
    this.schema.raw(String.raw`
      CREATE INDEX provider_events_pending_idx ON provider_events (received_at)
        WHERE processing_status IN ('pending', 'failed');
      CREATE INDEX provider_events_payment_idx ON provider_events (payment_id, received_at)
        WHERE payment_id IS NOT NULL;
      CREATE INDEX provider_events_refund_idx ON provider_events (refund_id, received_at)
        WHERE refund_id IS NOT NULL
    `)

    // docs/04 §2.2: the three tables with `updated_at`
    this.schema.raw(String.raw`
      CREATE TRIGGER payments_set_updated_at BEFORE UPDATE ON payments
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
      CREATE TRIGGER payment_allocations_set_updated_at BEFORE UPDATE ON payment_allocations
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
      CREATE TRIGGER refunds_set_updated_at BEFORE UPDATE ON refunds
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `)
  }

  async down() {
    this.schema.raw(String.raw`DROP TABLE IF EXISTS provider_events`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS refund_items`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS refunds`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS payment_allocations`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS payments`)
    this.schema.raw(String.raw`DROP FUNCTION IF EXISTS payments_amount_guard()`)
  }
}
