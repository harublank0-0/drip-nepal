import { BaseSchema } from '@adonisjs/lucid/schema'

/*
 * Baseline file 9 of 14 (docs/04 §20.2.2): orders, fulfilment and returns.
 * Tables and constraints are those of docs/04a §11.1 to §11.9, created in the
 * order the file list gives: `orders`, `shop_orders`, `order_items`,
 * `order_events`, `shipments` (its account and pickup-address keys point at
 * file 5), `shipment_events`, `return_requests`, `return_items`,
 * `shipment_items`; then the guard triggers of docs/04 §16.3 (INV-08) and
 * `shipments_booking_guard` (INV-30). `allow_only_columns()` itself is
 * created by file 1.
 *
 * Deferred foreign keys. Every key here points at a table created by this
 * file or an earlier one. The one key of docs/04a §11 that points at a later
 * file is left out and added there:
 * - `return_requests_case_fkey` (§11.7) references `support_cases` (§14.1),
 *   created by file 13, which adds it with ALTER TABLE (cycle 2).
 *
 * The append-only triggers and REVOKEs of `order_events` and
 * `shipment_events` are in file 14 (docs/04 §2.12).
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(String.raw`SET LOCAL lock_timeout = '5s'`)

    // docs/04a §11.1. `orders_shipping_address_check` writes the jsonb `?&`
    // operator as `\?&` so that Knex leaves it alone (docs/04 §20.2.2).
    this.schema.raw(String.raw`
      CREATE TABLE orders (
        id uuid NOT NULL DEFAULT uuidv7(),
        number text NOT NULL,
        customer_user_id uuid NOT NULL,
        status text NOT NULL,
        payment_method text NOT NULL,
        currency char(3) NOT NULL DEFAULT 'NPR',
        items_subtotal_minor bigint NOT NULL,
        shipping_total_minor bigint NOT NULL,
        discount_total_minor bigint NOT NULL DEFAULT 0,
        grand_total_minor bigint NOT NULL,
        shipping_address jsonb NOT NULL,
        shipping_district_code text NOT NULL,
        customer_email_snapshot text,
        customer_note text,
        verification_status text NOT NULL DEFAULT 'pending',
        verification_method text,
        verified_at timestamptz,
        verification_notes text,
        placed_at timestamptz NOT NULL DEFAULT now(),
        idempotency_key_id uuid,
        request_id text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT orders_pkey PRIMARY KEY (id),
        CONSTRAINT orders_number_key UNIQUE (number),
        CONSTRAINT orders_number_check CHECK (number ~ '^DN-[0-9A-HJKMNP-TV-Z]{7}$'),
        CONSTRAINT orders_id_customer_user_id_key UNIQUE (id, customer_user_id),   -- target for §11.7, §14.1
        CONSTRAINT orders_customer_fkey FOREIGN KEY (customer_user_id) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT orders_status_check
          CHECK (status IN ('awaiting_payment', 'placed', 'in_progress', 'completed', 'cancelled')),
        CONSTRAINT orders_payment_method_check CHECK (payment_method IN ('cod', 'esewa', 'khalti')),
        CONSTRAINT orders_cod_status_check CHECK (payment_method <> 'cod' OR status <> 'awaiting_payment'),
        CONSTRAINT orders_currency_check CHECK (currency = 'NPR'),
        CONSTRAINT orders_amounts_check CHECK (items_subtotal_minor >= 0 AND shipping_total_minor >= 0
          AND discount_total_minor >= 0 AND discount_total_minor <= items_subtotal_minor),
        CONSTRAINT orders_totals_check
          CHECK (grand_total_minor = items_subtotal_minor + shipping_total_minor - discount_total_minor),
        CONSTRAINT orders_shipping_address_check CHECK (
          jsonb_typeof(shipping_address) = 'object'
          AND shipping_address \?& ARRAY['recipient_name_enc', 'recipient_phone_enc',
                                        'district_code', 'local_level_code', 'ward_no']
          AND shipping_address ->> 'district_code' = shipping_district_code),
        CONSTRAINT orders_shipping_address_enc_check CHECK (
              ((shipping_address ->> 'recipient_name_enc') IS NULL OR (shipping_address ->> 'recipient_name_enc') ~ '^v[0-9]+\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$')
          AND ((shipping_address ->> 'recipient_phone_enc') IS NULL OR (shipping_address ->> 'recipient_phone_enc') ~ '^v[0-9]+\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$')
          AND ((shipping_address ->> 'area_tole_enc') IS NULL OR (shipping_address ->> 'area_tole_enc') ~ '^v[0-9]+\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$')
          AND ((shipping_address ->> 'street_landmark_enc') IS NULL OR (shipping_address ->> 'street_landmark_enc') ~ '^v[0-9]+\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$')),
        CONSTRAINT orders_recipient_present_check CHECK (customer_email_snapshot IS NULL
          OR ((shipping_address ->> 'recipient_name_enc') IS NOT NULL
              AND (shipping_address ->> 'recipient_phone_enc') IS NOT NULL)),
        CONSTRAINT orders_shipping_district_fkey FOREIGN KEY (shipping_district_code)
          REFERENCES districts (code) ON DELETE RESTRICT,
        CONSTRAINT orders_customer_note_check CHECK (customer_note IS NULL OR char_length(customer_note) <= 500),
        CONSTRAINT orders_verification_check CHECK (
          verification_status IN ('pending', 'verified', 'review_required', 'failed')
          AND (verification_method IS NULL OR verification_method IN ('phone_call', 'sms_otp', 'manual'))
          AND (verification_status = 'pending') = (verification_method IS NULL)
          AND (verification_status = 'verified') = (verified_at IS NOT NULL)
          AND (verification_notes IS NULL OR char_length(verification_notes) <= 500)),
        CONSTRAINT orders_request_id_check CHECK (request_id IS NULL OR request_id ~ '^[A-Za-z0-9-]{8,64}$'),
        CONSTRAINT orders_idempotency_key_fkey FOREIGN KEY (idempotency_key_id)
          REFERENCES idempotency_keys (id) ON DELETE SET NULL
      )
    `)
    this.schema.raw(String.raw`
      CREATE INDEX orders_customer_list_idx ON orders (customer_user_id, placed_at DESC, id DESC);
      CREATE INDEX orders_admin_status_idx ON orders (status, placed_at DESC, id DESC);
      CREATE INDEX orders_admin_recent_idx ON orders (placed_at DESC, id DESC);
      CREATE INDEX orders_cod_open_idx ON orders (customer_user_id)
        WHERE payment_method = 'cod' AND status IN ('placed', 'in_progress');
      CREATE UNIQUE INDEX orders_idempotency_key_key ON orders (idempotency_key_id)
        WHERE idempotency_key_id IS NOT NULL
    `)

    // docs/04a §11.2. The `\?` in shop_orders_number_check is the regex
    // quantifier `?`, escaped for Knex (docs/04 §20.2.2).
    this.schema.raw(String.raw`
      CREATE TABLE shop_orders (
        id uuid NOT NULL DEFAULT uuidv7(),
        order_id uuid NOT NULL,
        shop_id uuid NOT NULL,
        number text NOT NULL,
        status text NOT NULL,
        cancel_reason text,
        rejection_reason text,
        currency char(3) NOT NULL DEFAULT 'NPR',
        items_subtotal_minor bigint NOT NULL,
        shipping_fee_minor bigint NOT NULL,
        discount_minor bigint NOT NULL DEFAULT 0,
        total_minor bigint NOT NULL,
        commission_total_minor bigint NOT NULL,
        delivery_zone_code_snapshot text NOT NULL,
        est_min_days_snapshot smallint NOT NULL,
        est_max_days_snapshot smallint NOT NULL,
        shop_name_snapshot text NOT NULL,
        acceptance_due_at timestamptz,
        accepted_at timestamptz,
        completed_at timestamptz,
        cancelled_at timestamptz,
        rejected_at timestamptz,
        version int NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT shop_orders_pkey PRIMARY KEY (id),
        CONSTRAINT shop_orders_number_key UNIQUE (number),
        CONSTRAINT shop_orders_number_check CHECK (number ~ '^DN-[0-9A-HJKMNP-TV-Z]{7}-[1-9][0-9]\?$'),
        CONSTRAINT shop_orders_id_shop_id_key UNIQUE (id, shop_id),        -- target for §11.3, §11.5, §11.7, §12.4, §13.1, §13.5
        CONSTRAINT shop_orders_id_order_id_key UNIQUE (id, order_id),      -- target for §11.3, §11.4, §12.1, §12.2
        CONSTRAINT shop_orders_order_shop_key UNIQUE (order_id, shop_id),  -- one shop order per shop per order
        CONSTRAINT shop_orders_order_fkey FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT,
        CONSTRAINT shop_orders_shop_fkey FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE RESTRICT,
        CONSTRAINT shop_orders_status_check CHECK (status IN ('awaiting_payment', 'awaiting_acceptance',
          'accepted', 'completed', 'cancelled', 'rejected')),
        CONSTRAINT shop_orders_cancel_reason_check CHECK (cancel_reason IN ('customer_cancelled', 'payment_expired',
          'acceptance_timeout', 'admin_cancelled', 'shop_frozen', 'undeliverable', 'stock_unavailable_after_payment')),
        CONSTRAINT shop_orders_rejection_reason_check
          CHECK (rejection_reason IN ('out_of_stock', 'cannot_fulfil', 'pricing_error', 'other')),
        CONSTRAINT shop_orders_cancelled_check CHECK ((status = 'cancelled') = (cancel_reason IS NOT NULL)
          AND (cancel_reason IS NULL) = (cancelled_at IS NULL)),
        CONSTRAINT shop_orders_rejected_check CHECK ((status = 'rejected') = (rejection_reason IS NOT NULL)
          AND (rejection_reason IS NULL) = (rejected_at IS NULL)),
        CONSTRAINT shop_orders_accepted_check CHECK (status NOT IN ('accepted', 'completed') OR accepted_at IS NOT NULL),
        CONSTRAINT shop_orders_completed_check CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
        CONSTRAINT shop_orders_acceptance_due_check CHECK (CASE
          WHEN status = 'awaiting_payment' THEN acceptance_due_at IS NULL
          WHEN status = 'cancelled' THEN CASE
            WHEN cancel_reason IN ('payment_expired', 'stock_unavailable_after_payment') THEN acceptance_due_at IS NULL
            WHEN cancel_reason IN ('acceptance_timeout', 'admin_cancelled', 'undeliverable') THEN acceptance_due_at IS NOT NULL
            ELSE true END              -- customer_cancelled, shop_frozen: reached before or after awaiting_acceptance
          ELSE acceptance_due_at IS NOT NULL END),
        CONSTRAINT shop_orders_currency_check CHECK (currency = 'NPR'),
        CONSTRAINT shop_orders_amounts_check CHECK (items_subtotal_minor >= 0 AND shipping_fee_minor >= 0
          AND discount_minor >= 0 AND discount_minor <= items_subtotal_minor
          AND commission_total_minor >= 0 AND commission_total_minor <= items_subtotal_minor),
        CONSTRAINT shop_orders_totals_check
          CHECK (total_minor = items_subtotal_minor + shipping_fee_minor - discount_minor),
        CONSTRAINT shop_orders_estimate_check
          CHECK (est_min_days_snapshot >= 0 AND est_max_days_snapshot >= est_min_days_snapshot)
      )
    `)
    this.schema.raw(String.raw`
      CREATE INDEX shop_orders_seller_list_idx ON shop_orders (shop_id, status, created_at DESC, id DESC)
        WHERE acceptance_due_at IS NOT NULL;
      CREATE INDEX shop_orders_seller_all_idx ON shop_orders (shop_id, created_at DESC, id DESC);
      CREATE INDEX shop_orders_acceptance_due_idx ON shop_orders (acceptance_due_at)
        WHERE status = 'awaiting_acceptance';
      CREATE INDEX shop_orders_accepted_idx ON shop_orders (id) WHERE status = 'accepted'
    `)

    // docs/04a §11.3; the four foreign keys are the worked example of docs/04 §2.5.
    this.schema.raw(String.raw`
      CREATE TABLE order_items (
        id uuid NOT NULL DEFAULT uuidv7(),
        order_id uuid NOT NULL,
        shop_order_id uuid NOT NULL,
        shop_id uuid NOT NULL,
        product_id uuid NOT NULL,
        variant_id uuid NOT NULL,
        product_title_snapshot text NOT NULL,
        variant_label_snapshot text NOT NULL,
        sku_snapshot text NOT NULL,
        brand_name_snapshot text,
        image_url_snapshot text,
        category_path_snapshot text NOT NULL,
        currency char(3) NOT NULL DEFAULT 'NPR',
        unit_price_minor bigint NOT NULL,
        compare_at_price_minor_snapshot bigint,
        quantity int NOT NULL,
        rejected_quantity int NOT NULL DEFAULT 0,
        cancelled_quantity int NOT NULL DEFAULT 0,
        returned_quantity int NOT NULL DEFAULT 0,
        line_subtotal_minor bigint NOT NULL,
        discount_minor bigint NOT NULL DEFAULT 0,
        tax_minor bigint NOT NULL DEFAULT 0,
        tax_rate_bp int,
        tax_inclusive boolean NOT NULL DEFAULT true,
        line_total_minor bigint NOT NULL,
        commission_rate_bp int NOT NULL,
        commission_minor bigint NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT order_items_pkey PRIMARY KEY (id),
        CONSTRAINT order_items_shop_order_fkey FOREIGN KEY (shop_order_id, shop_id)
          REFERENCES shop_orders (id, shop_id) ON DELETE RESTRICT,
        CONSTRAINT order_items_shop_order_order_fkey FOREIGN KEY (shop_order_id, order_id)
          REFERENCES shop_orders (id, order_id) ON DELETE RESTRICT,
        CONSTRAINT order_items_variant_fkey FOREIGN KEY (variant_id, shop_id)
          REFERENCES product_variants (id, shop_id) ON DELETE RESTRICT,
        CONSTRAINT order_items_variant_product_fkey FOREIGN KEY (variant_id, product_id)
          REFERENCES product_variants (id, product_id) ON DELETE RESTRICT,
        CONSTRAINT order_items_shop_order_variant_key UNIQUE (shop_order_id, variant_id),  -- one line per variant
        CONSTRAINT order_items_id_shop_id_key UNIQUE (id, shop_id),                        -- target for §13.1
        CONSTRAINT order_items_id_shop_order_id_key UNIQUE (id, shop_order_id),            -- target for §11.8, §11.9, §12.5
        CONSTRAINT order_items_reservation_ref_key UNIQUE (id, order_id, shop_id, variant_id),  -- target for §8.2
        CONSTRAINT order_items_currency_check CHECK (currency = 'NPR'),
        CONSTRAINT order_items_quantity_check CHECK (quantity > 0),
        CONSTRAINT order_items_removed_check CHECK (rejected_quantity >= 0 AND cancelled_quantity >= 0
          AND returned_quantity >= 0
          AND rejected_quantity + cancelled_quantity + returned_quantity <= quantity),
        CONSTRAINT order_items_prices_check CHECK (unit_price_minor >= 0
          AND (compare_at_price_minor_snapshot IS NULL OR compare_at_price_minor_snapshot > unit_price_minor)),
        CONSTRAINT order_items_subtotal_check CHECK (line_subtotal_minor = unit_price_minor * quantity),
        CONSTRAINT order_items_discount_check CHECK (discount_minor >= 0 AND discount_minor <= line_subtotal_minor),
        CONSTRAINT order_items_tax_check CHECK (tax_minor >= 0
          AND (tax_rate_bp IS NULL OR tax_rate_bp BETWEEN 0 AND 10000)
          AND (NOT tax_inclusive OR tax_minor <= line_total_minor)),
        CONSTRAINT order_items_total_check CHECK (line_total_minor = line_subtotal_minor - discount_minor
          + CASE WHEN tax_inclusive THEN 0 ELSE tax_minor END),
        CONSTRAINT order_items_commission_check CHECK (commission_rate_bp BETWEEN 0 AND 10000
          AND commission_minor >= 0 AND commission_minor <= line_subtotal_minor),
        CONSTRAINT order_items_snapshot_check CHECK (char_length(product_title_snapshot) BETWEEN 1 AND 150
          AND char_length(variant_label_snapshot) <= 200 AND char_length(sku_snapshot) BETWEEN 1 AND 64
          AND (image_url_snapshot IS NULL OR image_url_snapshot ~ '^https://'))
      )
    `)
    this.schema.raw(String.raw`CREATE INDEX order_items_variant_idx ON order_items (variant_id)`)

    // docs/04a §11.4. Append-only: its triggers and REVOKEs are in file 14.
    this.schema.raw(String.raw`
      CREATE TABLE order_events (
        id uuid NOT NULL DEFAULT uuidv7(),
        order_id uuid NOT NULL,
        shop_order_id uuid,
        type text NOT NULL,
        visibility text NOT NULL,
        data jsonb NOT NULL DEFAULT '{}',
        actor_type text NOT NULL,
        actor_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT order_events_pkey PRIMARY KEY (id),
        CONSTRAINT order_events_order_fkey FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT,
        CONSTRAINT order_events_shop_order_fkey FOREIGN KEY (shop_order_id, order_id)
          REFERENCES shop_orders (id, order_id) ON DELETE RESTRICT,           -- MATCH SIMPLE: null allowed
        CONSTRAINT order_events_actor_fkey FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT order_events_type_check CHECK (type ~ '^[a-z_]+\.[a-z_]+$'),
        CONSTRAINT order_events_visibility_check CHECK (visibility IN ('customer', 'shop', 'internal')),
        CONSTRAINT order_events_shop_visibility_check CHECK (visibility <> 'shop' OR shop_order_id IS NOT NULL),
        CONSTRAINT order_events_actor_type_check
          CHECK (actor_type IN ('customer', 'shop_member', 'platform_staff', 'system', 'provider')),
        CONSTRAINT order_events_actor_check
          CHECK ((actor_type IN ('customer', 'shop_member', 'platform_staff')) = (actor_user_id IS NOT NULL)),
        CONSTRAINT order_events_data_check CHECK (jsonb_typeof(data) = 'object')
      )
    `)
    this.schema.raw(String.raw`
      CREATE INDEX order_events_order_idx ON order_events (order_id, created_at, id);
      CREATE INDEX order_events_shop_order_idx ON order_events (shop_order_id, created_at, id)
        WHERE shop_order_id IS NOT NULL
    `)

    // docs/04a §11.5 (OD-56: the manual and courier paths). The account and
    // pickup-address keys reference file 5 (§9.10, §6.6). The `\?` in
    // shipments_merchant_reference_check is the regex quantifier `?`.
    this.schema.raw(String.raw`
      CREATE TABLE shipments (
        id uuid NOT NULL DEFAULT uuidv7(),
        shop_order_id uuid NOT NULL,
        shop_id uuid NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        logistics_account_id uuid,
        pickup_address_id uuid,
        merchant_reference text,
        external_shipment_id text,
        service_code text,
        currency char(3) NOT NULL DEFAULT 'NPR',
        cod_amount_minor bigint,
        provider_cost_minor bigint,
        courier_name text,
        tracking_number text,
        tracking_url text,
        booked_at timestamptz,
        shipped_at timestamptz,
        delivered_at timestamptz,
        cancelled_at timestamptz,
        return_window_ends_at timestamptz,
        attempt_count smallint NOT NULL DEFAULT 0,
        version int NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT shipments_pkey PRIMARY KEY (id),
        CONSTRAINT shipments_id_shop_id_key UNIQUE (id, shop_id),               -- target for §11.6
        CONSTRAINT shipments_id_shop_order_id_key UNIQUE (id, shop_order_id),   -- target for §11.9
        CONSTRAINT shipments_merchant_reference_key UNIQUE (merchant_reference), -- NULLs are distinct
        CONSTRAINT shipments_shop_order_fkey FOREIGN KEY (shop_order_id, shop_id)
          REFERENCES shop_orders (id, shop_id) ON DELETE RESTRICT,
        CONSTRAINT shipments_account_fkey FOREIGN KEY (logistics_account_id, shop_id)
          REFERENCES logistics_account_shops (account_id, shop_id) ON DELETE RESTRICT,
        CONSTRAINT shipments_pickup_address_fkey FOREIGN KEY (pickup_address_id, shop_id)
          REFERENCES shop_addresses (id, shop_id) ON DELETE RESTRICT,
        CONSTRAINT shipments_status_check CHECK (status IN ('pending', 'packed', 'booking_requested', 'booked',
          'booking_failed', 'needs_reconciliation', 'shipped', 'out_for_delivery', 'delivered', 'delivery_failed',
          'returning', 'returned_to_origin', 'cancelled')),
        CONSTRAINT shipments_path_check CHECK (CASE WHEN logistics_account_id IS NULL
          THEN status IN ('pending', 'packed', 'shipped', 'delivered', 'delivery_failed', 'returning', 'returned_to_origin')
            AND merchant_reference IS NULL AND external_shipment_id IS NULL AND service_code IS NULL
            AND cod_amount_minor IS NULL AND provider_cost_minor IS NULL AND booked_at IS NULL
          ELSE status NOT IN ('pending', 'packed')
            AND pickup_address_id IS NOT NULL AND merchant_reference IS NOT NULL AND cod_amount_minor IS NOT NULL END),
        CONSTRAINT shipments_booked_check CHECK ((status IN ('pending', 'packed', 'booking_requested', 'booking_failed',
          'needs_reconciliation', 'cancelled') OR logistics_account_id IS NULL
          OR (external_shipment_id IS NOT NULL AND booked_at IS NOT NULL))
          AND (status NOT IN ('booking_requested', 'booking_failed', 'needs_reconciliation')
          OR (external_shipment_id IS NULL AND booked_at IS NULL))),
        CONSTRAINT shipments_cancelled_check CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)
          AND (status <> 'cancelled' OR shipped_at IS NULL)),
        CONSTRAINT shipments_shipped_check CHECK (status IN ('pending', 'packed', 'booking_requested', 'booked',
          'booking_failed', 'needs_reconciliation', 'cancelled')
          OR (shipped_at IS NOT NULL AND courier_name IS NOT NULL AND attempt_count >= 1)),
        CONSTRAINT shipments_delivered_check CHECK ((status = 'delivered') = (delivered_at IS NOT NULL)
          AND (delivered_at IS NULL OR delivered_at >= shipped_at)),
        CONSTRAINT shipments_return_window_check CHECK ((delivered_at IS NULL) = (return_window_ends_at IS NULL)
          AND (return_window_ends_at IS NULL OR return_window_ends_at >= delivered_at + interval '7 days')),
        CONSTRAINT shipments_attempt_count_check CHECK (attempt_count BETWEEN 0 AND 3),  -- reattempt limit [Assumption A-47, 05 §6.3]
        CONSTRAINT shipments_currency_check CHECK (currency = 'NPR'),
        CONSTRAINT shipments_amounts_check CHECK ((cod_amount_minor IS NULL OR cod_amount_minor >= 0)
          AND (provider_cost_minor IS NULL OR provider_cost_minor >= 0)),
        CONSTRAINT shipments_merchant_reference_check CHECK (merchant_reference IS NULL
          OR merchant_reference ~ '^DN-[0-9A-HJKMNP-TV-Z]{7}-[1-9][0-9]\?-S[1-9][0-9]\?$'),
        CONSTRAINT shipments_external_shipment_id_check
          CHECK (external_shipment_id IS NULL OR char_length(external_shipment_id) BETWEEN 1 AND 100),
        CONSTRAINT shipments_service_code_check CHECK (service_code IS NULL OR char_length(service_code) BETWEEN 1 AND 40),
        CONSTRAINT shipments_courier_name_check
          CHECK (courier_name IS NULL OR char_length(courier_name) BETWEEN 2 AND 80),
        CONSTRAINT shipments_tracking_number_check
          CHECK (tracking_number IS NULL OR char_length(tracking_number) BETWEEN 3 AND 64),
        CONSTRAINT shipments_tracking_url_check
          CHECK (tracking_url IS NULL OR (tracking_url ~ '^https://' AND char_length(tracking_url) <= 500))
      )
    `)
    this.schema.raw(String.raw`
      CREATE UNIQUE INDEX shipments_shop_order_key ON shipments (shop_order_id)
        WHERE status <> 'cancelled';                          -- R1: one live parcel per shop order
      CREATE UNIQUE INDEX shipments_external_id_key ON shipments (logistics_account_id, external_shipment_id)
        WHERE external_shipment_id IS NOT NULL;               -- one courier ID per account
      CREATE INDEX shipments_cancelled_idx ON shipments (shop_order_id) WHERE status = 'cancelled';
      CREATE INDEX shipments_to_ship_idx ON shipments (shop_id, created_at, id)
        WHERE status IN ('pending', 'packed', 'booking_requested', 'booked', 'booking_failed', 'needs_reconciliation');
      CREATE INDEX shipments_in_transit_idx ON shipments (updated_at)
        WHERE status IN ('shipped', 'out_for_delivery', 'delivery_failed');
      CREATE INDEX shipments_account_idx ON shipments (logistics_account_id, status)
        WHERE logistics_account_id IS NOT NULL;
      CREATE INDEX shipments_booking_unresolved_idx ON shipments (updated_at)
        WHERE status IN ('booking_requested', 'needs_reconciliation')
    `)

    // docs/04a §11.6. Append-only: its triggers and REVOKEs are in file 14.
    // shipment_events_refused_idx waits for OD-18 (docs/04 §17.3).
    this.schema.raw(String.raw`
      CREATE TABLE shipment_events (
        id uuid NOT NULL DEFAULT uuidv7(),
        shipment_id uuid NOT NULL,
        shop_id uuid NOT NULL,
        event text NOT NULL,
        status text NOT NULL,
        reason_code text,
        note text,
        actor_type text NOT NULL,
        actor_user_id uuid,
        provider_event_key text,
        raw_status text,
        metadata jsonb,
        occurred_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT shipment_events_pkey PRIMARY KEY (id),
        CONSTRAINT shipment_events_shipment_fkey FOREIGN KEY (shipment_id, shop_id)
          REFERENCES shipments (id, shop_id) ON DELETE RESTRICT,
        CONSTRAINT shipment_events_actor_fkey FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT shipment_events_event_check CHECK (event IN ('packed', 'shipped', 'delivered',
          'delivery_failed', 'reattempt', 'returning', 'returned_to_origin', 'booking_requested', 'booked',
          'booking_failed', 'needs_reconciliation', 'picked_up', 'in_transit', 'out_for_delivery', 'cancelled')),
        CONSTRAINT shipment_events_status_check CHECK (CASE event
          WHEN 'reattempt' THEN status = 'shipped'
          WHEN 'picked_up' THEN status = 'shipped'
          WHEN 'in_transit' THEN status IN ('shipped', 'out_for_delivery')
          ELSE status = event END),
        CONSTRAINT shipment_events_reason_check CHECK ((event = 'delivery_failed') = (reason_code IS NOT NULL)
          AND (reason_code IS NULL
               OR reason_code IN ('customer_unreachable', 'refused', 'address_problem', 'other'))),
        CONSTRAINT shipment_events_actor_check
          CHECK (actor_type IN ('shop_member', 'platform_staff', 'system', 'provider')
          AND (actor_type IN ('system', 'provider')) = (actor_user_id IS NULL)),
        CONSTRAINT shipment_events_provider_check CHECK ((actor_type = 'provider') = (raw_status IS NOT NULL)
          AND (provider_event_key IS NULL OR actor_type = 'provider')),
        CONSTRAINT shipment_events_note_check CHECK (note IS NULL OR char_length(note) <= 500),
        CONSTRAINT shipment_events_provider_text_check CHECK (
              (raw_status IS NULL OR char_length(raw_status) BETWEEN 1 AND 100)
          AND (provider_event_key IS NULL OR char_length(provider_event_key) BETWEEN 1 AND 200)),
        CONSTRAINT shipment_events_metadata_check CHECK (metadata IS NULL OR jsonb_typeof(metadata) = 'object')
      )
    `)
    this.schema.raw(String.raw`
      CREATE UNIQUE INDEX shipment_events_provider_event_key ON shipment_events (shipment_id, provider_event_key)
        WHERE provider_event_key IS NOT NULL;
      CREATE INDEX shipment_events_shipment_idx ON shipment_events (shipment_id, occurred_at, id)
    `)

    // docs/04a §11.7, without return_requests_case_fkey: support_cases is
    // created by file 13, which adds the key (cycle 2, docs/04 §20.2.2).
    this.schema.raw(String.raw`
      CREATE TABLE return_requests (
        id uuid NOT NULL DEFAULT uuidv7(),
        number text NOT NULL,
        order_id uuid NOT NULL,
        shop_order_id uuid NOT NULL,
        shop_id uuid NOT NULL,
        requested_by_user_id uuid NOT NULL,
        created_by_staff_id uuid,
        support_case_id uuid,
        reason_code text NOT NULL,
        status text NOT NULL DEFAULT 'requested',
        customer_note text,
        resolution_note text,
        approved_at timestamptz,
        refund_due_at timestamptz,
        received_at timestamptz,
        closed_at timestamptz,
        version int NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT return_requests_pkey PRIMARY KEY (id),
        CONSTRAINT return_requests_number_key UNIQUE (number),
        CONSTRAINT return_requests_number_check CHECK (number ~ '^RT-[0-9A-HJKMNP-TV-Z]{7}$'),
        CONSTRAINT return_requests_id_shop_order_id_key UNIQUE (id, shop_order_id),   -- target for §11.8, §12.4
        CONSTRAINT return_requests_shop_order_fkey FOREIGN KEY (shop_order_id, shop_id)
          REFERENCES shop_orders (id, shop_id) ON DELETE RESTRICT,
        CONSTRAINT return_requests_shop_order_order_fkey FOREIGN KEY (shop_order_id, order_id)
          REFERENCES shop_orders (id, order_id) ON DELETE RESTRICT,
        CONSTRAINT return_requests_customer_fkey FOREIGN KEY (order_id, requested_by_user_id)
          REFERENCES orders (id, customer_user_id) ON DELETE RESTRICT,
        CONSTRAINT return_requests_staff_fkey FOREIGN KEY (created_by_staff_id)
          REFERENCES platform_staff (user_id) ON DELETE RESTRICT,
        CONSTRAINT return_requests_status_check CHECK (status IN ('requested', 'approved', 'rejected',
          'in_transit', 'received', 'closed', 'rejected_after_inspection')),
        CONSTRAINT return_requests_reason_check CHECK (reason_code IN ('not_as_described', 'damaged',
          'wrong_item', 'size_issue', 'changed_mind', 'other')),
        CONSTRAINT return_requests_approved_check CHECK (status IN ('requested', 'rejected')
          OR (approved_at IS NOT NULL AND refund_due_at IS NOT NULL)),
        CONSTRAINT return_requests_received_check
          CHECK (status NOT IN ('received', 'closed', 'rejected_after_inspection') OR received_at IS NOT NULL),
        CONSTRAINT return_requests_closed_check CHECK ((status = 'closed') = (closed_at IS NOT NULL)),
        CONSTRAINT return_requests_resolution_check
          CHECK (status NOT IN ('rejected', 'rejected_after_inspection') OR resolution_note IS NOT NULL),
        CONSTRAINT return_requests_notes_check CHECK (char_length(coalesce(customer_note, '')) <= 1000
          AND char_length(coalesce(resolution_note, '')) <= 2000)
      )
    `)
    this.schema.raw(String.raw`
      CREATE INDEX return_requests_open_shop_order_idx ON return_requests (shop_order_id)
        WHERE status IN ('requested', 'approved', 'in_transit', 'received');
      CREATE INDEX return_requests_seller_list_idx ON return_requests (shop_id, created_at DESC, id DESC);
      CREATE INDEX return_requests_admin_queue_idx ON return_requests (status, created_at)
        WHERE status IN ('requested', 'approved', 'in_transit', 'received');
      CREATE INDEX return_requests_refund_due_idx ON return_requests (refund_due_at)
        WHERE status IN ('approved', 'in_transit', 'received')
    `)

    // docs/04a §11.8, a composite-key table (docs/04 §2.15).
    this.schema.raw(String.raw`
      CREATE TABLE return_items (
        return_request_id uuid NOT NULL,
        order_item_id uuid NOT NULL,
        shop_order_id uuid NOT NULL,
        quantity int NOT NULL,
        condition_note text,
        restock_quantity int,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT return_items_pkey PRIMARY KEY (return_request_id, order_item_id),
        CONSTRAINT return_items_request_fkey FOREIGN KEY (return_request_id, shop_order_id)
          REFERENCES return_requests (id, shop_order_id) ON DELETE RESTRICT,
        CONSTRAINT return_items_order_item_fkey FOREIGN KEY (order_item_id, shop_order_id)
          REFERENCES order_items (id, shop_order_id) ON DELETE RESTRICT,
        CONSTRAINT return_items_quantity_check CHECK (quantity > 0),
        CONSTRAINT return_items_restock_check
          CHECK (restock_quantity IS NULL OR restock_quantity BETWEEN 0 AND quantity),
        CONSTRAINT return_items_condition_note_check
          CHECK (condition_note IS NULL OR char_length(condition_note) <= 1000)
      )
    `)
    this.schema.raw(
      String.raw`CREATE INDEX return_items_order_item_idx ON return_items (order_item_id)`
    )

    // docs/04a §11.9 (OD-56), a composite-key table (docs/04 §2.15).
    this.schema.raw(String.raw`
      CREATE TABLE shipment_items (
        shipment_id uuid NOT NULL,
        order_item_id uuid NOT NULL,
        shop_order_id uuid NOT NULL,
        quantity int NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT shipment_items_pkey PRIMARY KEY (shipment_id, order_item_id),
        CONSTRAINT shipment_items_shipment_fkey FOREIGN KEY (shipment_id, shop_order_id)
          REFERENCES shipments (id, shop_order_id) ON DELETE RESTRICT,
        CONSTRAINT shipment_items_order_item_fkey FOREIGN KEY (order_item_id, shop_order_id)
          REFERENCES order_items (id, shop_order_id) ON DELETE RESTRICT,
        CONSTRAINT shipment_items_quantity_check CHECK (quantity > 0)
      )
    `)
    this.schema.raw(
      String.raw`CREATE INDEX shipment_items_order_item_idx ON shipment_items (order_item_id)`
    )

    // docs/04 §16.3 INV-08 (docs/04a §11 introduction, §11.1 to §11.3):
    // amounts and snapshots are written once. Each list allows updated_at,
    // which the set_updated_at triggers below change on every UPDATE.
    this.schema.raw(String.raw`
      CREATE TRIGGER orders_guard BEFORE UPDATE ON orders FOR EACH ROW
        EXECUTE FUNCTION allow_only_columns('status', 'updated_at', 'idempotency_key_id',
          'shipping_address', 'customer_email_snapshot', 'customer_note',   -- these three for 04 §19.2 and key rotation (04 §2.9)
          'verification_status', 'verification_method', 'verified_at', 'verification_notes');   -- OD-57
      CREATE TRIGGER shop_orders_guard BEFORE UPDATE ON shop_orders FOR EACH ROW
        EXECUTE FUNCTION allow_only_columns('status', 'cancel_reason', 'rejection_reason', 'acceptance_due_at',
          'accepted_at', 'completed_at', 'cancelled_at', 'rejected_at', 'version', 'updated_at');
      CREATE TRIGGER order_items_guard BEFORE UPDATE ON order_items FOR EACH ROW
        EXECUTE FUNCTION allow_only_columns('rejected_quantity', 'cancelled_quantity', 'returned_quantity', 'updated_at')
    `)
    // docs/04a §11.3: the removal counters only grow.
    this.schema.raw(String.raw`
      CREATE OR REPLACE FUNCTION order_items_counters_only_grow() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.rejected_quantity < OLD.rejected_quantity OR NEW.cancelled_quantity < OLD.cancelled_quantity
           OR NEW.returned_quantity < OLD.returned_quantity THEN
          RAISE EXCEPTION 'order_items removal counters can only grow' USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
      END $$
    `)
    this.schema.raw(String.raw`
      CREATE TRIGGER order_items_counters BEFORE UPDATE ON order_items FOR EACH ROW
        EXECUTE FUNCTION order_items_counters_only_grow()
    `)

    // docs/04a §11.5: what a booking was made with never changes (INV-30,
    // ADR-0019 decision 4).
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
      END $$
    `)
    this.schema.raw(String.raw`
      CREATE TRIGGER shipments_booking_guard BEFORE UPDATE ON shipments
        FOR EACH ROW EXECUTE FUNCTION shipments_booking_guard()
    `)

    // docs/04 §2.2: one updated_at trigger per table that has the column.
    this.schema.raw(String.raw`
      CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON orders
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
      CREATE TRIGGER shop_orders_set_updated_at BEFORE UPDATE ON shop_orders
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
      CREATE TRIGGER order_items_set_updated_at BEFORE UPDATE ON order_items
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
      CREATE TRIGGER shipments_set_updated_at BEFORE UPDATE ON shipments
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
      CREATE TRIGGER return_requests_set_updated_at BEFORE UPDATE ON return_requests
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
      CREATE TRIGGER return_items_set_updated_at BEFORE UPDATE ON return_items
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `)
  }

  async down() {
    this.schema.raw(String.raw`DROP TABLE IF EXISTS shipment_items`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS return_items`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS return_requests`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS shipment_events`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS shipments`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS order_events`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS order_items`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS shop_orders`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS orders`)
    this.schema.raw(String.raw`DROP FUNCTION IF EXISTS shipments_booking_guard()`)
    this.schema.raw(String.raw`DROP FUNCTION IF EXISTS order_items_counters_only_grow()`)
  }
}
